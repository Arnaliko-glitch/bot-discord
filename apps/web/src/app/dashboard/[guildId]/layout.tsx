import { redirect } from 'next/navigation';
import { prisma } from '@discord-bot-dashboard/database';
import { displayName, fetchUserGuilds, getSession, hasManageGuild, userAvatarUrl } from '@/lib/auth';
import { DashboardShell } from '@/components/DashboardShell';

export default async function GuildLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { guildId: string };
}) {
  const session = getSession();
  if (!session) redirect('/');

  const userGuilds = await fetchUserGuilds(session.accessToken);
  const sessionGuild = userGuilds.find((g) => g.id === params.guildId);
  if (!sessionGuild || !hasManageGuild(sessionGuild.permissions)) redirect('/dashboard');

  const guild = await prisma.guild.findUnique({ where: { id: params.guildId } });
  if (!guild) redirect('/dashboard');

  return (
    <DashboardShell
      guildId={guild.id}
      guildName={guild.name ?? sessionGuild.name}
      guildIcon={guild.icon}
      username={displayName(session)}
      userAvatarUrl={userAvatarUrl(session.userId, session.avatar, 64)}
    >
      {children}
    </DashboardShell>
  );
}
