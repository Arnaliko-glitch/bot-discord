import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string } };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
    const body = await request.json();

    await prisma.$transaction([
      prisma.levelRole.deleteMany({ where: { guildId: params.id } }),
      ...body.roles.map((r: { level: number; roleId: string }) =>
        prisma.levelRole.create({
          data: { guildId: params.id, level: r.level, roleId: r.roleId },
        })
      ),
    ]);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
}
