import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client, GatewayIntentBits, Partials, Events, MessageFlags } from 'discord.js';

// Un seul .env à la racine du monorepo, partagé avec apps/web — résolu par
// rapport à ce fichier (pas process.cwd(), qui vaut packages/bot en dev).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../../.env') });
import { prisma } from '@discord-bot-dashboard/database';
import type { BotModuleHandler } from './client.js';
import { welcomeModule } from './modules/welcome/index.js';
import { memberStatsModule } from './modules/memberStats.js';
import { serverTagModule } from './modules/serverTag.js';
import { messageXpModule as baseMessageXpModule } from './modules/levels/messageXp.js';
import { voiceXpModule } from './modules/levels/voiceXp.js';
import { rewardExpiryModule } from './modules/levels/rewardExpiry.js';
import { xpResetModule } from './modules/levels/xpReset.js';
import { commands } from './commands/index.js';
import { handleTicketInteraction } from './modules/tickets/interactions.js';
import { startPresenceRotation } from './modules/presence.js';
import { reactionRolesModule } from './modules/reactionRoles/index.js';

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) throw new Error('DISCORD_BOT_TOKEN manquant dans .env');

// Le dashboard (process web séparé) lit cette ligne pour savoir si le bot
// est réellement en ligne — un `/users/@me` réussi prouverait juste que le
// token est valide, pas que le process tourne. Fréquence alignée sur le
// seuil "hors ligne" côté dashboard (voir apps/web/src/lib/discord-bot.ts).
const HEARTBEAT_INTERVAL_MS = 30_000;
function sendHeartbeat() {
  prisma.botHeartbeat
    .upsert({ where: { id: 'singleton' }, create: { id: 'singleton', updatedAt: new Date() }, update: { updatedAt: new Date() } })
    .catch((err) => console.error('Heartbeat échoué:', err));
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
  // Nécessaires pour recevoir les événements de réaction (ajout/retrait de
  // rôle) même sur un message posté avant le démarrage du bot, donc jamais
  // mis en cache — sinon Discord n'envoie tout simplement pas l'événement.
  partials: [Partials.Message, Partials.Reaction, Partials.User],
  rest: {
    // Discord ne limite le renommage d'un salon qu'à 2 fois toutes les 10
    // minutes — par défaut discord.js mettrait la requête en attente et
    // réessaierait automatiquement (jusqu'à 10 minutes de blocage silencieux).
    // On préfère que ces requêtes échouent tout de suite pour pouvoir
    // prévenir l'utilisateur (voir modules/tickets/ticketActions.ts).
    rejectOnRateLimit: (data) => data.method === 'PATCH' && data.route.startsWith('/channels/'),
  },
});

// Gain d'xp (message + vocal), expiration des rôles temporaires et reset à
// la sortie/au ban ne sont pas des modules indépendants du point de vue de
// l'utilisateur — ils forment ensemble le système de niveaux, regroupés ici
// sous un seul nom pour que le log de démarrage reflète la réalité.
const messageXpModule: BotModuleHandler = {
  name: 'messageXp',
  register(client) {
    baseMessageXpModule.register(client);
    voiceXpModule.register(client);
    rewardExpiryModule.register(client);
    xpResetModule.register(client);
  },
};

// Ajouté au fur et à mesure que chaque module est reconstruit.
const modules: BotModuleHandler[] = [
  welcomeModule,
  messageXpModule,
  memberStatsModule,
  serverTagModule,
  reactionRolesModule,
];

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = commands.find((c) => c.data.name === interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Commande /${interaction.commandName} échouée:`, err);
      const content = 'Une erreur est survenue lors de l\'exécution de cette commande.';
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content }).catch(() => undefined);
      else await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => undefined);
    }
    return;
  }

  if (interaction.isButton() || interaction.isModalSubmit()) {
    try {
      await handleTicketInteraction(interaction);
    } catch (err) {
      console.error('Interaction ticket échouée:', err);
      const content = 'Une erreur est survenue.';
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content }).catch(() => undefined);
      else await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => undefined);
    }
  }
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot connecté en tant que ${readyClient.user.tag}`);

  // Garde la table Guild à jour avec les serveurs où le bot est présent —
  // le dashboard s'en sert pour savoir quelles guildes proposer à l'utilisateur.
  await Promise.all(
    readyClient.guilds.cache.map((guild) =>
      prisma.guild
        .upsert({
          where: { id: guild.id },
          update: { name: guild.name, icon: guild.icon },
          create: { id: guild.id, name: guild.name, icon: guild.icon },
        })
        .catch((err) => console.error(`Échec de la synchro de la guilde ${guild.id}:`, err))
    )
  );

  for (const mod of modules) {
    mod.register(readyClient);
    console.log(`Module "${mod.name}" enregistré`);
  }
  // Géré directement dans le handler InteractionCreate ci-dessus plutôt que
  // via le pattern BotModuleHandler (pas d'écoute d'événement à enregistrer),
  // mais reste listé ici pour refléter fidèlement les modules actifs.
  console.log('Module "tickets" enregistré');

  startPresenceRotation(readyClient);

  sendHeartbeat();
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
});

client.on(Events.GuildCreate, (guild) => {
  prisma.guild
    .upsert({
      where: { id: guild.id },
      update: { name: guild.name, icon: guild.icon },
      create: { id: guild.id, name: guild.name, icon: guild.icon },
    })
    .catch((err) => console.error(`Échec de la synchro de la guilde ${guild.id}:`, err));
});

client.login(token);
