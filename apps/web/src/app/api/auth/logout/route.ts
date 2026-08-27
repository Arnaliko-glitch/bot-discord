import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth';
import { appOrigin } from '@/lib/request-origin';

export async function GET(request: Request) {
  const res = NextResponse.redirect(new URL('/', appOrigin(request)));
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
