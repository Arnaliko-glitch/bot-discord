import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string } };

function emojiList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string').slice(0, 20);
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const triggers = await prisma.wordReactionTrigger.findMany({
    where: { guildId: params.id },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(triggers);
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });

  const phrase = String(body.phrase ?? '').trim().slice(0, 100);
  const emojis = emojiList(body.emojis);
  if (!phrase) return NextResponse.json({ error: 'Phrase requise' }, { status: 400 });
  if (emojis.length === 0) return NextResponse.json({ error: 'Au moins un emoji requis' }, { status: 400 });

  const created = await prisma.$transaction(async (tx) => {
    const trigger = await tx.wordReactionTrigger.create({
      data: { id: crypto.randomUUID(), guildId: params.id, phrase, emojis },
    });
    await tx.wordReactionConfig.updateMany({ where: { guildId: params.id }, data: { updatedAt: new Date() } });
    return trigger;
  });
  return NextResponse.json(created);
}
