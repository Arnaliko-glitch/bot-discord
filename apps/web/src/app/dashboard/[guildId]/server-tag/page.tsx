import { prisma } from '@discord-bot-dashboard/database';
import { displayName, getSession, userAvatarUrl } from '@/lib/auth';
import { getBotIdentity } from '@/lib/discord-bot';
import { ServerTagConfigPage } from '@/components/ServerTagConfigPage';

export default async function ServerTagPage({ params }: { params: { guildId: string } }) {
  const session = await getSession();
  if (!session) return null; // le layout parent redirige déjà si non connecté

  const [guild, config, bot] = await Promise.all([
    prisma.guild.findUnique({ where: { id: params.guildId } }),
    prisma.serverTagConfig.findUnique({ where: { guildId: params.guildId } }),
    getBotIdentity(),
  ]);

  const guildIconUrl = guild?.icon
    ? `https://cdn.discordapp.com/icons/${params.guildId}/${guild.icon}.png?size=64`
    : null;

  return (
    <ServerTagConfigPage
      guildId={params.guildId}
      guildName={guild?.name ?? 'Serveur'}
      guildIconUrl={guildIconUrl}
      previewAvatarUrl={userAvatarUrl(session.userId, session.avatar)}
      previewUsername={displayName(session)}
      botName={bot.name}
      botAvatarUrl={bot.avatarUrl}
      initial={
        config
          ? {
              enabled: config.enabled,
              roleId: config.roleId,
              announceChannelId: config.announceChannelId,
              announceMessage: config.announceMessage,
            }
          : undefined
      }
    />
  );
}
