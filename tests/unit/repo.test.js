import test from 'node:test';
import assert from 'node:assert/strict';
import './_db.js';
import * as repo from '../../lib/repo.js';
import { limit } from '../../lib/ratelimit.js';
import { postInput } from '../../lib/validators.js';

const mk = (o) => postInput.parse({ kind: 'post', bodyMd: 'hello', ...o });
const H = 3600e3;

test('visibility: drafts and scheduled items are hidden; published shown', async () => {
  const now = Date.now();
  const a = (await repo.savePost(mk({ bodyMd: 'live one' }), { now: now - 10 })).post;
  await repo.savePost(mk({ bodyMd: 'a draft', status: 'draft' }), { now });
  await repo.savePost(mk({ bodyMd: 'scheduled', publishAt: now + H }), { now });
  const { items } = await repo.listFeed({ now });
  assert.deepEqual(items.map((i) => i.id), [a.id]);
  assert.equal((await repo.listFeed({ now: now + 2 * H })).items.length, 2);
  assert.equal(await repo.getPost((await repo.adminList()).find((p) => p.status === 'draft').id), null);
});

test('cursor pagination is stable and complete', async () => {
  const base = Date.now() - 100 * H;
  for (let i = 0; i < 25; i++) await repo.savePost(mk({ bodyMd: `p${i} #pg`, tags: ['pg'], publishAt: base + i * 1000 }), { now: base });
  const seen = []; let cursor;
  do { const r = await repo.listFeed({ tag: 'pg', limit: 10, cursor, now: Date.now() }); seen.push(...r.items.map((i) => i.id)); cursor = r.next ?? undefined; } while (cursor);
  assert.equal(seen.length, 25); assert.equal(new Set(seen).size, 25);
});

test('search treats % and _ literally; tag filter', async () => {
  await repo.savePost(mk({ bodyMd: 'discount 50% off', tags: ['deals'] }));
  assert.equal((await repo.listFeed({ q: '50%' })).items.length, 1);
  assert.equal((await repo.listFeed({ q: '%' })).items.length, 1);
  assert.equal((await repo.listFeed({ tag: 'deals' })).items.length, 1);
  assert.equal((await repo.listFeed({ q: "x'; DROP TABLE posts;--" })).items.length, 0);
});

test('stories expire after 24h unless pinned to a highlight', async () => {
  const now = Date.now();
  const s = (await repo.savePost(mk({ kind: 'story', bodyMd: 'today', bg: 'ink' }), { now })).post;
  const h = (await repo.savePost(mk({ kind: 'story', bodyMd: 'forever', newHighlight: 'Projects' }), { now })).post;
  assert.equal(s.expiresAt, now + 24 * H); assert.equal(h.expiresAt, null);
  assert.deepEqual((await repo.activeStories(now + H)).map((x) => x.id), [s.id]);
  assert.deepEqual((await repo.activeStories(now + 25 * H)).map((x) => x.id), []);
  const hl = await repo.listHighlights(now + 400 * H);
  assert.equal(hl[0].name, 'Projects'); assert.equal(hl[0].stories[0].id, h.id);
});

test('threads: replies hidden from feed, visible in thread; bad roots rejected', async () => {
  const root = (await repo.savePost(mk({ bodyMd: 'thread root' }))).post;
  const reply = (await repo.savePost(mk({ bodyMd: 'reply', threadId: root.id }))).post;
  const feed = (await repo.listFeed({ limit: 20 })).items.map((i) => i.id);
  assert.ok(feed.includes(root.id) && !feed.includes(reply.id));
  assert.deepEqual((await repo.getThread(root.id)).map((p) => p.id), [root.id, reply.id]);
  assert.equal((await repo.threadSizes([root.id]))[root.id], 2);
  assert.equal((await repo.savePost(mk({ bodyMd: 'x', threadId: reply.id }))).error, 'bad_thread');
  assert.equal((await repo.savePost(mk({ bodyMd: 'x', threadId: 'nonexist12' }))).error, 'bad_thread');
});

