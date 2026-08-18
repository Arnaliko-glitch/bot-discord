import { prisma } from '@discord-bot-dashboard/database';
import { getSession } from '@/lib/auth';
import { TicketsConfigPage } from '@/components/TicketsConfigPage';

export default async function TicketsPage({ params }: { params: { guildId: string } }) {
  const session = getSession();
  if (!session) return null; // le layout parent redirige déjà si non connecté

  const [guild, config] = await Promise.all([
    prisma.guild.findUnique({ where: { id: params.guildId } }),
    prisma.ticketConfig.findUnique({ where: { guildId: params.guildId } }),
  ]);

  const guildIconUrl = guild?.icon ? `https://cdn.discordapp.com/icons/${params.guildId}/${guild.icon}.png?size=64` : null;

  return (
    <TicketsConfigPage
      guildId={params.guildId}
      guildName={guild?.name ?? 'Serveur'}
      guildIconUrl={guildIconUrl}
      initial={
        config
          ? {
              enabled: config.enabled,
              categoryId: config.categoryId,
              logChannelId: config.logChannelId,
              validationEnabled: config.validationEnabled,
              confirmationMessage: config.confirmationMessage,
              askOpenReason: config.askOpenReason,
              askCloseReason: config.askCloseReason,
              ticketNameFormat: config.ticketNameFormat,
              openPrivateThread: config.openPrivateThread,
              autoSaveTranscript: config.autoSaveTranscript,
              accessRoleIds: config.accessRoleIds,
              moderatorRoleIds: config.moderatorRoleIds,
              mentionModerators: config.mentionModerators,
              maxOpenPerUser: config.maxOpenPerUser,
              noReasonMessage: config.noReasonMessage,
              autoDeleteOnClose: config.autoDeleteOnClose,
              openingMessage: config.openingMessage,
            }
          : undefined
      }
    />
  );
}
