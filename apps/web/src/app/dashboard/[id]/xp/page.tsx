import { notFound } from 'next/navigation';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';
import { DashboardShell } from '@/components/DashboardShell';
import { XpConfigPage } from '@/components/XpConfigPage';

export default async function XpPage({ params }: { params: { id: string } }) {
  let access;
  try {
    access = await requireGuildAccess(params.id);
  } catch {
    notFound();
  }

  const config = await prisma.xpSettings.findUnique({ where: { guildId: params.id } });
  if (!config) notFound();

  return (
    <DashboardShell
      guild={{ id: access.dbGuild.id, name: access.dbGuild.name, icon: access.dbGuild.icon }}
      user={{ id: access.session.id, username: access.session.username, avatar: access.session.avatar }}
    >
      <h1 className="mb-2 text-2xl font-bold">XP & Niveaux</h1>
      <p className="mb-8 text-gray-400">Configurez le système de progression</p>
      <XpConfigPage
        guildId={params.id}
        config={{
          enabled: config.enabled,
          xpMin: config.xpMin,
          xpMax: config.xpMax,
          cooldownSeconds: config.cooldownSeconds,
          levelUpChannelId: config.levelUpChannelId ?? '',
          levelUpMessage: config.levelUpMessage,
          announceLevelUp: config.announceLevelUp,
          stackRoles: config.stackRoles,
        }}
      />
    </DashboardShell>
  );
}
