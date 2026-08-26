import { ChannelType, Events, type Guild, type GuildMember, type VoiceChannel, type VoiceState } from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { PrivateRoomConfig } from '@discord-bot-dashboard/database';
import type { BotClient, BotModuleHandler } from '../../client.js';
import { applyRoomPermissions } from './permissions.js';
import { postControlPanel } from './panel.js';

// Empêche deux voiceStateUpdate quasi simultanés (double-clic, lag réseau)
// de créer deux salons pour le même membre pendant que le premier appel est
// encore en cours de création.
const creating = new Set<string>();

function roomName(template: string, username: string): string {
  return template.replaceAll('{user}', username).slice(0, 100);
}

async function createRoomFor(guild: Guild, member: GuildMember, config: PrivateRoomConfig, hub: VoiceChannel) {
  const lockKey = `${guild.id}:${member.id}`;
  if (creating.has(lockKey)) return;
  creating.add(lockKey);

  try {
    // Un membre déjà propriétaire d'un salon actif est redéplacé dedans au
    // lieu d'en recréer un — évite un flood de salons/panneaux si son client
    // rejoint le hub plusieurs fois de suite (reco réseau, redémarrage du
    // bot en dev pendant qu'une vieille connexion vocale traîne, etc.).
    const existingRoom = await prisma.privateRoom.findFirst({ where: { guildId: guild.id, ownerId: member.id } });
    if (existingRoom) {
      const existingChannel =
        guild.channels.cache.get(existingRoom.channelId) ?? (await guild.channels.fetch(existingRoom.channelId).catch(() => null));
      if (existingChannel?.type === ChannelType.GuildVoice) {
        await member.voice.setChannel(existingChannel).catch((err) => console.error('Déplacement vers le salon privé échoué:', err));
        return;
      }
      // Le salon n'existe plus (supprimé manuellement) : ligne orpheline,
      // on la nettoie avant de continuer vers une vraie création.
      await prisma.privateRoom.delete({ where: { id: existingRoom.id } }).catch(() => undefined);
    }

    // `parent` seul suffit à faire hériter les permissions de la catégorie
    // (comportement natif de l'API Discord dès qu'aucun `permissionOverwrites`
    // n'est passé à la création) — la base pour "category" comme pour "hub",
    // qui hérite forcément aussi de sa propre catégorie s'il n'a pas de
    // permissions à lui. Pour "hub", on superpose ensuite les éventuelles
    // permissions propres du salon de création par-dessus cette base : les
    // copier seules (sans la catégorie) donnerait 0 permission si le hub n'a
    // lui-même aucune permission explicite, ce qui est le cas le plus courant.
    const parent = config.categoryId ?? hub.parentId ?? undefined;
    const channel = await guild.channels.create({
      name: roomName(config.nameTemplate, member.displayName),
      type: ChannelType.GuildVoice,
      parent,
      userLimit: config.userLimit,
    });

    if (config.permissionSource === 'hub' && hub.permissionOverwrites.cache.size > 0) {
      const merged = new Map(channel.permissionOverwrites.cache.map((o) => [o.id, o]));
      for (const overwrite of hub.permissionOverwrites.cache.values()) merged.set(overwrite.id, overwrite);
      await channel.permissionOverwrites.set([...merged.values()]).catch((err) => console.error('Copie des permissions du hub échouée:', err));
    }

    const room = await prisma.privateRoom.create({
      data: { id: crypto.randomUUID(), guildId: guild.id, channelId: channel.id, ownerId: member.id },
    });

    // Déplacer le membre tout de suite, dès que le salon existe — le détail
    // des permissions (modérateurs, intouchables, mode d'accès) et le
    // panneau ne changent rien à sa capacité à rejoindre (le bot le déplace
    // directement via l'API, sans passer par ses propres permissions), les
    // faire attendre ici ne ferait qu'allonger le délai avant le déplacement.
    await member.voice.setChannel(channel).catch((err) => console.error('Déplacement vers le salon privé échoué:', err));

    await applyRoomPermissions(channel, guild, room, config, true);
    if (config.configMenuEnabled) await postControlPanel(channel, room);
  } catch (err) {
    console.error('Création du salon privé échouée:', err);
  } finally {
    creating.delete(lockKey);
  }
}

async function deleteIfEmpty(channel: VoiceChannel) {
  if (channel.members.size > 0) return;

  const room = await prisma.privateRoom.findUnique({ where: { channelId: channel.id } });
  if (!room) return;

  await prisma.privateRoom.delete({ where: { channelId: channel.id } }).catch(() => undefined);
  await channel.delete().catch((err) => console.error('Suppression du salon privé échouée:', err));
}

async function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
  const guild = newState.guild;
  const config = await prisma.privateRoomConfig.findUnique({ where: { guildId: guild.id } });
  if (!config?.enabled) return;

  if (newState.channelId && newState.channelId === config.hubChannelId && newState.member) {
    const hub = newState.channel;
    if (hub?.type === ChannelType.GuildVoice) await createRoomFor(guild, newState.member, config, hub);
  }

  if (oldState.channel?.type === ChannelType.GuildVoice && oldState.channelId !== newState.channelId) {
    await deleteIfEmpty(oldState.channel);
  }
}

// Nettoie en base (et sur Discord) les salons temporaires devenus orphelins
// pendant que le bot était hors ligne — salon supprimé manuellement entre
// temps, ou vidé sans que le bot ait pu traiter l'événement. Appelée à
// chaque arrivée sur une guilde (GuildCreate couvre aussi bien un nouvel
// ajout que le rechargement de la liste des guildes au démarrage).
async function reconcileGuild(guild: Guild) {
  const rooms = await prisma.privateRoom.findMany({ where: { guildId: guild.id } });
  if (rooms.length === 0) return;

  for (const room of rooms) {
    const channel = guild.channels.cache.get(room.channelId) ?? (await guild.channels.fetch(room.channelId).catch(() => null));
    if (channel?.type !== ChannelType.GuildVoice) {
      await prisma.privateRoom.delete({ where: { id: room.id } }).catch(() => undefined);
      continue;
    }
    if (channel.members.size === 0) await deleteIfEmpty(channel);
  }
}

export const privateRoomsModule: BotModuleHandler = {
  name: 'privateRooms',
  register(client: BotClient) {
    client.on(Events.VoiceStateUpdate, (oldState, newState) => {
      handleVoiceStateUpdate(oldState, newState).catch((err) => console.error('privateRooms module failed:', err));
    });

    client.on(Events.GuildCreate, (guild) => {
      reconcileGuild(guild).catch((err) => console.error('privateRooms module (reconcile) failed:', err));
    });
  },
};
