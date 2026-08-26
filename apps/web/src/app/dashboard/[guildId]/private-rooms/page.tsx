import { prisma } from '@discord-bot-dashboard/database';
import { PrivateRoomsConfigPage } from '@/components/PrivateRoomsConfigPage';

export default async function PrivateRoomsPage({ params }: { params: { guildId: string } }) {
  const config = await prisma.privateRoomConfig.findUnique({ where: { guildId: params.guildId } });

  return (
    <PrivateRoomsConfigPage
      guildId={params.guildId}
      initial={
        config
          ? {
              enabled: config.enabled,
              hubChannelId: config.hubChannelId,
              categoryId: config.categoryId,
              nameTemplate: config.nameTemplate,
              userLimit: config.userLimit,
              permissionSource: config.permissionSource,
              creatorCanInvite: config.creatorCanInvite,
              creatorPrioritySpeaker: config.creatorPrioritySpeaker,
              creatorSetStatus: config.creatorSetStatus,
              creatorManageChannel: config.creatorManageChannel,
              creatorUseSoundboard: config.creatorUseSoundboard,
              creatorManagePermissions: config.creatorManagePermissions,
              allowClaim: config.allowClaim,
              configMenuEnabled: config.configMenuEnabled,
              moderatorRoleIds: config.moderatorRoleIds,
              untouchableRoleIds: config.untouchableRoleIds,
              accessRoleIds: config.accessRoleIds,
            }
          : undefined
      }
    />
  );
}
