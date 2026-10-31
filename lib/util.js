import { randomBytes, createHmac } from 'node:crypto';

export const now = () => Date.now();
export const isProd = () => process.env.NODE_ENV === 'production';
export const siteUrl = () => (process.env.SITE_URL || 'https://samriddha-portfolio.vercel.app').replace(/\/$/, '');

const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
export const newId = (n = 10) => Array.from(randomBytes(n), (b) => ALPHA[b % ALPHA.length]).join('');

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const parseJson = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };

export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
export const htmlRes = (body, status = 200, headers = {}) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
export const redirect = (to, headers = {}) => new Response(null, { status: 303, headers: { location: to, ...headers } });

export function secret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (isProd()) throw new Error('SESSION_SECRET (>= 32 chars) is required in production');
  return 'dev-only-secret-dev-only-secret-0000';
}
export const hmac = (data) => createHmac('sha256', secret()).update(data).digest('hex');

export function clientIp(request) {
  return (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'local').split(',')[0].trim();
}
export const ipHash = (request) => hmac('ip:' + clientIp(request)).slice(0, 20);

export function parseCookies(request) {
  const out = {};
  for (const part of (request.headers.get('cookie') || '').split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1));
  }
  return out;
}
export function cookie(name, value, { maxAge, httpOnly = true, sameSite = 'Strict' } = {}) {
  return `${name}=${encodeURIComponent(value)}; Path=/; ${httpOnly ? 'HttpOnly; ' : ''}SameSite=${sameSite}; ${isProd() ? 'Secure; ' : ''}Max-Age=${maxAge}`;
}

// Same-origin check for state-changing requests (CSRF layer on top of SameSite cookies).
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).host === (request.headers.get('x-forwarded-host') || request.headers.get('host')); } catch { return false; }
}

// Reads JSON or form-encoded bodies (the public forms work without JavaScript).
export async function readBody(request) {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await request.json().catch(() => ({}));
  if (ct.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(await request.text()));
  return {};
}
