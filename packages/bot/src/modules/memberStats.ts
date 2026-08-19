import { Events, type GuildMember } from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { BotClient, BotModuleHandler } from '../client.js';

// Un jour = minuit UTC, pour que la ligne du jour reste la même quel que
// soit le fuseau du serveur qui héberge le bot.
function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// Ne garde qu'un an d'historique — un balayage par jour suffit largement
// (voir packages/bot/src/commands/statistiques.ts pour le calcul de taille :
// une ligne par jour par serveur, la table reste minuscule même sur des années).
const PRUNE_TICK_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 365;

async function pruneOldStats() {
  const cutoff = startOfUtcDay(new Date());
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
  await prisma.dailyMemberStat.deleteMany({ where: { date: { lt: cutoff } } }).catch((err) => {
    console.error('Purge des statistiques membres échouée:', err);
  });
}

async function recordJoin(guildId: string) {
  const date = startOfUtcDay(new Date());
  await prisma.dailyMemberStat
    .upsert({
      where: { guildId_date: { guildId, date } },
      create: { id: crypto.randomUUID(), guildId, date, joins: 1, updatedAt: new Date() },
      update: { joins: { increment: 1 }, updatedAt: new Date() },
    })
    .catch((err) => console.error('Suivi arrivée échoué:', err));
}

async function recordLeave(guildId: string) {
  const date = startOfUtcDay(new Date());
  await prisma.dailyMemberStat
    .upsert({
      where: { guildId_date: { guildId, date } },
      create: { id: crypto.randomUUID(), guildId, date, leaves: 1, updatedAt: new Date() },
      update: { leaves: { increment: 1 }, updatedAt: new Date() },
    })
    .catch((err) => console.error('Suivi départ échoué:', err));
}

// Compteur journalier d'arrivées/départs pour le graphique de variation
// nette de la page d'accueil du dashboard — volontairement indépendant du
// module Bienvenue/Départs (activé ou non, on veut quand même les stats).
export const memberStatsModule: BotModuleHandler = {
  name: 'memberStats',
  register(client: BotClient) {
    client.on(Events.GuildMemberAdd, (member) => {
      // Exclus les bots : la tuile "Membre total" du dashboard ne compte que
      // les humains (fetchGuildMembers filtre .user.bot) — sans ce filtre,
      // l'ajout d'un bot ferait un blip incohérent avec le total affiché.
      if (member.user.bot) return;
      recordJoin(member.guild.id);
    });
    client.on(Events.GuildMemberRemove, (member) => {
      if (!member.guild || (member as GuildMember).user.bot) return;
      recordLeave((member as GuildMember).guild.id);
    });

    pruneOldStats().catch((err) => console.error('memberStats module failed (startup prune):', err));
    setInterval(() => {
      pruneOldStats().catch((err) => console.error('memberStats module failed (prune):', err));
    }, PRUNE_TICK_MS);
  },
};
