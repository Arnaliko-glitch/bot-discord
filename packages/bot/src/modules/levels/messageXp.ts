import { ChannelType, Events, type Message } from 'discord.js';
import type { BotClient, BotModuleHandler } from '../../client.js';
import { grantXp } from './xp.js';
import { getXpSettings } from './settingsCache.js';

// Cooldown en mémoire (clé "guildId:userId" → timestamp du dernier gain) —
// évite un aller-retour base à chaque message ; se réinitialise au redémarrage
// du bot, ce qui n'accorde qu'un message "gratuit" de plus dans le pire cas.
const lastXpAt = new Map<string, number>();

// Sans purge, cette map grossirait indéfiniment (une entrée par membre ayant
// jamais parlé depuis le démarrage) sur un process qui tourne des semaines.
const CLEANUP_INTERVAL_MS = 10 * 60_000;
const MAX_ENTRY_AGE_MS = 60 * 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of lastXpAt) {
    if (now - timestamp > MAX_ENTRY_AGE_MS) lastXpAt.delete(key);
  }
}, CLEANUP_INTERVAL_MS);

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (Math.max(min, max) - Math.min(min, max) + 1)) + Math.min(min, max);
}

function isChannelEligible(channelId: string, mode: string, list: string[]): boolean {
  const inList = list.includes(channelId);
  return mode === 'with' ? inList : !inList;
}

function isRoleEligible(member: Message['member'], mode: string, list: string[]): boolean {
  if (!member || list.length === 0) return mode !== 'with';
  const hasOne = list.some((roleId) => member.roles.cache.has(roleId));
  return mode === 'with' ? hasOne : !hasOne;
}

async function handleMessage(message: Message) {
  if (!message.guild || !message.member || message.author.bot) return;

  const settings = await getXpSettings(message.guild.id);
  if (!settings || !settings.enabled) return;

  const channel = message.channel;
  const isThread = channel.isThread();
  if (isThread) {
    const isForumPost = channel.parent?.type === ChannelType.GuildForum;
    if (isForumPost && !settings.xpInForumPosts) return;
    if (!isForumPost && !settings.xpInThreads) return;
  }
  if (channel.isVoiceBased() && settings.voiceTextXpMode === 'disabled') return;
  if (channel.isVoiceBased() && settings.voiceTextXpMode === 'connected') {
    const inVoice = message.member.voice.channelId === channel.id;
    if (!inVoice) return;
  }

  const eligibilityChannelId = isThread ? (channel.parentId ?? channel.id) : channel.id;
  if (!isChannelEligible(eligibilityChannelId, settings.xpChannelMode, settings.ignoredChannelIds)) return;
  if (!isRoleEligible(message.member, settings.xpRoleMode, settings.ignoredRoleIds)) return;

  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  const last = lastXpAt.get(key) ?? 0;
  if (now - last < settings.cooldownSeconds * 1000) return;
  lastXpAt.set(key, now);

  let amount = randomInt(settings.xpMin, settings.xpMax);
  if (settings.longMessageDoubleXp && message.content.length > 250) amount *= 2;
  if (settings.boosterChannelIds.includes(eligibilityChannelId)) amount *= 2;
  if (settings.boosterRoleIds.some((roleId) => message.member!.roles.cache.has(roleId))) amount *= 2;

  await grantXp(message.member, settings, amount, channel.id).catch((err) =>
    console.error('Gain xp (message) échoué:', err)
  );
}

export const messageXpModule: BotModuleHandler = {
  name: 'messageXp',
  register(client: BotClient) {
    client.on(Events.MessageCreate, (message) => {
      handleMessage(message).catch((err) => console.error('messageXp module failed:', err));
    });
  },
};
