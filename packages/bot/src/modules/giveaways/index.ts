import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, LabelBuilder, MessageFlags,
  ModalBuilder, PermissionFlagsBits, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder, escapeMarkdown,
  type ButtonInteraction, type Client, type Guild, type MessageCreateOptions, type ModalSubmitInteraction,
} from 'discord.js';
import { randomBytes } from 'node:crypto';
import { prisma, type Giveaway } from '@discord-bot-dashboard/database';
import type { BotModuleHandler } from '../../client.js';
import { shuffleParticipants } from './utils.js';
import { deliverGiveawayNotifications, giveawayDirectMessages } from './notifications.js';
import { GIVEAWAY_COLOR, giveawayReply } from './presentation.js';

export const GIVEAWAY_BUTTON_PREFIX = 'giveaway:';
export const GIVEAWAY_REMOVE_PREFIX = 'giveaway-remove:';
export const GIVEAWAY_LEAVE_PREFIX = 'giveaway-leave:';
export const GIVEAWAY_PAGE_PREFIX = 'giveaway-participants-page:';
const locks = new Map<string, Promise<unknown>>();
const participationReplies = new Map<string, Map<string, { interaction: ButtonInteraction; timer: ReturnType<typeof setTimeout> }>>();

function forgetParticipationReply(id: string, messageId: string) {
  const replies = participationReplies.get(id);
  const reply = replies?.get(messageId);
  if (reply) clearTimeout(reply.timer);
  replies?.delete(messageId);
  if (!replies?.size) participationReplies.delete(id);
}

async function endParticipationReplies(id: string) {
  const replies = participationReplies.get(id);
  if (!replies) return;
  participationReplies.delete(id);
  await Promise.allSettled([...replies.values()].map(async ({ interaction, timer }) => {
    clearTimeout(timer);
    await interaction.editReply({ content: '', embeds: [new EmbedBuilder().setColor(0xed4245)
      .setDescription('💡 Le giveaway est terminé !')], components: [] });
  }));
}

// Les clics, le balayage et les commandes d'un même giveaway se suivent.
export async function withGiveawayLock<T>(id: string, action: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(action);
  locks.set(id, current);
  try { return await current; }
  finally { if (locks.get(id) === current) locks.delete(id); }
}

