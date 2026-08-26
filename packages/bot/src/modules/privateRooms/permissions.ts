import type { Guild, PermissionOverwriteOptions, VoiceChannel } from 'discord.js';
import type { PrivateRoomConfig } from '@discord-bot-dashboard/database';

// Permissions Discord données au créateur sur son propre salon (en plus de
// celles qu'il a déjà via ses rôles), configurables depuis le dashboard —
// jamais "Déplacer les membres" : l'expulsion passe par le bouton "Purge"
// du panneau (voir interactions.ts), qui vérifie aussi les rôles intouchables.
function creatorPermissionOptions(config: PrivateRoomConfig): PermissionOverwriteOptions {
  const options: PermissionOverwriteOptions = {};
  if (config.creatorCanInvite) options.CreateInstantInvite = true;
  if (config.creatorPrioritySpeaker) options.PrioritySpeaker = true;
  if (config.creatorSetStatus) options.SetVoiceChannelStatus = true;
  if (config.creatorManageChannel) options.ManageChannels = true;
  if (config.creatorUseSoundboard) options.UseSoundboard = true;
  if (config.creatorManagePermissions) options.ManageRoles = true;
  return options;
}

export interface RoomAccessState {
  ownerId: string;
  mode: string;
  whitelistUserIds: string[];
  blacklistUserIds: string[];
}

// Recalcule les permissions d'accès du salon à partir de son mode actuel —
// modifie seulement les entrées concernées (propriétaire, modérateurs,
// intouchables, rôles d'accès de base, liste blanche/noire) sans toucher au
// reste des permissions héritées de la catégorie ou du salon de création.
// Appelée à la création (isInitialSetup: true) puis à chaque changement de
// mode/liste via le panneau (isInitialSetup: false, valeur par défaut) — la
// distinction ne compte que pour le mode "open" par défaut, voir plus bas.
export async function applyRoomPermissions(
  channel: VoiceChannel,
  guild: Guild,
  room: RoomAccessState,
  config: PrivateRoomConfig,
  isInitialSetup = false
) {
  await channel.permissionOverwrites
    .edit(room.ownerId, { ViewChannel: true, Connect: true, ...creatorPermissionOptions(config) })
    .catch((err) => console.error('Permissions propriétaire salon privé échouées:', err));

  for (const roleId of [...config.moderatorRoleIds, ...config.untouchableRoleIds]) {
    await channel.permissionOverwrites
      .edit(roleId, { ViewChannel: true, Connect: true })
      .catch((err) => console.error('Permissions modérateur/intouchable salon privé échouées:', err));
  }

  const baseRoles = config.accessRoleIds.length > 0 ? config.accessRoleIds : [guild.roles.everyone.id];

  if (room.mode === 'closed') {
    for (const roleId of baseRoles) await editOverwrite(channel, roleId, { ViewChannel: true, Connect: false });
  } else if (room.mode === 'private') {
    for (const roleId of baseRoles) await editOverwrite(channel, roleId, { ViewChannel: false, Connect: false });
  } else if (room.mode === 'whitelist') {
    for (const roleId of baseRoles) await editOverwrite(channel, roleId, { ViewChannel: false, Connect: false });
    for (const userId of room.whitelistUserIds) await editOverwrite(channel, userId, { ViewChannel: true, Connect: true });
  } else if (room.mode === 'blacklist') {
    for (const roleId of baseRoles) await editOverwrite(channel, roleId, { ViewChannel: true, Connect: true });
    for (const userId of room.blacklistUserIds) await editOverwrite(channel, userId, { ViewChannel: true, Connect: false });
  } else if (config.accessRoleIds.length > 0) {
    // "open" avec des rôles d'accès explicitement configurés : ce sont eux
    // qui définissent l'accès par défaut, donc toujours forcés — que ce soit
    // à la création ou en revenant sur "Ouvrir" après un mode restreint.
    for (const roleId of config.accessRoleIds) await editOverwrite(channel, roleId, { ViewChannel: true, Connect: true });
    for (const userId of [...room.whitelistUserIds, ...room.blacklistUserIds]) {
      await channel.permissionOverwrites.delete(userId).catch(() => undefined);
    }
  } else if (isInitialSetup) {
    // "open" par défaut à la création, sans rôle d'accès configuré : on ne
    // touche à rien, les permissions héritées (catégorie ou salon hub, voir
    // permissionSource) décident seules — les forcer écraserait un salon
    // privé hérité du hub/de la catégorie dès la création.
  } else {
    // "open" cliqué depuis le panneau après un mode restreint (Fermer,
    // Privé, listes) : on supprime l'entrée @everyone posée par ce mode
    // pour retrouver l'état d'origine (hérité de la catégorie/du hub).
    await channel.permissionOverwrites.delete(guild.roles.everyone.id).catch(() => undefined);
    for (const userId of [...room.whitelistUserIds, ...room.blacklistUserIds]) {
      await channel.permissionOverwrites.delete(userId).catch(() => undefined);
    }
  }
}

async function editOverwrite(channel: VoiceChannel, id: string, options: { ViewChannel: boolean; Connect: boolean }) {
  await channel.permissionOverwrites
    .edit(id, options)
    .catch((err) => console.error('Mise à jour des permissions du salon privé échouée:', err));
}
