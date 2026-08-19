import { prisma } from '@discord-bot-dashboard/database';
import { ServerTagConfigPage } from '@/components/ServerTagConfigPage';

export default async function ServerTagPage({ params }: { params: { guildId: string } }) {
  const config = await prisma.serverTagConfig.findUnique({ where: { guildId: params.guildId } });

  return (
    <ServerTagConfigPage
      guildId={params.guildId}
      initial={config ? { enabled: config.enabled, roleId: config.roleId } : undefined}
    />
  );
}
