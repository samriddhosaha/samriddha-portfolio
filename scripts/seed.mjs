// npm run db:seed          adds sample content (wipes existing feed data first, so only use on a fresh DB)
import { getDb } from '../lib/db.js';
import { seedAll } from '../lib/seed.js';

if (process.env.NODE_ENV === 'production' && process.argv[2] !== '--yes') {
  console.error('Refusing to wipe a production database. Re-run with: npm run db:seed -- --yes');
  process.exit(1);
}
console.log(`seeded ${await seedAll(getDb())} items`);
