import { NextResponse } from 'next/server';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string } };

interface DiscordRole {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  // Mis en cache 30s côté serveur — voir la route /channels pour le détail.
  const res = await fetch(`https://discord.com/api/v10/guilds/${params.id}/roles`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    next: { revalidate: 30 },
  });
  if (!res.ok) return NextResponse.json({ error: 'Impossible de récupérer les rôles' }, { status: 502 });

  const roles = (await res.json()) as DiscordRole[];
  const mentionable = roles
    .filter((r) => r.name !== '@everyone' && !r.managed)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name, color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : null }));

  return NextResponse.json(mentionable);
}
