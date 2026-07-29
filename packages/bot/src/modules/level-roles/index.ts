import type { Guild, GuildMember } from 'discord.js';
import type { BotModuleHandler } from '../../client.js';
import { prisma } from '@discord-bot-dashboard/database';

export async function applyLevelRoles(guild: Guild, member: GuildMember, level: number) {
  const { prisma: db } = await import('@discord-bot-dashboard/database');
  const levelRoles = await db.levelRole.findMany({
    where: { guildId: guild.id, level: { lte: level } },
    orderBy: { level: 'asc' },
  });

  if (levelRoles.length === 0) return;

  const xpSettings = await db.xpSettings.findUnique({ where: { guildId: guild.id } });
  const stackRoles = xpSettings?.stackRoles ?? false;

  const rolesToAdd = stackRoles
    ? levelRoles.map((lr) => lr.roleId)
    : [levelRoles[levelRoles.length - 1]!.roleId];

  for (const roleId of rolesToAdd) {
    const role = guild.roles.cache.get(roleId);
    if (role && !member.roles.cache.has(roleId)) {
      await member.roles.add(role).catch(() => undefined);
    }
  }

  if (!stackRoles && levelRoles.length > 1) {
    const keepRole = levelRoles[levelRoles.length - 1]!.roleId;
    for (const lr of levelRoles.slice(0, -1)) {
      if (member.roles.cache.has(lr.roleId)) {
        await member.roles.remove(lr.roleId).catch(() => undefined);
      }
    }
  }
}

export const levelRolesModule: BotModuleHandler = {
  name: 'levelRoles',
  register(client) {
    // Level roles are applied from XP module on level up
    client.on('guildMemberAdd', async (member) => {
      if (!(await client.isModuleEnabled(member.guild.id, 'levelRoles'))) return;
      const data = await prisma.userXp.findUnique({
        where: { guildId_discordUserId: { guildId: member.guild.id, discordUserId: member.id } },
      });
      if (data && data.level > 0) {
        await applyLevelRoles(member.guild, member, data.level);
      }
    });
  },
};
