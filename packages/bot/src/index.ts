import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { BotClient } from './client.js';
import { loadModules } from './modules/loader.js';
import { registerEvents } from './events/register.js';

loadEnv();
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.error('❌ DISCORD_BOT_TOKEN is required');
    process.exit(1);
  }

  const client = new BotClient();
  await loadModules(client);
  registerEvents(client);

  client.once('ready', () => {
    console.log(`✅ Bot connecté en tant que ${client.user?.tag}`);
    console.log(`📊 ${client.guilds.cache.size} serveur(s)`);
  });

  await client.login(token);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
