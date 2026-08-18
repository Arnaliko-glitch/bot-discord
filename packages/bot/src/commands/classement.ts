import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { SlashCommand } from './types.js';

const MEDALS = ['🥇', '🥈', '🥉'];
const LEADERBOARD_SIZE = 10;

interface LeaderboardEntry {
  userId: string;
  username: string;
  level: number;
  xp: number;
}

export const classementCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('classement')
    .setDescription('Affiche le top 10 du serveur par expérience') as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: 'Cette commande n\'est utilisable que sur un serveur.', flags: MessageFlags.Ephemeral });
      return;
    }

    const settings = await prisma.xpSettings.findUnique({ where: { guildId: guild.id } });
    if (!settings?.enabled) {
      await interaction.reply({ content: 'Le module de niveaux n\'est pas activé sur ce serveur.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply();

    const top = await prisma.userXp.findMany({
      where: { guildId: guild.id },
      orderBy: { xp: 'desc' },
      take: LEADERBOARD_SIZE,
    });

    // Le nom "affiché" (pseudo serveur > nom global > pseudo Discord) peut
    // avoir changé depuis le dernier gain d'xp — on le résout via le cache
    // membres (déjà rempli pour un petit serveur grâce à l'intent
    // GuildMembers, pas besoin d'un fetch réseau), repli sur la colonne
    // "username" stockée si absent du cache (membre parti, gros serveur...).
    const entries: LeaderboardEntry[] = top.map((t) => ({
      userId: t.discordUserId,
      username: guild.members.cache.get(t.discordUserId)?.displayName ?? t.username,
      level: t.level,
      xp: t.xp,
    }));

    if (entries.length < LEADERBOARD_SIZE) {
      const existingIds = new Set(entries.map((e) => e.userId));
      for (const member of guild.members.cache.values()) {
        if (entries.length >= LEADERBOARD_SIZE) break;
        if (member.user.bot || existingIds.has(member.id)) continue;
        entries.push({ userId: member.id, username: member.displayName, level: 0, xp: 0 });
        existingIds.add(member.id);
      }
    }

    if (entries.length === 0) {
      await interaction.editReply({ content: 'Aucun membre à afficher.' });
      return;
    }

    const lines = entries.map((entry, i) => {
      const rank = MEDALS[i] ?? `**${i + 1}.**`;
      return `${rank} ${entry.username}\n└ Niveau ${entry.level} • ${entry.xp} XP`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xf0a020)
      .setTitle('🏆 Classement des niveaux')
      .setDescription(lines.join('\n\n'))
      .setFooter({
        text: interaction.client.user.username,
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .setTimestamp();

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
    const components = appUrl
      ? [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel('Voir le classement complet')
              .setStyle(ButtonStyle.Link)
              .setURL(`${appUrl}/leaderboard/${guild.id}`)
          ),
        ]
      : [];

    await interaction.editReply({ embeds: [embed], components });
  },
};
