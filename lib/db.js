import fs from 'node:fs';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

export function openDb(url = process.env.TURSO_DATABASE_URL || 'file:.data/dev.db', authToken = process.env.TURSO_AUTH_TOKEN) {
  if (url.startsWith('file:') && !url.includes(':memory:')) fs.mkdirSync('.data', { recursive: true });
  return drizzle(createClient({ url, authToken }), { schema });
}

let shared;
export const getDb = () => (shared ??= openDb());
