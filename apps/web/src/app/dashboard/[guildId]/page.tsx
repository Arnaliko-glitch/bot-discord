import { prisma } from '@discord-bot-dashboard/database';
import { memberStatsDay, memberStatsDayKey, shiftMemberStatsDay } from '@discord-bot-dashboard/shared';
import { getBotIdentity } from '@/lib/discord-bot';
import { fetchGuildMembers } from '@/lib/discord-members';
import { MemberActivityChart, type DailyMemberPoint } from '@/components/MemberActivityChart';

// La plus longue période proposée par le sélecteur du graphique (30/60/90j)
// — on récupère toujours ce maximum, le composant découpe côté client selon
// le choix de l'utilisateur (évite un aller-retour serveur à chaque bascule).
const MAX_ACTIVITY_DAYS = 90;

// 90 derniers jours, aujourd'hui inclus (le suivi n'existant que depuis
// l'ajout de cette fonctionnalité, les jours sans donnée valent simplement 0/0).
function buildActivityRange(rows: { date: Date; joins: number; leaves: number }[], today: Date): DailyMemberPoint[] {
  const byDate = new Map(rows.map((r) => [memberStatsDayKey(r.date), r]));
  const days: DailyMemberPoint[] = [];
  for (let i = MAX_ACTIVITY_DAYS - 1; i >= 0; i--) {
    const d = shiftMemberStatsDay(today, -i);
    const key = memberStatsDayKey(d);
    const row = byDate.get(key);
    days.push({ date: key, joins: row?.joins ?? 0, leaves: row?.leaves ?? 0 });
  }
  return days;
}

export default async function GuildHomePage({ params }: { params: { guildId: string } }) {
  const today = memberStatsDay(new Date());
  const rangeStart = shiftMemberStatsDay(today, -(MAX_ACTIVITY_DAYS - 1));

  const [bot, members, activityRows] = await Promise.all([
    getBotIdentity(),
    fetchGuildMembers(params.guildId),
    prisma.dailyMemberStat.findMany({
      where: { guildId: params.guildId, date: { gte: rangeStart, lte: today } },
      orderBy: { date: 'asc' },
    }),
  ]);

  const memberCount = members.filter((m) => !m.user.bot).length;
  const activity = buildActivityRange(activityRows, today);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Accueil</h1>

      <div className="card">
        <h2 className="text-lg font-semibold text-white">Bienvenue dans le panneau d&apos;administration du bot {bot.name}</h2>
        <p className="mt-1 text-sm text-gray-500">
          Choisissez un module dans le menu à gauche pour commencer à le configurer.
        </p>
      </div>

      <MemberActivityChart memberCount={memberCount} data={activity} />
    </div>
  );
}
