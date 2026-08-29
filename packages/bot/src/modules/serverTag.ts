import { AttachmentBuilder, EmbedBuilder, Events, type Guild, type GuildMember, type User } from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { ServerTagConfig } from '@discord-bot-dashboard/database';
import type { BotClient, BotModuleHandler } from '../client.js';
import { generateCelebrationCard } from '../utils/celebrationCard.js';

const ANNOUNCE_FALLBACK_ACCENT = '#dc2626';

// Un membre affiche le "tag de serveur" (identité) de CE serveur si son
// primaryGuild pointe dessus ET que l'affichage est activé — les deux
// conditions peuvent changer indépendamment (ex: garder identityGuildId mais
// désactiver l'affichage).
function displaysTagFor(user: User, guildId: string): boolean {
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

// Les événements en direct (GuildMemberUpdate, PresenceUpdate) ne se
// déclenchent qu'à l'occasion d'une activité quelconque du membre (message,
// changement de statut...) sur CE serveur précis — un membre resté silencieux
// ici juste après avoir changé son tag peut ne générer aucun événement scopé
// sur cette guilde avant longtemps, même si le bot partage bien un autre
// serveur plus actif avec lui entre-temps (vérifié en pratique : événements
// reçus, mais scopés sur l'autre guilde). D'où la resynchronisation
// périodique ci-dessous en filet de sécurité, en plus de l'écoute en direct.
async function handleMemberUpdate(member: GuildMember) {
  const config = await prisma.serverTagConfig.findUnique({ where: { guildId: member.guild.id } });
  if (!config?.enabled || !config.roleId) return;
  await applyTagRoleState(member.guild, member, config, true);
}

// Repasse sur tous les membres d'une guilde pour rattraper les cas ratés par
// l'écoute event-par-event (ex: membre déjà tagué avant que le bot rejoigne,
// ou dont aucun événement n'est jamais arrivé scopé sur cette guilde - voir
// plus haut). `announce` à false uniquement pour la synchro de démarrage
// (GuildCreate, qui couvre aussi bien un nouvel ajout du bot que le
// rechargement de ses guildes au redémarrage) — sinon un simple redémarrage
// du bot spammerait une annonce publique pour des membres tagués depuis
// longtemps. La synchro périodique, elle, annonce normalement : à ce
// moment-là un rôle nouvellement ajouté correspond à un vrai changement
// récent, pas à un rattrapage d'état existant.
async function syncGuildTagRoles(guild: Guild, announce: boolean) {
  const config = await prisma.serverTagConfig.findUnique({ where: { guildId: guild.id } });
  if (!config?.enabled || !config.roleId) return;

  const members = await guild.members.fetch().catch((err) => {
    console.error('Synchronisation tag du serveur échouée (fetch membres):', err);
    return null;
  });
  if (!members) return;

  for (const member of members.values()) {
    if (member.user.bot) continue;
    await applyTagRoleState(guild, member, config, announce);
  }
}

const PERIODIC_SYNC_INTERVAL_MS = 5 * 60 * 1000;

// Donne/retire un rôle selon que le membre affiche ou non le tag de CE
// serveur sur son profil Discord.
export const serverTagModule: BotModuleHandler = {
  name: 'serverTag',
  register(client: BotClient) {
    client.on(Events.GuildMemberUpdate, (_oldMember, newMember) => {
      if (newMember.user.bot) return;
      handleMemberUpdate(newMember).catch((err) => console.error('serverTag module failed:', err));
    });

    // Détecte le cas le plus courant en direct (le membre est actif sur CE
    // serveur au moment du changement) — nécessite l'intent GuildPresences
    // (voir index.ts). Ne couvre pas tous les cas, voir le filet de sécurité
    // périodique plus bas.
    client.on(Events.PresenceUpdate, (_oldPresence, newPresence) => {
      const member = newPresence.member;
      if (!member || member.user.bot) return;
      handleMemberUpdate(member).catch((err) => console.error('serverTag module (presence) failed:', err));
    });

    // GuildCreate couvre à la fois un nouvel ajout du bot ET le rechargement
    // de toutes ses guildes au démarrage — un seul écouteur suffit pour
    // "quand il arrive" (rejoint ou redémarre) dans les deux cas.
    client.on(Events.GuildCreate, (guild) => {
      syncGuildTagRoles(guild, false).catch((err) => console.error('serverTag module (sync) failed:', err));
    });

    setInterval(() => {
      for (const guild of client.guilds.cache.values()) {
        syncGuildTagRoles(guild, true).catch((err) => console.error('serverTag module (periodic sync) failed:', err));
      }
    }, PERIODIC_SYNC_INTERVAL_MS);
  },
};
