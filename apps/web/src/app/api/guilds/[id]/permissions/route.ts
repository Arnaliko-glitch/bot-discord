import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string } };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { session } = await requireGuildAccess(params.id);
    const body = await request.json();

    const perm = await prisma.dashboardPermission.create({
      data: {
        guildId: params.id,
        discordId: body.discordId,
        username: body.username,
        level: body.level ?? 'admin',
        addedBy: session.id,
      },
    });

    return NextResponse.json(perm);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    await prisma.dashboardPermission.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
}
