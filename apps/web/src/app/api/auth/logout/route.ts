import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { deleteSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { appOrigin } from '@/lib/request-origin';

export async function GET(request: Request) {
  await deleteSession(cookies().get(SESSION_COOKIE_NAME)?.value);
  const res = NextResponse.redirect(new URL('/', appOrigin(request)));
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
