import { EmbedBuilder } from 'discord.js';

export const GIVEAWAY_COLOR = 0xed4245;

export function giveawayReply(description: string) {
  return { content: '', embeds: [new EmbedBuilder().setColor(GIVEAWAY_COLOR).setDescription(description)],
    allowedMentions: { parse: [] as const } };
}
