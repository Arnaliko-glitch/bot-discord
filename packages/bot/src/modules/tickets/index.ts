import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type TextChannel,
} from 'discord.js';
import type { BotClient, BotModuleHandler } from '../../client.js';
import { prisma, type TicketConfig } from '@discord-bot-dashboard/database';
import { createLogEntry, ensureGuild } from '../../utils/guild.js';

export const ticketsModule: BotModuleHandler = {
  name: 'tickets',
  register(client: BotClient) {
    client.on('interactionCreate', async (interaction) => {
      if (!interaction.guild) return;
      if (!(await client.isModuleEnabled(interaction.guild.id, 'tickets'))) return;

      if (interaction.isChatInputCommand() && interaction.commandName === 'ticket') {
        await handleTicketCommand(interaction);
        return;
      }

      if (interaction.isButton()) {
        if (interaction.customId === 'ticket_create') {
          await createTicket(interaction);
        } else if (interaction.customId === 'ticket_close') {
          await requestClose(interaction);
        } else if (interaction.customId === 'ticket_close_confirm') {
          await confirmClose(interaction);
        } else if (interaction.customId === 'ticket_close_cancel') {
          await interaction.update({ content: 'Fermeture annulée.', components: [] });
        } else if (interaction.customId === 'ticket_reopen') {
          await reopenTicket(interaction);
        } else if (interaction.customId === 'ticket_delete') {
          await deleteTicketChannel(interaction);
        }
      }
    });
  },
};

