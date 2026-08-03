import type { BotClient } from '../../client.js';
import type { BotModuleHandler } from '../../client.js';
import { EmbedBuilder, TextChannel } from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import { ensureGuild, replacePlaceholders, createLogEntry } from '../../utils/guild.js';

export const welcomeModule: BotModuleHandler = {
  name: 'welcome',
  register(client: BotClient) {
    client.on('guildMemberAdd', async (member) => {
      if (!(await client.isModuleEnabled(member.guild.id, 'welcome'))) return;
      await ensureGuild(member.guild.id, member.guild.name, member.guild.ownerId, member.guild.icon);
      const config = await prisma.welcomeConfig.findUnique({ where: { guildId: member.guild.id } });
      if (!config?.enabled) return;
      await createLogEntry(member.guild.id, 'member_join', {
        actorId: member.id,
        actorName: member.user.tag,
      });
      const vars = {
        user: `<@${member.id}>`,
        username: member.user.username,
        server: member.guild.name,
        memberCount: member.guild.memberCount,
      };
      if (config.channelId) {
        const channel = member.guild.channels.cache.get(config.channelId) as TextChannel | undefined;
        if (channel?.isTextBased()) {
          if (config.useEmbed) {
            const embed = new EmbedBuilder()
              .setColor(config.embedColor as `#${string}`)
              .setDescription(replacePlaceholders(config.embedDescription, vars));
            if (config.embedTitle) embed.setTitle(replacePlaceholders(config.embedTitle, vars));
            if (config.embedThumbnail) embed.setThumbnail(member.user.displayAvatarURL({ size: 256 }));
            embed.setFooter({
              text: client.user!.username,
              iconURL: client.user!.displayAvatarURL(),
            }).setTimestamp();
            await channel.send({ embeds: [embed] }).catch(() => undefined);
          } else {
            await channel.send(replacePlaceholders(config.welcomeMessage, vars)).catch(() => undefined);
          }
        }
      }
      if (config.dmWelcome) {
        await member.send(replacePlaceholders(config.welcomeMessage, vars)).catch(() => undefined);
      }
    });
    client.on('guildMemberRemove', async (member) => {
      if (!(await client.isModuleEnabled(member.guild.id, 'welcome'))) return;
      const config = await prisma.welcomeConfig.findUnique({ where: { guildId: member.guild.id } });
      if (!config?.enabled) return;
      await createLogEntry(member.guild.id, 'member_leave', {
        actorId: member.id,
        actorName: member.user?.tag ?? 'Unknown',
      });
      const vars = {
        user: `<@${member.id}>`,
        username: member.user?.username ?? 'Unknown',
        server: member.guild.name,
        memberCount: member.guild.memberCount,
      };
      const channelId = config.goodbyeChannelId ?? config.channelId;
      if (channelId) {
        const channel = member.guild.channels.cache.get(channelId) as TextChannel | undefined;
        if (channel?.isTextBased()) {
          if (config.goodbyeUseEmbed) {
            const embed = new EmbedBuilder()
              .setColor(config.goodbyeEmbedColor as `#${string}`)
              .setDescription(replacePlaceholders(config.goodbyeEmbedDescription, vars));
            if (config.goodbyeEmbedTitle) embed.setTitle(replacePlaceholders(config.goodbyeEmbedTitle, vars));
            if (config.goodbyeEmbedThumbnail && member.user) {
              embed.setThumbnail(member.user.displayAvatarURL({ size: 256 }));
            }
            embed.setFooter({
              text: client.user!.username,
              iconURL: client.user!.displayAvatarURL(),
            }).setTimestamp();
            await channel.send({ embeds: [embed] }).catch(() => undefined);
          } else {
            await channel.send(replacePlaceholders(config.goodbyeMessage, vars)).catch(() => undefined);
          }
        }
      }
    });
  },
};
