import { ActivityType, type Client } from 'discord.js';

const PHRASES = [
  '🤖 Gère Onory',
  '📡 Système Actif',
  '🛡️ Sécurise Onory',
  '👋 Accueille Les Membres',
  '💫 Toujours Là',
  '🎫 Gère Les Tickets',
  '🔔 Service Disponible',
  '👀 Observe La Communauté',
];

const MIN_DELAY_MS = 30_000;
const MAX_DELAY_MS = 60_000;

function randomDelay(): number {
  return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
}

function randomPhrase(): string {
  return PHRASES[Math.floor(Math.random() * PHRASES.length)];
}

// Fait défiler la présence du bot parmi une liste de phrases, à intervalle
// aléatoire entre 40s et 1 minute (durée re-tirée à chaque cycle plutôt
// qu'un setInterval fixe).
export function startPresenceRotation(client: Client<true>) {
  function tick() {
    const phrase = randomPhrase();
    client.user.setPresence({
      activities: [{ name: phrase, type: ActivityType.Custom, state: phrase }],
      status: 'online',
    });
    setTimeout(tick, randomDelay());
  }
  tick();
}
