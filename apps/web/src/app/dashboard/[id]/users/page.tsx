import { notFound } from 'next/navigation';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';
import { DashboardShell } from '@/components/DashboardShell';
import { userAvatarUrl } from '@/lib/utils';
import { xpProgress } from '@discord-bot-dashboard/shared';

type UserXpEntry = {
  id: string;
  guildId: string;
  discordUserId: string;
  username: string;
  avatar: string | null;
  xp: number;
  level: number;
  messageCount: number;
};

export default async function UsersPage({
  params,
}: {
  params: { id: string };
}) {
  let access;

  try {
    access = await requireGuildAccess(params.id);
  } catch {
    notFound();
  }

  const users = await prisma.userXp.findMany({
    where: { guildId: params.id },
    orderBy: { xp: 'desc' },
    take: 100,
  }) as UserXpEntry[];

  return (
    <DashboardShell
      guild={{
        id: access.dbGuild.id,
        name: access.dbGuild.name,
        icon: access.dbGuild.icon,
      }}
      user={{
        id: access.session.id,
        username: access.session.username,
        avatar: access.session.avatar,
      }}
    >
      <h1 className="mb-2 text-2xl font-bold">
        Utilisateurs
      </h1>

      <p className="mb-8 text-gray-400">
        Classement XP du serveur
      </p>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--background)]">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-400">#</th>
              <th className="px-4 py-3 font-medium text-gray-400">Utilisateur</th>
              <th className="px-4 py-3 font-medium text-gray-400">Niveau</th>
              <th className="px-4 py-3 font-medium text-gray-400">XP</th>
              <th className="px-4 py-3 font-medium text-gray-400">Messages</th>
              <th className="px-4 py-3 font-medium text-gray-400">Progression</th>
            </tr>
          </thead>

          <tbody>
            {users.map((u: UserXpEntry, i) => {
              const progress = xpProgress(u.xp);

              return (
                <tr
                  key={u.id}
                  className="border-b border-[var(--border)]/50 hover:bg-[var(--card-hover)]"
                >
                  <td className="px-4 py-3 text-gray-500">
                    {i + 1}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={userAvatarUrl(u.discordUserId, u.avatar, 32)}
                        alt=""
                        className="h-8 w-8 rounded-full"
                      />

                      <span className="font-medium">
                        {u.username}
                      </span>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    {u.level}
                  </td>

                  <td className="px-4 py-3">
                    {u.xp.toLocaleString('fr-FR')}
                  </td>

                  <td className="px-4 py-3">
                    {u.messageCount}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-700">
                        <div
                          className="h-full bg-[var(--accent)]"
                          style={{
                            width: `${progress.percent}%`,
                          }}
                        />
                      </div>

                      <span className="text-xs text-gray-500">
                        {progress.percent}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {users.length === 0 && (
          <p className="p-8 text-center text-gray-400">
            Aucun utilisateur avec de l&apos;XP
          </p>
        )}
      </div>
    </DashboardShell>
  );
}