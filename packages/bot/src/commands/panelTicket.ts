import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { SlashCommand } from './types.js';
import { TICKET_CREATE_BUTTON_ID } from '../modules/tickets/constants.js';

// Poste le panneau de création de ticket (embed + bouton) dans le salon où
// la commande est utilisée — remplace un composeur de message générique
// avec boutons, pas encore disponible.
export const panelTicketCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('panel-ticket')
    .setDescription('Poste le panneau de création de ticket dans ce salon')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    const channel = guild && interaction.channelId ? await guild.channels.fetch(interaction.channelId).catch(() => null) : null;
    if (!guild || !channel?.isTextBased()) {
      await interaction.reply({ content: 'Cette commande n\'est utilisable que dans un salon textuel.', flags: MessageFlags.Ephemeral });
      return;
    }

    const config = await prisma.ticketConfig.findUnique({ where: { guildId: guild.id } });
    if (!config?.enabled) {
      await interaction.reply({ content: 'Le module de tickets n\'est pas activé sur ce serveur.', flags: MessageFlags.Ephemeral });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🎫 Support')
      .setDescription('Cliquez sur le bouton ci-dessous pour ouvrir un ticket et contacter le staff.');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(TICKET_CREATE_BUTTON_ID).setLabel('Créer un ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary)
    );

    await channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: 'Panneau de ticket posté.', flags: MessageFlags.Ephemeral });
  },
};
