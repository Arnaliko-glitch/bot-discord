import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string } };

const DEFAULTS = {
  enabled: false,
  hubChannelId: null as string | null,
  categoryId: null as string | null,
  nameTemplate: '🔊 Salon de {user}',
  userLimit: 0,
  permissionSource: 'category',
  creatorCanInvite: true,
  creatorPrioritySpeaker: true,
  creatorSetStatus: true,
  creatorManageChannel: false,
  creatorUseSoundboard: true,
  creatorManagePermissions: false,
  allowClaim: true,
  configMenuEnabled: true,
  moderatorRoleIds: [] as string[],
  untouchableRoleIds: [] as string[],
  accessRoleIds: [] as string[],
};

function roleIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string').slice(0, 50);
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const config = await prisma.privateRoomConfig.findUnique({ where: { guildId: params.id } });
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
    hubChannelId: body.hubChannelId || null,
    categoryId: body.categoryId || null,
    nameTemplate: String(body.nameTemplate || '🔊 Salon de {user}').slice(0, 100),
    userLimit: Math.min(99, Math.max(0, Math.trunc(Number(body.userLimit) || 0))),
    permissionSource: body.permissionSource === 'hub' ? 'hub' : 'category',
    creatorCanInvite: !!body.creatorCanInvite,
    creatorPrioritySpeaker: !!body.creatorPrioritySpeaker,
    creatorSetStatus: !!body.creatorSetStatus,
    creatorManageChannel: !!body.creatorManageChannel,
    creatorUseSoundboard: !!body.creatorUseSoundboard,
    creatorManagePermissions: !!body.creatorManagePermissions,
    allowClaim: !!body.allowClaim,
    configMenuEnabled: !!body.configMenuEnabled,
    moderatorRoleIds: roleIdList(body.moderatorRoleIds),
    untouchableRoleIds: roleIdList(body.untouchableRoleIds),
    accessRoleIds: roleIdList(body.accessRoleIds),
  };

  const updated = await prisma.privateRoomConfig.upsert({
    where: { guildId: params.id },
    update: { ...data, updatedAt: new Date() },
    create: { id: crypto.randomUUID(), guildId: params.id, updatedAt: new Date(), ...data },
  });

  return NextResponse.json(updated);
}
