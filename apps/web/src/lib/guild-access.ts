import { prisma } from '@discord-bot-dashboard/database';
import { getSession, hasAdminPermission, fetchUserGuilds } from './auth';

type DiscordGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
};

type BotGuild = {
  id: string;
  name: string | null;
  icon: string | null;
};

export async function requireSession() {
  const session = await getSession();

  if (!session) {
    throw new Error('Unauthorized');
  }

  return session;
}

export async function requireGuildAccess(guildId: string) {
  const session = await requireSession();

  const guilds = await fetchUserGuilds(
    session.accessToken
  ) as DiscordGuild[];

  const guild = guilds.find(
    (g: DiscordGuild) => g.id === guildId
  );

  if (
    !guild ||
    (!guild.owner &&
      !hasAdminPermission(guild.permissions))
  ) {
    throw new Error('Forbidden');
  }

  const dbGuild = await prisma.guild.findUnique({
    where: { id: guildId },
  });

  if (!dbGuild) {
    throw new Error('Guild not found - bot must be on server');
  }

  const permission = await prisma.dashboardPermission.findUnique({
    where: {
      guildId_discordId: {
        guildId,
        discordId: session.id,
      },
    },
  });

  const isOwner = guild.owner;
  const hasDashboardPerm = !!permission || isOwner;

  if (!hasDashboardPerm && !isOwner) {
    const permCount = await prisma.dashboardPermission.count({
      where: { guildId },
    });

    if (permCount > 0 && !permission) {
      throw new Error('No dashboard permission');
    }
  }

  return {
    session,
    guild,
    dbGuild,
    permission,
  };
}

export async function getManagedGuilds() {
  const session = await requireSession();

  const guilds = await fetchUserGuilds(
    session.accessToken
  ) as DiscordGuild[];

  const adminGuilds = guilds.filter(
    (g: DiscordGuild) =>
      g.owner || hasAdminPermission(g.permissions)
  );

  const botGuilds = await prisma.guild.findMany({
    where: {
      id: {
        in: adminGuilds.map(
          (g: DiscordGuild) => g.id
        ),
      },
    },
    select: {
      id: true,
      name: true,
      icon: true,
    },
  }) as BotGuild[];

  const botGuildIds = new Set(
    botGuilds.map(
      (g: BotGuild) => g.id
    )
  );

  return adminGuilds
    .filter(
      (g: DiscordGuild) =>
        botGuildIds.has(g.id)
    )
    .map(
      (g: DiscordGuild) => {
        const bot = botGuilds.find(
          (b: BotGuild) => b.id === g.id
        )!;

        return {
          id: g.id,
          name: bot.name || g.name,
          icon: bot.icon ?? g.icon,
          owner: g.owner,
        };
      }
    );
}