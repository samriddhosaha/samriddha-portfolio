// Fresh migrated file DB per test file. Import this BEFORE any lib module that touches the db.
import fs from 'node:fs';
import path from 'node:path';
import { migrate } from 'drizzle-orm/libsql/migrator';

const name = path.basename(process.argv[1] || 'x').replace(/\W/g, '_') + '-' + process.pid;
fs.mkdirSync('.data', { recursive: true });
process.env.TURSO_DATABASE_URL = `file:.data/unit-${name}.db`;
process.env.SESSION_SECRET = 'unit-test-secret-unit-test-secret-1234';
const { getDb } = await import('../../lib/db.js');
await migrate(getDb(), { migrationsFolder: 'drizzle' });
export const db = getDb();
