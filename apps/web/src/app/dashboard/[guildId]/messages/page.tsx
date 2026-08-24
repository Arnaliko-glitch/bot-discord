import { prisma } from '@discord-bot-dashboard/database';
import { getBotIdentity } from '@/lib/discord-bot';
import { MessagesConfigPage, type EmbedData, type MessageButtonData } from '@/components/MessagesConfigPage';

const BLANK_EMBED: EmbedData = {
  authorName: null,
  authorIconUrl: null,
  title: null,
  titleUrl: null,
  description: null,
  color: null,
  fields: [],
  imageUrl: null,
  thumbnailUrl: null,
  footerText: null,
  footerIconUrl: null,
};

const BLANK_BUTTON: MessageButtonData = {
  label: '',
  emoji: null,
  style: 'blue',
  disabled: false,
  action: null,
  url: null,
};

// Les messages enregistrés avant le passage aux embeds multiples stockent un
// objet unique en base ; on le normalise ici en tableau (et on complète les
// champs manquants) pour que le composant n'ait jamais à gérer les deux formes.
function normalizeEmbeds(raw: unknown): EmbedData[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.slice(0, 5).map((e) => ({ ...BLANK_EMBED, ...(e as Partial<EmbedData>) }));
}

function normalizeButtons(raw: unknown): MessageButtonData[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 5).map((b) => ({ ...BLANK_BUTTON, ...(b as Partial<MessageButtonData>) }));
}

export default async function MessagesPage({ params }: { params: { guildId: string } }) {
  const [messages, bot, guild] = await Promise.all([
    prisma.savedMessage.findMany({ where: { guildId: params.guildId }, orderBy: { updatedAt: 'desc' } }),
    getBotIdentity(),
    prisma.guild.findUnique({ where: { id: params.guildId } }),
  ]);
  const guildIconUrl = guild?.icon
    ? `https://cdn.discordapp.com/icons/${params.guildId}/${guild.icon}.png?size=64`
    : null;

  return (
    <MessagesConfigPage
      guildId={params.guildId}
      guildName={guild?.name ?? 'Serveur'}
      guildIconUrl={guildIconUrl}
      botName={bot.name}
      botAvatarUrl={bot.avatarUrl}
      initialMessages={messages.map((m) => ({
        id: m.id,
        name: m.name,
        channelId: m.channelId,
        content: m.content,
        embedData: normalizeEmbeds(m.embedData),
        imageUrls: m.imageUrls,
        buttons: normalizeButtons(m.buttons),
        lastSentMessageId: m.lastSentMessageId,
        lastSentChannelId: m.lastSentChannelId,
      }))}
    />
  );
}
