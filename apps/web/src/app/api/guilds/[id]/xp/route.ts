import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string } };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
    const body = await request.json();

    await prisma.xpSettings.update({
      where: { guildId: params.id },
      data: {
        enabled: body.enabled,
        xpMin: body.xpMin,
        xpMax: body.xpMax,
        cooldownSeconds: body.cooldownSeconds,
        levelUpChannelId: body.levelUpChannelId || null,
        levelUpMessage: body.levelUpMessage,
        announceLevelUp: body.announceLevelUp,
        stackRoles: body.stackRoles,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
}
