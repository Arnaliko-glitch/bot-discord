import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';

type Params = { params: { id: string } };

// Mêmes valeurs par défaut que la colonne en base (schema.prisma) — utilisées
// seulement si la guilde n'a pas encore de ligne WelcomeConfig du tout.
const DEFAULTS = {
  enabled: false,
  channelId: null as string | null,
  message: 'Bienvenue {user} sur **{server}** ! Tu es le membre n°{server.membercount}.',
  mentionUser: true,
  backgroundColor: '#57F287',
  backgroundImage: null as string | null,
  backgroundOverlay: true,
  embedTitle: 'Ho ! Un nouveau membre !' as string | null,
  embedFooter: null as string | null,
  sidebarColor: '#dc2626',
  goodbyeEnabled: false,
  goodbyeChannelId: null as string | null,
  goodbyeMessage: '{user} a quitté **{server}**.',
  goodbyeBackgroundColor: '#ED4245',
  goodbyeBackgroundImage: null as string | null,
  goodbyeBackgroundOverlay: true,
  goodbyeEmbedTitle: 'Un membre vient de partir...' as string | null,
  goodbyeEmbedFooter: null as string | null,
  goodbyeSidebarColor: '#dc2626',
};

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const config = await prisma.welcomeConfig.findUnique({ where: { guildId: params.id } });
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
    channelId: body.channelId || null,
    message: String(body.message ?? '').slice(0, 4000),
    mentionUser: !!body.mentionUser,
    backgroundColor: String(body.backgroundColor ?? 'none'),
    backgroundImage: body.backgroundImage || null,
    backgroundOverlay: !!body.backgroundOverlay,
    // L'embed est toujours actif — pas de bascule exposée pour l'instant.
    useEmbed: true,
    embedTitle: body.embedTitle ? String(body.embedTitle).slice(0, 256) : null,
    embedFooter: body.embedFooter ? String(body.embedFooter).slice(0, 2048) : null,
    goodbyeEnabled: !!body.goodbyeEnabled,
    goodbyeChannelId: body.goodbyeChannelId || null,
    goodbyeMessage: String(body.goodbyeMessage ?? '').slice(0, 4000),
    goodbyeBackgroundColor: String(body.goodbyeBackgroundColor ?? 'none'),
    goodbyeBackgroundImage: body.goodbyeBackgroundImage || null,
    goodbyeBackgroundOverlay: !!body.goodbyeBackgroundOverlay,
    goodbyeUseEmbed: true,
    goodbyeEmbedTitle: body.goodbyeEmbedTitle ? String(body.goodbyeEmbedTitle).slice(0, 256) : null,
    goodbyeEmbedFooter: body.goodbyeEmbedFooter ? String(body.goodbyeEmbedFooter).slice(0, 2048) : null,
  };

  // Le formulaire du dashboard suppose le module actif dès qu'on
  // l'enregistre — la vraie bascule "module" viendra avec un futur réglage
  // dédié si besoin, sans quoi le bot ignorerait silencieusement la config.
  const updated = await prisma.welcomeConfig.upsert({
    where: { guildId: params.id },
    update: { ...data, moduleEnabled: true },
    create: { guildId: params.id, ...data, moduleEnabled: true },
  });

  return NextResponse.json(updated);
}
