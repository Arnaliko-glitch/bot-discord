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
  // Pseudo de connexion Discord (ex: "jtefumesousweed"), distinct du pseudo
  // affiché — absent si le membre n'est plus dans le cache (parti du
  // serveur), auquel cas rien n'est stocké en base pour le retrouver.
  handle: string | null;
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
    const entries: LeaderboardEntry[] = top.map((t) => {
      const member = guild.members.cache.get(t.discordUserId);
      return {
        userId: t.discordUserId,
        username: member?.displayName ?? t.username,
        handle: member?.user.username ?? t.handle,
        level: t.level,
        xp: t.xp,
      };
    });

    if (entries.length < LEADERBOARD_SIZE) {
      const existingIds = new Set(entries.map((e) => e.userId));
      for (const member of guild.members.cache.values()) {
        if (entries.length >= LEADERBOARD_SIZE) break;
        if (member.user.bot || existingIds.has(member.id)) continue;
        entries.push({ userId: member.id, username: member.displayName, handle: member.user.username, level: 0, xp: 0 });
        existingIds.add(member.id);
      }
    }

    if (entries.length === 0) {
      await interaction.editReply({ content: 'Aucun membre à afficher.' });
      return;
    }

    const lines = entries.map((entry, i) => {
      const rank = MEDALS[i] ?? `**${i + 1}.**`;
      const handle = entry.handle ? ` \`@${entry.handle}\`` : '';
      return `${rank} **${entry.username}**${handle}\n└ Niveau ${entry.level} • ${entry.xp} XP`;
    });

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
    const leaderboardUrl = appUrl && settings.publicLeaderboardEnabled ? `${appUrl}/leaderboard/${guild.id}` : null;

    const embed = new EmbedBuilder()
      .setColor(0xf0a020)
      .setTitle(`🏆 Classement de niveaux de : ${guild.name}`)
      .setThumbnail(guild.iconURL())
      // Une ligne vide "pure" est trim/collapsée par le rendu Discord — un
      // espace de largeur nulle force une vraie ligne visible.
      // Espace supplémentaire entre le podium (médailles) et le reste du
      // classement — une ligne vide "pure" est trim/collapsée par Discord,
      // d'où l'espace de largeur nulle (même astuce que pour le titre).
      .setDescription(`​\n${lines.map((line, i) => (i === 3 ? `​\n${line}` : line)).join('\n')}`)
      .setFooter({
        text: interaction.client.user.username,
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .setTimestamp();
    if (leaderboardUrl) embed.setURL(leaderboardUrl);

    const components = leaderboardUrl
      ? [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setLabel('Voir le classement complet').setStyle(ButtonStyle.Link).setURL(leaderboardUrl)
          ),
        ]
      : [];

    await interaction.editReply({ embeds: [embed], components });
  },
};
