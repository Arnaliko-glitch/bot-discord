import {
  ActionRowBuilder,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type ButtonInteraction,
  type Interaction,
  type ModalSubmitInteraction,
  type UserSelectMenuInteraction,
  type VoiceChannel,
} from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { PrivateRoom, PrivateRoomConfig } from '@discord-bot-dashboard/database';
import { applyRoomPermissions } from './permissions.js';
import { buildPanelPayload } from './panel.js';

async function loadContext(channelId: string) {
  const room = await prisma.privateRoom.findUnique({ where: { channelId } });
  if (!room) return null;
  const config = await prisma.privateRoomConfig.findUnique({ where: { guildId: room.guildId } });
  if (!config) return null;
  return { room, config };
}

function canManage(interaction: Interaction<'cached'>, room: PrivateRoom, config: PrivateRoomConfig) {
  return interaction.user.id === room.ownerId || interaction.member.roles.cache.some((r) => config.moderatorRoleIds.includes(r.id));
}

// Le panneau se met à jour directement via interaction.update() quand
// l'action vient d'un clic sur son propre message (boutons, modales) — ce
// n'est nécessaire séparément que pour les flux passant par un message
// éphémère intermédiaire (menus de sélection de membres), où c'est ce
// second message, pas le panneau, qui reçoit la réponse à l'interaction.
async function refreshPanel(channel: VoiceChannel, room: PrivateRoom) {
  const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  const panelMessage = messages?.find((m) => m.author.id === channel.client.user.id && m.embeds[0]?.title === '🔊 Gestion du salon');
  await panelMessage?.edit(buildPanelPayload(room)).catch((err) => console.error('Rafraîchissement du panneau échoué:', err));
}

async function updateRoom(channel: VoiceChannel, room: PrivateRoom, config: PrivateRoomConfig, data: Partial<PrivateRoom>) {
  const updated = await prisma.privateRoom.update({ where: { id: room.id }, data });
  await applyRoomPermissions(channel, channel.guild, updated, config);
  return updated;
}

async function handleToggle(interaction: ButtonInteraction<'cached'>, channel: VoiceChannel, room: PrivateRoom, config: PrivateRoomConfig) {
  const updated = await updateRoom(channel, room, config, { mode: room.mode === 'closed' ? 'open' : 'closed' });
  await interaction.update(buildPanelPayload(updated));
}

async function handlePrivate(interaction: ButtonInteraction<'cached'>, channel: VoiceChannel, room: PrivateRoom, config: PrivateRoomConfig) {
  const updated = await updateRoom(channel, room, config, { mode: room.mode === 'private' ? 'open' : 'private' });
  await interaction.update(buildPanelPayload(updated));
}

