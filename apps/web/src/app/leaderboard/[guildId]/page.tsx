import { notFound } from 'next/navigation';
import { prisma } from '@discord-bot-dashboard/database';
import { fetchLeaderboardPage } from '@/lib/leaderboard';
import { PublicLeaderboardPage } from '@/components/PublicLeaderboardPage';

interface DiscordRole {
  id: string;
  name: string;
  color: number;
}

async function fetchGuildRoles(guildId: string): Promise<DiscordRole[]> {
  const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    next: { revalidate: 60 },
  });
  if (!res.ok) return [];
  return (await res.json()) as DiscordRole[];
}

// Page publique (aucune session requise) — classement complet d'un serveur,
// pointée par le bouton de la commande Discord /classement.
export default async function LeaderboardPage({ params }: { params: { guildId: string } }) {
  const [guild, settings, rewards, firstPage] = await Promise.all([
    prisma.guild.findUnique({ where: { id: params.guildId } }),
    prisma.xpSettings.findUnique({ where: { guildId: params.guildId } }),
    prisma.levelRole.findMany({ where: { guildId: params.guildId }, orderBy: { level: 'asc' } }),
    fetchLeaderboardPage(params.guildId, 0),
  ]);

  // 404 aussi bien si le module niveaux est désactivé que si l'admin a
  // spécifiquement coupé la visibilité du classement en ligne — dans ce
  // dernier cas, la page reste inaccessible même en tapant l'URL directement.
  if (!guild || !settings?.enabled || !settings.publicLeaderboardEnabled) notFound();

  const roles = rewards.length > 0 ? await fetchGuildRoles(params.guildId) : [];
  const roleMap = new Map(roles.map((r) => [r.id, r]));

  // Seule la première page est chargée ici (voir fetchLeaderboardPage) — la
  // suite arrive via l'API à mesure qu'on clique sur "Charger plus", plutôt
  // que de charger toute la table UserXp de la guilde d'un coup.
  const { rows: entries, hasMore } = firstPage;

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
      initialHasMore={hasMore}
      rewards={rewardList}
      curveStyle={settings.curveStyle}
      curveMultiplier={settings.curveMultiplier}
    />
  );
}
