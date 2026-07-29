import { redirect, notFound } from 'next/navigation';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';
import { DashboardShell } from '@/components/DashboardShell';
import { Users, Ticket, Sparkles, ScrollText } from 'lucide-react';

export default async function GuildOverviewPage({ params }: { params: { id: string } }) {
  let access;
  try {
    access = await requireGuildAccess(params.id);
  } catch {
    notFound();
  }

  const { session, dbGuild } = access;

  const [ticketCount, openTickets, userXpCount, totalXp, logsToday, modules] = await Promise.all([
    prisma.ticket.count({ where: { guildId: params.id } }),
    prisma.ticket.count({ where: { guildId: params.id, status: 'open' } }),
    prisma.userXp.count({ where: { guildId: params.id } }),
    prisma.userXp.aggregate({ where: { guildId: params.id }, _sum: { xp: true } }),
    prisma.logEntry.count({
      where: {
        guildId: params.id,
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
    prisma.moduleConfig.findMany({ where: { guildId: params.id } }),
  ]);

  const enabledModules = modules.filter((m) => m.enabled).length;

  const stats = [
    { label: 'Membres XP', value: userXpCount, icon: Users, color: 'text-blue-400' },
    { label: 'Tickets ouverts', value: openTickets, icon: Ticket, color: 'text-green-400' },
    { label: 'Total tickets', value: ticketCount, icon: Ticket, color: 'text-yellow-400' },
    { label: 'XP total', value: totalXp._sum.xp ?? 0, icon: Sparkles, color: 'text-purple-400' },
    { label: 'Logs aujourd\'hui', value: logsToday, icon: ScrollText, color: 'text-red-400' },
    { label: 'Modules actifs', value: `${enabledModules}/${modules.length}`, icon: Sparkles, color: 'text-[var(--accent)]' },
  ];

  return (
    <DashboardShell
      guild={{ id: dbGuild.id, name: dbGuild.name, icon: dbGuild.icon }}
      user={{ id: session.id, username: session.username, avatar: session.avatar }}
    >
      <h1 className="mb-2 text-2xl font-bold">Vue d&apos;ensemble</h1>
      <p className="mb-8 text-gray-400">Statistiques du serveur {dbGuild.name}</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-gray-400">{label}</span>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <p className="text-3xl font-bold">{value}</p>
          </div>
        ))}
      </div>
    </DashboardShell>
  );
}
