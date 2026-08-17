import { NextResponse } from 'next/server';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string } };

interface DiscordEmoji {
  id: string;
  name: string;
  animated: boolean;
  available: boolean;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const res = await fetch(`https://discord.com/api/v10/guilds/${params.id}/emojis`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    cache: 'no-store',
  });
  if (!res.ok) return NextResponse.json({ error: 'Impossible de récupérer les émojis' }, { status: 502 });

  const emojis = (await res.json()) as DiscordEmoji[];
  const usable = emojis
    .filter((e) => e.available !== false)
    .map((e) => ({ id: e.id, name: e.name, animated: e.animated }));

  return NextResponse.json(usable);
}