test('articles get unique slugs, toc and reading time', async () => {
  const a = (await repo.savePost(postInput.parse({ kind: 'article', title: 'Same Title', bodyMd: '## A\n\nsome words here for the body' }))).post;
  const b = (await repo.savePost(postInput.parse({ kind: 'article', title: 'Same Title', bodyMd: '## B\n\nsome words here for the body' }))).post;
  assert.equal(a.slug, 'same-title'); assert.equal(b.slug, 'same-title-2'); assert.equal(a.toc[0].id, 'h-a'); assert.equal(a.readingMinutes, 1);
  assert.equal((await repo.getBySlug('same-title')).id, a.id);
});

test('reactions: one per visitor per emoji, toggle off, separate visitors counted', async () => {
  const p = (await repo.savePost(mk({ bodyMd: 'react to me' }))).post;
  let s = await repo.toggleReaction(p.id, 'v1', '🔥'); assert.deepEqual(s, { counts: { '🔥': 1 }, mine: ['🔥'] });
  await repo.toggleReaction(p.id, 'v2', '🔥'); await repo.toggleReaction(p.id, 'v1', '👏');
  s = await repo.toggleReaction(p.id, 'v1', '🔥'); assert.deepEqual(s.counts, { '🔥': 1, '👏': 1 }); assert.deepEqual(s.mine, ['👏']);
  assert.equal(await repo.toggleReaction('missing123', 'v1', '🔥'), null);
});

test('comments stay hidden until approved; stories cannot be commented', async () => {
  const p = (await repo.savePost(mk({ bodyMd: 'comment on me' }))).post;
  const id = await repo.addComment({ postId: p.id, name: 'Ann', body: 'nice post' });
  assert.equal((await repo.approvedComments(p.id)).length, 0);
  assert.equal((await repo.moderationQueue('pending')).some((c) => c.id === id), true);
  await repo.moderateComment(id, 'approved');
  assert.equal((await repo.approvedComments(p.id)).length, 1);
  await repo.moderateComment(id, 'rejected');
  assert.equal((await repo.approvedComments(p.id)).length, 0);
  const s = (await repo.savePost(mk({ kind: 'story', bodyMd: 's' }))).post;
  assert.equal(await repo.addComment({ postId: s.id, name: 'x', body: 'no' }), null);
});

test('subscribers: double opt-in, idempotent, unsubscribe, re-subscribe', async () => {
  const r = await repo.subscribe('a@example.com'); assert.equal(r.status, 'pending');
  assert.equal((await repo.activeSubscribers()).length, 0);
  assert.equal(await repo.confirmSubscriber(r.token), true);
  assert.deepEqual((await repo.subscribe('a@example.com')), { status: 'active' });
  assert.equal((await repo.activeSubscribers()).length, 1);
  await repo.unsubscribe(r.token); assert.equal((await repo.activeSubscribers()).length, 0);
  assert.equal((await repo.subscribe('a@example.com')).status, 'pending');
  assert.equal(await repo.confirmSubscriber('0'.repeat(32)), false);
});

test('rate limit: allows max, blocks the next, resets after the window', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await limit('t:a', 3, 60_000)).ok, true);
  const blocked = await limit('t:a', 3, 60_000); assert.equal(blocked.ok, false); assert.ok(blocked.retryAfter > 0);
  assert.equal((await limit('t:b', 3, 60_000)).ok, true);
  assert.equal((await limit('t:c', 1, 1)).ok, true); await new Promise((r) => setTimeout(r, 5)); assert.equal((await limit('t:c', 1, 1)).ok, true);
});

test('delete detaches thread replies and removes dependents', async () => {
  const root = (await repo.savePost(mk({ bodyMd: 'root to delete' }))).post;
  const reply = (await repo.savePost(mk({ bodyMd: 'reply stays', threadId: root.id }))).post;
  await repo.toggleReaction(root.id, 'v9', '🔥');
  assert.equal(await repo.deletePost(root.id), true);
  assert.equal((await repo.getPost(reply.id)).threadId, null);
  assert.equal(await repo.getPost(root.id), null);
});