export function giveawayMessage(giveaway: Pick<Giveaway,
  'id' | 'prize' | 'hostId' | 'winnerCount' | 'endsAt' | 'status' | 'winnerIds' | 'imageName'> & { title?: string | null; description?: string | null; thumbnailName?: string | null; mentionRoleIds?: string[]; showParticipants?: boolean }, count: number) {
  const active = giveaway.status === 'active';
  const cancelled = giveaway.status === 'cancelled';
  const end = Math.floor(giveaway.endsAt.getTime() / 1000);
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(giveaway.title || giveaway.prize)
    .setDescription([
      giveaway.description ? `${giveaway.description.split('\n').map((line) => `> ${line}`).join('\n')}\n` : null,
      `**Récompense :** ${giveaway.prize}`,
      `**${giveaway.winnerCount > 1 ? 'Gagnants' : 'Gagnant'} :** ${giveaway.status === 'ended'
        ? giveaway.winnerIds.map((id) => `<@${id}>`).join(', ') || 'Aucun gagnant'
        : giveaway.winnerCount}`,
      cancelled ? '\nCe giveaway a été annulé.' : `\n**Fin :** <t:${end}:R> (<t:${end}:F>)`,
    ].filter(Boolean).join('\n'));
  if (giveaway.thumbnailName) embed.setThumbnail(`attachment://${giveaway.thumbnailName}`);
  // La copie jointe au message du bot reste disponible lors des éditions.
  if (giveaway.imageName) embed.setImage(`attachment://${giveaway.imageName}`);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${GIVEAWAY_BUTTON_PREFIX}${giveaway.id}`)
      .setLabel('Participer')
      .setEmoji('🎉').setStyle(ButtonStyle.Primary).setDisabled(!active),
  );
  if (giveaway.showParticipants !== false) row.addComponents(new ButtonBuilder().setCustomId(`giveaway-participants:${giveaway.id}`)
    .setLabel(`Participants (${count})`).setEmoji('👥').setStyle(ButtonStyle.Secondary));
  return { content: (giveaway.mentionRoleIds ?? []).map((id) => `<@&${id}>`).join(' '), embeds: [embed], components: [row], allowedMentions: { parse: [] as const } };
}

// Un échec d'édition ne perd ni les inscriptions ni les gagnants : needsSync
// reste vrai et le balayage réessaie, sans refaire de tirage.
export async function syncGiveawayMessage(client: Client, id: string): Promise<void> {
  const giveaway = await prisma.giveaway.findUnique({ where: { id }, include: { _count: { select: { entries: true } } } });
  if (!giveaway) return;
  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    if (!channel?.isTextBased() || !('messages' in channel)) throw new Error('Salon du giveaway inaccessible.');
    await channel.messages.edit(giveaway.messageId, giveawayMessage(giveaway, giveaway._count.entries));
    await prisma.giveaway.update({ where: { id }, data: { needsSync: false } });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && [10003, 10008].includes(Number(error.code))) {
      await prisma.giveaway.update({ where: { id }, data: {
        needsSync: false,
        ...(giveaway.status === 'active' ? { status: 'cancelled', endedAt: new Date() } : {}),
      } });
      return;
    }
    throw error;
  }
}

async function selectWinners(guild: Guild, giveaway: Giveaway, exclude: string[]): Promise<string[]> {
  const entries = await prisma.giveawayEntry.findMany({ where: { giveawayId: giveaway.id } });
  const candidates = shuffleParticipants(entries.map((entry) => entry.userId).filter((id) => !exclude.includes(id)));
  const winners: string[] = [];
  for (const id of candidates) {
    // Force un contrôle actuel : un membre parti peut encore être en cache.
    const member = await guild.members.fetch({ user: id, force: true }).catch((error: unknown) => {
      if (typeof error === 'object' && error !== null && 'code' in error && Number(error.code) === 10007) return null;
      throw error;
    });
    if (member && !member.user.bot) winners.push(id);
    if (winners.length >= giveaway.winnerCount) break;
  }
  return winners;
}

export function giveawayAnnouncement(giveaway: Pick<Giveaway,
  'guildId' | 'channelId' | 'messageId' | 'prize' | 'winnerIds'>): MessageCreateOptions {
  const prize = escapeMarkdown(giveaway.prize).replace(/@/g, '@\u200b');
  const winners = giveaway.winnerIds.map((id) => `<@${id}>`).join(', ');
  const result = winners
    ? `🎉 Félicitations ${winners} ! ${giveaway.winnerIds.length === 1 ? 'Tu remportes' : 'Vous remportez'} **${prize}** !`
    : `Le giveaway **${prize}** est terminé. Aucun participant éligible : aucun gagnant.`;
  return {
    content: winners,
    embeds: [new EmbedBuilder().setColor(GIVEAWAY_COLOR).setDescription(`${result}\n\n🎁 Giveaway : https://discord.com/channels/${giveaway.guildId}/${giveaway.channelId}/${giveaway.messageId}`)],
    allowedMentions: { parse: [], users: giveaway.winnerIds },
  };
}

// Le nonce est conservé en base pour les réessais : Discord déduplique les
// envois rapprochés si la réponse a été perdue après l'envoi du message.
export async function announceGiveaway(client: Client, id: string): Promise<void> {
  const giveaway = await prisma.giveaway.findUnique({ where: { id } });
  if (!giveaway || giveaway.status !== 'ended' || !giveaway.announcementNonce || giveaway.announcementMessageId) return;
  const channel = await client.channels.fetch(giveaway.channelId);
  if (!channel?.isSendable() || !('guild' in channel)) throw new Error('Salon de l’annonce du giveaway inaccessible.');
  const message = await channel.send({
    ...giveawayAnnouncement(giveaway), nonce: giveaway.announcementNonce, enforceNonce: true,
  });
  await prisma.giveaway.updateMany({
    where: { id, announcementNonce: giveaway.announcementNonce, announcementMessageId: null },
    data: { announcementMessageId: message.id },
  });
}