async function handleTicketCommand(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  await ensureGuild(interaction.guild!.id, interaction.guild!.name, interaction.guild!.ownerId);

  if (sub === 'panel') {
    const config = await prisma.ticketConfig.findUnique({ where: { guildId: interaction.guild!.id } });
    if (!config?.enabled) {
      await interaction.reply({ content: '❌ Le module tickets est désactivé.', ephemeral: true });
      return;
    }

    const target = config.panelChannelId
      ? (interaction.guild!.channels.cache.get(config.panelChannelId) as TextChannel | undefined)
      : (interaction.channel as TextChannel);

    if (!target?.isTextBased()) {
      await interaction.reply({
        content: '❌ Salon du panel introuvable. Vérifiez la configuration du dashboard.',
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🎫 Support')
      .setDescription(config.panelMessage)
      .setColor('#5865F2');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ticket_create').setLabel('Ouvrir un ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫')
    );

    await interaction.reply({ content: `✅ Panel créé dans ${target} !`, ephemeral: true });
    await target.send({ embeds: [embed], components: [row] });
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

async function requestClose(interaction: ButtonInteraction) {
  const config = await prisma.ticketConfig.findUnique({ where: { guildId: interaction.guild!.id } });

  if (!config?.closeConfirmation) {
    await closeTicket(interaction);
    return;
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('ticket_close_confirm').setLabel('Confirmer').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket_close_cancel').setLabel('Annuler').setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({
    content: 'Confirmez-vous la fermeture de ce ticket ?',
    components: [row],
    ephemeral: true,
  });
}

async function confirmClose(interaction: ButtonInteraction) {
  await interaction.update({ content: 'Fermeture en cours...', components: [] });
  await closeTicket(interaction, true);
}

async function closeTicket(interaction: ButtonInteraction, alreadyReplied = false) {
  const ticket = await prisma.ticket.findFirst({
    where: { channelId: interaction.channelId, status: 'open' },
  });
  if (!ticket) {
    await respond(interaction, alreadyReplied, { content: '❌ Ticket introuvable.', ephemeral: true });
    return;
  }

  const config = await prisma.ticketConfig.findUnique({ where: { guildId: interaction.guild!.id } });
  const channel = interaction.channel as TextChannel;

  if (config?.transcriptEnabled) {
    await sendTranscript(channel, ticket.creatorId, config);
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

  await channel.permissionOverwrites
    .edit(ticket.creatorId, { SendMessages: false })
    .catch(() => undefined);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('ticket_reopen').setLabel('Rouvrir').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket_delete').setLabel('Supprimer le salon').setStyle(ButtonStyle.Danger)
  );

  if (config?.deleteOnClose) {
    await channel.send({
      content: `🔒 Ticket fermé. Le salon sera supprimé dans ${config.deleteDelaySeconds}s.`,
    });
    setTimeout(() => {
      void channel.delete().catch(() => undefined);
    }, config.deleteDelaySeconds * 1000);
  } else {
    await channel.send({ content: '🔒 Ticket fermé.', components: [row] });
  }

  await respond(interaction, alreadyReplied, { content: '🔒 Ticket fermé.', ephemeral: true });
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

  await (interaction.channel as TextChannel).permissionOverwrites
    .edit(ticket.creatorId, { SendMessages: true })
    .catch(() => undefined);

  await interaction.reply({ content: '🔓 Ticket rouvert.' });
}

async function deleteTicketChannel(interaction: ButtonInteraction) {
  const config = await prisma.ticketConfig.findUnique({ where: { guildId: interaction.guild!.id } });
  if (!canManageTickets(interaction.member as GuildMember | null, config)) {
    await interaction.reply({ content: '❌ Seul le support peut supprimer ce salon.', ephemeral: true });
    return;
  }

  await interaction.reply({ content: '🗑️ Suppression du salon...' });
  await (interaction.channel as TextChannel).delete().catch(() => undefined);
}

async function closeTicketFromCommand(interaction: ChatInputCommandInteraction) {
  const ticket = await prisma.ticket.findFirst({
    where: { channelId: interaction.channelId, status: 'open' },
  });
  if (!ticket) {
    await interaction.reply({ content: '❌ Aucun ticket ouvert ici.', ephemeral: true });
    return;
  }

  const config = await prisma.ticketConfig.findUnique({ where: { guildId: interaction.guild!.id } });
  const channel = interaction.channel as TextChannel;

  if (config?.transcriptEnabled) {
    await sendTranscript(channel, ticket.creatorId, config);
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

  await channel.permissionOverwrites.edit(ticket.creatorId, { SendMessages: false }).catch(() => undefined);

  if (config?.deleteOnClose) {
    await interaction.reply({
      content: `🔒 Ticket fermé. Le salon sera supprimé dans ${config.deleteDelaySeconds}s.`,
    });
    setTimeout(() => {
      void channel.delete().catch(() => undefined);
    }, config.deleteDelaySeconds * 1000);
    return;
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('ticket_reopen').setLabel('Rouvrir').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket_delete').setLabel('Supprimer le salon').setStyle(ButtonStyle.Danger)
  );

  await interaction.reply({ content: '🔒 Ticket fermé.', components: [row] });
}

function canManageTickets(member: GuildMember | null, config: TicketConfig | null): boolean {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
  return Boolean(config?.supportRoleId && member.roles.cache.has(config.supportRoleId));
}

async function respond(
  interaction: ButtonInteraction,
  alreadyReplied: boolean,
  options: { content: string; ephemeral: boolean }
) {
  if (alreadyReplied) {
    await interaction.followUp(options).catch(() => undefined);
  } else {
    await interaction.reply(options).catch(() => undefined);
  }
}

async function buildTranscript(channel: TextChannel): Promise<string> {
  const lines: string[] = [];
  let before: string | undefined;

  while (lines.length < 5000) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;

    for (const message of batch.values()) {
      const attachments = message.attachments.map((a) => a.url).join(' ');
      lines.push(
        `[${message.createdAt.toISOString()}] ${message.author.tag}: ${message.content}${attachments ? ` ${attachments}` : ''}`
      );
    }

    before = batch.last()?.id;
    if (batch.size < 100) break;
  }

  const header = `Transcript du salon #${channel.name} (${channel.id}) — ${new Date().toISOString()}`;
  return [header, '', ...lines.reverse()].join('\n');
}

async function sendTranscript(channel: TextChannel, creatorId: string, config: TicketConfig) {
  const transcript = await buildTranscript(channel).catch(() => null);
  if (!transcript) return;

  const file = new AttachmentBuilder(Buffer.from(transcript, 'utf-8'), {
    name: `transcript-${channel.name}.txt`,
  });

  const settings = await prisma.guildSettings.findUnique({ where: { guildId: channel.guild.id } });
  const archiveChannelId = config.transcriptChannelId ?? settings?.logChannelId;

  if (archiveChannelId) {
    const archive = channel.guild.channels.cache.get(archiveChannelId) as TextChannel | undefined;
    if (archive?.isTextBased()) {
      await archive.send({ content: `📄 Transcript de #${channel.name}`, files: [file] }).catch(() => undefined);
    }
  }

  const creator = await channel.guild.members.fetch(creatorId).catch(() => null);
  await creator?.send({
    content: `📄 Transcript de votre ticket sur **${channel.guild.name}**`,
    files: [new AttachmentBuilder(Buffer.from(transcript, 'utf-8'), { name: `transcript-${channel.name}.txt` })],
  }).catch(() => undefined);
}
