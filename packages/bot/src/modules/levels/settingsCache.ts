import { prisma } from '@discord-bot-dashboard/database';
import type { XpSettings } from '@discord-bot-dashboard/database';

const TTL_MS = 30_000;
const cache = new Map<string, { value: XpSettings | null; expiresAt: number }>();

// XpSettings est lu à chaque message et toutes les 30s par guilde pour le
// vocal — sans cache, ça fait un aller-retour DB par message envoyé sur tout
// le bot, même quand le module est désactivé. Un TTL de 30s suffit largement
// (les réglages changent rarement, et jamais au rythme des messages).
export async function getXpSettings(guildId: string): Promise<XpSettings | null> {
  const cached = cache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = await prisma.xpSettings.findUnique({ where: { guildId } });
  cache.set(guildId, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}
