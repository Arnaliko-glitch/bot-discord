import { Events, type Message } from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { WordReactionTrigger } from '@discord-bot-dashboard/database';
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

async function handleMessage(message: Message) {
  if (message.author.bot || !message.guild || !message.content) return;

  const config = await prisma.wordReactionConfig.findUnique({ where: { guildId: message.guild.id } });
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

  // Deux requêtes séparées faute de relation Prisma entre les deux modèles
  // (chacun ne référence que Guild) — acceptable au volume d'un petit
  // serveur ; à revisiter (relation + include, ou cache par guilde) si le
  // nombre de messages devient significatif.
  const triggers = await prisma.wordReactionTrigger.findMany({ where: { guildId: message.guild.id } });
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
  },
};
