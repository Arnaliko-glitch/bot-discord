import { AttachmentBuilder, EmbedBuilder, Events, type Guild, type GuildMember, type PartialUser, type User } from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { ServerTagConfig } from '@discord-bot-dashboard/database';
import type { BotClient, BotModuleHandler } from '../client.js';
import { generateCelebrationCard } from '../utils/celebrationCard.js';

const ANNOUNCE_FALLBACK_ACCENT = '#ED4245';

// Un membre affiche le "tag de serveur" (identité) de CE serveur si son
// primaryGuild pointe dessus ET que l'affichage est activé — les deux
// conditions peuvent changer indépendamment (ex: garder identityGuildId mais
// désactiver l'affichage).
function displaysTagFor(user: User | PartialUser, guildId: string): boolean {
  return user.primaryGuild?.identityGuildId === guildId && user.primaryGuild.identityEnabled === true;
}

// Envoie un log dans le salon configuré (module Logs du dashboard) — no-op
// silencieux si aucun salon n'est choisi ou si cet événement est décoché.
// Exportée pour la commande de test /test-tag-log (dev uniquement).
export async function logTagEvent(guild: Guild, member: GuildMember, added: boolean) {
  const logsConfig = await prisma.logsConfig.findUnique({ where: { guildId: guild.id } });
  if (!logsConfig?.tagChannelId) return;
  if (added ? !logsConfig.tagLogAdded : !logsConfig.tagLogRemoved) return;

  const channel =
    guild.channels.cache.get(logsConfig.tagChannelId) ?? (await guild.channels.fetch(logsConfig.tagChannelId).catch(() => null));
  if (!channel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setColor(added ? 0x57f287 : 0xed4245)
    .setTitle(added ? '🏷️ Ajout du tag' : '🚫 Suppression du tag')
    .setDescription(`${member} a ${added ? 'ajouté' : 'retiré'} le tag du serveur.`)
    .setThumbnail(member.displayAvatarURL({ extension: 'png', size: 128 }))
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch((err) => console.error('Log tag du serveur échoué:', err));
}

// Annonce publiquement l'obtention du rôle (carte "Félicitations !" façon
// récompense de niveau, voir modules/levels/rewards.ts) — no-op silencieux
// si aucun salon n'est choisi. Exportée pour la commande de test
// /test-tag-announce (dev uniquement).
export async function announceTagReward(guild: Guild, member: GuildMember, config: ServerTagConfig) {
  if (!config.announceChannelId || !config.roleId) return;

  const channel =
    guild.channels.cache.get(config.announceChannelId) ??
    (await guild.channels.fetch(config.announceChannelId).catch(() => null));
  if (!channel?.isTextBased()) return;

  const role = await guild.roles.fetch(config.roleId).catch(() => null);
  const roleName = role?.name ?? 'le rôle';
  const accentColor = role?.color ? role.hexColor : ANNOUNCE_FALLBACK_ACCENT;
  const content = config.announceMessage.replaceAll('{user}', `<@${member.id}>`);

  const card = await generateCelebrationCard({
    avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 128 }),
    accentColor,
    line1: 'vous recevez le rôle',
    line2: roleName,
    emoji: '🎉',
  });
  const attachment = new AttachmentBuilder(card, { name: 'tag-reward.png' });
  const embed = new EmbedBuilder().setColor(accentColor).setImage('attachment://tag-reward.png');

  await channel.send({ content, embeds: [embed], files: [attachment] }).catch((err) => console.error('Annonce tag du serveur échouée:', err));
}

