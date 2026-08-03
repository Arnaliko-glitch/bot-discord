import { notFound } from 'next/navigation';
import { prisma } from '@discord-bot-dashboard/database';
import { requireGuildAccess } from '@/lib/guild-access';
import { DashboardShell } from '@/components/DashboardShell';
import { WelcomeConfigPage } from '@/components/WelcomeConfigPage';

export default async function WelcomePage({ params }: { params: { id: string } }) {
  let access;
  try {
    access = await requireGuildAccess(params.id);
  } catch {
    notFound();
  }
  const config = await prisma.welcomeConfig.findUnique({ where: { guildId: params.id } });
  if (!config) notFound();
  return (
    <DashboardShell
      guild={{ id: access.dbGuild.id, name: access.dbGuild.name, icon: access.dbGuild.icon }}
      user={{ id: access.session.id, username: access.session.username, avatar: access.session.avatar }}
    >
      <h1 className="mb-2 text-2xl font-bold">Messages de bienvenue</h1>
      <p className="mb-8 text-gray-400">Configurez les messages d&apos;accueil et d&apos;au revoir</p>
      <WelcomeConfigPage
        guildId={params.id}
        config={{
          enabled: config.enabled,
          channelId: config.channelId ?? '',
          goodbyeChannelId: config.goodbyeChannelId ?? '',
          welcomeMessage: config.welcomeMessage,
          goodbyeMessage: config.goodbyeMessage,
          useEmbed: config.useEmbed,
          embedTitle: config.embedTitle ?? '',
          embedDescription: config.embedDescription,
          embedColor: config.embedColor,
          embedThumbnail: config.embedThumbnail,
          goodbyeUseEmbed: config.goodbyeUseEmbed,
          goodbyeEmbedTitle: config.goodbyeEmbedTitle ?? '',
          goodbyeEmbedDescription: config.goodbyeEmbedDescription,
          goodbyeEmbedColor: config.goodbyeEmbedColor,
          goodbyeEmbedThumbnail: config.goodbyeEmbedThumbnail,
          dmWelcome: config.dmWelcome,
        }}
      />
    </DashboardShell>
  );
}
