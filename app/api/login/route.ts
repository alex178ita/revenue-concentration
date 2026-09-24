import { NextResponse } from 'next/server';
import { COOKIE, cookieOptions, passwordMatches, sessionToken } from '@/lib/auth';

export async function POST(req: Request) {
  const form = await req.formData();
  const pw = String(form.get('password') ?? '');
  const base = new URL(req.url);
  if (!passwordMatches(pw)) return NextResponse.redirect(new URL('/login?error=1', base), 303);
  const token = await sessionToken();
  // The token travels in the URL as well as in the cookie: inside the Zoho CRM Web Tab the
  // browser may refuse a third-party cookie, and the redirect would bounce back to the login form.
  const res = NextResponse.redirect(new URL(`/?t=${token}`, base), 303);
  res.cookies.set(COOKIE, token, cookieOptions);
  return res;
}
