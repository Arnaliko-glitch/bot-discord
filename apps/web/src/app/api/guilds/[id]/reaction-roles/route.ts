import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string } };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const panels = await prisma.reactionRolePanel.findMany({
    where: { guildId: params.id },
    orderBy: { updatedAt: 'desc' },
  });
  return NextResponse.json(panels);
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const count = await prisma.reactionRolePanel.count({ where: { guildId: params.id } });

  const created = await prisma.reactionRolePanel.create({
    data: {
      id: crypto.randomUUID(),
      guildId: params.id,
      name: String(body?.name ?? `Panneau ${count + 1}`).slice(0, 100),
      updatedAt: new Date(),
    },
  });
  return NextResponse.json(created);
}
