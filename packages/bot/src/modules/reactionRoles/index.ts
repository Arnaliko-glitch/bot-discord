import { Events, type MessageReaction, type PartialMessageReaction, type User, type PartialUser } from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { BotClient, BotModuleHandler } from '../../client.js';

interface Mapping {
  emoji: string;
  roleId: string;
}

// Les emojis personnalisés sont stockés au format Discord affiché
// (<a:nom:id> ou <:nom:id>, voir EmojiPickerPanel côté dashboard) — on en
// extrait l'id pour comparer à l'événement de réaction, qui ne porte que
// l'id et le nom (le nom peut changer si le serveur renomme l'emoji, l'id
// jamais).
function matchesEmoji(stored: string, emoji: MessageReaction['emoji']): boolean {
  const custom = /^<a?:\w+:(\d+)>$/.exec(stored);
  return custom ? emoji.id === custom[1] : emoji.name === stored;
}

async function handleReaction(
  reaction: MessageReaction | PartialMessageReaction,
  reactor: User | PartialUser,
  grant: boolean
) {
  try {
    if (reaction.partial) await reaction.fetch();
  } catch (err) {
    console.error('Fetch réaction (rôles-réactions) échoué:', err);
    return;
  }

  // Le bot ajoute lui-même les réactions de départ sur le panneau au moment
  // de la publication (voir la route API "publish") — sans ce filtre, cet
  // ajout initial déclencherait aussi cet événement.
  const user = reactor.partial ? await reactor.fetch().catch(() => null) : reactor;
  if (!user || user.bot) return;

  const guild = reaction.message.guild;
  if (!guild) return;

  const panel = await prisma.reactionRolePanel.findUnique({ where: { messageId: reaction.message.id } });
  if (!panel) return;

  const mappings = Array.isArray(panel.mappings) ? (panel.mappings as unknown as Mapping[]) : [];
  const mapping = mappings.find((m) => matchesEmoji(m.emoji, reaction.emoji));
  if (!mapping) return;

  const member = guild.members.cache.get(user.id) ?? (await guild.members.fetch(user.id).catch(() => null));
  if (!member) return;

  if (grant) await member.roles.add(mapping.roleId).catch((err) => console.error('Ajout rôle-réaction échoué:', err));
  else await member.roles.remove(mapping.roleId).catch((err) => console.error('Retrait rôle-réaction échoué:', err));
}

// Ajoute/retire un rôle quand un membre réagit/retire sa réaction sur un
// message publié par le module "Rôles-réactions" du dashboard — nécessite
// l'intent GuildMessageReactions et les partials Message/Reaction/User pour
// recevoir l'événement même sur un message déjà présent avant le démarrage
// du bot (non mis en cache).
export const reactionRolesModule: BotModuleHandler = {
  name: 'reactionRoles',
  register(client: BotClient) {
    client.on(Events.MessageReactionAdd, (reaction, user) => {
      handleReaction(reaction, user, true).catch((err) => console.error('reactionRoles module failed:', err));
    });
    client.on(Events.MessageReactionRemove, (reaction, user) => {
      handleReaction(reaction, user, false).catch((err) => console.error('reactionRoles module failed:', err));
    });
  },
};
