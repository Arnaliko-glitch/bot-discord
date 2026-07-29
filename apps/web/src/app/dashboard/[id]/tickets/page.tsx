import { notFound } from 'next/navigation';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';
import { DashboardShell } from '@/components/DashboardShell';
import { TicketConfigPage } from '@/components/TicketConfigPage';

export default async function TicketsPage({ params }: { params: { id: string } }) {
  let access;
  try {
    access = await requireGuildAccess(params.id);
  } catch {
    notFound();
  }

  const config = await prisma.ticketConfig.findUnique({ where: { guildId: params.id } });
  if (!config) notFound();

  return (
    <DashboardShell
      guild={{ id: access.dbGuild.id, name: access.dbGuild.name, icon: access.dbGuild.icon }}
      user={{ id: access.session.id, username: access.session.username, avatar: access.session.avatar }}
    >
      <h1 className="mb-2 text-2xl font-bold">Système de tickets</h1>
      <p className="mb-8 text-gray-400">Configurez le support par tickets</p>
      <TicketConfigPage
        guildId={params.id}
        config={{
          enabled: config.enabled,
          categoryId: config.categoryId ?? '',
          supportRoleId: config.supportRoleId ?? '',
          panelChannelId: config.panelChannelId ?? '',
          panelMessage: config.panelMessage,
          ticketNameFormat: config.ticketNameFormat,
          maxOpenPerUser: config.maxOpenPerUser,
          closeConfirmation: config.closeConfirmation,
          transcriptEnabled: config.transcriptEnabled,
          transcriptChannelId: config.transcriptChannelId ?? '',
          deleteOnClose: config.deleteOnClose,
          deleteDelaySeconds: config.deleteDelaySeconds,
        }}
      />
    </DashboardShell>
  );
}
