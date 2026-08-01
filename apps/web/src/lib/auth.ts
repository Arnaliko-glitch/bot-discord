import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { SessionUser } from '@discord-bot-dashboard/shared';

const COOKIE_NAME = 'dbd_session';
const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? 'dev-secret-change-in-production-min-32-chars!!'
);

export async function createSession(user: SessionUser): Promise<string> {
  return new SignJWT({ user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return (payload as { user: SessionUser }).user;
  } catch {
    return null;
  }
}

export { COOKIE_NAME };

export function getDiscordAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    redirect_uri: process.env.DISCORD_REDIRECT_URI!,
    response_type: 'code',
    scope: 'identify guilds',
    state,
  });
  return `https://discord.com/api/oauth2/authorize?${params}`;
}

export async function exchangeCode(code: string) {
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    client_secret: process.env.DISCORD_CLIENT_SECRET!,
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.DISCORD_REDIRECT_URI!,
  });
  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error('Token exchange failed');
  return res.json() as Promise<{ access_token: string; token_type: string }>;
}

export async function fetchDiscordUser(accessToken: string) {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch user');
  return res.json() as Promise<{
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
  }>;
}

type DiscordGuildDTO = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
};

// Cache mémoire pour éviter de rate-limiter l'endpoint Discord /users/@me/guilds,
// qui est appelé plusieurs fois par page (server component + fetch client).
const guildsCache = new Map<string, { data: DiscordGuildDTO[]; expires: number }>();
const GUILDS_CACHE_TTL_MS = 60_000;

export async function fetchUserGuilds(accessToken: string): Promise<DiscordGuildDTO[]> {
  const cached = guildsCache.get(accessToken);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const res = await fetch('https://discord.com/api/users/@me/guilds', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    // Rate-limit ou erreur Discord ponctuelle : on retombe sur le cache périmé
    // plutôt que de faire échouer toute la requête si on en a un.
    if (cached) return cached.data;
    throw new Error(`Failed to fetch guilds: ${res.status}`);
  }

  const data = (await res.json()) as DiscordGuildDTO[];
  guildsCache.set(accessToken, { data, expires: Date.now() + GUILDS_CACHE_TTL_MS });
  return data;
}

export function hasAdminPermission(permissions: string): boolean {
  const perm = BigInt(permissions);
  const ADMIN = BigInt(0x8);
  return (perm & ADMIN) === ADMIN;
}