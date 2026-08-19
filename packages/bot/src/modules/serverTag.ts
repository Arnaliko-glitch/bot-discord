import { Events, type PartialUser, type User } from 'discord.js';
import { prisma } from '@discord-bot-dashboard/database';
import type { BotClient, BotModuleHandler } from '../client.js';

// Un membre affiche le "tag de serveur" (identité) de CE serveur si son
// primaryGuild pointe dessus ET que l'affichage est activé — les deux
// conditions peuvent changer indépendamment (ex: garder identityGuildId mais
// désactiver l'affichage).
function displaysTagFor(user: User | PartialUser, guildId: string): boolean {
  return user.primaryGuild?.identityGuildId === guildId && user.primaryGuild.identityEnabled === true;
}

async function syncTagRole(client: BotClient, oldUser: User | PartialUser, newUser: User) {
  // Seules les guildes concernées par le changement (avant et/ou après)
  // peuvent avoir un rôle à ajouter/retirer — inutile de vérifier les autres.
  const relevantGuildIds = new Set(
    [oldUser.primaryGuild?.identityGuildId, newUser.primaryGuild?.identityGuildId].filter(
      (id): id is string => Boolean(id)
    )
  );
  if (relevantGuildIds.size === 0) return;

  for (const guildId of relevantGuildIds) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;

    const config = await prisma.serverTagConfig.findUnique({ where: { guildId } });
    if (!config?.enabled || !config.roleId) continue;

    const member = guild.members.cache.get(newUser.id) ?? (await guild.members.fetch(newUser.id).catch(() => null));
    if (!member) continue;

    const shouldHaveRole = displaysTagFor(newUser, guildId);
    const hasRole = member.roles.cache.has(config.roleId);
    if (shouldHaveRole && !hasRole) {
      await member.roles.add(config.roleId).catch((err) => console.error('Ajout rôle tag de serveur échoué:', err));
    } else if (!shouldHaveRole && hasRole) {
      await member.roles.remove(config.roleId).catch((err) => console.error('Retrait rôle tag de serveur échoué:', err));
    }
  }
}

// Donne/retire un rôle selon que le membre affiche ou non le tag de CE
// serveur sur son profil Discord — discord.js relaie ce changement via
// l'événement UserUpdate (déclenché par les mises à jour de membre déjà
// reçues avec l'intent GuildMembers, pas besoin d'intent supplémentaire).
export const serverTagModule: BotModuleHandler = {
  name: 'serverTag',
  register(client: BotClient) {
    client.on(Events.UserUpdate, (oldUser, newUser) => {
      syncTagRole(client, oldUser, newUser).catch((err) => console.error('serverTag module failed:', err));
    });
  },
};
