// Fixed-window counter in the database, so it holds across serverless instances.
import { sql } from 'drizzle-orm';
import { getDb } from './db.js';

export async function limit(key, max, windowMs, db = getDb()) {
  const t = Date.now();
  const row = await db.get(sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, ${t}, 1)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN window_start < ${t - windowMs} THEN 1 ELSE count + 1 END,
      window_start = CASE WHEN window_start < ${t - windowMs} THEN ${t} ELSE window_start END
    RETURNING count, window_start AS windowStart`);
  const count = Number(row.count);
  return { ok: count <= max, retryAfter: Math.max(1, Math.ceil((Number(row.windowStart) + windowMs - t) / 1000)) };
}
export const tooMany = (r) => new Response(JSON.stringify({ error: 'rate_limited', message: 'Too many requests. Try again later.' }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': String(r.retryAfter) } });
export const resetLimit = (key, db = getDb()) => db.run(sql`DELETE FROM rate_limits WHERE key = ${key}`);
