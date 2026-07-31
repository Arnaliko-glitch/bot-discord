import { NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireGuildAccess(params.id);

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

    return NextResponse.json({
      memberCount: userXpCount,
      ticketCount,
      openTickets,
      totalXp: totalXp._sum.xp ?? 0,
      activeUsers: userXpCount,
      logsToday,
      enabledModules: modules.filter((m: { enabled: boolean }) => m.enabled).length,
    });
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
}
