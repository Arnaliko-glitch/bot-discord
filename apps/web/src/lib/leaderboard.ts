import { prisma } from '@discord-bot-dashboard/database';
import { userAvatarUrl } from '@/lib/auth';
import { fetchGuildMembers, resolveDisplayName } from '@/lib/discord-members';

export interface LeaderboardRow {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string;
  xp: number;
  level: number;
}

export const LEADERBOARD_PAGE_SIZE = 100;

// Construit une tranche du classement complet (participants avec xp triés
// par xp décroissant, puis membres sans xp en remplissage) sans jamais
// charger toute la table UserXp d'un coup — seule la tranche demandée est
// récupérée en base via l'index (guildId, xp) plutôt qu'un findMany sans
// limite, qui deviendrait de plus en plus lourd à mesure que la guilde
// accumule des membres suivis.
export async function fetchLeaderboardPage(
  guildId: string,
  offset: number
): Promise<{ rows: LeaderboardRow[]; hasMore: boolean }> {
  const [xpTotal, members, existingIdRows] = await Promise.all([
    prisma.userXp.count({ where: { guildId } }),
    fetchGuildMembers(guildId),
    // Uniquement les ids (pas les lignes complètes) : sert à exclure du
    // remplissage les membres qui ont déjà de l'xp, sans payer le coût d'une
    // lecture de toutes les colonnes de toute la table.
    prisma.userXp.findMany({ where: { guildId }, select: { discordUserId: true } }),
  ]);
  const memberMap = new Map(members.map((m) => [m.user.id, m]));
  const existingIds = new Set(existingIdRows.map((r) => r.discordUserId));

  const rows: LeaderboardRow[] = [];

  if (offset < xpTotal) {
    const xpRows = await prisma.userXp.findMany({
      where: { guildId },
      orderBy: { xp: 'desc' },
      skip: offset,
      take: LEADERBOARD_PAGE_SIZE,
    });
    xpRows.forEach((entry, i) => {
      const member = memberMap.get(entry.discordUserId);
      rows.push({
        rank: offset + i + 1,
        userId: entry.discordUserId,
        username: member ? resolveDisplayName(member) : entry.username,
        avatarUrl: member
          ? userAvatarUrl(entry.discordUserId, member.user.avatar)
          : userAvatarUrl(entry.discordUserId, entry.avatar),
        xp: entry.xp,
        level: entry.level,
      });
    });
  }

  // Complète avec les membres réels du serveur qui n'ont pas encore gagné
  // d'xp, pour afficher tout le monde plutôt que seulement les participants
  // — triés par id pour un ordre stable d'une page à l'autre.
  const fillMembers = members
    .filter((m) => !m.user.bot && !existingIds.has(m.user.id))
    .sort((a, b) => (a.user.id < b.user.id ? -1 : a.user.id > b.user.id ? 1 : 0));

  if (rows.length < LEADERBOARD_PAGE_SIZE) {
    const fillOffset = Math.max(0, offset - xpTotal);
    const need = LEADERBOARD_PAGE_SIZE - rows.length;
    fillMembers.slice(fillOffset, fillOffset + need).forEach((m, i) => {
      rows.push({
        rank: xpTotal + fillOffset + i + 1,
        userId: m.user.id,
        username: resolveDisplayName(m),
        avatarUrl: userAvatarUrl(m.user.id, m.user.avatar),
        xp: 0,
        level: 0,
      });
    });
  }

  const total = xpTotal + fillMembers.length;
  return { rows, hasMore: offset + rows.length < total };
}
