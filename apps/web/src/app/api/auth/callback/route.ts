import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_NAME, createSession, exchangeCode, fetchDiscordUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const storedState = cookies().get('oauth_state')?.value;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://37.187.98.86';

  if (!code || !state || state !== storedState) {
    console.error('Auth check failed:', { code: !!code, state, storedState });
    return NextResponse.redirect(new URL('/?error=auth', appUrl));
  }

  try {
    const tokens = await exchangeCode(code);
    const user = await fetchDiscordUser(tokens.access_token);

    const sessionToken = await createSession({
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      accessToken: tokens.access_token,
    });

    const isHttps = appUrl.startsWith('https://');
    cookies().set(COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    cookies().delete('oauth_state');

    return NextResponse.redirect(new URL('/dashboard', appUrl));

  } catch {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(new URL('/?error=auth', appUrl));
  }
}
