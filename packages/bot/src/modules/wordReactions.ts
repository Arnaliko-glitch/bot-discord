import { Events, type Message } from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { WordReactionConfig, WordReactionTrigger } from '@discord-bot-dashboard/database';
import type { BotClient, BotModuleHandler } from '../client.js';
import { extractCustomEmojiId } from '../utils/emoji.js';

// "allow" = seuls les rôles/salons listés déclenchent une réaction ; "deny"
// = tous sauf ceux listés. Une liste vide ne restreint jamais, quel que
// soit le mode (même convention que le reste du projet, ex: xpRoleMode).
function passesFilter(mode: string, ids: string[], candidateIds: string[]): boolean {
  if (ids.length === 0) return true;
  const matches = candidateIds.some((id) => ids.includes(id));
  return mode === 'deny' ? !matches : matches;
}

// Le déclencheur le plus long qui correspond gagne (évite qu'un déclencheur
// court comme "sal" masque "salut" configuré à côté), insensible à la casse.
function findMatchingTrigger(content: string, triggers: WordReactionTrigger[]): WordReactionTrigger | null {
  const normalized = content.trim().toLowerCase();
  let best: WordReactionTrigger | null = null;
  let bestLength = 0;
  for (const trigger of triggers) {
    const phrase = trigger.phrase.trim().toLowerCase();
    if (!phrase || !normalized.startsWith(phrase)) continue;
    if (phrase.length > bestLength) {
      best = trigger;
      bestLength = phrase.length;
    }
  }
  return best;
}

interface CachedWordReactions {
  config: WordReactionConfig | null;
  triggers: WordReactionTrigger[];
  version: number;
  expiresAt: number;
}

const cache = new Map<string, CachedWordReactions>();
const loadsInProgress = new Map<string, Promise<CachedWordReactions>>();
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const INVALIDATION_POLL_MS = 10_000;

async function loadWordReactions(guildId: string): Promise<CachedWordReactions> {
  const [config, triggers] = await Promise.all([
    prisma.wordReactionConfig.findUnique({ where: { guildId } }),
    prisma.wordReactionTrigger.findMany({ where: { guildId } }),
  ]);
  const entry = {
    config,
    triggers,
    version: config?.updatedAt.getTime() ?? 0,
    expiresAt: Date.now() + CACHE_MAX_AGE_MS,
  };
  cache.set(guildId, entry);
  return entry;
}

async function getWordReactions(guildId: string): Promise<CachedWordReactions> {
  const cached = cache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) return cached;
  const existingLoad = loadsInProgress.get(guildId);
  if (existingLoad) return existingLoad;
  const load = loadWordReactions(guildId).finally(() => loadsInProgress.delete(guildId));
  loadsInProgress.set(guildId, load);
  return load;
}

async function invalidateChangedWordReactions() {
  if (cache.size === 0) return;
  const versions = await prisma.wordReactionConfig.findMany({
    where: { guildId: { in: [...cache.keys()] } },
    select: { guildId: true, updatedAt: true },
  });
  const byGuild = new Map(versions.map((row) => [row.guildId, row.updatedAt.getTime()]));
  for (const [guildId, entry] of cache) {
    if ((byGuild.get(guildId) ?? 0) !== entry.version) cache.delete(guildId);
  }
}

async function handleMessage(message: Message) {
  if (message.author.bot || !message.guild || !message.content) return;

  const { config, triggers } = await getWordReactions(message.guild.id);
  if (!config?.enabled) return;

  if (!passesFilter(config.channelMode, config.channelIds, [message.channelId])) return;

  // Ne va chercher les rôles du membre (et le fetch réseau qui va avec si le
  // cache n'est pas déjà chaud) que si une restriction de rôle est vraiment
  // configurée — le cas par défaut (aucune restriction) ne doit rien coûter
  // de plus qu'une comparaison de tableau vide sur ce chemin exécuté à
  // chaque message.
  if (config.roleIds.length > 0) {
    const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
    const memberRoleIds = member ? [...member.roles.cache.keys()] : [];
    if (!passesFilter(config.roleMode, config.roleIds, memberRoleIds)) return;
  }

  const trigger = findMatchingTrigger(message.content, triggers);
  if (!trigger) return;

  // Réactions ajoutées une par une (pas en parallèle) : Discord les affiche
  // dans l'ordre où l'API les reçoit, et les envoyer d'un coup solliciterait
  // inutilement plus fort le rate limit de réactions en rafale.
  for (const emoji of trigger.emojis) {
    const reactable = extractCustomEmojiId(emoji) ?? emoji;
    await message.react(reactable).catch((err) => console.error('Réaction de mot échouée:', err));
  }
}

// Ajoute une ou plusieurs réactions emoji automatiquement quand un message
// commence par une phrase configurée, insensible à la casse — restrictions
// de rôles/salons globales au module, façon DraftBot.
export const wordReactionsModule: BotModuleHandler = {
  name: 'wordReactions',
  register(client: BotClient) {
    client.on(Events.MessageCreate, (message) => {
      handleMessage(message).catch((err) => console.error('wordReactions module failed:', err));
    });
    setInterval(() => {
      invalidateChangedWordReactions().catch((err) => console.error('Invalidation cache réactions échouée:', err));
    }, INVALIDATION_POLL_MS);
  },
};
