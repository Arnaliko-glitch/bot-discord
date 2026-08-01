import { NextResponse } from 'next/server';
import { requireGuildAccess } from '@/lib/guild-access';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireGuildAccess(params.id);
  } catch (err) {
    console.error('requireGuildAccess failed:', err);
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const res = await fetch(`https://discord.com/api/v10/guilds/${params.id}/channels`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'Impossible de récupérer les salons' }, { status: 502 });
  }

  const channels: Array<{ id: string; name: string; type: number; position: number }> = await res.json();

  const textChannels = channels
    .filter((c) => c.type === 0 || c.type === 5)
    .sort((a, b) => a.position - b.position)
    .map((c) => ({ id: c.id, name: c.name }));

  return NextResponse.json(textChannels);
}