import { ActivityType, type Client } from 'discord.js';

const PHRASES = [
  '📡 Système Actif',
  '🛡️ Sécurise Onory',
  '👋 Accueille Les Membres',
  '💫 Toujours Là',
  '🎫 Gère Les Tickets',
  '👀 Observe La Communauté',
];

const MIN_DELAY_MS = 40_000;
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
      // ActivityType.Custom affiche une petite bulle flottante à côté de
      // l'avatar (icône + texte) — Watching affiche une vraie carte "Regarde
      // ..." dans le popup de profil, comme les autres bots (façon Novaria).
      activities: [{ name: phrase, type: ActivityType.Watching }],
      status: 'online',
    });
    setTimeout(tick, randomDelay());
  }
  tick();
}
