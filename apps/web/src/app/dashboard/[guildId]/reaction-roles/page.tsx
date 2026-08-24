import { prisma } from '@discord-bot-dashboard/database';
import { getBotIdentity } from '@/lib/discord-bot';
import { BLANK_EMBED, type EmbedData } from '@/components/EmbedEditor';
import { ReactionRolesConfigPage, type ReactionRolePanelData, type ReactionRoleMapping } from '@/components/ReactionRolesConfigPage';

function normalizeMappings(raw: unknown): ReactionRoleMapping[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m): m is ReactionRoleMapping =>
        typeof m === 'object' && m !== null && typeof (m as ReactionRoleMapping).emoji === 'string' && typeof (m as ReactionRoleMapping).roleId === 'string'
    )
    .map((m) => ({ emoji: m.emoji, roleId: m.roleId }));
}

// Complète les champs manquants (ancien panneau enregistré avant l'ajout
// d'un champ à EmbedData) pour que le composant n'ait jamais à gérer un
// embed partiel — même principe que normalizeEmbeds côté module Messages.
function normalizeEmbed(raw: unknown): EmbedData | null {
  if (!raw || typeof raw !== 'object') return null;
  return { ...BLANK_EMBED, ...(raw as Partial<EmbedData>) };
}

export default async function ReactionRolesPage({ params }: { params: { guildId: string } }) {
  const [guild, panels, bot] = await Promise.all([
    prisma.guild.findUnique({ where: { id: params.guildId } }),
    prisma.reactionRolePanel.findMany({ where: { guildId: params.guildId }, orderBy: { updatedAt: 'desc' } }),
    getBotIdentity(),
  ]);
  const guildIconUrl = guild?.icon
    ? `https://cdn.discordapp.com/icons/${params.guildId}/${guild.icon}.png?size=64`
    : null;

  return (
    <ReactionRolesConfigPage
      guildId={params.guildId}
      botName={bot.name}
      botAvatarUrl={bot.avatarUrl}
      guildName={guild?.name ?? 'Serveur'}
      guildIconUrl={guildIconUrl}
      initialPanels={panels.map(
        (p): ReactionRolePanelData => ({
          id: p.id,
          name: p.name,
          channelId: p.channelId,
          messageId: p.messageId,
          content: p.content,
          imageUrl: p.imageUrl,
          embedData: normalizeEmbed(p.embedData),
          mappings: normalizeMappings(p.mappings),
        })
      )}
    />
  );
}
