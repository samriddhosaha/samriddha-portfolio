// Single-owner auth: env password (scrypt hash) -> HMAC-signed, HttpOnly session cookie. No sign-up exists.
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookie, hmac, isProd, json, parseCookies, sameOrigin } from './util.js';

const SESSION_MS = 7 * 24 * 3600 * 1000;
export const SESSION_COOKIE = () => (isProd() ? '__Host-sid' : 'sid');

export function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(pw, salt, 64).toString('hex')}`;
}
const eq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export function verifyPassword(pw) {
  const stored = process.env.ADMIN_PASSWORD_HASH;
  if (stored) {
    const [scheme, salt, hash] = stored.split(':');
    return scheme === 'scrypt' && !!salt && !!hash && eq(scryptSync(pw, salt, 64).toString('hex'), hash);
  }
  // Plain password is accepted only outside production (local dev and tests).
  if (!isProd() && process.env.ADMIN_PASSWORD) return eq(hmac('pw:' + pw), hmac('pw:' + process.env.ADMIN_PASSWORD));
  return false;
}

export function sessionCookie() {
  const exp = String(Date.now() + SESSION_MS);
  return cookie(SESSION_COOKIE(), `${exp}.${hmac('session:' + exp)}`, { maxAge: SESSION_MS / 1000 });
}
export const clearSessionCookie = () => cookie(SESSION_COOKIE(), '', { maxAge: 0 });

export function isAdmin(request) {
  const v = parseCookies(request)[SESSION_COOKIE()];
  if (!v) return false;
  const [exp, sig] = v.split('.');
  return !!exp && !!sig && /^\d+$/.test(exp) && Number(exp) > Date.now() && eq(sig, hmac('session:' + exp));
}

// Guard for every /api/admin/* handler. Returns a Response to short-circuit, or null when allowed.
export function requireAdmin(request) {
  if (!isAdmin(request)) return json({ error: 'unauthorized' }, 401);
  if (!['GET', 'HEAD'].includes(request.method) && (!sameOrigin(request) || request.headers.get('x-requested-with') !== 'fetch')) return json({ error: 'forbidden' }, 403);
  return null;
}
