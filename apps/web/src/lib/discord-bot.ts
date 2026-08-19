import { prisma } from '@discord-bot-dashboard/database';

export interface BotIdentity {
  name: string;
  avatarUrl: string | null;
}

// Le process du bot écrit cette ligne toutes les 30s tant qu'il est connecté
// (voir packages/bot/src/index.ts) — au-delà de 3 intervalles sans mise à
// jour, on considère qu'il est hors ligne (arrêté, en train de redémarrer,
// ou n'a jamais tourné depuis que la table existe).
const HEARTBEAT_STALE_AFTER_MS = 90_000;

export async function getBotOnlineStatus(): Promise<boolean> {
  const heartbeat = await prisma.botHeartbeat.findUnique({ where: { id: 'singleton' } }).catch(() => null);
  if (!heartbeat) return false;
  return Date.now() - heartbeat.updatedAt.getTime() < HEARTBEAT_STALE_AFTER_MS;
}

// Utilisé dans les aperçus du dashboard (ex: WelcomeConfigPage) pour
// afficher le vrai nom/avatar du bot plutôt qu'un texte générique.
export async function getBotIdentity(): Promise<BotIdentity> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return { name: 'Votre Bot', avatarUrl: null };

  try {
    const res = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${token}` },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { name: 'Votre Bot', avatarUrl: null };
    const data = (await res.json()) as { id: string; username: string; avatar: string | null };
    const avatarUrl = data.avatar
      ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png?size=64`
      : null;
    return { name: data.username, avatarUrl };
  } catch {
    return { name: 'Votre Bot', avatarUrl: null };
  }
}
