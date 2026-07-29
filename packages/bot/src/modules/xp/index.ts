import { EmbedBuilder, type Message, type TextChannel } from 'discord.js';
import type { BotModuleHandler } from '../../client.js';
import { prisma } from '@discord-bot-dashboard/database';
import { levelFromXp, xpForLevel } from '@discord-bot-dashboard/shared';
import { ensureGuild, replacePlaceholders, createLogEntry } from '../../utils/guild.js';

const cooldowns = new Map<string, number>();

export const xpModule: BotModuleHandler = {
  name: 'xp',
  register(client) {
    client.on('messageCreate', async (message) => {
      if (message.author.bot || !message.guild) return;
      if (!(await client.isModuleEnabled(message.guild.id, 'xp'))) return;

      const settings = await prisma.xpSettings.findUnique({ where: { guildId: message.guild.id } });
      if (!settings?.enabled) return;

      if (settings.ignoredChannelIds.includes(message.channel.id)) return;
      if (message.member?.roles.cache.some((r) => settings.ignoredRoleIds.includes(r.id))) return;

      const key = `${message.guild.id}:${message.author.id}`;
      const now = Date.now();
      const last = cooldowns.get(key) ?? 0;
      if (now - last < settings.cooldownSeconds * 1000) return;
      cooldowns.set(key, now);

      await ensureGuild(message.guild.id, message.guild.name, message.guild.ownerId);

      const xpGain = Math.floor(Math.random() * (settings.xpMax - settings.xpMin + 1)) + settings.xpMin;

      const existing = await prisma.userXp.findUnique({
        where: { guildId_discordUserId: { guildId: message.guild.id, discordUserId: message.author.id } },
      });

      const newXp = (existing?.xp ?? 0) + xpGain;
      const newLevel = levelFromXp(newXp);
      const oldLevel = existing?.level ?? 0;

      await prisma.userXp.upsert({
        where: { guildId_discordUserId: { guildId: message.guild.id, discordUserId: message.author.id } },
        create: {
          guildId: message.guild.id,
          discordUserId: message.author.id,
          username: message.author.username,
          avatar: message.author.displayAvatarURL(),
          xp: newXp,
          level: newLevel,
          messageCount: 1,
          lastXpAt: new Date(),
        },
        update: {
          username: message.author.username,
          avatar: message.author.displayAvatarURL(),
          xp: newXp,
          level: newLevel,
          messageCount: { increment: 1 },
          lastXpAt: new Date(),
        },
      });

      if (newLevel > oldLevel) {
        await handleLevelUp(message, newLevel, settings);
      }
    });

    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand() || !interaction.guild) return;
      if (interaction.commandName !== 'rank') return;
      if (!(await client.isModuleEnabled(interaction.guild.id, 'xp'))) return;

      const target = interaction.options.getUser('user') ?? interaction.user;
      const data = await prisma.userXp.findUnique({
        where: { guildId_discordUserId: { guildId: interaction.guild.id, discordUserId: target.id } },
      });

      const xp = data?.xp ?? 0;
      const level = data?.level ?? 0;
      const nextXp = xpForLevel(level + 1);
      const currentXp = xpForLevel(level);

      const embed = new EmbedBuilder()
        .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
        .setColor('#5865F2')
        .addFields(
          { name: 'Niveau', value: String(level), inline: true },
          { name: 'XP', value: `${xp - currentXp}/${nextXp - currentXp}`, inline: true },
          { name: 'Messages', value: String(data?.messageCount ?? 0), inline: true }
        );

      await interaction.reply({ embeds: [embed] });
    });
  },
};

async function handleLevelUp(
  message: Message,
  level: number,
  settings: { levelUpChannelId: string | null; levelUpMessage: string; announceLevelUp: boolean }
) {
  await createLogEntry(message.guild!.id, 'level_up', {
    actorId: message.author.id,
    actorName: message.author.tag,
    metadata: { level },
  });

  if (!settings.announceLevelUp) return;

  const vars = { user: `<@${message.author.id}>`, level };
  const content = replacePlaceholders(settings.levelUpMessage, vars);

  const channelId = settings.levelUpChannelId ?? message.channel.id;
  const channel = message.guild!.channels.cache.get(channelId) as TextChannel | undefined;
  if (channel?.isTextBased()) {
    await channel.send(content).catch(() => undefined);
  }

  // Trigger level role module via event emission pattern - import dynamically
  const { applyLevelRoles } = await import('../level-roles/index.js');
  await applyLevelRoles(message.guild!, message.member!, level);
}
