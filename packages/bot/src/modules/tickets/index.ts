import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type ButtonInteraction,
  type TextChannel,
} from 'discord.js';
import type { BotClient, BotModuleHandler } from '../../client.js';
import { prisma } from '@discord-bot-dashboard/database';
import { createLogEntry, ensureGuild } from '../../utils/guild.js';

export const ticketsModule: BotModuleHandler = {
  name: 'tickets',
  register(client: BotClient) {
    client.on('interactionCreate', async (interaction) => {
      if (!interaction.guild) return;
      if (!(await client.isModuleEnabled(interaction.guild.id, 'tickets'))) return;

      if (interaction.isChatInputCommand() && interaction.commandName === 'ticket') {
        await handleTicketCommand(client, interaction);
        return;
      }

      if (interaction.isButton()) {
        if (interaction.customId === 'ticket_create') {
          await createTicket(interaction);
        } else if (interaction.customId === 'ticket_close') {
          await closeTicket(interaction);
        } else if (interaction.customId === 'ticket_reopen') {
          await reopenTicket(interaction);
        }
      }
    });
  },
};

async function handleTicketCommand(
  client: BotClient,
  interaction: import('discord.js').ChatInputCommandInteraction
) {
  const sub = interaction.options.getSubcommand();
  await ensureGuild(interaction.guild!.id, interaction.guild!.name, interaction.guild!.ownerId);

  if (sub === 'panel') {
    const config = await prisma.ticketConfig.findUnique({ where: { guildId: interaction.guild!.id } });
    if (!config?.enabled) {
      await interaction.reply({ content: '❌ Le module tickets est désactivé.', ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🎫 Support')
      .setDescription(config.panelMessage)
      .setColor('#5865F2');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ticket_create').setLabel('Ouvrir un ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫')
    );

    await interaction.reply({ content: '✅ Panel créé !', ephemeral: true });
    const channel = interaction.channel as TextChannel;
    await channel.send({ embeds: [embed], components: [row] });
    return;
  }

  if (sub === 'close') {
    await closeTicketFromCommand(interaction);
  }
}

async function createTicket(interaction: ButtonInteraction) {
  const guild = interaction.guild!;
  const config = await prisma.ticketConfig.findUnique({ where: { guildId: guild.id } });
  if (!config?.enabled) {
    await interaction.reply({ content: '❌ Tickets désactivés.', ephemeral: true });
    return;
  }

  const openCount = await prisma.ticket.count({
    where: { guildId: guild.id, creatorId: interaction.user.id, status: 'open' },
  });
  if (openCount >= config.maxOpenPerUser) {
    await interaction.reply({
      content: `❌ Vous avez déjà ${config.maxOpenPerUser} ticket(s) ouvert(s).`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const name = config.ticketNameFormat
    .replace('{username}', interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .slice(0, 90);

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: config.categoryId ?? undefined,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: interaction.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
      ...(config.supportRoleId
        ? [{
            id: config.supportRoleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          }]
        : []),
    ],
  });

  await prisma.ticket.create({
    data: {
      guildId: guild.id,
      channelId: channel.id,
      creatorId: interaction.user.id,
      creatorName: interaction.user.tag,
      status: 'open',
    },
  });

  await createLogEntry(guild.id, 'ticket_create', {
    actorId: interaction.user.id,
    actorName: interaction.user.tag,
    channelId: channel.id,
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Fermer').setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: `<@${interaction.user.id}> Bienvenue dans votre ticket !`,
    components: [row],
  });

  await interaction.editReply({ content: `✅ Ticket créé: ${channel}` });
}

async function closeTicket(interaction: ButtonInteraction) {
  const ticket = await prisma.ticket.findFirst({
    where: { channelId: interaction.channelId, status: 'open' },
  });
  if (!ticket) {
    await interaction.reply({ content: '❌ Ticket introuvable.', ephemeral: true });
    return;
  }

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: 'closed', closedBy: interaction.user.id, closedAt: new Date() },
  });

  await createLogEntry(interaction.guild!.id, 'ticket_close', {
    actorId: interaction.user.id,
    actorName: interaction.user.tag,
    channelId: interaction.channelId,
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('ticket_reopen').setLabel('Rouvrir').setStyle(ButtonStyle.Success)
  );

  await interaction.reply({ content: '🔒 Ticket fermé.', components: [row] });
}

async function reopenTicket(interaction: ButtonInteraction) {
  const ticket = await prisma.ticket.findFirst({
    where: { channelId: interaction.channelId, status: 'closed' },
  });
  if (!ticket) {
    await interaction.reply({ content: '❌ Ticket introuvable.', ephemeral: true });
    return;
  }

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: 'open', reopenedAt: new Date(), closedBy: null, closedAt: null },
  });

  await createLogEntry(interaction.guild!.id, 'ticket_reopen', {
    actorId: interaction.user.id,
    actorName: interaction.user.tag,
    channelId: interaction.channelId,
  });

  await interaction.reply({ content: '🔓 Ticket rouvert.' });
}

async function closeTicketFromCommand(interaction: import('discord.js').ChatInputCommandInteraction) {
  const ticket = await prisma.ticket.findFirst({
    where: { channelId: interaction.channelId, status: 'open' },
  });
  if (!ticket) {
    await interaction.reply({ content: '❌ Aucun ticket ouvert ici.', ephemeral: true });
    return;
  }

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: 'closed', closedBy: interaction.user.id, closedAt: new Date() },
  });

  await interaction.reply({ content: '🔒 Ticket fermé.' });
}
