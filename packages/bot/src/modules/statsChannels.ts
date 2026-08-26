import { Events, type Collection, type Guild, type GuildBasedChannel, type GuildMember } from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { StatsChannel } from '@discord-bot-dashboard/database';
import type { BotClient, BotModuleHandler } from '../client.js';

// Discord ne permet que 2 renommages d'un même salon toutes les 10 minutes
// (voir modules/tickets/ticketActions.ts) — une mise à jour périodique plutôt
// qu'à chaque arrivée/départ (qui exploserait ce quota sur un serveur actif).
const UPDATE_INTERVAL_MS = 10 * 60 * 1000;

// La liste des statistiques calculables — amenée à s'étendre (rôles, salons,
// boosts...) sans changer la forme de StatsChannel ni le reste du module.
// `members` est le résultat d'un unique guild.members.fetch() par guilde et
// par cycle (voir updateGuildStatsChannels) — le demander à nouveau ici pour
// chaque salon déclenchait le rate limit Discord sur l'opcode "Request
// Guild Members" dès que plusieurs salons "membersNoBots" existaient.
function computeStat(guild: Guild, statType: string, members: Collection<string, GuildMember> | null): number {
  if (statType === 'membersTotal') return guild.memberCount;
  return members ? members.filter((m) => !m.user.bot).size : 0;
}

function renameStatsChannel(channel: GuildBasedChannel, stat: StatsChannel, guild: Guild, members: Collection<string, GuildMember> | null) {
  const count = computeStat(guild, stat.statType, members);
  const name = stat.format.replaceAll('{count}', String(count)).slice(0, 100);
  if (channel.name === name) return Promise.resolve();

  return channel.setName(name).catch((err) => console.error('Renommage du salon de statistiques échoué:', err));
}

// L'intent privilégié GuildMembers (activé sur ce bot, voir index.ts) fait
// recevoir en direct chaque arrivée/départ/modif de membre via la gateway,
// pour TOUTES les guildes, en continu — une fois le cache initialement
// rempli, il reste donc à jour tout seul. Un guild.members.fetch() complet
// ne sert qu'à ce premier remplissage (au démarrage/à la jonction d'une
// guilde) ; le refaire à chaque cycle était un appel réseau inutile en plus
// de déclencher le rate limit Discord (voir historique de ce fichier).
async function ensureMembersCache(guild: Guild) {
  if (guild.members.cache.size >= guild.memberCount) return guild.members.cache;
  return guild.members.fetch().catch((err) => {
    console.error('Calcul de statistique (salon de statistiques) échoué:', err);
    return null;
  });
}

async function updateGuildStatsChannels(guild: Guild) {
  const stats = await prisma.statsChannel.findMany({ where: { guildId: guild.id } });
  if (stats.length === 0) return;

  const members = stats.some((s) => s.statType === 'membersNoBots') ? await ensureMembersCache(guild) : null;

  for (const stat of stats) {
    const channel = guild.channels.cache.get(stat.channelId) ?? (await guild.channels.fetch(stat.channelId).catch(() => null));
    if (!channel) {
      await prisma.statsChannel.delete({ where: { id: stat.id } }).catch(() => undefined);
      continue;
    }
    if (stat.statType === 'membersNoBots' && !members) continue;
    await renameStatsChannel(channel, stat, guild, members);
  }
}

async function updateAllGuilds(client: BotClient) {
  for (const guild of client.guilds.cache.values()) {
    await updateGuildStatsChannels(guild).catch((err) => console.error('statsChannels module failed:', err));
  }
}

// Renomme les salons de statistiques créés depuis le dashboard pour afficher
// en direct une valeur du serveur (nombre de membres pour l'instant), façon
// "📊 Membres : 1234".
export const statsChannelsModule: BotModuleHandler = {
  name: 'statsChannels',
  register(client: BotClient) {
    updateAllGuilds(client).catch((err) => console.error('statsChannels module failed (startup):', err));

    client.on(Events.GuildCreate, (guild) => {
      updateGuildStatsChannels(guild).catch((err) => console.error('statsChannels module failed:', err));
    });

    setInterval(() => {
      updateAllGuilds(client).catch((err) => console.error('statsChannels module failed:', err));
    }, UPDATE_INTERVAL_MS);
  },
};
