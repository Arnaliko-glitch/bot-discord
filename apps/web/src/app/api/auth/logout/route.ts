import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth';

export async function GET(request: Request) {
  const res = NextResponse.redirect(new URL('/', request.url));
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
