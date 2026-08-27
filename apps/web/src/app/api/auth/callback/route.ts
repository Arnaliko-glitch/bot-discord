import { NextResponse } from 'next/server';
import { createSessionCookieValue, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from '@/lib/auth';
import { appOrigin, isSecureRequest } from '@/lib/request-origin';

interface DiscordTokenResponse {
  access_token: string;
}

interface DiscordUser {
  id: string;
  username: string;
  // Pseudo/nom affiché choisi par l'utilisateur (peut contenir des
  // caractères spéciaux) — c'est ce que Discord affiche réellement, pas le
  // "username" de connexion. Absent (null) si l'utilisateur n'en a pas défini.
  global_name: string | null;
  avatar: string | null;
}

export async function GET(request: Request) {
  const origin = appOrigin(request);
  const code = new URL(request.url).searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/?error=oauth', origin));

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: 'Configuration Discord manquante' }, { status: 500 });
  }

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) return NextResponse.redirect(new URL('/?error=oauth', origin));
  const token = (await tokenRes.json()) as DiscordTokenResponse;

  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!userRes.ok) return NextResponse.redirect(new URL('/?error=oauth', origin));
  const user = (await userRes.json()) as DiscordUser;

  // La liste des guildes n'est volontairement pas mise en session ici — voir
  // fetchUserGuilds() dans lib/auth.ts, elle est récupérée en direct au
  // moment où on en a besoin plutôt que stockée dans le cookie.
  const cookieValue = createSessionCookieValue({
    userId: user.id,
    username: user.username,
    globalName: user.global_name,
    avatar: user.avatar,
    accessToken: token.access_token,
  });

  const res = NextResponse.redirect(new URL('/dashboard', origin));
  res.cookies.set(SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    // Basé sur le protocole réel de la requête plutôt que NODE_ENV : évite
    // de casser le cookie en dev si NODE_ENV vaut "production" dans .env.
    secure: isSecureRequest(request),
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  return res;
}
