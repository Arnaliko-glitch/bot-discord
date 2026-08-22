import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string } };

const DEFAULTS = {
  enabled: false,
  roleId: null as string | null,
  announceChannelId: null as string | null,
  announceMessage: '{user}, voici votre récompense pour avoir mis le tag du serveur ! 🏷️',
};

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const config = await prisma.serverTagConfig.findUnique({ where: { guildId: params.id } });
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
    roleId: body.roleId || null,
    announceChannelId: body.announceChannelId || null,
    announceMessage: String(body.announceMessage ?? '').slice(0, 1000),
  };

  const updated = await prisma.serverTagConfig.upsert({
    where: { guildId: params.id },
    update: { ...data, updatedAt: new Date() },
    create: { id: crypto.randomUUID(), guildId: params.id, updatedAt: new Date(), ...data },
  });

  return NextResponse.json(updated);
}
