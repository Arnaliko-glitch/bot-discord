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
const body = commands.map((c) => c.data.toJSON());

console.log(`Déploiement de ${body.length} commande(s) slash...`);
await rest.put(Routes.applicationCommands(clientId), { body });
console.log('Commandes déployées.');
