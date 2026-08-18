import { Events, type GuildMember, type GuildBan } from 'discord.js';
import type { BotClient, BotModuleHandler } from '../../client.js';
import { resetUserXp } from './xp.js';
import { getXpSettings } from './settingsCache.js';

async function handleLeave(member: GuildMember) {
  const settings = await getXpSettings(member.guild.id);
  if (settings?.enabled && settings.resetXpOnLeave) await resetUserXp(member.guild.id, member.id);
}

async function handleBan(ban: GuildBan) {
  const settings = await getXpSettings(ban.guild.id);
  if (settings?.enabled && settings.resetXpOnBan) await resetUserXp(ban.guild.id, ban.user.id);
}

export const xpResetModule: BotModuleHandler = {
  name: 'xpReset',
  register(client: BotClient) {
    client.on(Events.GuildMemberRemove, (member) => {
      if (!member.guild) return;
      handleLeave(member as GuildMember).catch((err) => console.error('xpReset module (leave) failed:', err));
    });
    client.on(Events.GuildBanAdd, (ban) => {
      handleBan(ban).catch((err) => console.error('xpReset module (ban) failed:', err));
    });
  },
};
