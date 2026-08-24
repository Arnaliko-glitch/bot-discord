import crypto from 'node:crypto';
import { ChannelType, MessageType, PermissionsBitField, type Guild, type GuildMember, type OverwriteResolvable, type User } from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { TicketConfig } from '@discord-bot-dashboard/database';
import { buildCloseRow, openStateEmbed, ticketTopic } from './ticketActions.js';

const CHANNEL_ACCESS = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.ReadMessageHistory,
  PermissionsBitField.Flags.AttachFiles,
];

// Règles de nommage des salons Discord : minuscules, alphanumériques + tiret
// / underscore, 100 caractères max.
function sanitizeChannelName(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return (cleaned || 'ticket').slice(0, 100);
}

function buildChannelName(format: string, requester: User, requesterMember: GuildMember | null): string {
  const displayName = requesterMember?.displayName ?? requester.username;
  const name = format.replaceAll('{user.globalname}', displayName).replaceAll('{user.username}', requester.username);
  return sanitizeChannelName(name);
}

// Crée le salon de ticket (permissions, catégorie, message d'ouverture) et
// la ligne Ticket en base — utilisé aussi bien pour une création directe que
// pour l'approbation d'une demande passée par la validation.
export async function createTicketChannel(
  guild: Guild,
  requester: User,
  reason: string | null,
  config: TicketConfig,
  approvedBy?: User | null,
  requestId?: string | null
): Promise<import('discord.js').TextChannel> {
  const overwrites: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    { id: requester.id, allow: CHANNEL_ACCESS },
    ...config.moderatorRoleIds.map((roleId) => ({ id: roleId, allow: CHANNEL_ACCESS })),
    ...config.accessRoleIds.map((roleId) => ({ id: roleId, allow: CHANNEL_ACCESS })),
  ];

  const requesterMember = guild.members.cache.get(requester.id) ?? (await guild.members.fetch(requester.id).catch(() => null));
  const requesterDisplayName = requesterMember?.displayName ?? requester.username;

  const channel = await guild.channels.create({
    name: buildChannelName(config.ticketNameFormat, requester, requesterMember),
    type: ChannelType.GuildText,
    parent: config.categoryId ?? undefined,
    permissionOverwrites: overwrites,
    topic: ticketTopic('demandé', requester.id),
  });

  const ticket = await prisma.ticket.create({
    data: {
      id: crypto.randomUUID(),
      guildId: guild.id,
      channelId: channel.id,
      creatorId: requester.id,
      creatorName: requesterDisplayName,
      subject: reason,
      status: 'open',
      updatedAt: new Date(),
      requestId: requestId ?? null,
    },
  });

  const content = approvedBy
    ? `Bienvenue <@${requester.id}>, votre demande de ticket a été acceptée par <@${approvedBy.id}> !`
    : [
        config.mentionModerators ? config.moderatorRoleIds.map((roleId) => `<@&${roleId}>`).join(' ') : '',
        config.openingMessage.replaceAll('{user}', `<@${requester.id}>`),
      ]
        .filter(Boolean)
        .join('\n');

  const actionMessage = await channel.send({
    content,
    embeds: [openStateEmbed(guild.name, guild.iconURL() ?? undefined, reason, config.noReasonMessage)],
    components: [buildCloseRow()],
  });
  await prisma.ticket.update({ where: { id: ticket.id }, data: { activeCloseMessageId: actionMessage.id } });
  await actionMessage.pin().catch((err) => console.error('Épinglage du message de ticket échoué:', err));
  // Discord poste automatiquement "X a épinglé un message" après un pin —
  // on le supprime aussitôt pour ne pas polluer la conversation.
  const pinNotice = await channel.messages.fetch({ limit: 1 }).then((msgs) => msgs.first()).catch(() => null);
  if (pinNotice?.type === MessageType.ChannelPinnedMessage) await pinNotice.delete().catch(() => undefined);

  return channel;
}
