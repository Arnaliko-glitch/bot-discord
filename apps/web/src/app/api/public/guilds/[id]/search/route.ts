import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@discord-bot-dashboard/database';
import { userAvatarUrl } from '@/lib/auth';
import { resolveDisplayName, searchGuildMembers } from '@/lib/discord-members';

type Params = { params: { id: string } };

// Recherche publique (pas de session requise) — utilisée par la page de
// classement publique pour retrouver n'importe quel membre du serveur par
// nom affiché, même s'il n'a jamais gagné d'xp. S'appuie sur la recherche
// native de Discord (préfixe pseudo/nom) plutôt que sur la seule base xp,
// pour fonctionner même sur de gros serveurs.
export async function GET(request: NextRequest, { params }: Params) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (!query) return NextResponse.json([]);

  const settings = await prisma.xpSettings.findUnique({ where: { guildId: params.id } });
  if (!settings?.enabled) return NextResponse.json({ error: 'Module désactivé' }, { status: 404 });

  const members = await searchGuildMembers(params.id, query, 20);
  const nonBotMembers = members.filter((m) => !m.user.bot);

  const results = await Promise.all(
    nonBotMembers.map(async (member) => {
      const userXp = await prisma.userXp.findUnique({
        where: { guildId_discordUserId: { guildId: params.id, discordUserId: member.user.id } },
      });
      const xp = userXp?.xp ?? 0;
      const rank = 1 + (await prisma.userXp.count({ where: { guildId: params.id, xp: { gt: xp } } }));
      return {
        rank,
        userId: member.user.id,
        username: resolveDisplayName(member),
        avatarUrl: userAvatarUrl(member.user.id, member.user.avatar),
        xp,
        level: userXp?.level ?? 0,
      };
    })
  );

  results.sort((a, b) => b.xp - a.xp);
  return NextResponse.json(results);
}
