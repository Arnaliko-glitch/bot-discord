import type { BotClient } from '../client.js';
import { ensureGuild } from '../utils/guild.js';
import { registerSlashCommands } from './commands.js';

export function registerEvents(client: BotClient) {
  client.on('guildCreate', async (guild) => {
    await ensureGuild(guild.id, guild.name, guild.ownerId, guild.iconURL());
    console.log(`➕ Rejoint: ${guild.name}`);
  });

  client.on('guildDelete', (guild) => {
    console.log(`➖ Quitté: ${guild.name}`);
  });

  client.on('error', (error) => {
    console.error('Erreur client Discord:', error);
  });

  client.once('ready', async () => {
    for (const guild of client.guilds.cache.values()) {
      await ensureGuild(guild.id, guild.name, guild.ownerId, guild.iconURL()).catch((error) =>
        console.error(`Synchronisation impossible pour ${guild.name}:`, error)
      );
    }
    await registerSlashCommands(client);
  });
}