// L'appelant tient le verrou. Le résultat est écrit avant l'édition Discord.
export async function finishGiveaway(guild: Guild, giveaway: Giveaway, reroll = false,
  options: { notifyCreatorOfEnd?: boolean } = {}): Promise<void> {
  // Ne pas écraser une annonce précédente qui reste à livrer.
  if (reroll) await announceGiveaway(guild.client, giveaway.id);
  const winnerIds = await selectWinners(guild, giveaway, reroll ? giveaway.winnerIds : []);
  if (reroll && !winnerIds.length) throw new Error('Aucun autre participant éligible pour un nouveau tirage.');
  const updated = await prisma.$transaction(async (tx) => {
    const updated = await tx.giveaway.updateMany({
      where: { id: giveaway.id, status: reroll ? 'ended' : 'active' },
      data: { status: 'ended', endedAt: new Date(), winnerIds, needsSync: true,
        announcementNonce: randomBytes(12).toString('hex'), announcementMessageId: null },
    });
    if (updated.count) {
      const notifications = giveawayDirectMessages(giveaway, guild.name, winnerIds, options.notifyCreatorOfEnd !== false);
      if (notifications.length) await tx.giveawayNotification.createMany({ data: notifications });
    }
    return updated;
  });
  if (!updated.count) return;
  await endParticipationReplies(giveaway.id);
  await syncGiveawayMessage(guild.client, giveaway.id).catch((error) => console.error('Synchronisation giveaway différée :', error));
  await announceGiveaway(guild.client, giveaway.id).catch((error) => console.error('Annonce giveaway différée :', error));
  await deliverGiveawayNotifications(guild.client, giveaway.id).catch((error) => console.error('MP de giveaway différés :', error));
}

