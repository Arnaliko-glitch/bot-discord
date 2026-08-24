import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { fetchLeaderboardPage } from '@/lib/leaderboard';

type Params = { params: { id: string } };

// Pagination du classement public — voir fetchLeaderboardPage pour pourquoi
// ("Charger plus" appelle cette route au lieu de tout charger d'un coup).
export async function GET(request: NextRequest, { params }: Params) {
  const settings = await prisma.xpSettings.findUnique({ where: { guildId: params.id } });
  if (!settings?.enabled || !settings.publicLeaderboardEnabled) {
    return NextResponse.json({ error: 'Module désactivé' }, { status: 404 });
  }

  const offset = Math.max(0, Math.trunc(Number(request.nextUrl.searchParams.get('offset')) || 0));
  const { rows, hasMore } = await fetchLeaderboardPage(params.id, offset);
  return NextResponse.json({ rows, hasMore });
}