async function handleRenameButton(interaction: ButtonInteraction<'cached'>, channel: VoiceChannel) {
  const input = new TextInputBuilder()
    .setCustomId('name')
    .setLabel('Nouveau nom du salon')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setValue(channel.name)
    .setRequired(true);
  const modal = new ModalBuilder()
    .setCustomId('privateroom-modal:rename')
    .setTitle('Renommer le salon')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

async function handleLimitButton(interaction: ButtonInteraction<'cached'>, channel: VoiceChannel) {
  const input = new TextInputBuilder()
    .setCustomId('limit')
    .setLabel('Limite de places (0 = illimité)')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(2)
    .setValue(String(channel.userLimit))
    .setRequired(true);
  const modal = new ModalBuilder()
    .setCustomId('privateroom-modal:limit')
    .setTitle('Limite de places')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

async function handlePurge(interaction: ButtonInteraction<'cached'>, channel: VoiceChannel, room: PrivateRoom, config: PrivateRoomConfig) {
  let kicked = 0;
  for (const member of channel.members.values()) {
    if (member.id === room.ownerId) continue;
    if (member.roles.cache.some((r) => config.untouchableRoleIds.includes(r.id))) continue;
    const disconnected = await member.voice
      .disconnect('Purge du salon privé')
      .then(() => true)
      .catch(() => false);
    if (disconnected) kicked++;
  }
  await interaction.reply({
    content: kicked > 0 ? `🧹 ${kicked} membre(s) expulsé(s).` : 'Personne à expulser.',
    flags: MessageFlags.Ephemeral,
  });
}

async function handleTransferButton(interaction: ButtonInteraction<'cached'>, channel: VoiceChannel, room: PrivateRoom, config: PrivateRoomConfig) {
  if (interaction.user.id === room.ownerId) {
    const others = [...channel.members.values()].filter((m) => m.id !== room.ownerId);
    if (others.length === 0) {
      await interaction.reply({ content: 'Personne dans le salon à qui transférer la propriété.', flags: MessageFlags.Ephemeral });
      return;
    }
    const select = new UserSelectMenuBuilder()
      .setCustomId('privateroom-select:transfer')
      .setPlaceholder('Choisir le nouveau propriétaire')
      .setMinValues(1)
      .setMaxValues(1);
    await interaction.reply({
      content: 'Choisissez le nouveau propriétaire (doit être présent dans le salon) :',
      components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(select)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Réquisition : un membre présent peut réclamer la propriété si le
  // propriétaire actuel a quitté le salon et que la réquisition est activée.
  if (channel.members.has(room.ownerId)) {
    await interaction.reply({ content: 'Le propriétaire est toujours présent dans le salon.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!config.allowClaim) {
    await interaction.reply({ content: 'La réquisition de salon est désactivée sur ce serveur.', flags: MessageFlags.Ephemeral });
    return;
  }
  const updated = await updateRoom(channel, room, config, { ownerId: interaction.user.id });
  await interaction.update(buildPanelPayload(updated));
}

async function handleListButton(interaction: ButtonInteraction<'cached'>, room: PrivateRoom, list: 'whitelist' | 'blacklist') {
  const defaults = list === 'whitelist' ? room.whitelistUserIds : room.blacklistUserIds;
  const select = new UserSelectMenuBuilder()
    .setCustomId(`privateroom-select:${list}`)
    .setPlaceholder(list === 'whitelist' ? 'Membres autorisés' : 'Membres bannis')
    .setMinValues(0)
    .setMaxValues(25);
  if (defaults.length > 0) select.setDefaultUsers(defaults.slice(0, 25));

  await interaction.reply({
    content: list === 'whitelist' ? 'Choisissez les membres autorisés à rejoindre :' : 'Choisissez les membres bannis du salon :',
    components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(select)],
    flags: MessageFlags.Ephemeral,
  });
}

const BUTTON_HANDLERS: Record<
  string,
  (interaction: ButtonInteraction<'cached'>, channel: VoiceChannel, room: PrivateRoom, config: PrivateRoomConfig) => Promise<void>
> = {
  toggle: handleToggle,
  private: handlePrivate,
  rename: (interaction, channel) => handleRenameButton(interaction, channel),
  limit: (interaction, channel) => handleLimitButton(interaction, channel),
  purge: handlePurge,
  transfer: handleTransferButton,
  whitelist: (interaction, _channel, room) => handleListButton(interaction, room, 'whitelist'),
  blacklist: (interaction, _channel, room) => handleListButton(interaction, room, 'blacklist'),
};

async function handleButton(interaction: ButtonInteraction<'cached'>) {
  const channel = interaction.channel;
  if (!channel?.isVoiceBased() || channel.type !== ChannelType.GuildVoice) return;

  const context = await loadContext(channel.id);
  if (!context) {
    await interaction.reply({ content: "Ce salon n'est plus géré comme un salon privé.", flags: MessageFlags.Ephemeral });
    return;
  }
  const { room, config } = context;

  const action = interaction.customId.split(':')[1];
  const isTransferClaim = action === 'transfer' && interaction.user.id !== room.ownerId;
  if (!isTransferClaim && !canManage(interaction, room, config)) {
    await interaction.reply({ content: 'Seuls le propriétaire et les modérateurs peuvent utiliser ce menu.', flags: MessageFlags.Ephemeral });
    return;
  }

  const handler = BUTTON_HANDLERS[action];
  if (!handler) return;
  await handler(interaction, channel, room, config).catch((err) => console.error(`Action salon privé "${action}" échouée:`, err));
}

async function handleModal(interaction: ModalSubmitInteraction<'cached'>) {
  if (!interaction.isFromMessage()) return;
  const channel = interaction.channel;
  if (!channel?.isVoiceBased() || channel.type !== ChannelType.GuildVoice) return;

  const context = await loadContext(channel.id);
  if (!context) return;
  const { room, config } = context;
  if (!canManage(interaction, room, config)) {
    await interaction.reply({ content: 'Seuls le propriétaire et les modérateurs peuvent utiliser ce menu.', flags: MessageFlags.Ephemeral });
    return;
  }

  const action = interaction.customId.split(':')[1];
  if (action === 'rename') {
    const name = interaction.fields.getTextInputValue('name').trim().slice(0, 100) || channel.name;
    await channel.setName(name).catch((err) => console.error('Renommage du salon privé échoué:', err));
  } else if (action === 'limit') {
    const limit = Math.min(99, Math.max(0, Math.trunc(Number(interaction.fields.getTextInputValue('limit')) || 0)));
    await channel.setUserLimit(limit).catch((err) => console.error('Changement de limite du salon privé échoué:', err));
  }
  await interaction.deferUpdate();
}

async function handleUserSelect(interaction: UserSelectMenuInteraction<'cached'>) {
  const channel = interaction.channel;
  if (!channel?.isVoiceBased() || channel.type !== ChannelType.GuildVoice) return;

  const context = await loadContext(channel.id);
  if (!context) return;
  const { room, config } = context;
  if (!canManage(interaction, room, config)) {
    await interaction.reply({ content: 'Seuls le propriétaire et les modérateurs peuvent utiliser ce menu.', flags: MessageFlags.Ephemeral });
    return;
  }

  const action = interaction.customId.split(':')[1];
  if (action === 'transfer') {
    const targetId = interaction.values[0];
    if (!channel.members.has(targetId)) {
      await interaction.update({ content: "Ce membre n'est plus dans le salon.", components: [] });
      return;
    }
    const updated = await updateRoom(channel, room, config, { ownerId: targetId });
    await refreshPanel(channel, updated);
    await interaction.update({ content: `👑 <@${targetId}> est maintenant propriétaire du salon.`, components: [] });
    return;
  }

  if (action === 'whitelist' || action === 'blacklist') {
    // Un membre intouchable ne peut pas être mis en liste noire — il reste
    // toujours autorisé, comme pour la Purge.
    const userIds =
      action === 'blacklist'
        ? interaction.values.filter((id) => !interaction.guild.members.cache.get(id)?.roles.cache.some((r) => config.untouchableRoleIds.includes(r.id)))
        : interaction.values;
    const updated = await updateRoom(channel, room, config, {
      mode: action,
      whitelistUserIds: action === 'whitelist' ? userIds : room.whitelistUserIds,
      blacklistUserIds: action === 'blacklist' ? userIds : room.blacklistUserIds,
    });
    await refreshPanel(channel, updated);
    await interaction.update({ content: '✅ Liste mise à jour.', components: [] });
  }
}

export async function handlePrivateRoomInteraction(interaction: Interaction) {
  if (!interaction.inCachedGuild()) return;
  if (interaction.isButton() && interaction.customId.startsWith('privateroom:')) await handleButton(interaction);
  else if (interaction.isModalSubmit() && interaction.customId.startsWith('privateroom-modal:')) await handleModal(interaction);
  else if (interaction.isUserSelectMenu() && interaction.customId.startsWith('privateroom-select:')) await handleUserSelect(interaction);
}
