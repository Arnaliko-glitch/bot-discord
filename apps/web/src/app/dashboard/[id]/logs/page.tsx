import { notFound } from 'next/navigation';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';
import { DashboardShell } from '@/components/DashboardShell';
import { formatDate, LOG_TYPE_LABELS } from '@/lib/utils';

export default async function LogsPage({ params }: { params: { id: string } }) {
  let access;
  try {
    access = await requireGuildAccess(params.id);
  } catch {
    notFound();
  }

  const logs = await prisma.logEntry.findMany({
    where: { guildId: params.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <DashboardShell
      guild={{ id: access.dbGuild.id, name: access.dbGuild.name, icon: access.dbGuild.icon }}
      user={{ id: access.session.id, username: access.session.username, avatar: access.session.avatar }}
    >
      <h1 className="mb-2 text-2xl font-bold">Logs de modération</h1>
      <p className="mb-8 text-gray-400">Historique des actions sur le serveur</p>

      <div className="space-y-3">
        {logs.map((log) => (
          <div key={log.id} className="card flex items-start gap-4 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--background)] text-lg">
              {log.type.includes('ticket') ? '🎫' : log.type.includes('level') ? '⭐' : log.type.includes('message') ? '💬' : '👤'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="rounded bg-[var(--accent)]/20 px-2 py-0.5 text-xs font-medium text-[var(--accent)]">
                  {LOG_TYPE_LABELS[log.type] ?? log.type}
                </span>
                <span className="text-xs text-gray-500">{formatDate(log.createdAt)}</span>
              </div>
              <p className="text-sm">
                {log.actorName && <span className="font-medium">{log.actorName}</span>}
                {log.targetName && <span> → {log.targetName}</span>}
                {log.reason && <span className="text-gray-400"> — {log.reason}</span>}
              </p>
              {log.channelId && <p className="text-xs text-gray-500">Salon: {log.channelId}</p>}
            </div>
          </div>
        ))}
        {logs.length === 0 && <p className="text-center text-gray-400">Aucun log enregistré</p>}
      </div>
    </DashboardShell>
  );
}
