import { prisma } from '@discord-bot-dashboard/database';
import { displayName, getSession, userAvatarUrl } from '@/lib/auth';
import { getBotIdentity } from '@/lib/discord-bot';
import { WelcomeConfigPage } from '@/components/WelcomeConfigPage';

export default async function WelcomePage({ params }: { params: { guildId: string } }) {
  const session = getSession();
  if (!session) return null; // le layout parent redirige déjà si non connecté

  const [guild, config, bot] = await Promise.all([
    prisma.guild.findUnique({ where: { id: params.guildId } }),
    prisma.welcomeConfig.findUnique({ where: { guildId: params.guildId } }),
    getBotIdentity(),
  ]);

  const avatarUrl = userAvatarUrl(session.userId, session.avatar);
  const guildIconUrl = guild?.icon
    ? `https://cdn.discordapp.com/icons/${params.guildId}/${guild.icon}.png?size=64`
    : null;

  return (
    <WelcomeConfigPage
      guildId={params.guildId}
      guildName={guild?.name ?? 'Serveur'}
      guildIconUrl={guildIconUrl}
      previewAvatarUrl={avatarUrl}
      previewUsername={displayName(session)}
      botName={bot.name}
      botAvatarUrl={bot.avatarUrl}
      initial={
        config
          ? {
              enabled: config.enabled,
              channelId: config.channelId,
              message: config.message,
              mentionUser: config.mentionUser,
              backgroundColor: config.backgroundColor,
              backgroundImage: config.backgroundImage,
              backgroundOverlay: config.backgroundOverlay,
              embedTitle: config.embedTitle,
              embedFooter: config.embedFooter,
              sidebarColor: config.sidebarColor,
              goodbyeEnabled: config.goodbyeEnabled,
              goodbyeChannelId: config.goodbyeChannelId,
              goodbyeMessage: config.goodbyeMessage,
              goodbyeBackgroundColor: config.goodbyeBackgroundColor,
              goodbyeBackgroundImage: config.goodbyeBackgroundImage,
              goodbyeBackgroundOverlay: config.goodbyeBackgroundOverlay,
              goodbyeEmbedTitle: config.goodbyeEmbedTitle,
              goodbyeEmbedFooter: config.goodbyeEmbedFooter,
              goodbyeSidebarColor: config.goodbyeSidebarColor,
            }
          : undefined
      }
    />
  );
}
