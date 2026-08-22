import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string } };

const DEFAULTS = {
  tagChannelId: null as string | null,
  tagLogAdded: true,
  tagLogRemoved: true,
};

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const config = await prisma.logsConfig.findUnique({ where: { guildId: params.id } });
  return NextResponse.json(config ?? DEFAULTS);
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });

  const data = {
    tagChannelId: body.tagChannelId || null,
    tagLogAdded: !!body.tagLogAdded,
    tagLogRemoved: !!body.tagLogRemoved,
  };

  const updated = await prisma.logsConfig.upsert({
    where: { guildId: params.id },
    update: { ...data, updatedAt: new Date() },
    create: { id: crypto.randomUUID(), guildId: params.id, updatedAt: new Date(), ...data },
  });

  return NextResponse.json(updated);
}
