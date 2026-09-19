import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string; triggerId: string } };

function emojiList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string').slice(0, 20);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const existing = await prisma.wordReactionTrigger.findUnique({ where: { id: params.triggerId } });
  if (!existing || existing.guildId !== params.id) {
    return NextResponse.json({ error: 'Déclencheur introuvable' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });

  const phrase = String(body.phrase ?? '').trim().slice(0, 100);
  const emojis = emojiList(body.emojis);
  if (!phrase) return NextResponse.json({ error: 'Phrase requise' }, { status: 400 });
  if (emojis.length === 0) return NextResponse.json({ error: 'Au moins un emoji requis' }, { status: 400 });

  const updated = await prisma.$transaction(async (tx) => {
    const trigger = await tx.wordReactionTrigger.update({
      where: { id: params.triggerId },
      data: { phrase, emojis },
    });
    await tx.wordReactionConfig.updateMany({ where: { guildId: params.id }, data: { updatedAt: new Date() } });
    return trigger;
  });
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const existing = await prisma.wordReactionTrigger.findUnique({ where: { id: params.triggerId } });
  if (!existing || existing.guildId !== params.id) {
    return NextResponse.json({ error: 'Déclencheur introuvable' }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.wordReactionTrigger.delete({ where: { id: params.triggerId } }),
    prisma.wordReactionConfig.updateMany({ where: { guildId: params.id }, data: { updatedAt: new Date() } }),
  ]);
  return NextResponse.json({ ok: true });
}