export async function handleGiveawayRemoval(interaction: ButtonInteraction | ModalSubmitInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ ...giveawayReply('Seuls les administrateurs peuvent retirer un participant du giveaway.'), flags: MessageFlags.Ephemeral });
    return;
  }
  const id = interaction.customId.slice(GIVEAWAY_REMOVE_PREFIX.length);
  if (interaction.isButton()) {
    const giveaway = await prisma.giveaway.findFirst({ where: { id, guildId: interaction.guildId, status: 'active', endsAt: { gt: new Date() } } });
    if (!giveaway) {
      await interaction.reply({ ...giveawayReply('Ce giveaway est terminé ou indisponible.'), flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.showModal(new ModalBuilder().setCustomId(`${GIVEAWAY_REMOVE_PREFIX}${id}`)
      .setTitle('Retirer un participant du giveaway')
      .addLabelComponents(new LabelBuilder().setLabel('Participant')
        .setDescription('Il ne sera pas notifié de son retrait et pourra participer à nouveau.')
        .setUserSelectMenuComponent(new UserSelectMenuBuilder().setCustomId('participant')
          .setPlaceholder('Sélectionne le participant à retirer…').setMinValues(1).setMaxValues(1))));
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const userId = interaction.fields.getSelectedUsers('participant', true).first()!.id;
  await withGiveawayLock(id, async () => {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.giveaway.updateMany({ where: { id, guildId: interaction.guildId!,
        status: 'active', endsAt: { gt: new Date() } }, data: { needsSync: true } });
      if (!updated.count) return 'Ce giveaway est terminé ou indisponible.';
      const removed = await tx.giveawayEntry.deleteMany({ where: { giveawayId: id, userId } });
      return removed.count
        ? '✅ Le participant a été retiré du giveaway. Il n’a pas été notifié et pourra participer à nouveau.'
        : 'Ce membre ne participe pas à ce giveaway.';
    });
    await interaction.editReply(giveawayReply(result));
    await syncGiveawayMessage(interaction.client, id).catch((error) => console.error('Synchronisation giveaway différée :', error));
  });
}

export async function handleGiveawayInteraction(interaction: ButtonInteraction | ModalSubmitInteraction): Promise<void> {
  const leaving = interaction.customId.startsWith(GIVEAWAY_LEAVE_PREFIX);
  const paging = interaction.customId.startsWith(GIVEAWAY_PAGE_PREFIX);
  const [pageGiveawayId, rawPage, pageOwner] = paging ? interaction.customId.slice(GIVEAWAY_PAGE_PREFIX.length).split(':') : [];
  if (paging && pageOwner !== interaction.user.id) {
    await interaction.reply({ ...giveawayReply('Ouvre ta propre liste avec le bouton Participants du giveaway.'), flags: MessageFlags.Ephemeral });
    return;
  }
  if (paging && rawPage === 'choose' && interaction.isButton()) {
    await interaction.showModal(new ModalBuilder().setCustomId(`${GIVEAWAY_PAGE_PREFIX}${pageGiveawayId}:submit:${pageOwner}`)
      .setTitle('Choisir une page').addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('page').setLabel('Numéro de page').setPlaceholder('Exemple : 12')
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10))));
    return;
  }
  const enteredPage = paging && interaction.isModalSubmit() ? interaction.fields.getTextInputValue('page').trim() : null;
  if (leaving || paging) await interaction.deferUpdate();
  else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (interaction.customId.startsWith('giveaway-participants:') || paging) {
    const id = paging ? pageGiveawayId : interaction.customId.slice('giveaway-participants:'.length);
    const giveaway = await prisma.giveaway.findFirst({ where: { id, guildId: interaction.guildId ?? '', ...(paging ? {} : { messageId: interaction.message!.id }) },
      include: { _count: { select: { entries: true } } } });
    const count = giveaway?._count.entries ?? 0;
    const pageCount = Math.max(1, Math.ceil(count / 25));
    if (enteredPage !== null && (!/^\d+$/.test(enteredPage) || Number(enteredPage) < 1 || Number(enteredPage) > pageCount)) {
      await interaction.followUp({ ...giveawayReply(`Choisis un numéro de page entre 1 et ${pageCount}.`), flags: MessageFlags.Ephemeral });
      return;
    }
    const requestedPage = enteredPage !== null ? Number(enteredPage) - 1 : paging && /^\d+$/.test(rawPage ?? '') ? Number(rawPage) : 0;
    const page = Math.max(0, Math.min(Number.isSafeInteger(requestedPage) ? requestedPage : 0, pageCount - 1));
    const entries = giveaway ? await prisma.giveawayEntry.findMany({ where: { giveawayId: giveaway.id },
      take: 25, skip: page * 25, orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }] }) : [];
    const participants = await Promise.all(entries.map(async (entry) => {
      const user = await interaction.client.users.fetch(entry.userId).catch(() => null);
      return user?.username
        ? `• ${escapeMarkdown(user.globalName || user.username)} (@${escapeMarkdown(user.username)})`
        : `• <@${entry.userId}>`;
    }));
    const listEmbed = new EmbedBuilder().setColor(0xed4245).setDescription(giveaway
      ? `**Participants du [giveaway](https://discord.com/channels/${giveaway.guildId}/${giveaway.channelId}/${giveaway.messageId})**\n\n${participants.join('\n') || 'Aucun participant pour le moment.'}`
      : 'Giveaway introuvable.');
    if (giveaway) listEmbed.setFooter({ text: `Participants (${count}) • Page ${page + 1}/${pageCount}${count ? ` • ${page * 25 + 1}–${page * 25 + entries.length}` : ''}` });
    const components: ActionRowBuilder<ButtonBuilder>[] = [];
    if (giveaway && pageCount > 1) components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${GIVEAWAY_PAGE_PREFIX}${id}:${Math.max(0, page - 1)}:${interaction.user.id}`)
        .setLabel('Précédent').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`${GIVEAWAY_PAGE_PREFIX}${id}:choose:${interaction.user.id}`)
        .setLabel('Page').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${GIVEAWAY_PAGE_PREFIX}${id}:${Math.min(pageCount - 1, page + 1)}:${interaction.user.id}`)
        .setLabel('Suivant').setStyle(ButtonStyle.Secondary).setDisabled(page === pageCount - 1),
    ));
    if (giveaway && giveaway.status === 'active' && giveaway.endsAt > new Date()
      && count > 0 && interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder()
        .setCustomId(`${GIVEAWAY_REMOVE_PREFIX}${id}`).setLabel('Retirer un participant').setStyle(ButtonStyle.Danger)));
    }
    await interaction.editReply({ content: '', embeds: [listEmbed], allowedMentions: { parse: [] },
      components,
    });
    return;
  }
  const [id, ownerId] = leaving
    ? interaction.customId.slice(GIVEAWAY_LEAVE_PREFIX.length).split(':')
    : [interaction.customId.slice(GIVEAWAY_BUTTON_PREFIX.length), interaction.user.id];
  if (ownerId !== interaction.user.id) {
    await interaction.editReply({ content: '', embeds: [new EmbedBuilder().setColor(0xed4245)
      .setDescription('Tu peux uniquement retirer ta propre participation.')], components: [] });
    return;
  }
  if (leaving) forgetParticipationReply(id, interaction.message!.id);
  await withGiveawayLock(id, async () => {
    const result = await prisma.$transaction(async (tx) => {
      // Cette écriture prend aussi le verrou de ligne PostgreSQL avant de
      // vérifier/modifier l'inscription (double clic, expiration concurrente).
      const updated = await tx.giveaway.updateMany({ where: {
        id, guildId: interaction.guildId ?? '', ...(leaving ? {} : { messageId: interaction.message!.id }),
        status: 'active', endsAt: { gt: new Date() },
      }, data: { needsSync: true } });
      if (!updated.count) return 'Ce giveaway est terminé ou indisponible.';
      const key = { giveawayId: id, userId: interaction.user.id };
      const existing = await tx.giveawayEntry.findUnique({ where: { giveawayId_userId: key } });
      if (existing) {
        if (!leaving) return '💡 Vous participez déjà à ce giveaway !';
        await tx.giveawayEntry.delete({ where: { giveawayId_userId: key } });
        return '✅ Vous ne participez plus à ce giveaway.';
      }
      if (leaving) return 'Vous ne participez pas à ce giveaway.';
      await tx.giveawayEntry.create({ data: key });
      return '✅ Vous participez à présent au giveaway !';
    });
    const reply = await interaction.editReply({ content: '', embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(result)],
      components: result === '💡 Vous participez déjà à ce giveaway !'
        ? [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder()
          .setCustomId(`${GIVEAWAY_LEAVE_PREFIX}${id}:${interaction.user.id}`).setLabel('Se désinscrire').setStyle(ButtonStyle.Secondary))]
        : [], allowedMentions: { parse: [] } });
    if (result === '💡 Vous participez déjà à ce giveaway !' && reply?.id) {
      forgetParticipationReply(id, reply.id);
      const replies = participationReplies.get(id) ?? new Map();
      // Le jeton d'une réponse privée Discord reste utilisable 15 minutes.
      const timer = setTimeout(() => forgetParticipationReply(id, reply.id), 14 * 60_000);
      timer.unref();
      replies.set(reply.id, { interaction: interaction as ButtonInteraction, timer });
      participationReplies.set(id, replies);
    }
    await syncGiveawayMessage(interaction.client, id).catch((error) => console.error('Synchronisation giveaway différée :', error));
  });
}

