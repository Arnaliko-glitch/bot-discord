import {
  AttachmentBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { SlashCommand } from './types.js';
import { levelForXp, levelProgress } from '@discord-bot-dashboard/shared';
import { ACCENT, generateRankCard } from '../utils/rankCard.js';

const DEFAULT_CURVE_STYLE = 'exponential';
const DEFAULT_CURVE_MULTIPLIER = 1;
const DEFAULT_MAX_LEVEL = 0;

export const niveauCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('niveau')
    .setDescription('Affiche le niveau et la progression d\'un membre')
    .addUserOption((option) =>
      option.setName('membre').setDescription('Le membre dont vous voulez voir le niveau').setRequired(false)
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      await interaction.reply({ content: 'Cette commande n\'est utilisable que sur un serveur.', flags: MessageFlags.Ephemeral });
      return;
    }

    // Accusé de réception tout de suite : les requêtes DB qui suivent
    // pourraient sinon dépasser la fenêtre de 3s de Discord et faire
    // échouer l'interaction avant même d'avoir pu répondre.
    await interaction.deferReply();

    const target = interaction.options.getUser('membre') ?? interaction.user;
    const settings = await prisma.xpSettings.findUnique({ where: { guildId: interaction.guild.id } });

    if (!settings?.enabled) {
      await interaction.editReply({ content: 'Le module de niveaux n\'est pas activé sur ce serveur.' });
      return;
    }

    if (
      target.id !== interaction.user.id &&
      !settings.viewOthersLevel &&
      !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    ) {
      await interaction.editReply({ content: 'Vous ne pouvez pas consulter le niveau des autres membres.' });
      return;
    }

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      await interaction.editReply({ content: 'Ce membre est introuvable sur ce serveur.' });
      return;
    }

    const userXp = await prisma.userXp.findUnique({
      where: { guildId_discordUserId: { guildId: interaction.guild.id, discordUserId: target.id } },
    });
    const xp = userXp?.xp ?? 0;
    const curveStyle = settings.curveStyle ?? DEFAULT_CURVE_STYLE;
    const curveMultiplier = settings.curveMultiplier ?? DEFAULT_CURVE_MULTIPLIER;
    const maxLevel = settings.maxLevel ?? DEFAULT_MAX_LEVEL;
    const level = levelForXp(xp, curveStyle, curveMultiplier, maxLevel);
    const { xpIntoLevel, xpForNextLevel } = levelProgress(xp, level, curveStyle, curveMultiplier);

    const place =
      1 + (await prisma.userXp.count({ where: { guildId: interaction.guild.id, xp: { gt: xp } } }));

    const card = await generateRankCard({
      avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 128 }),
      username: member.displayName,
      place,
      level,
      xpIntoLevel,
      xpForNextLevel,
    });

    const attachment = new AttachmentBuilder(card, { name: 'rank.png' });
    const embed = new EmbedBuilder().setColor(ACCENT).setImage('attachment://rank.png');
    await interaction.editReply({ embeds: [embed], files: [attachment] });
  },
};
