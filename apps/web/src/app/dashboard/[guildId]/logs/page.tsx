import { prisma } from '@discord-bot-dashboard/database';
import { LogsConfigPage } from '@/components/LogsConfigPage';

export default async function LogsPage({ params }: { params: { guildId: string } }) {
  const config = await prisma.logsConfig.findUnique({ where: { guildId: params.guildId } });

  return (
    <LogsConfigPage
      guildId={params.guildId}
      initial={
        config
          ? { tagChannelId: config.tagChannelId, tagLogAdded: config.tagLogAdded, tagLogRemoved: config.tagLogRemoved }
          : undefined
      }
    />
  );
}
