import { notFound } from 'next/navigation';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';
import { DashboardShell } from '@/components/DashboardShell';
import { LevelRolesPage } from '@/components/LevelRolesPage';

export default async function LevelRolesRoute({ params }: { params: { id: string } }) {
  let access;
  try {
    access = await requireGuildAccess(params.id);
  } catch {
    notFound();
  }

  const roles = await prisma.levelRole.findMany({ where: { guildId: params.id }, orderBy: { level: 'asc' } });

  return (
    <DashboardShell
      guild={{ id: access.dbGuild.id, name: access.dbGuild.name, icon: access.dbGuild.icon }}
      user={{ id: access.session.id, username: access.session.username, avatar: access.session.avatar }}
    >
      <h1 className="mb-2 text-2xl font-bold">Rôles par niveau</h1>
      <p className="mb-8 text-gray-400">Attribuez des rôles automatiquement selon le niveau XP</p>
      <LevelRolesPage guildId={params.id} roles={roles} />
    </DashboardShell>
  );
}
