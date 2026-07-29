import { notFound } from 'next/navigation';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';
import { DashboardShell } from '@/components/DashboardShell';
import { PermissionsPage } from '@/components/PermissionsPage';

export default async function PermissionsRoute({ params }: { params: { id: string } }) {
  let access;
  try {
    access = await requireGuildAccess(params.id);
  } catch {
    notFound();
  }

  const permissions = await prisma.dashboardPermission.findMany({ where: { guildId: params.id } });

  return (
    <DashboardShell
      guild={{ id: access.dbGuild.id, name: access.dbGuild.name, icon: access.dbGuild.icon }}
      user={{ id: access.session.id, username: access.session.username, avatar: access.session.avatar }}
    >
      <h1 className="mb-2 text-2xl font-bold">Permissions dashboard</h1>
      <p className="mb-8 text-gray-400">Gérez qui peut configurer le bot</p>
      <PermissionsPage guildId={params.id} permissions={permissions} />
    </DashboardShell>
  );
}
