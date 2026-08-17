import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string } };

// Mêmes valeurs par défaut que la colonne en base (schema.prisma) — utilisées
// seulement si la guilde n'a pas encore de ligne XpSettings du tout.
const DEFAULTS = {
  enabled: false,
  levelUpAnnounceMode: 'channel' as string,
  levelUpChannelId: null as string | null,
  levelUpMessage: '{user}, vous venez de passer au niveau {level} !',
  levelUpMinLevel: 0,
  xpMin: 15,
  xpMax: 25,
  cooldownSeconds: 30,
  voiceXpEnabled: false,
  voiceXpMin: 5,
  voiceXpMax: 15,
  voiceXpIntervalSeconds: 60,
  curveStyle: 'exponential' as string,
  curveMultiplier: 1,
  maxLevel: 0,
  xpRoleMode: 'without' as string,
  ignoredRoleIds: [] as string[],
  boosterRoleIds: [] as string[],
  xpChannelMode: 'without' as string,
  ignoredChannelIds: [] as string[],
  boosterChannelIds: [] as string[],
};

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const config = await prisma.xpSettings.findUnique({ where: { guildId: params.id } });
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
    levelUpAnnounceMode: body.levelUpAnnounceMode === 'disabled' ? 'disabled' : 'channel',
    levelUpChannelId: body.levelUpChannelId || null,
    levelUpMessage: String(body.levelUpMessage ?? '').slice(0, 1000),
    levelUpMinLevel: Math.max(0, Math.trunc(Number(body.levelUpMinLevel) || 0)),
    xpMin: Math.max(0, Math.trunc(Number(body.xpMin) || 0)),
    xpMax: Math.max(0, Math.trunc(Number(body.xpMax) || 0)),
    cooldownSeconds: Math.max(0, Math.trunc(Number(body.cooldownSeconds) || 0)),
    voiceXpEnabled: !!body.voiceXpEnabled,
    voiceXpMin: Math.max(0, Math.trunc(Number(body.voiceXpMin) || 0)),
    voiceXpMax: Math.max(0, Math.trunc(Number(body.voiceXpMax) || 0)),
    voiceXpIntervalSeconds: Math.max(0, Math.trunc(Number(body.voiceXpIntervalSeconds) || 0)),
    curveStyle: String(body.curveStyle ?? 'exponential'),
    curveMultiplier: Math.max(0, Number(body.curveMultiplier) || 1),
    maxLevel: Math.max(0, Math.trunc(Number(body.maxLevel) || 0)),
    xpRoleMode: body.xpRoleMode === 'with' ? 'with' : 'without',
    ignoredRoleIds: toStringArray(body.ignoredRoleIds),
    boosterRoleIds: toStringArray(body.boosterRoleIds),
    xpChannelMode: body.xpChannelMode === 'with' ? 'with' : 'without',
    ignoredChannelIds: toStringArray(body.ignoredChannelIds),
    boosterChannelIds: toStringArray(body.boosterChannelIds),
  };

  const updated = await prisma.xpSettings.upsert({
    where: { guildId: params.id },
    update: data,
    create: { id: crypto.randomUUID(), guildId: params.id, updatedAt: new Date(), ...data },
  });

  return NextResponse.json(updated);
}
