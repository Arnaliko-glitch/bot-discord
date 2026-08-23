import { prisma } from '@discord-bot-dashboard/database';
import { displayName, getSession, userAvatarUrl } from '@/lib/auth';
import { getBotIdentity } from '@/lib/discord-bot';
import { LevelsConfigPage } from '@/components/LevelsConfigPage';

export default async function LevelsPage({ params }: { params: { guildId: string } }) {
  const session = getSession();
  if (!session) return null; // le layout parent redirige déjà si non connecté

  const [guild, config, rewards, bot] = await Promise.all([
    prisma.guild.findUnique({ where: { id: params.guildId } }),
    prisma.xpSettings.findUnique({ where: { guildId: params.guildId } }),
    prisma.levelRole.findMany({ where: { guildId: params.guildId }, orderBy: { level: 'desc' } }),
    getBotIdentity(),
  ]);

  const avatarUrl = userAvatarUrl(session.userId, session.avatar);
  const guildIconUrl = guild?.icon
    ? `https://cdn.discordapp.com/icons/${params.guildId}/${guild.icon}.png?size=64`
    : null;

  return (
    <LevelsConfigPage
      guildId={params.guildId}
      guildName={guild?.name ?? 'Serveur'}
      guildIconUrl={guildIconUrl}
      previewAvatarUrl={avatarUrl}
      previewUsername={displayName(session)}
      botName={bot.name}
      botAvatarUrl={bot.avatarUrl}
      initialRewards={rewards.map((r) => ({
        id: r.id,
        level: r.level,
        roleId: r.roleId,
        rewardType: r.rewardType,
        stackMode: r.stackMode,
        durationSeconds: r.durationSeconds,
      }))}
      initial={
        config
          ? {
              enabled: config.enabled,
              levelUpAnnounceMode: config.levelUpAnnounceMode,
              levelUpChannelId: config.levelUpChannelId,
              levelUpMessage: config.levelUpMessage,
              levelUpMinLevel: config.levelUpMinLevel,
              xpMin: config.xpMin,
              xpMax: config.xpMax,
              cooldownSeconds: config.cooldownSeconds,
              voiceXpEnabled: config.voiceXpEnabled,
              voiceXpMin: config.voiceXpMin,
              voiceXpMax: config.voiceXpMax,
              voiceXpIntervalSeconds: config.voiceXpIntervalSeconds,
              curveStyle: config.curveStyle,
              curveMultiplier: config.curveMultiplier,
              maxLevel: config.maxLevel,
              xpRoleMode: config.xpRoleMode,
              ignoredRoleIds: config.ignoredRoleIds,
              boosterRoleIds: config.boosterRoleIds,
              xpChannelMode: config.xpChannelMode,
              ignoredChannelIds: config.ignoredChannelIds,
              boosterChannelIds: config.boosterChannelIds,
              xpInThreads: config.xpInThreads,
              xpInForumPosts: config.xpInForumPosts,
              voiceTextXpMode: config.voiceTextXpMode,
              viewOthersLevel: config.viewOthersLevel,
              publicLeaderboardEnabled: config.publicLeaderboardEnabled,
              resetXpOnLeave: config.resetXpOnLeave,
              resetXpOnBan: config.resetXpOnBan,
              longMessageDoubleXp: config.longMessageDoubleXp,
              rewardAnnounceMode: config.rewardAnnounceMode,
              rewardChannelId: config.rewardChannelId,
              rewardMessage: config.rewardMessage,
            }
          : undefined
      }
    />
  );
}
