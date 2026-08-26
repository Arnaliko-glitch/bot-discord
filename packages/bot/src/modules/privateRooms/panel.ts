import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type VoiceChannel } from 'discord.js';
import type { PrivateRoom } from '@discord-bot-dashboard/database';

const MODE_LABELS: Record<string, string> = {
  open: 'Ouvert',
  closed: 'Fermé',
  private: 'Privé',
  whitelist: 'Liste blanche',
  blacklist: 'Liste noire',
};

// Panneau reconstruit à chaque action (plutôt que modifié champ par champ)
// pour rester simple et toujours cohérent avec l'état réel du salon en base
// — un salon vocal n'a jamais assez de trafic de boutons pour que ça pèse.
export function buildPanelPayload(room: PrivateRoom) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🔊 Gestion du salon')
    .setDescription(`Propriétaire : <@${room.ownerId}>\nMode : **${MODE_LABELS[room.mode] ?? room.mode}**`)
    .setFooter({ text: 'Seuls le propriétaire et les modérateurs peuvent utiliser ce menu.' });

  const closeOpen = new ButtonBuilder()
    .setCustomId('privateroom:toggle')
    .setLabel(room.mode === 'closed' ? 'Ouvrir' : 'Fermer')
    .setEmoji(room.mode === 'closed' ? '🔓' : '🔒')
    .setStyle(room.mode === 'closed' ? ButtonStyle.Success : ButtonStyle.Secondary);

  const privateBtn = new ButtonBuilder()
    .setCustomId('privateroom:private')
    .setLabel('Privé')
    .setEmoji('🙈')
    .setStyle(room.mode === 'private' ? ButtonStyle.Primary : ButtonStyle.Secondary);

  const renameBtn = new ButtonBuilder().setCustomId('privateroom:rename').setLabel('Renommer').setEmoji('✏️').setStyle(ButtonStyle.Secondary);
  const limitBtn = new ButtonBuilder().setCustomId('privateroom:limit').setLabel('Limite').setEmoji('👥').setStyle(ButtonStyle.Secondary);
  const purgeBtn = new ButtonBuilder().setCustomId('privateroom:purge').setLabel('Purge').setEmoji('🧹').setStyle(ButtonStyle.Danger);
  const transferBtn = new ButtonBuilder().setCustomId('privateroom:transfer').setLabel('Transfert').setEmoji('👑').setStyle(ButtonStyle.Secondary);
  const whitelistBtn = new ButtonBuilder()
    .setCustomId('privateroom:whitelist')
    .setLabel('Liste blanche')
    .setEmoji('✅')
    .setStyle(room.mode === 'whitelist' ? ButtonStyle.Primary : ButtonStyle.Secondary);
  const blacklistBtn = new ButtonBuilder()
    .setCustomId('privateroom:blacklist')
    .setLabel('Liste noire')
    .setEmoji('⛔')
    .setStyle(room.mode === 'blacklist' ? ButtonStyle.Primary : ButtonStyle.Secondary);

  const rows = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(closeOpen, privateBtn, renameBtn, limitBtn),
    new ActionRowBuilder<ButtonBuilder>().addComponents(purgeBtn, transferBtn, whitelistBtn, blacklistBtn),
  ];

  return { embeds: [embed], components: rows };
}

export async function postControlPanel(channel: VoiceChannel, room: PrivateRoom) {
  await channel.send(buildPanelPayload(room)).catch((err) => console.error('Publication du panneau du salon privé échouée:', err));
}
