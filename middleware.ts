import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, cookieOptions, passwordMatches, sessionToken } from './lib/auth';

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  if (pathname.startsWith('/login') || pathname.startsWith('/api/login') || pathname.startsWith('/_next') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }
  const expected = await sessionToken();

  // Web Tab URL may carry ?key=<password>: set the session and strip the key from the address
  const key = searchParams.get('key');
  if (key !== null) {
    const url = req.nextUrl.clone();
    url.searchParams.delete('key');
    if (passwordMatches(key)) {
      const res = NextResponse.redirect(url);
      res.cookies.set(COOKIE, expected, cookieOptions);
      return res;
    }
  }

  if (process.env.APP_PASSWORD && req.cookies.get(COOKIE)?.value === expected) return NextResponse.next();

  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const login = req.nextUrl.clone();
  login.pathname = '/login';
  login.search = '';
  return NextResponse.redirect(login);
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };
