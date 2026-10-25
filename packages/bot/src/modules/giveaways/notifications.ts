import { randomBytes } from 'node:crypto';
import { EmbedBuilder, escapeMarkdown, type APIEmbed, type Client } from 'discord.js';
import { prisma, type Giveaway, type Prisma } from '@discord-bot-dashboard/database';

export function giveawayDirectMessages(giveaway: Pick<Giveaway, 'id' | 'guildId' | 'channelId' | 'messageId' | 'hostId' | 'prize'>,
  guildName: string, winnerIds: string[], includeEndMessage = true) {
  const prize = escapeMarkdown(giveaway.prize).replace(/@/g, '@\u200b');
  const server = escapeMarkdown(guildName).replace(/@/g, '@\u200b');
  const winners = winnerIds.map((id) => `<@${id}>`).join(', ');
  const url = `https://discord.com/channels/${giveaway.guildId}/${giveaway.channelId}/${giveaway.messageId}`;
  const embed = (title: string, description: string) => new EmbedBuilder().setColor(0xed4245)
    .setTitle(title).setURL(url).setDescription(description).toJSON();
  const hostEmbeds = [];
  if (winnerIds.length) hostEmbeds.push(embed('Récompense à donner !',
    `Un membre a gagné une récompense personnalisée sur **${server}** !\n\n**${winnerIds.length > 1 ? 'Gagnants' : 'Gagnant'} :** ${winners}\n**Récompense :** ${prize}`));
  const recap = embed('Plop ! 👋', `Le giveaway créé sur le serveur **${server}** est maintenant terminé !\n\n${winnerIds.length
    ? `${winnerIds.length > 1 ? 'Les gagnants sont' : 'Le gagnant est'} ${winners}.`
    : 'Aucun participant éligible : aucun gagnant.'}\nLa récompense promise était : **${prize}**.`);
  if (includeEndMessage) hostEmbeds.push(recap);
  return [
    ...(hostEmbeds.length ? [{ recipientId: giveaway.hostId, embeds: hostEmbeds }] : []),
  ].map((message) => ({ id: randomBytes(12).toString('hex'), giveawayId: giveaway.id,
    recipientId: message.recipientId, embeds: message.embeds as unknown as Prisma.InputJsonValue }));
}

// Chaque notification a son propre nonce persistant, y compris après un nouveau tirage.
export async function deliverGiveawayNotifications(client: Client, giveawayId: string) {
  const pending = await prisma.giveawayNotification.findMany({ where: { giveawayId, status: 'pending' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 25 });
  for (const notification of pending) {
    try {
      const user = await client.users.fetch(notification.recipientId);
      await user.send({ embeds: notification.embeds as unknown as APIEmbed[],
        allowedMentions: { parse: [] }, nonce: notification.id, enforceNonce: true });
      await prisma.giveawayNotification.update({ where: { id: notification.id }, data: { status: 'sent' } });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && [50007, 10013, 50013].includes(Number(error.code))) {
        await prisma.giveawayNotification.update({ where: { id: notification.id }, data: { status: 'blocked' } });
      } else {
        console.error('MP de giveaway différé :', error);
      }
    }
  }
}
