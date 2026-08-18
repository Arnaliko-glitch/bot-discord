import type { BotClient, BotModuleHandler } from '../../client.js';
import { grantXp } from './xp.js';
import { getXpSettings } from './settingsCache.js';

const TICK_MS = 60_000;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (Math.max(min, max) - Math.min(min, max) + 1)) + Math.min(min, max);
}

// Dernier gain d'xp vocal par "guildId:userId" — comme pour le texte, un
// simple compteur en mémoire suffit (se réinitialise au redémarrage).
const lastVoiceXpAt = new Map<string, number>();

const CLEANUP_INTERVAL_MS = 10 * 60_000;
const MAX_ENTRY_AGE_MS = 60 * 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of lastVoiceXpAt) {
    if (now - timestamp > MAX_ENTRY_AGE_MS) lastVoiceXpAt.delete(key);
  }
}, CLEANUP_INTERVAL_MS);

// `guild.voiceStates.cache` ne contient que les membres réellement connectés
// à un salon vocal — bien moins coûteux que de parcourir tous les salons de
// la guilde pour n'en garder que les vocaux à chaque tick.
async function tick(client: BotClient) {
  for (const guild of client.guilds.cache.values()) {
    const settings = await getXpSettings(guild.id);
    if (!settings || !settings.enabled || !settings.voiceXpEnabled) continue;

    for (const voiceState of guild.voiceStates.cache.values()) {
      const member = voiceState.member;
      if (!member || member.user.bot) continue;
      if (!voiceState.channelId || voiceState.channelId === guild.afkChannelId) continue;

      const key = `${guild.id}:${member.id}`;
      const now = Date.now();
      const last = lastVoiceXpAt.get(key) ?? 0;
      if (now - last < settings.voiceXpIntervalSeconds * 1000) continue;
      lastVoiceXpAt.set(key, now);

      const amount = randomInt(settings.voiceXpMin, settings.voiceXpMax);
      await grantXp(member, settings, amount, null).catch((err) => console.error('Gain xp (vocal) échoué:', err));
    }
  }
}

export const voiceXpModule: BotModuleHandler = {
  name: 'voiceXp',
  register(client: BotClient) {
    // Garde de réentrance : si un tick (génération de cartes de level-up
    // incluse) dépasse l'intervalle, on saute le suivant plutôt que de les
    // laisser s'empiler.
    let running = false;
    setInterval(() => {
      if (running) return;
      running = true;
      tick(client)
        .catch((err) => console.error('voiceXp module failed:', err))
        .finally(() => {
          running = false;
        });
    }, TICK_MS);
  },
};
