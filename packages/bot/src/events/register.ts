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

  client.once('ready', async () => {
    await registerSlashCommands(client);
  });
}
