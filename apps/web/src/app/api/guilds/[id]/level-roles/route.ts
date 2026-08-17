import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma, prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string } };

const REWARD_TYPES = new Set(['role', 'temporary_role']);
const STACK_MODES = new Set(['stack', 'evolve']);

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const rewards = await prisma.levelRole.findMany({
    where: { guildId: params.id },
    orderBy: { level: 'desc' },
  });
  return NextResponse.json(rewards);
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });

  const level = Math.max(1, Math.trunc(Number(body.level) || 0));
  const roleId = String(body.roleId ?? '');
  if (!roleId || !level) return NextResponse.json({ error: 'Rôle et niveau requis' }, { status: 400 });

  const rewardType = REWARD_TYPES.has(body.rewardType) ? body.rewardType : 'role';

  try {
    const created = await prisma.levelRole.create({
      data: {
        id: crypto.randomUUID(),
        guildId: params.id,
        level,
        roleId,
        rewardType,
        stackMode: STACK_MODES.has(body.stackMode) ? body.stackMode : 'stack',
        durationSeconds:
          rewardType === 'temporary_role' && Number(body.durationSeconds) > 0
            ? Math.trunc(Number(body.durationSeconds))
            : null,
      },
    });
    return NextResponse.json(created);
  } catch (err) {
    // Contrainte @@unique([guildId, level]) : déjà une récompense à ce niveau.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'Une récompense existe déjà pour ce niveau' }, { status: 409 });
    }
    console.error('Erreur création level-role', err);
    return NextResponse.json({ error: 'Erreur lors de la création de la récompense' }, { status: 500 });
  }
}
