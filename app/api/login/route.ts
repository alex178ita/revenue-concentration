import { NextResponse } from 'next/server';
import { COOKIE, cookieOptions, passwordMatches, sessionToken } from '@/lib/auth';

export async function POST(req: Request) {
  const form = await req.formData();
  const pw = String(form.get('password') ?? '');
  const base = new URL(req.url);
  if (!passwordMatches(pw)) return NextResponse.redirect(new URL('/login?error=1', base), 303);
  const res = NextResponse.redirect(new URL('/', base), 303);
  res.cookies.set(COOKIE, await sessionToken(), cookieOptions);
  return res;
}
