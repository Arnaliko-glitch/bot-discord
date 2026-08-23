import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';
import { fetchGuildMembers, resolveDisplayName } from '@/lib/discord-members';
import { convertToLocalXp, fetchDraftBotLevels, parseDraftBotServerId } from '@/lib/draftbot-import';

type Params = { params: { id: string } };

// Utilisées seulement si la guilde n'a pas encore de ligne XpSettings (courbe
// jamais configurée) — mêmes valeurs par défaut que schema.prisma.
const DEFAULT_CURVE_STYLE = 'exponential';
const DEFAULT_CURVE_MULTIPLIER = 1;

export async function POST(request: NextRequest, { params }: Params) {
  try {
    await requireGuildAccess(params.id);
  } catch {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });

  const serverId = parseDraftBotServerId(String(body.draftbotServerId ?? ''));
  if (!serverId) {
    return NextResponse.json({ error: "Lien ou ID de serveur DraftBot invalide." }, { status: 400 });
  }

  let scraped: Awaited<ReturnType<typeof fetchDraftBotLevels>>;
  try {
    scraped = await fetchDraftBotLevels(serverId);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Échec de la récupération.' }, { status: 400 });
  }
  if (scraped.members.length === 0) {
    return NextResponse.json({ error: 'Aucun membre avec de la progression trouvé sur ce serveur DraftBot.' }, { status: 400 });
  }

  const xpSettings = await prisma.xpSettings.findUnique({ where: { guildId: params.id } });
  const curveStyle = xpSettings?.curveStyle ?? DEFAULT_CURVE_STYLE;
  const curveMultiplier = xpSettings?.curveMultiplier ?? DEFAULT_CURVE_MULTIPLIER;

  const existing = await prisma.userXp.findMany({
    where: { guildId: params.id, discordUserId: { in: scraped.members.map((m) => m.discordUserId) } },
    select: { discordUserId: true },
  });
  const existingIds = new Set(existing.map((e) => e.discordUserId));

  const dryRun = body.dryRun !== false;
  const levels = scraped.members.map((m) => m.level);

  if (dryRun) {
    const liveMembers = await fetchGuildMembers(params.id);
    const liveIds = new Set(liveMembers.map((m) => m.user.id));
    const stillHere = scraped.members.filter((m) => liveIds.has(m.discordUserId)).length;

    return NextResponse.json({
      guildName: scraped.guildName,
      totalFound: scraped.members.length,
      minLevel: Math.min(...levels),
      maxLevel: Math.max(...levels),
      alreadyExisting: existingIds.size,
      stillHere,
    });
  }

  // Le bot doit avoir déjà rejoint ce serveur (ligne Guild créée à sa
  // connexion) — sans ça, l'écriture échoue sur la contrainte de clé
  // étrangère de UserXp. On le vérifie ici plutôt que de laisser Postgres
  // renvoyer une erreur peu claire.
  const guild = await prisma.guild.findUnique({ where: { id: params.id } });
  if (!guild) {
    return NextResponse.json(
      { error: "Le bot doit d'abord avoir rejoint ce serveur avant de pouvoir importer les niveaux." },
      { status: 400 }
    );
  }

  const overwriteExisting = Boolean(body.overwriteExisting);
  const toImport = overwriteExisting ? scraped.members : scraped.members.filter((m) => !existingIds.has(m.discordUserId));

  // Les membres réellement présents sur CE serveur peuvent avoir leur avatar
  // (et pseudo serveur) rempli tout de suite, plutôt que d'attendre leur
  // premier message — ceux absents (pas encore rejoint, scraping d'un autre
  // serveur pour test...) gardent un avatar vide, comblé plus tard.
  const liveMembers = await fetchGuildMembers(params.id);
  const liveMemberMap = new Map(liveMembers.map((m) => [m.user.id, m]));

  await Promise.all(
    toImport.map((member) => {
      const { level, xp } = convertToLocalXp(member, curveStyle, curveMultiplier);
      const liveMember = liveMemberMap.get(member.discordUserId);
      const username = liveMember ? resolveDisplayName(liveMember) : member.displayName;
      const avatar = liveMember?.user.avatar ?? null;
      return prisma.userXp.upsert({
        where: { guildId_discordUserId: { guildId: params.id, discordUserId: member.discordUserId } },
        update: { xp, level, username, avatar, updatedAt: new Date() },
        create: {
          id: crypto.randomUUID(),
          guildId: params.id,
          discordUserId: member.discordUserId,
          username,
          avatar,
          xp,
          level,
          updatedAt: new Date(),
        },
      });
    })
  );

  return NextResponse.json({ imported: toImport.length, skipped: scraped.members.length - toImport.length });
}
