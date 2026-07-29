import { prisma } from '@discord-bot-dashboard/database';
import { getSession, hasAdminPermission, fetchUserGuilds } from './auth';

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');
  return session;
}

export async function requireGuildAccess(guildId: string) {
  const session = await requireSession();

  const guilds = await fetchUserGuilds(session.accessToken);
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild || (!guild.owner && !hasAdminPermission(guild.permissions))) {
    throw new Error('Forbidden');
  }

  const dbGuild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!dbGuild) {
    throw new Error('Guild not found - bot must be on server');
  }

  const permission = await prisma.dashboardPermission.findUnique({
    where: { guildId_discordId: { guildId, discordId: session.id } },
  });

  const isOwner = guild.owner;
  const hasDashboardPerm = !!permission || isOwner;

  if (!hasDashboardPerm && !isOwner) {
    const permCount = await prisma.dashboardPermission.count({ where: { guildId } });
    if (permCount > 0 && !permission) {
      throw new Error('No dashboard permission');
    }
  }

  return { session, guild, dbGuild, permission };
}

export async function getManagedGuilds() {
  const session = await requireSession();
  const guilds = await fetchUserGuilds(session.accessToken);
  const adminGuilds = guilds.filter((g) => g.owner || hasAdminPermission(g.permissions));

  const botGuilds = await prisma.guild.findMany({
    where: { id: { in: adminGuilds.map((g) => g.id) } },
    select: { id: true, name: true, icon: true },
  });

  const botGuildIds = new Set(botGuilds.map((g) => g.id));

  return adminGuilds
    .filter((g) => botGuildIds.has(g.id))
    .map((g) => {
      const bot = botGuilds.find((b) => b.id === g.id)!;
      return {
        id: g.id,
        name: bot.name || g.name,
        icon: bot.icon ?? g.icon,
        owner: g.owner,
      };
    });
}
