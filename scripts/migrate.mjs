// npm run db:migrate  (uses TURSO_DATABASE_URL / TURSO_AUTH_TOKEN, default file:.data/dev.db)
import { migrate } from 'drizzle-orm/libsql/migrator';
import { getDb } from '../lib/db.js';

await migrate(getDb(), { migrationsFolder: 'drizzle' });
console.log('migrations applied');