// Applique le rôle au membre s'il manque et qu'il affiche le tag, le retire
// s'il l'a alors qu'il ne devrait pas — et ne touche à rien dans les deux
// autres cas (déjà dans le bon état), pour ne jamais retirer un rôle à
// quelqu'un qui a toujours le tag actif, même en cas de re-synchronisation.
// `announce` est désactivé pendant la synchro en masse (arrivée/redémarrage)
// pour ne pas spammer une annonce publique pour des membres tagués depuis
// longtemps — seul l'ajout/retrait en direct (un vrai événement) l'annonce.
async function applyTagRoleState(guild: Guild, member: GuildMember, config: ServerTagConfig, announce: boolean) {
  if (!config.roleId) return;
  const roleId = config.roleId;
  const shouldHaveRole = displaysTagFor(member.user, guild.id);
  const hasRole = member.roles.cache.has(roleId);
  if (shouldHaveRole && !hasRole) {
    const added = await member.roles
      .add(roleId)
      .then(() => true)
      .catch((err) => {
        console.error('Ajout rôle tag de serveur échoué:', err);
        return false;
      });
    if (added) {
      await logTagEvent(guild, member, true);
      if (announce) await announceTagReward(guild, member, config);
    }
  } else if (!shouldHaveRole && hasRole) {
    const removed = await member.roles
      .remove(roleId)
      .then(() => true)
      .catch((err) => {
        console.error('Retrait rôle tag de serveur échoué:', err);
        return false;
      });
    if (removed) await logTagEvent(guild, member, false);
  }
}

async function syncTagRole(client: BotClient, oldUser: User | PartialUser, newUser: User) {
  // Seules les guildes concernées par le changement (avant et/ou après)
  // peuvent avoir un rôle à ajouter/retirer — inutile de vérifier les autres.
  const relevantGuildIds = new Set(
    [oldUser.primaryGuild?.identityGuildId, newUser.primaryGuild?.identityGuildId].filter(
      (id): id is string => Boolean(id)
    )
  );
  if (relevantGuildIds.size === 0) return;

  for (const guildId of relevantGuildIds) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;

    const config = await prisma.serverTagConfig.findUnique({ where: { guildId } });
    if (!config?.enabled || !config.roleId) continue;

    const member = guild.members.cache.get(newUser.id) ?? (await guild.members.fetch(newUser.id).catch(() => null));
    if (!member) continue;

    await applyTagRoleState(guild, member, config, true);
  }
}

// Repasse sur tous les membres d'une guilde pour rattraper les cas ratés par
// l'écoute event-par-event (ex: membre déjà tagué avant que le bot rejoigne,
// ou hors ligne au moment du changement) — appelée à chaque arrivée sur une
// guilde (GuildCreate, qui couvre aussi bien un nouvel ajout que le rechargement
// de la liste des guildes au démarrage). Sans effet si le module est désactivé
// ou si aucun rôle n'est configuré, pour ne pas faire un fetch complet des
// membres inutilement.
async function syncGuildTagRoles(guild: Guild) {
  const config = await prisma.serverTagConfig.findUnique({ where: { guildId: guild.id } });
  if (!config?.enabled || !config.roleId) return;

  const members = await guild.members.fetch().catch((err) => {
    console.error('Synchronisation tag du serveur échouée (fetch membres):', err);
    return null;
  });
  if (!members) return;

  for (const member of members.values()) {
    if (member.user.bot) continue;
    await applyTagRoleState(guild, member, config, false);
  }
}

// Donne/retire un rôle selon que le membre affiche ou non le tag de CE
// serveur sur son profil Discord — discord.js relaie ce changement via
// l'événement UserUpdate (déclenché par les mises à jour de membre déjà
// reçues avec l'intent GuildMembers, pas besoin d'intent supplémentaire).
export const serverTagModule: BotModuleHandler = {
  name: 'serverTag',
  register(client: BotClient) {
    client.on(Events.UserUpdate, (oldUser, newUser) => {
      syncTagRole(client, oldUser, newUser).catch((err) => console.error('serverTag module failed:', err));
    });

    // GuildCreate couvre à la fois un nouvel ajout du bot ET le rechargement
    // de toutes ses guildes au démarrage — un seul écouteur suffit pour
    // "quand il arrive" (rejoint ou redémarre) dans les deux cas.
    client.on(Events.GuildCreate, (guild) => {
      syncGuildTagRoles(guild).catch((err) => console.error('serverTag module (sync) failed:', err));
    });
  },
};