let sweeping = false;
export async function sweepGiveaways(client: Client): Promise<void> {
  if (sweeping) return;
  sweeping = true;
  try {
    const due = await prisma.giveaway.findMany({
      where: { status: 'active', endsAt: { lte: new Date() } }, orderBy: { endsAt: 'asc' }, take: 30,
    });
    for (const item of due) {
      const guild = client.guilds.cache.get(item.guildId);
      if (!guild) continue;
      await withGiveawayLock(item.id, async () => {
        const current = await prisma.giveaway.findUnique({ where: { id: item.id } });
        if (current?.status === 'active') await finishGiveaway(guild, current);
      }).catch((error) => console.error(`Fin du giveaway ${item.id} différée :`, error));
    }
    const dirty = await prisma.giveaway.findMany({ where: { needsSync: true }, take: 50 });
    for (const item of dirty) {
      if (!client.guilds.cache.has(item.guildId)) continue;
      await withGiveawayLock(item.id, () => syncGiveawayMessage(client, item.id))
        .catch((error) => console.error(`Édition du giveaway ${item.id} différée :`, error));
    }
    const announcements = await prisma.giveaway.findMany({
      where: { status: 'ended', announcementNonce: { not: null }, announcementMessageId: null }, take: 30,
    });
    for (const item of announcements) {
      if (!client.guilds.cache.has(item.guildId)) continue;
      await withGiveawayLock(item.id, () => announceGiveaway(client, item.id))
        .catch((error) => console.error(`Annonce du giveaway ${item.id} différée :`, error));
    }
    const notifications = await prisma.giveawayNotification.findMany({ where: { status: 'pending' }, distinct: ['giveawayId'], select: { giveawayId: true }, take: 30 });
    for (const item of notifications) {
      await withGiveawayLock(item.giveawayId, () => deliverGiveawayNotifications(client, item.giveawayId))
        .catch((error) => console.error('MP de giveaway différés :', error));
    }
  } finally { sweeping = false; }
}

export const giveawaysModule: BotModuleHandler = {
  name: 'giveaways',
  register(client) {
    const tick = () => sweepGiveaways(client).catch((error) => console.error('Module giveaways :', error));
    void tick();
    setInterval(tick, 10_000);
  },
};
