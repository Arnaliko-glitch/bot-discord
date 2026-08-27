import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';
import { parseIdList } from '@/lib/id-list';

type Params = { params: { id: string } };

const MODES = new Set(['allow', 'deny']);

const DEFAULTS = {
  enabled: false,
  roleMode: 'allow',
  roleIds: [] as string[],
  channelMode: 'allow',
  channelIds: [] as string[],
};

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const config = await prisma.wordReactionConfig.findUnique({ where: { guildId: params.id } });
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
    enabled: !!body.enabled,
    roleMode: MODES.has(body.roleMode) ? body.roleMode : 'allow',
    roleIds: parseIdList(body.roleIds),
    channelMode: MODES.has(body.channelMode) ? body.channelMode : 'allow',
    channelIds: parseIdList(body.channelIds),
  };

  const updated = await prisma.wordReactionConfig.upsert({
    where: { guildId: params.id },
    update: { ...data, updatedAt: new Date() },
    create: { id: crypto.randomUUID(), guildId: params.id, updatedAt: new Date(), ...data },
  });

  return NextResponse.json(updated);
}
