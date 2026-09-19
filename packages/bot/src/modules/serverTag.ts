import { AttachmentBuilder, EmbedBuilder, Events, type Guild, type GuildMember, type PartialUser, type User } from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { ServerTagConfig } from '@discord-bot-dashboard/database';
import type { BotClient, BotModuleHandler } from '../client.js';
import { generateCelebrationCard, roleAccentColors } from '../utils/celebrationCard.js';

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
  const accentColors = roleAccentColors(role, ANNOUNCE_FALLBACK_ACCENT);
  const content = config.announceMessage.replaceAll('{user}', `<@${member.id}>`);

  const card = await generateCelebrationCard({
    avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 128 }),
    accentColor: accentColors,
    line1: 'vous recevez le rôle',
    line2: roleName,
    emoji: '🎉',
  });
  const attachment = new AttachmentBuilder(card, { name: 'tag-reward.png' });
  // L'embed Discord ne peut avoir qu'une seule couleur pleine — pas de
  // dégradé possible ici, contrairement à la carte dessinée au-dessus.
  const embed = new EmbedBuilder().setColor(accentColors[0]).setImage('attachment://tag-reward.png');

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

// Events.UserUpdate est un événement discord.js "synthétisé" — en interne,
// GuildMemberUpdate ET PresenceUpdate déclenchent tous les deux
// client.actions.UserUpdate.handle() dès que le user imbriqué a changé (voir
// GuildMemberUpdate.js/PresenceUpdate.js dans discord.js), et cet événement
// n'est PAS scopé à une seule guilde contrairement aux deux précédents — il
// se déclenche dès qu'un changement est détecté sur N'IMPORTE QUELLE guilde
// partagée. D'où la recherche explicite ci-dessous sur toutes les guildes du
// bot plutôt que de se fier à `member.guild` d'un événement guild-scopé (ce
// qui ratait le cas où le membre n'a d'activité que sur une AUTRE guilde
// partagée avec le bot).
async function syncTagRole(client: BotClient, oldUser: User | PartialUser, newUser: User) {
  const relevantGuildIds = new Set(
    [oldUser.primaryGuild?.identityGuildId, newUser.primaryGuild?.identityGuildId].filter((id): id is string =>
      Boolean(id)
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
// ou un membre totalement silencieux sur toutes les guildes partagées avec
// le bot au moment du changement, qui ne génère donc aucun UserUpdate).
// `announce` à false uniquement pour la synchro de démarrage (GuildCreate,
// qui couvre aussi bien un nouvel ajout du bot que le rechargement de ses
// guildes au redémarrage) — sinon un simple redémarrage du bot spammerait
// une annonce publique pour des membres tagués depuis longtemps. La synchro
// périodique, elle, annonce normalement : à ce moment-là un rôle nouvellement
// ajouté correspond à un vrai changement récent, pas à un rattrapage d'état
// existant.
async function syncGuildTagRoles(guild: Guild, announce: boolean) {
  const config = await prisma.serverTagConfig.findUnique({ where: { guildId: guild.id } });
  if (!config?.enabled || !config.roleId) return;

  const members = await guild.members.fetch();

  for (const member of members.values()) {
    if (member.user.bot) continue;
    await applyTagRoleState(guild, member, config, announce);
  }
}

const PERIODIC_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = PERIODIC_SYNC_INTERVAL_MS;
const syncFailures = new Map<string, number>();
const syncInProgress = new Set<string>();

function retryAfterMs(error: unknown, failures: number): number {
  const explicit = typeof error === 'object' && error !== null && 'data' in error
    ? Number((error as { data?: { retry_after?: unknown } }).data?.retry_after) * 1000
    : 0;
  return Math.min(RETRY_MAX_MS, Math.max(explicit || 0, RETRY_BASE_MS * 2 ** Math.min(failures, 8)));
}

function scheduleGuildSync(guild: Guild, announce: boolean, delayMs = 0) {
  setTimeout(async () => {
    if (syncInProgress.has(guild.id)) return;
    syncInProgress.add(guild.id);
    try {
      await syncGuildTagRoles(guild, announce);
      syncFailures.delete(guild.id);
    } catch (error) {
      const failures = (syncFailures.get(guild.id) ?? 0) + 1;
      syncFailures.set(guild.id, failures);
      const retryMs = retryAfterMs(error, failures);
      console.error(`Synchronisation tag du serveur échouée, nouvel essai dans ${Math.ceil(retryMs / 1000)}s:`, error);
      scheduleGuildSync(guild, announce, retryMs);
    } finally {
      syncInProgress.delete(guild.id);
    }
  }, delayMs);
}

// Donne/retire un rôle selon que le membre affiche ou non le tag de CE
// serveur sur son profil Discord.
export const serverTagModule: BotModuleHandler = {
  name: 'serverTag',
  register(client: BotClient) {
    // Couvre le cas en direct. GuildPresences (voir index.ts) reste
    // nécessaire : c'est ce qui permet à discord.js de détecter le
    // changement en premier lieu quand le membre n'a d'activité que via son
    // statut/présence, pas une vraie mise à jour de membre.
    client.on(Events.UserUpdate, (oldUser, newUser) => {
      if (newUser.bot) return;
      syncTagRole(client, oldUser, newUser).catch((err) => console.error('serverTag module failed:', err));
    });

    // GuildCreate couvre à la fois un nouvel ajout du bot ET le rechargement
    // de toutes ses guildes au démarrage — un seul écouteur suffit pour
    // "quand il arrive" (rejoint ou redémarre) dans les deux cas.
    client.on(Events.GuildCreate, (guild) => {
      scheduleGuildSync(guild, false);
    });

    setInterval(() => {
      for (const guild of client.guilds.cache.values()) {
        scheduleGuildSync(guild, true);
      }
    }, PERIODIC_SYNC_INTERVAL_MS);
  },
};
