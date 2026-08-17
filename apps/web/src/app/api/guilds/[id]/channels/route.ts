import { NextResponse } from 'next/server';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string } };

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
}

// GUILD_TEXT et GUILD_ANNOUNCEMENT — les seuls types de salon où le bot peut
// poster un message texte.
const TEXT_CHANNEL_TYPES = new Set([0, 5]);

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const res = await fetch(`https://discord.com/api/v10/guilds/${params.id}/channels`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    cache: 'no-store',
  });
  if (!res.ok) return NextResponse.json({ error: 'Impossible de récupérer les salons' }, { status: 502 });

  const channels = (await res.json()) as DiscordChannel[];
  const textChannels = channels
    .filter((c) => TEXT_CHANNEL_TYPES.has(c.type))
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(textChannels);
}
