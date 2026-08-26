import { Events, type Guild, type GuildBasedChannel } from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { StatsChannel } from '@discord-bot-dashboard/database';
import type { BotClient, BotModuleHandler } from '../client.js';

// Discord ne permet que 2 renommages d'un même salon toutes les 10 minutes
// (voir modules/tickets/ticketActions.ts) — une mise à jour périodique plutôt
// qu'à chaque arrivée/départ (qui exploserait ce quota sur un serveur actif).
const UPDATE_INTERVAL_MS = 10 * 60 * 1000;

// La liste des statistiques calculables — amenée à s'étendre (rôles, salons,
// boosts...) sans changer la forme de StatsChannel ni le reste du module.
async function computeStat(guild: Guild, statType: string): Promise<number> {
  if (statType === 'membersTotal') return guild.memberCount;

  const members = await guild.members.fetch();
  return members.filter((m) => !m.user.bot).size;
}

async function renameStatsChannel(guild: Guild, channel: GuildBasedChannel, stat: StatsChannel) {
  const count = await computeStat(guild, stat.statType).catch((err) => {
    console.error('Calcul de statistique (salon de statistiques) échoué:', err);
    return null;
  });
  if (count === null) return;

  const name = stat.format.replaceAll('{count}', String(count)).slice(0, 100);
  if (channel.name === name) return;

  await channel.setName(name).catch((err) => console.error('Renommage du salon de statistiques échoué:', err));
}

async function updateGuildStatsChannels(guild: Guild) {
  const stats = await prisma.statsChannel.findMany({ where: { guildId: guild.id } });
  if (stats.length === 0) return;

  // Un seul fetch complet des membres pour toute la guilde, réutilisé par
  // chaque salon "membersNoBots" plutôt que de le refaire à chaque salon.
  if (stats.some((s) => s.statType === 'membersNoBots')) await guild.members.fetch().catch(() => undefined);

  for (const stat of stats) {
    const channel = guild.channels.cache.get(stat.channelId) ?? (await guild.channels.fetch(stat.channelId).catch(() => null));
    if (!channel) {
      await prisma.statsChannel.delete({ where: { id: stat.id } }).catch(() => undefined);
      continue;
    }
    await renameStatsChannel(guild, channel, stat);
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
