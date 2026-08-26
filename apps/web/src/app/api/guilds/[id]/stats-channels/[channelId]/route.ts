import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';
import { fetchGuildMembers } from '@/lib/discord-members';

type Params = { params: { id: string; channelId: string } };

const STAT_TYPES = new Set(['membersNoBots', 'membersTotal']);

async function computeCount(guildId: string, statType: string): Promise<number> {
  if (statType === 'membersTotal') {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
      cache: 'no-store',
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as { approximate_member_count?: number };
    return data.approximate_member_count ?? 0;
  }

  const members = await fetchGuildMembers(guildId);
  return members.filter((m) => !m.user.bot).length;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const existing = await prisma.statsChannel.findUnique({ where: { id: params.channelId } });
  if (!existing || existing.guildId !== params.id) {
    return NextResponse.json({ error: 'Salon de statistiques introuvable' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });

  const statType = STAT_TYPES.has(body.statType) ? body.statType : existing.statType;
  const format = String(body.format || existing.format).slice(0, 100);

  const count = await computeCount(params.id, statType);
  const name = format.replaceAll('{count}', String(count)).slice(0, 100);
  await fetch(`https://discord.com/api/v10/channels/${existing.channelId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }).catch(() => undefined);

  const updated = await prisma.statsChannel.update({ where: { id: params.channelId }, data: { statType, format } });
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const existing = await prisma.statsChannel.findUnique({ where: { id: params.channelId } });
  if (!existing || existing.guildId !== params.id) {
    return NextResponse.json({ error: 'Salon de statistiques introuvable' }, { status: 404 });
  }

  await fetch(`https://discord.com/api/v10/channels/${existing.channelId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
  }).catch(() => undefined);

  await prisma.statsChannel.delete({ where: { id: params.channelId } });
  return NextResponse.json({ ok: true });
}
