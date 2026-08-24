import crypto from 'node:crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Interaction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { Ticket, TicketConfig, TicketRequest } from '@discord-bot-dashboard/database';
import { createTicketChannel } from './createTicket.js';
import {
  buildConfirmEmbed,
  canModerateTicket,
  closeTicket,
  deleteTicket,
  reopenTicket,
  resolveDisplayName,
  CLOSE_CONFIRM_ROW,
  DELETE_CONFIRM_ROW,
  REOPEN_CONFIRM_ROW,
  type TicketInteraction,
} from './ticketActions.js';
import {
  TICKET_APPROVE_PREFIX,
  TICKET_CLOSE_BUTTON_ID,
  TICKET_CLOSE_CONFIRM_NO,
  TICKET_CLOSE_CONFIRM_YES,
  TICKET_CLOSE_REASON_INPUT_ID,
  TICKET_CLOSE_REASON_MODAL_ID,
  TICKET_CREATE_BUTTON_ID,
  TICKET_DELETE_BUTTON_ID,
  TICKET_DELETE_CONFIRM_NO,
  TICKET_DELETE_CONFIRM_YES,
  TICKET_DENY_PREFIX,
  TICKET_DENY_REASON_INPUT_ID,
  TICKET_DENY_REASON_MODAL_PREFIX,
  TICKET_REASON_INPUT_ID,
  TICKET_REASON_MODAL_ID,
  TICKET_REOPEN_BUTTON_ID,
  TICKET_REOPEN_CONFIRM_NO,
  TICKET_REOPEN_CONFIRM_YES,
} from './constants.js';

