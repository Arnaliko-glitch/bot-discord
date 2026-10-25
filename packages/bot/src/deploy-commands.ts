import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { REST, Routes } from 'discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../../.env') });

const { commands } = await import('./commands/index.js');

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
if (!token) throw new Error('DISCORD_BOT_TOKEN manquant dans .env');
if (!clientId) throw new Error('DISCORD_CLIENT_ID manquant dans .env');

const rest = new REST().setToken(token);
const commandIndex = process.argv.indexOf('--command');
const commandName = commandIndex >= 0 ? process.argv[commandIndex + 1] : undefined;
const guildId = process.env.DISCORD_GUILD_ID;
const route = guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId);

if (commandIndex >= 0) {
  const command = commands.find((entry) => entry.data.name === commandName);
  if (!command) throw new Error(`Commande inconnue : ${commandName ?? '(nom manquant)'}`);
  console.log(`Déploiement de /${commandName}${guildId ? ' sur le serveur de développement' : ''}...`);
  // POST crée ou met à jour cette commande sans retirer les autres.
  await rest.post(route, { body: command.data.toJSON() });
} else {
  const body = commands.map((c) => c.data.toJSON());
  console.log(`Déploiement de ${body.length} commande(s) slash...`);
  await rest.put(route, { body });
}
console.log('Commandes déployées.');
