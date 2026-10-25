import { createCanvas } from '@napi-rs/canvas';
import type { Client } from 'discord.js';

let mentionsEmoji: { id: string; name: string } | undefined;

export function giveawayMentionsEmoji() { return mentionsEmoji; }

export async function initializeGiveawayEmojis(client: Client<true>) {
  const emojis = await client.application.emojis.fetch();
  let emoji = emojis.find((entry) => entry.name === 'giveaway_mentions');
  if (!emoji) {
    const canvas = createCanvas(128, 128);
    const context = canvas.getContext('2d');
    context.fillStyle = '#b5bac1';
    context.font = '112px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('@', 64, 62);
    emoji = await client.application.emojis.create({ name: 'giveaway_mentions', attachment: canvas.toBuffer('image/png') });
  }
  mentionsEmoji = { id: emoji.id, name: emoji.name! };
}
