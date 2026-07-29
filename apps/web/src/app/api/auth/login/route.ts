import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { COOKIE_NAME, createSession, exchangeCode, fetchDiscordUser, getDiscordAuthUrl } from '@/lib/auth';

export async function GET() {
  const state = randomBytes(16).toString('hex');
  cookies().set('oauth_state', state, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 600, path: '/' });
  return NextResponse.redirect(getDiscordAuthUrl(state));
}
