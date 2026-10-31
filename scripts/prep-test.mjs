// Used by Playwright's webServer: migrate + reseed the test DB, clear the dev outbox, then the dev server starts.
import fs from 'node:fs';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { getDb } from '../lib/db.js';
import { seedAll } from '../lib/seed.js';

if (!/test|dev/.test(process.env.TURSO_DATABASE_URL || '')) throw new Error('prep-test refuses to touch a non-test database');
await migrate(getDb(), { migrationsFolder: 'drizzle' });
await seedAll(getDb());
fs.rmSync('.data/outbox.jsonl', { force: true });
