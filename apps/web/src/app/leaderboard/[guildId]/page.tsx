import { notFound } from 'next/navigation';
import { prisma } from '@discord-bot-dashboard/database';
import { userAvatarUrl } from '@/lib/auth';
import { fetchGuildMembers, resolveDisplayName } from '@/lib/discord-members';
import { PublicLeaderboardPage } from '@/components/PublicLeaderboardPage';

const LEADERBOARD_SIZE = 100;

interface DiscordRole {
  id: string;
  name: string;
  color: number;
}

async function fetchGuildRoles(guildId: string): Promise<DiscordRole[]> {
  const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  return (await res.json()) as DiscordRole[];
}

// Page publique (aucune session requise) — classement complet d'un serveur,
// pointée par le bouton de la commande Discord /classement.
export default async function LeaderboardPage({ params }: { params: { guildId: string } }) {
  const [guild, settings, userXpRows, rewards, members] = await Promise.all([
    prisma.guild.findUnique({ where: { id: params.guildId } }),
    prisma.xpSettings.findUnique({ where: { guildId: params.guildId } }),
    prisma.userXp.findMany({ where: { guildId: params.guildId } }),
    prisma.levelRole.findMany({ where: { guildId: params.guildId }, orderBy: { level: 'asc' } }),
    fetchGuildMembers(params.guildId),
  ]);

  if (!guild || !settings?.enabled) notFound();

  const roles = rewards.length > 0 ? await fetchGuildRoles(params.guildId) : [];
  const roleMap = new Map(roles.map((r) => [r.id, r]));

  // Le nom "affiché" (pseudo serveur > nom global > pseudo Discord) vient du
  // membre récupéré en direct — repli sur la colonne stockée si le membre a
  // quitté le serveur (absent de la liste actuelle).
  const memberMap = new Map(members.map((m) => [m.user.id, m]));
  const xpMap = new Map(userXpRows.map((u) => [u.discordUserId, u]));

  const fromXp = userXpRows.map((entry) => {
    const member = memberMap.get(entry.discordUserId);
    return {
      userId: entry.discordUserId,
      username: member ? resolveDisplayName(member) : entry.username,
      avatarUrl: member
        ? userAvatarUrl(entry.discordUserId, member.user.avatar)
        : userAvatarUrl(entry.discordUserId, entry.avatar),
      xp: entry.xp,
      level: entry.level,
    };
  });

  // Complète avec les membres réels du serveur qui n'ont pas encore gagné
  // d'xp, pour afficher tout le monde plutôt que seulement les participants.
  const fillMembers = members
    .filter((m) => !m.user.bot && !xpMap.has(m.user.id))
    .map((m) => ({
      userId: m.user.id,
      username: resolveDisplayName(m),
      avatarUrl: userAvatarUrl(m.user.id, m.user.avatar),
      xp: 0,
      level: 0,
    }));

  const entries = [...fromXp, ...fillMembers]
    .sort((a, b) => b.xp - a.xp)
    .slice(0, LEADERBOARD_SIZE)
    .map((entry, i) => ({ rank: i + 1, ...entry }));

  const rewardList = rewards.map((reward) => {
    const role = roleMap.get(reward.roleId);
    return {
      level: reward.level,
      roleName: role?.name ?? 'Rôle inconnu',
      roleColor: role?.color ? `#${role.color.toString(16).padStart(6, '0')}` : null,
    };
  });

  const guildIconUrl = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : null;

  return (
    <PublicLeaderboardPage
      guildId={params.guildId}
      guildName={guild.name}
      guildIconUrl={guildIconUrl}
      initialEntries={entries}
      rewards={rewardList}
      curveStyle={settings.curveStyle}
      curveMultiplier={settings.curveMultiplier}
    />
  );
}
