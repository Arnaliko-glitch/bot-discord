import { NextRequest, NextResponse } from 'next/server';
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
// GUILD_CATEGORY
const CATEGORY_CHANNEL_TYPES = new Set([4]);

export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  // Mis en cache 30s côté serveur (fetch natif Next.js) : évite de
  // retaper l'API Discord à chaque navigation entre les pages du dashboard,
  // qui rendait le chargement des salons perceptiblement lent.
  const res = await fetch(`https://discord.com/api/v10/guilds/${params.id}/channels`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    next: { revalidate: 30 },
  });
  if (!res.ok) return NextResponse.json({ error: 'Impossible de récupérer les salons' }, { status: 502 });

  const type = request.nextUrl.searchParams.get('type');
  const allowedTypes = type === 'category' ? CATEGORY_CHANNEL_TYPES : TEXT_CHANNEL_TYPES;

  const channels = (await res.json()) as DiscordChannel[];
  const filtered = channels
    .filter((c) => allowedTypes.has(c.type))
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(filtered);
}
