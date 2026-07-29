import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_NAME } from '@/lib/auth';

export async function POST() {
  cookies().delete(COOKIE_NAME);
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  cookies().delete(COOKIE_NAME);
  return NextResponse.redirect(new URL('/', request.url));
}
