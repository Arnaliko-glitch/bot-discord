import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string } };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
    const body = await request.json();

    await prisma.ticketConfig.update({
      where: { guildId: params.id },
      data: {
        enabled: body.enabled,
        categoryId: body.categoryId || null,
        supportRoleId: body.supportRoleId || null,
        panelChannelId: body.panelChannelId || null,
        panelMessage: body.panelMessage,
        ticketNameFormat: body.ticketNameFormat,
        maxOpenPerUser: body.maxOpenPerUser,
        closeConfirmation: body.closeConfirmation,
        transcriptEnabled: body.transcriptEnabled,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
}
