import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string } };

const DEFAULTS = {
  enabled: false,
  categoryId: null as string | null,
  ticketNameFormat: '{user.globalname}',
  maxOpenPerUser: 1,
  accessRoleIds: [] as string[],
  askCloseReason: true,
  askOpenReason: true,
  autoDeleteOnClose: true,
  confirmationMessage: 'Votre ticket a bien été envoyé, un membre du staff vous prendra rapidement en charge si votre ticket est accepté !',
  logChannelId: null as string | null,
  mentionModerators: true,
  moderatorRoleIds: [] as string[],
  noReasonMessage: "N'hésitez pas à décrire votre problème, un membre du staff vous prendra rapidement en charge.",
  validationEnabled: true,
  openingMessage: 'Bonjour {user}, décrivez votre problème et un membre du staff vous répondra sous peu.',
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

  const config = await prisma.ticketConfig.findUnique({ where: { guildId: params.id } });
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
    categoryId: body.categoryId || null,
    ticketNameFormat: String(body.ticketNameFormat ?? DEFAULTS.ticketNameFormat).slice(0, 100),
    maxOpenPerUser: Math.min(10, Math.max(1, Math.trunc(Number(body.maxOpenPerUser) || 1))),
    accessRoleIds: toStringArray(body.accessRoleIds),
    askCloseReason: !!body.askCloseReason,
    askOpenReason: !!body.askOpenReason,
    autoDeleteOnClose: !!body.autoDeleteOnClose,
    confirmationMessage: String(body.confirmationMessage ?? '').slice(0, 4000),
    logChannelId: body.logChannelId || null,
    mentionModerators: !!body.mentionModerators,
    moderatorRoleIds: toStringArray(body.moderatorRoleIds),
    noReasonMessage: String(body.noReasonMessage ?? '').slice(0, 4000),
    validationEnabled: !!body.validationEnabled,
    openingMessage: String(body.openingMessage ?? '').slice(0, 4000),
  };

  const updated = await prisma.ticketConfig.upsert({
    where: { guildId: params.id },
    update: data,
    create: { id: crypto.randomUUID(), guildId: params.id, updatedAt: new Date(), ...data },
  });

  return NextResponse.json(updated);
}
