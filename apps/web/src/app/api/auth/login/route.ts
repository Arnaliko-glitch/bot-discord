import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { COOKIE_NAME, createSession, exchangeCode, fetchDiscordUser, getDiscordAuthUrl } from '@/lib/auth';

export async function GET() {
  const state = randomBytes(16).toString('hex');
  const isHttps = (process.env.NEXT_PUBLIC_APP_URL || '').startsWith('https://');
  cookies().set('oauth_state', state, { httpOnly: true, secure: isHttps, sameSite: 'lax', maxAge: 600, path: '/' });
  return NextResponse.redirect(getDiscordAuthUrl(state));
}
