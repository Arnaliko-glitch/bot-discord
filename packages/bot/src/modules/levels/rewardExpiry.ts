import { prisma } from '@discord-bot-dashboard/database';
import type { BotClient, BotModuleHandler } from '../../client.js';

const TICK_MS = 60_000;
// Borne le travail d'un balayage même en cas de gros retard accumulé (bot
// resté hors ligne longtemps) — le reste sera traité aux balayages suivants.
const BATCH_SIZE = 100;

async function sweep(client: BotClient) {
  const expired = await prisma.temporaryRoleGrant.findMany({
    where: { expiresAt: { lte: new Date() } },
    take: BATCH_SIZE,
  });
  if (expired.length === 0) return;

  const toDelete: string[] = [];
  for (const grant of expired) {
    const guild = client.guilds.cache.get(grant.guildId);
    if (!guild) {
      // Guilde inaccessible (bot expulsé...) : plus rien à faire, on nettoie.
      toDelete.push(grant.id);
      continue;
    }

    const member = guild.members.cache.get(grant.userId) ?? (await guild.members.fetch(grant.userId).catch(() => null));
    if (!member) {
      // Membre parti : le rôle n'a plus lieu d'être retiré.
      toDelete.push(grant.id);
      continue;
    }

    const removed = await member.roles.remove(grant.roleId).catch((err) => {
      console.error('Retrait rôle temporaire échoué:', err);
      return null;
    });
    // En cas d'échec (permissions, rate limit...), on ne supprime pas la
    // ligne : elle sera retentée au balayage suivant plutôt que perdue.
    if (removed) toDelete.push(grant.id);
  }

  if (toDelete.length > 0) {
    await prisma.temporaryRoleGrant.deleteMany({ where: { id: { in: toDelete } } }).catch(() => undefined);
  }
}

export const rewardExpiryModule: BotModuleHandler = {
  name: 'rewardExpiry',
  register(client: BotClient) {
    sweep(client).catch((err) => console.error('rewardExpiry module failed (startup):', err));
    setInterval(() => {
      sweep(client).catch((err) => console.error('rewardExpiry module failed:', err));
    }, TICK_MS);
  },
};
