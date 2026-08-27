import { prisma } from '@discord-bot-dashboard/database';
import { WordReactionsConfigPage } from '@/components/WordReactionsConfigPage';

export default async function WordReactionsPage({ params }: { params: { guildId: string } }) {
  const [guild, config] = await Promise.all([
    prisma.guild.findUnique({ where: { id: params.guildId } }),
    prisma.wordReactionConfig.findUnique({ where: { guildId: params.guildId } }),
  ]);
  const guildIconUrl = guild?.icon
    ? `https://cdn.discordapp.com/icons/${params.guildId}/${guild.icon}.png?size=64`
    : null;

  return (
    <WordReactionsConfigPage
      guildId={params.guildId}
      guildName={guild?.name ?? 'Serveur'}
      guildIconUrl={guildIconUrl}
      initial={
        config
          ? {
              enabled: config.enabled,
              roleMode: config.roleMode,
              roleIds: config.roleIds,
              channelMode: config.channelMode,
              channelIds: config.channelIds,
            }
          : undefined
      }
    />
  );
}
