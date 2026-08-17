import { NextRequest, NextResponse } from 'next/server';
import { Prisma, prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string; rewardId: string } };

const REWARD_TYPES = new Set(['role', 'temporary_role']);
const STACK_MODES = new Set(['stack', 'evolve']);

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const existing = await prisma.levelRole.findUnique({ where: { id: params.rewardId } });
  if (!existing || existing.guildId !== params.id) {
    return NextResponse.json({ error: 'Récompense introuvable' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });

  const level = Math.max(1, Math.trunc(Number(body.level) || 0));
  const roleId = String(body.roleId ?? '');
  if (!roleId || !level) return NextResponse.json({ error: 'Rôle et niveau requis' }, { status: 400 });

  const rewardType = REWARD_TYPES.has(body.rewardType) ? body.rewardType : 'role';

  try {
    const updated = await prisma.levelRole.update({
      where: { id: params.rewardId },
      data: {
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
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'Une récompense existe déjà pour ce niveau' }, { status: 409 });
    }
    console.error('Erreur modification level-role', err);
    return NextResponse.json({ error: 'Erreur lors de la modification de la récompense' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const existing = await prisma.levelRole.findUnique({ where: { id: params.rewardId } });
  if (!existing || existing.guildId !== params.id) {
    return NextResponse.json({ error: 'Récompense introuvable' }, { status: 404 });
  }

  await prisma.levelRole.delete({ where: { id: params.rewardId } });
  return NextResponse.json({ ok: true });
}
