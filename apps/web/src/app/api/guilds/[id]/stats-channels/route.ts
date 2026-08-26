import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';
import { fetchGuildMembers } from '@/lib/discord-members';

type Params = { params: { id: string } };

const STAT_TYPES = new Set(['membersNoBots', 'membersTotal']);
const CHANNEL_TYPES = new Set(['voice', 'text']);

// Refusée à @everyone sur les salons vocaux créés ici — ils n'existent que
// pour afficher leur nom, jamais pour être rejoints.
const CONNECT_PERMISSION = '1048576';

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

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const channels = await prisma.statsChannel.findMany({ where: { guildId: params.id }, orderBy: { createdAt: 'asc' } });
  return NextResponse.json(channels);
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });

  const statType = STAT_TYPES.has(body.statType) ? body.statType : 'membersNoBots';
  const channelType = CHANNEL_TYPES.has(body.channelType) ? body.channelType : 'voice';
  const format = String(body.format || 'Membres : {count}').slice(0, 100);

  const count = await computeCount(params.id, statType);
  const name = format.replaceAll('{count}', String(count)).slice(0, 100);

  const createRes = await fetch(`https://discord.com/api/v10/guilds/${params.id}/channels`, {
    method: 'POST',
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      type: channelType === 'voice' ? 2 : 0,
      permission_overwrites: channelType === 'voice' ? [{ id: params.id, type: 0, deny: CONNECT_PERMISSION }] : undefined,
    }),
  });
  if (!createRes.ok) return NextResponse.json({ error: 'Impossible de créer le salon' }, { status: 502 });
  const channel = (await createRes.json()) as { id: string };

  const created = await prisma.statsChannel.create({
    data: { id: crypto.randomUUID(), guildId: params.id, channelId: channel.id, statType, channelType, format },
  });

  return NextResponse.json(created);
}
