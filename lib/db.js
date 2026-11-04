import fs from 'node:fs';
import * as schema from './schema.js';
import { isProd } from './util.js';

export class NotConfigured extends Error {
  constructor(what) { super(`${what} is not configured`); this.name = 'NotConfigured'; }
}

// Remote Turso (libsql://, https://) uses the pure-JS web client: nothing native to bundle on Vercel.
// The native client is only loaded for local files (dev, tests), never in production.
const remote = isProd() || /^(libsql|https?|wss?):/.test(process.env.TURSO_DATABASE_URL || '');
const [{ createClient }, { drizzle }] = remote
  ? await Promise.all([import('@libsql/client/web'), import('drizzle-orm/libsql/web')])
  : await Promise.all([import('@libsql/client'), import('drizzle-orm/libsql')]);

export function openDb(url = process.env.TURSO_DATABASE_URL, authToken = process.env.TURSO_AUTH_TOKEN) {
  if (!url) {
    if (isProd()) throw new NotConfigured('TURSO_DATABASE_URL');
    url = 'file:.data/dev.db';
  }
  if (url.startsWith('file:') && !url.includes(':memory:')) fs.mkdirSync('.data', { recursive: true });
  return drizzle(createClient({ url, authToken }), { schema });
}

let shared;
export const getDb = () => (shared ??= openDb());