async function openTicketRequest(interaction: ButtonInteraction | ModalSubmitInteraction, reason: string | null) {
  const guild = interaction.guild;
  if (!guild) return;

  const config = await prisma.ticketConfig.findUnique({ where: { guildId: guild.id } });
  if (!config?.enabled) {
    await interaction.reply({ content: 'Le module de tickets n\'est pas activé sur ce serveur.', flags: MessageFlags.Ephemeral });
    return;
  }

  const [openCount, pendingCount] = await Promise.all([
    prisma.ticket.count({ where: { guildId: guild.id, creatorId: interaction.user.id, status: 'open' } }),
    prisma.ticketRequest.count({ where: { guildId: guild.id, requesterId: interaction.user.id, status: 'pending' } }),
  ]);
  if (openCount + pendingCount >= config.maxOpenPerUser) {
    await interaction.reply({
      content: `Vous avez déjà atteint la limite de ${config.maxOpenPerUser} ticket(s) ouvert(s).`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const requesterName = resolveDisplayName(interaction);

  const confirmEmbed = new EmbedBuilder()
    .setColor(0x8a63f2)
    .setAuthor({ name: requesterName, iconURL: interaction.user.displayAvatarURL() })
    .setDescription(config.confirmationMessage)
    .setFooter({ text: 'Système de Tickets', iconURL: interaction.client.user.displayAvatarURL() })
    .setTimestamp();
  await interaction.reply({ embeds: [confirmEmbed], flags: MessageFlags.Ephemeral });

  if (!config.validationEnabled) {
    await createTicketChannel(guild, interaction.user, reason, config);
    return;
  }

  const request = await prisma.ticketRequest.create({
    data: {
      id: crypto.randomUUID(),
      guildId: guild.id,
      requesterId: interaction.user.id,
      requesterName,
      reason,
      status: 'pending',
    },
  });

  if (!config.logChannelId) return;
  const logChannel =
    guild.channels.cache.get(config.logChannelId) ?? (await guild.channels.fetch(config.logChannelId).catch(() => null));
  if (!logChannel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setColor(0x8a63f2)
    .setAuthor({ name: `Ticket demandé par ${requesterName}`, iconURL: interaction.user.displayAvatarURL() })
    .setFooter({ text: 'Ticket en attente' })
    .setTimestamp();
  if (reason) embed.setDescription(`**Raison :** ${reason}`);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${TICKET_APPROVE_PREFIX}${request.id}`).setLabel('Accepter').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${TICKET_DENY_PREFIX}${request.id}`).setLabel('Refuser').setStyle(ButtonStyle.Danger)
  );

  const validationMessage = await logChannel.send({ embeds: [embed], components: [row] });
  await prisma.ticketRequest.update({
    where: { id: request.id },
    data: { validationChannelId: logChannel.id, validationMessageId: validationMessage.id },
  });
}

// Charge la demande visée par un bouton d'accepter/refuser et vérifie les
// permissions — répond directement avec un message d'erreur si quelque
// chose ne va pas, auquel cas l'appelant doit s'arrêter là.
async function resolveRequest(
  interaction: TicketInteraction,
  requestId: string
): Promise<{ request: TicketRequest; config: TicketConfig } | null> {
  const guild = interaction.guild;
  if (!guild) return null;

  const request = await prisma.ticketRequest.findUnique({ where: { id: requestId } });
  if (!request || request.guildId !== guild.id) {
    await interaction.reply({ content: 'Demande introuvable.', flags: MessageFlags.Ephemeral });
    return null;
  }
  if (request.status !== 'pending') {
    await interaction.reply({ content: 'Cette demande a déjà été traitée.', flags: MessageFlags.Ephemeral });
    return null;
  }

  const config = await prisma.ticketConfig.findUnique({ where: { guildId: guild.id } });
  if (!config) return null;
  if (!canModerateTicket(interaction, config)) {
    await interaction.reply({ content: 'Vous n\'avez pas la permission de traiter cette demande.', flags: MessageFlags.Ephemeral });
    return null;
  }

  return { request, config };
}

async function handleApprove(interaction: ButtonInteraction) {
  const requestId = interaction.customId.slice(TICKET_APPROVE_PREFIX.length);
  const resolved = await resolveRequest(interaction, requestId);
  if (!resolved) return;
  const { request, config } = resolved;
  const guild = interaction.guild!;

  await interaction.deferUpdate();
  await prisma.ticketRequest.update({
    where: { id: request.id },
    data: { status: 'approved', decidedBy: interaction.user.id },
  });

  const requester = await interaction.client.users.fetch(request.requesterId).catch(() => null);
  const channel = requester
    ? await createTicketChannel(guild, requester, request.reason, config, interaction.user, request.id)
    : null;

  const decisionEmbed = new EmbedBuilder()
    .setColor(0x57f287)
    .setAuthor({ name: `Ticket demandé par ${request.requesterName}`, iconURL: requester?.displayAvatarURL() })
    .setFooter({ text: `Accepté par ${resolveDisplayName(interaction)}`, iconURL: interaction.user.displayAvatarURL() })
    .setTimestamp();
  if (request.reason) decisionEmbed.setDescription(`**Raison :** ${request.reason}`);
  await interaction.editReply({ embeds: [decisionEmbed], components: [] });

  if (requester && channel) {
    await interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(`✅ Le ticket de <@${requester.id}> a été créé dans le salon **#${channel.name}** !`),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleDenyButton(interaction: ButtonInteraction) {
  const requestId = interaction.customId.slice(TICKET_DENY_PREFIX.length);
  const resolved = await resolveRequest(interaction, requestId);
  if (!resolved) return;

  const modal = new ModalBuilder()
    .setCustomId(`${TICKET_DENY_REASON_MODAL_PREFIX}${requestId}`)
    .setTitle('Refuser un ticket');
  const input = new TextInputBuilder()
    .setCustomId(TICKET_DENY_REASON_INPUT_ID)
    .setLabel('Raison')
    .setPlaceholder('Pour quelle raison refusez-vous ce ticket ?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

async function handleDenyReasonModal(interaction: ModalSubmitInteraction) {
  if (!interaction.isFromMessage()) return;
  const requestId = interaction.customId.slice(TICKET_DENY_REASON_MODAL_PREFIX.length);
  const resolved = await resolveRequest(interaction, requestId);
  if (!resolved) return;
  const { request } = resolved;
  const denyReason = interaction.fields.getTextInputValue(TICKET_DENY_REASON_INPUT_ID).trim();

  await interaction.deferUpdate();
  await prisma.ticketRequest.update({
    where: { id: request.id },
    data: { status: 'denied', denyReason, decidedBy: interaction.user.id },
  });

  const requester = await interaction.client.users.fetch(request.requesterId).catch(() => null);

  const decisionEmbed = new EmbedBuilder()
    .setColor(0xed4245)
    .setAuthor({ name: `Ticket demandé par ${request.requesterName}`, iconURL: requester?.displayAvatarURL() })
    .setFooter({ text: `Refusé par ${resolveDisplayName(interaction)}`, iconURL: interaction.user.displayAvatarURL() })
    .setTimestamp();
  const lines = [request.reason ? `**Raison :** ${request.reason}` : null, `**Raison du refus :** ${denyReason}`].filter(Boolean);
  decisionEmbed.setDescription(lines.join('\n'));
  await interaction.editReply({ embeds: [decisionEmbed], components: [] });
  await interaction.followUp({ content: '✅ Le ticket a bien été refusé.', flags: MessageFlags.Ephemeral });

  if (requester && interaction.guild) {
    const reasonClause = request.reason ? ` avec la raison ${request.reason}` : '';
    const dmEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setDescription(
        `💡 Votre ticket sur le serveur **${interaction.guild.name}**${reasonClause} n'a pas été accepté.\n**Raison du refus :** ${denyReason}\n\n*N'hésitez pas à reformuler votre demande.*`
      );
    await requester.send({ embeds: [dmEmbed] }).catch(() => undefined);
  }
}

// Charge le ticket du salon courant et vérifie son statut — répond
// directement avec une erreur en cas de souci, l'appelant doit alors
// s'arrêter là.
async function resolveTicket(
  interaction: TicketInteraction,
  expectedStatus: 'open' | 'closed'
): Promise<{ ticket: Ticket; config: TicketConfig } | null> {
  const guild = interaction.guild;
  if (!guild) return null;

  const ticket = await prisma.ticket.findUnique({ where: { channelId: interaction.channelId ?? '' } });
  if (!ticket || ticket.status !== expectedStatus) {
    await interaction.reply({
      content: expectedStatus === 'open' ? 'Ce ticket est introuvable ou déjà fermé.' : 'Ce ticket est introuvable ou n\'est pas fermé.',
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  const config = await prisma.ticketConfig.findUnique({ where: { guildId: guild.id } });
  if (!config) return null;
  return { ticket, config };
}

async function handleCloseButton(interaction: ButtonInteraction) {
  const resolved = await resolveTicket(interaction, 'open');
  if (!resolved) return;
  const { ticket, config } = resolved;

  const isCreator = interaction.user.id === ticket.creatorId;
  if (!isCreator && config.askCloseReason) {
    const modal = new ModalBuilder().setCustomId(TICKET_CLOSE_REASON_MODAL_ID).setTitle('Fermeture du ticket');
    const input = new TextInputBuilder()
      .setCustomId(TICKET_CLOSE_REASON_INPUT_ID)
      .setLabel('Raison')
      .setPlaceholder(
        'Pour quelle raison souhaitez-vous fermer ce ticket ?\n(laisser vide pour ne pas MP l\'utilisateur)'
      )
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(1000);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  await interaction.reply({
    embeds: [buildConfirmEmbed('Êtes-vous sûr de vouloir fermer ce ticket ?')],
    components: [CLOSE_CONFIRM_ROW()],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleCloseReasonModal(interaction: ModalSubmitInteraction) {
  if (!interaction.isFromMessage()) return;
  const resolved = await resolveTicket(interaction, 'open');
  if (!resolved) return;
  const { ticket, config } = resolved;

  const reason = interaction.fields.getTextInputValue(TICKET_CLOSE_REASON_INPUT_ID).trim() || null;
  await interaction.deferUpdate();
  await closeTicket(interaction, ticket, config, reason);
}

async function handleCloseConfirm(interaction: ButtonInteraction, confirmed: boolean) {
  if (!confirmed) {
    await interaction.update({ content: 'Annulé.', embeds: [], components: [] });
    return;
  }
  const resolved = await resolveTicket(interaction, 'open');
  if (!resolved) return;
  await interaction.update({ content: 'Fermeture en cours...', embeds: [], components: [] });
  await closeTicket(interaction, resolved.ticket, resolved.config, null);
}

async function handleReopenButton(interaction: ButtonInteraction) {
  const resolved = await resolveTicket(interaction, 'closed');
  if (!resolved) return;

  if (!canModerateTicket(interaction, resolved.config)) {
    await interaction.reply({ content: 'Vous n\'avez pas la permission de réouvrir ce ticket.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.reply({
    embeds: [buildConfirmEmbed('Êtes-vous sûr de vouloir réouvrir ce ticket ?')],
    components: [REOPEN_CONFIRM_ROW()],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleReopenConfirm(interaction: ButtonInteraction, confirmed: boolean) {
  if (!confirmed) {
    await interaction.update({ content: 'Annulé.', embeds: [], components: [] });
    return;
  }
  const resolved = await resolveTicket(interaction, 'closed');
  if (!resolved) return;
  if (!canModerateTicket(interaction, resolved.config)) {
    await interaction.update({ content: 'Vous n\'avez pas la permission de réouvrir ce ticket.', embeds: [], components: [] });
    return;
  }
  await interaction.update({ content: 'Réouverture en cours...', embeds: [], components: [] });
  await reopenTicket(interaction, resolved.ticket, resolved.config);
}

async function handleDeleteButton(interaction: ButtonInteraction) {
  const resolved = await resolveTicket(interaction, 'closed');
  if (!resolved) return;

  if (!canModerateTicket(interaction, resolved.config)) {
    await interaction.reply({ content: 'Vous n\'avez pas la permission de supprimer ce ticket.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.reply({
    embeds: [buildConfirmEmbed('Êtes-vous sûr de vouloir supprimer définitivement ce ticket ?')],
    components: [DELETE_CONFIRM_ROW()],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleDeleteConfirm(interaction: ButtonInteraction, confirmed: boolean) {
  if (!confirmed) {
    await interaction.update({ content: 'Annulé.', embeds: [], components: [] });
    return;
  }
  const resolved = await resolveTicket(interaction, 'closed');
  if (!resolved) return;
  if (!canModerateTicket(interaction, resolved.config)) {
    await interaction.update({ content: 'Vous n\'avez pas la permission de supprimer ce ticket.', embeds: [], components: [] });
    return;
  }
  await interaction.update({ content: 'Suppression en cours...', embeds: [], components: [] });
  await deleteTicket(interaction, resolved.ticket, resolved.config);
}

export async function handleTicketInteraction(interaction: Interaction): Promise<boolean> {
  if (interaction.isButton()) {
    if (interaction.customId === TICKET_CREATE_BUTTON_ID) {
      const guild = interaction.guild;
      if (!guild) return true;
      const config = await prisma.ticketConfig.findUnique({ where: { guildId: guild.id } });
      if (config?.askOpenReason) {
        const modal = new ModalBuilder().setCustomId(TICKET_REASON_MODAL_ID).setTitle('Ouverture de ticket');
        const input = new TextInputBuilder()
          .setCustomId(TICKET_REASON_INPUT_ID)
          .setLabel('Décrivez votre problème')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
        await interaction.showModal(modal);
      } else {
        await openTicketRequest(interaction, null);
      }
      return true;
    }

    if (interaction.customId.startsWith(TICKET_APPROVE_PREFIX)) {
      await handleApprove(interaction);
      return true;
    }
    if (interaction.customId.startsWith(TICKET_DENY_PREFIX)) {
      await handleDenyButton(interaction);
      return true;
    }
    if (interaction.customId === TICKET_CLOSE_BUTTON_ID) {
      await handleCloseButton(interaction);
      return true;
    }
    if (interaction.customId === TICKET_REOPEN_BUTTON_ID) {
      await handleReopenButton(interaction);
      return true;
    }
    if (interaction.customId === TICKET_DELETE_BUTTON_ID) {
      await handleDeleteButton(interaction);
      return true;
    }
    if (interaction.customId === TICKET_CLOSE_CONFIRM_YES || interaction.customId === TICKET_CLOSE_CONFIRM_NO) {
      await handleCloseConfirm(interaction, interaction.customId === TICKET_CLOSE_CONFIRM_YES);
      return true;
    }
    if (interaction.customId === TICKET_REOPEN_CONFIRM_YES || interaction.customId === TICKET_REOPEN_CONFIRM_NO) {
      await handleReopenConfirm(interaction, interaction.customId === TICKET_REOPEN_CONFIRM_YES);
      return true;
    }
    if (interaction.customId === TICKET_DELETE_CONFIRM_YES || interaction.customId === TICKET_DELETE_CONFIRM_NO) {
      await handleDeleteConfirm(interaction, interaction.customId === TICKET_DELETE_CONFIRM_YES);
      return true;
    }
    return false;
  }

  if (interaction.isModalSubmit() && interaction.customId === TICKET_REASON_MODAL_ID) {
    const reason = interaction.fields.getTextInputValue(TICKET_REASON_INPUT_ID);
    await openTicketRequest(interaction, reason);
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId === TICKET_CLOSE_REASON_MODAL_ID) {
    await handleCloseReasonModal(interaction);
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith(TICKET_DENY_REASON_MODAL_PREFIX)) {
    await handleDenyReasonModal(interaction);
    return true;
  }

  return false;
}
