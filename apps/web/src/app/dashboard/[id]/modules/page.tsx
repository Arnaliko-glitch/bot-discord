import { notFound } from 'next/navigation';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';
import { DashboardShell } from '@/components/DashboardShell';
import { ModulesPage } from '@/components/ModulesPage';

export default async function ModulesRoute({ params }: { params: { id: string } }) {
  let access;
  try {
    access = await requireGuildAccess(params.id);
  } catch {
    notFound();
  }

  const modules = await prisma.moduleConfig.findMany({ where: { guildId: params.id } });

  return (
    <DashboardShell
      guild={{ id: access.dbGuild.id, name: access.dbGuild.name, icon: access.dbGuild.icon }}
      user={{ id: access.session.id, username: access.session.username, avatar: access.session.avatar }}
    >
      <h1 className="mb-2 text-2xl font-bold">Modules</h1>
      <p className="mb-8 text-gray-400">Activez ou désactivez les fonctionnalités du bot</p>
      <ModulesPage guildId={params.id} modules={modules} />
    </DashboardShell>
  );
}
