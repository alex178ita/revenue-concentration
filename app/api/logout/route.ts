import { NextResponse } from 'next/server';
import { COOKIE, cookieOptions } from '@/lib/auth';

export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL('/login', req.url), 303);
  res.cookies.set(COOKIE, '', { ...cookieOptions, maxAge: 0 });
  return res;
}
