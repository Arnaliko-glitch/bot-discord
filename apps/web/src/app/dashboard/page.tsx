import { redirect } from 'next/navigation';
import { prisma } from '@discord-bot-dashboard/database';
import { fetchUserGuilds, getSession, hasManageGuild } from '@/lib/auth';

function guildIconUrl(guildId: string, icon: string | null) {
  if (!icon) return null;
  const ext = icon.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.${ext}?size=128`;
}

export default async function ServerPickerPage() {
  const session = await getSession();
  if (!session) redirect('/');

  const userGuilds = await fetchUserGuilds(session.accessToken);
  const manageable = userGuilds.filter((g) => hasManageGuild(g.permissions));
  const botGuilds = await prisma.guild.findMany({
    where: { id: { in: manageable.map((g) => g.id) } },
  });
  const botGuildIds = new Set(botGuilds.map((g) => g.id));
  const guilds = manageable.filter((g) => botGuildIds.has(g.id));

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-1 text-2xl font-bold text-white">Choisissez un serveur</h1>
      <p className="mb-8 text-gray-400">Serveurs où vous pouvez gérer le bot.</p>

      {guilds.length === 0 ? (
        <p className="text-gray-500">
          Aucun serveur trouvé — vérifiez que le bot est bien invité sur un serveur où vous avez la permission
          &quot;Gérer le serveur&quot;.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {guilds.map((g) => {
            const iconUrl = guildIconUrl(g.id, g.icon);
            return (
              <a
                key={g.id}
                href={`/dashboard/${g.id}`}
                className="card flex flex-col items-center gap-3 p-4 text-center transition hover:bg-[var(--card-hover)]"
              >
                {iconUrl ? (
                  <img src={iconUrl} alt="" className="h-16 w-16 rounded-full" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)] text-xl font-bold text-white">
                    {g.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className="truncate text-sm font-medium text-white">{g.name}</span>
              </a>
            );
          })}
        </div>
      )}
    </main>
  );
}
