import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { prisma } from '@discord-bot-dashboard/database';

export const SESSION_COOKIE_NAME = 'session';
export const OAUTH_STATE_COOKIE_NAME = 'oauth_state';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 jours

// Volontairement minimal : la liste des guildes n'est PAS stockée ici (voir
// fetchUserGuilds) — avec beaucoup de serveurs elle dépasse la limite de
// ~4 Ko par cookie, que le navigateur rejette alors silencieusement (la
// session ne "prenait" jamais après le callback OAuth).
export interface SessionData {
  userId: string;
  // "username" est le login Discord (ex: "remiom") — quasiment jamais ce
  // qu'on veut afficher. Voir displayName() pour le vrai pseudo affiché.
  username: string;
  globalName: string | null;
  avatar: string | null;
  accessToken: string;
}

// Le pseudo réellement affiché par Discord (peut contenir des caractères
// spéciaux) — retombe sur le username de connexion si l'utilisateur n'en a pas défini.
export function displayName(session: Pick<SessionData, 'username' | 'globalName'>): string {
  return session.globalName ?? session.username;
}

export interface SessionGuild {
  id: string;
  name: string;
  icon: string | null;
  // Bitfield de permissions Discord de l'utilisateur sur cette guilde, en
  // string (dépasse Number.MAX_SAFE_INTEGER) — voir hasManageGuild().
  permissions: string;
}

// URL de l'avatar Discord d'un utilisateur, ou son avatar par défaut s'il n'en a pas.
export function userAvatarUrl(userId: string, avatarHash: string | null, size = 128): string {
  if (avatarHash) return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=${size}`;
  const index = Number(BigInt(userId) >> 22n) % 6;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

const MANAGE_GUILD = 0x20n;

export function hasManageGuild(permissions: string): boolean {
  try {
    return (BigInt(permissions) & MANAGE_GUILD) === MANAGE_GUILD;
  } catch {
    return false;
  }
}

// Va chercher la liste des serveurs de l'utilisateur en direct auprès de
// Discord plutôt que de la stocker en session — voir le commentaire sur
// SessionData ci-dessus.
//
// Mise en cache courte (par token) : chaque route protégée (channels, roles,
// emojis, welcome, upload...) appelle requireGuildAccess → fetchUserGuilds,
// donc un seul chargement de page déclenche plusieurs appels quasi
// simultanés à cet endpoint Discord, qui est particulièrement rate-limité.
//
// On met en cache la PROMESSE elle-même (pas juste le résultat une fois
// arrivé) : sinon, plusieurs appels qui arrivent avant que le tout premier
// n'ait eu le temps de répondre passent tous à côté du cache (encore vide) et
// déclenchent chacun leur propre requête — exactement le scénario qui
// provoquait des 429 intermittents (salons/rôles qui disparaissent au
// hasard). En partageant la même promesse en vol, un seul appel réseau part
// vraiment, peu importe combien de routes le demandent en même temps.
interface GuildsCacheEntry {
  promise: Promise<SessionGuild[]>;
  expires: number;
}

const guildsCache = new Map<string, GuildsCacheEntry>();
// Le layout du dashboard rappelle fetchUserGuilds() à chaque navigation
// (chaque clic dans le menu) — un TTL plus long réduit d'autant les appels
// à cet endpoint particulièrement rate-limité, sans gêner l'utilisateur
// (la liste de guildes/permissions ne change quasiment jamais en session).
const GUILDS_CACHE_TTL_MS = 60_000;

async function fetchUserGuildsRaw(accessToken: string): Promise<SessionGuild[]> {
  const res = await fetch('https://discord.com/api/users/@me/guilds', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Discord guilds fetch failed: ${res.status}`);
  const guilds = (await res.json()) as { id: string; name: string; icon: string | null; permissions: string }[];
  return guilds.map((g) => ({ id: g.id, name: g.name, icon: g.icon, permissions: g.permissions }));
}

export async function fetchUserGuilds(accessToken: string): Promise<SessionGuild[]> {
  const previous = guildsCache.get(accessToken);
  let entry = previous;

  if (!entry || entry.expires <= Date.now()) {
    const promise = fetchUserGuildsRaw(accessToken);
    // Empêche Node de signaler une "unhandled rejection" si cette promesse
    // partagée n'est jamais directement awaited par personne d'autre que le
    // bloc try/catch ci-dessous (qui, lui, la consomme correctement).
    promise.catch(() => {});
    entry = { promise, expires: Date.now() + GUILDS_CACHE_TTL_MS };
    guildsCache.set(accessToken, entry);
  }

  // Chaque appelant — qu'il vienne de créer la promesse ou de retomber sur
  // une déjà en cache — passe par SON PROPRE try/catch avant de la retourner.
  // Auparavant, retourner directement `cached.promise` sans l'attendre ici
  // laissait son rejet (ex: 429 de Discord) remonter tel quel, non catché,
  // jusqu'à l'appelant final — d'où l'erreur runtime non gérée.
  try {
    return await entry.promise;
  } catch {
    // Rate-limité ou en erreur : on ne garde pas cet échec en cache (pour
    // qu'un appel suivant retente), et on resert le dernier résultat connu
    // s'il y en a un plutôt qu'une liste vide trompeuse.
    if (guildsCache.get(accessToken) === entry) guildsCache.delete(accessToken);
    if (previous && previous !== entry) {
      const stale = await previous.promise.catch(() => null);
      if (stale) return stale;
    }
    return [];
  }
}

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sessionEncryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET manquant dans .env');
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptAccessToken(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptAccessToken(value: string): string {
  const [iv, tag, encrypted] = value.split('.');
  if (!iv || !tag || !encrypted) throw new Error('Session chiffrée invalide');
  const decipher = crypto.createDecipheriv('aes-256-gcm', sessionEncryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}

export async function createSession(data: SessionData): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
  await prisma.$transaction([
    prisma.dashboardSession.deleteMany({ where: { expiresAt: { lte: new Date() } } }),
    prisma.dashboardSession.create({
      data: { ...data, accessToken: encryptAccessToken(data.accessToken), tokenHash: tokenHash(token), expiresAt },
    }),
  ]);
  return token;
}

export async function deleteSession(token?: string): Promise<void> {
  if (!token) return;
  await prisma.dashboardSession.deleteMany({ where: { tokenHash: tokenHash(token) } });
}

export async function getSession(): Promise<SessionData | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await prisma.dashboardSession.findUnique({ where: { tokenHash: tokenHash(token) } });
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.dashboardSession.delete({ where: { tokenHash: session.tokenHash } }).catch(() => undefined);
    return null;
  }
  try {
    return {
      userId: session.userId,
      username: session.username,
      globalName: session.globalName,
      avatar: session.avatar,
      accessToken: decryptAccessToken(session.accessToken),
    };
  } catch {
    await prisma.dashboardSession.delete({ where: { tokenHash: session.tokenHash } }).catch(() => undefined);
    return null;
  }
}
