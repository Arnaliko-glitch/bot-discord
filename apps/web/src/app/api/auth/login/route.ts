import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { OAUTH_STATE_COOKIE_NAME } from '@/lib/auth';
import { isSecureRequest } from '@/lib/request-origin';

export async function GET(request: Request) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: 'Configuration Discord manquante' }, { status: 500 });
  }

  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify guilds');
  const state = crypto.randomBytes(24).toString('base64url');
  url.searchParams.set('state', state);

  const response = NextResponse.redirect(url);
  response.cookies.set(OAUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: 'lax',
    maxAge: 10 * 60,
    path: '/',
  });
  return response;
}
