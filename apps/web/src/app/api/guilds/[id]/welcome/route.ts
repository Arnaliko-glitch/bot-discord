import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string } };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
    const body = await request.json();

    await prisma.welcomeConfig.update({
      where: { guildId: params.id },
      data: {
        enabled: body.enabled,
        channelId: body.channelId || null,
        goodbyeChannelId: body.goodbyeChannelId || null,
        welcomeMessage: body.welcomeMessage,
        goodbyeMessage: body.goodbyeMessage,
        useEmbed: body.useEmbed,
        embedTitle: body.embedTitle || null,
        embedDescription: body.embedDescription,
        embedColor: body.embedColor,
        embedThumbnail: body.embedThumbnail,
        embedFooter: body.embedFooter || null,
        dmWelcome: body.dmWelcome,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 403 });
  }
}
