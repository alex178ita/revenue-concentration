// Edge-compatible helpers (used by middleware and route handlers)
export const COOKIE = 'rc_session';

export async function sessionToken(): Promise<string> {
  const pw = (process.env.APP_PASSWORD || '').trim();
  const secret = process.env.AUTH_SECRET || 'change-me';
  const data = new TextEncoder().encode(`${pw}::${secret}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function passwordMatches(input: string | null | undefined): boolean {
  const pw = (process.env.APP_PASSWORD || '').trim();
  input = (input || '').trim();
  if (!pw || !input || input.length !== pw.length) return false;
  let diff = 0;
  for (let i = 0; i < pw.length; i++) diff |= pw.charCodeAt(i) ^ input.charCodeAt(i);
  return diff === 0;
}

// SameSite=None + Secure so the cookie survives inside the Zoho CRM Web Tab iframe
export const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none' as const,
  path: '/',
  maxAge: 60 * 60 * 12,
};
