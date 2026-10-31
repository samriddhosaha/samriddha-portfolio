// Data layer. Every public read goes through `visible()`: published, publish time reached, story not expired.
import { and, asc, desc, eq, inArray, isNull, like, lt, lte, or, gt, sql, count } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { getDb } from './db.js';
import * as t from './schema.js';
import { renderArticle, renderLite, excerptOf } from './markdown.js';
import { newId, parseJson } from './util.js';

const { posts, highlights, reactions, comments, subscribers, issues } = t;

export const visible = (now) => and(eq(posts.status, 'published'), lte(posts.publishAt, now), or(isNull(posts.expiresAt), gt(posts.expiresAt, now)));

export const hydrate = (r) => (r ? ({ ...r, media: parseJson(r.media, []), tags: parseJson(r.tags, []), toc: parseJson(r.toc, []), linkPreview: parseJson(r.linkPreview, null) }) : null);
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'issue';

const KINDS_BY_TAB = { all: ['post', 'article', 'update'], posts: ['post'], newsletter: ['article'], journey: ['update'] };
const likeEsc = (s) => `%${s.replace(/[\\%_]/g, (m) => '\\' + m)}%`;

export async function listFeed({ tab = 'all', tag, q, cursor, limit = 10, now = Date.now(), skipPinned = false, db = getDb() } = {}) {
  const conds = [visible(now), inArray(posts.kind, KINDS_BY_TAB[tab] || KINDS_BY_TAB.all), isNull(posts.threadId)];
  if (tag) conds.push(like(posts.tags, `%"${tag}"%`));
  if (q) {
    const p = likeEsc(q);
    conds.push(or(sql`${posts.title} LIKE ${p} ESCAPE '\\'`, sql`${posts.bodyMd} LIKE ${p} ESCAPE '\\'`, sql`${posts.tags} LIKE ${p} ESCAPE '\\'`));
  }
  if (skipPinned) conds.push(eq(posts.pinned, false));
  if (cursor) {
    const [at, id] = cursor.split('_');
    conds.push(or(lt(posts.publishAt, Number(at)), and(eq(posts.publishAt, Number(at)), lt(posts.id, id))));
  }
  const rows = await db.select().from(posts).where(and(...conds)).orderBy(desc(posts.publishAt), desc(posts.id)).limit(limit + 1);
  const page = rows.slice(0, limit).map(hydrate);
  const last = page[page.length - 1];
  return { items: page, next: rows.length > limit ? `${last.publishAt}_${last.id}` : null };
}

export const listPinned = (now = Date.now(), db = getDb()) =>
  db.select().from(posts).where(and(visible(now), eq(posts.pinned, true), isNull(posts.threadId), inArray(posts.kind, KINDS_BY_TAB.all))).orderBy(desc(posts.publishAt)).then((r) => r.map(hydrate));

export async function getPost(id, { now = Date.now(), any = false, db = getDb() } = {}) {
  const [r] = await db.select().from(posts).where(any ? eq(posts.id, id) : and(eq(posts.id, id), visible(now))).limit(1);
  return hydrate(r);
}
export async function getBySlug(slug, { now = Date.now(), db = getDb() } = {}) {
  const [r] = await db.select().from(posts).where(and(eq(posts.slug, slug), eq(posts.kind, 'article'), visible(now))).limit(1);
  return hydrate(r);
}
export async function getThread(rootId, now = Date.now(), db = getDb()) {
  const rows = await db.select().from(posts).where(and(visible(now), or(eq(posts.id, rootId), eq(posts.threadId, rootId)))).orderBy(asc(posts.publishAt));
  return rows.map(hydrate);
}
export async function threadSizes(ids, now = Date.now(), db = getDb()) {
  if (!ids.length) return {};
  const rows = await db.select({ id: posts.threadId, n: count() }).from(posts).where(and(visible(now), inArray(posts.threadId, ids))).groupBy(posts.threadId);
  return Object.fromEntries(rows.map((r) => [r.id, r.n + 1]));
}

export const activeStories = (now = Date.now(), db = getDb()) =>
  db.select().from(posts).where(and(visible(now), eq(posts.kind, 'story'), isNull(posts.highlightId))).orderBy(asc(posts.publishAt)).then((r) => r.map(hydrate));

export async function listHighlights(now = Date.now(), db = getDb()) {
  const hs = await db.select().from(highlights).orderBy(asc(highlights.sort), asc(highlights.createdAt));
  const out = [];
  for (const h of hs) {
    const stories = (await db.select().from(posts).where(and(visible(now), eq(posts.kind, 'story'), eq(posts.highlightId, h.id))).orderBy(asc(posts.publishAt))).map(hydrate);
    if (stories.length) out.push({ ...h, stories });
  }
  return out;
}

export async function allTags(now = Date.now(), db = getDb()) {
  const rows = await db.select({ tags: posts.tags }).from(posts).where(and(visible(now), inArray(posts.kind, KINDS_BY_TAB.all)));
  const n = {};
  for (const r of rows) for (const g of parseJson(r.tags, [])) n[g] = (n[g] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, c]) => ({ name, count: c }));
}

// ---------- reactions ----------
export async function reactionState(ids, visitor, db = getDb()) {
  const out = Object.fromEntries(ids.map((i) => [i, { counts: {}, mine: [] }]));
  if (!ids.length) return out;
  const rows = await db.select({ postId: reactions.postId, emoji: reactions.emoji, n: count(), mine: sql`SUM(${reactions.visitor} = ${visitor})` }).from(reactions).where(inArray(reactions.postId, ids)).groupBy(reactions.postId, reactions.emoji);
  for (const r of rows) { out[r.postId].counts[r.emoji] = r.n; if (Number(r.mine)) out[r.postId].mine.push(r.emoji); }
  return out;
}
export async function toggleReaction(postId, visitor, emoji, now = Date.now(), db = getDb()) {
  if (!(await getPost(postId, { now, db }))) return null;
  const del = await db.delete(reactions).where(and(eq(reactions.postId, postId), eq(reactions.visitor, visitor), eq(reactions.emoji, emoji)));
  if (!del.rowsAffected) await db.insert(reactions).values({ postId, visitor, emoji, createdAt: now }).onConflictDoNothing();
  return (await reactionState([postId], visitor, db))[postId];
}

// ---------- comments (hidden until approved) ----------
export async function addComment({ postId, name, body }, now = Date.now(), db = getDb()) {
  const p = await getPost(postId, { now, db });
  if (!p || p.kind === 'story') return null;
  const id = newId();
  await db.insert(comments).values({ id, postId, name, body, status: 'pending', createdAt: now });
  return id;
}
export const approvedComments = (postId, db = getDb()) => db.select().from(comments).where(and(eq(comments.postId, postId), eq(comments.status, 'approved'))).orderBy(asc(comments.createdAt));
export const moderationQueue = (status = 'pending', db = getDb()) =>
  db.select({ id: comments.id, postId: comments.postId, name: comments.name, body: comments.body, status: comments.status, createdAt: comments.createdAt, postTitle: posts.title, postExcerpt: posts.excerpt })
    .from(comments).leftJoin(posts, eq(posts.id, comments.postId)).where(eq(comments.status, status)).orderBy(desc(comments.createdAt)).limit(200);
export const moderateComment = async (id, status, db = getDb()) => (await db.update(comments).set({ status }).where(eq(comments.id, id))).rowsAffected > 0;
export const approvedCounts = async (ids, db = getDb()) => {
  if (!ids.length) return {};
  const rows = await db.select({ id: comments.postId, n: count() }).from(comments).where(and(inArray(comments.postId, ids), eq(comments.status, 'approved'))).groupBy(comments.postId);
  return Object.fromEntries(rows.map((r) => [r.id, r.n]));
};

// ---------- subscribers (double opt-in) ----------
export async function subscribe(email, now = Date.now(), db = getDb()) {
  const [ex] = await db.select().from(subscribers).where(eq(subscribers.email, email)).limit(1);
  if (ex?.status === 'active') return { status: 'active' };
  if (ex) { await db.update(subscribers).set({ status: 'pending' }).where(eq(subscribers.id, ex.id)); return { status: 'pending', token: ex.token }; }
  const token = randomBytes(16).toString('hex');
  await db.insert(subscribers).values({ id: newId(), email, status: 'pending', token, createdAt: now });
  return { status: 'pending', token };
}
export const confirmSubscriber = async (token, now = Date.now(), db = getDb()) =>
  (await db.update(subscribers).set({ status: 'active', confirmedAt: now }).where(eq(subscribers.token, token))).rowsAffected > 0;
export const unsubscribe = async (token, db = getDb()) => (await db.update(subscribers).set({ status: 'unsubscribed' }).where(eq(subscribers.token, token))).rowsAffected > 0;
export const listSubscribers = (db = getDb()) => db.select().from(subscribers).orderBy(desc(subscribers.createdAt));
export const activeSubscribers = (db = getDb()) => db.select().from(subscribers).where(eq(subscribers.status, 'active'));
export const recordIssue = (postId, kind, recipients, now = Date.now(), db = getDb()) => db.insert(issues).values({ id: newId(), postId, kind, recipients, sentAt: now });
const lastIssue = async (postId, kind, db) => (await db.select().from(issues).where(and(eq(issues.postId, postId), eq(issues.kind, kind))).orderBy(desc(issues.sentAt)).limit(1))[0] || null;
export const lastSend = (postId, db = getDb()) => lastIssue(postId, 'send', db);
export const lastTest = (postId, db = getDb()) => lastIssue(postId, 'test', db);

// ---------- writes ----------
export async function saveHighlight(name, db = getDb()) {
  const [ex] = await db.select().from(highlights).where(eq(highlights.name, name)).limit(1);
  if (ex) return ex.id;
  const id = newId();
  await db.insert(highlights).values({ id, name, sort: 0, createdAt: Date.now() });
  return id;
}

async function uniqueSlug(base, selfId, db) {
  let slug = base, n = 2;
  for (;;) {
    const [hit] = await db.select({ id: posts.id }).from(posts).where(eq(posts.slug, slug)).limit(1);
    if (!hit || hit.id === selfId) return slug;
    slug = `${base}-${n++}`;
  }
}

// input is already zod-validated. Returns { post } or { error }.
export async function savePost(input, { id, linkPreview = null, now = Date.now(), db = getDb() } = {}) {
  const existing = id ? await getPost(id, { any: true, db }) : null;
  if (id && !existing) return { error: 'not_found' };
  if (input.threadId) {
    const root = await getPost(input.threadId, { any: true, db });
    if (!root || root.threadId || root.kind !== 'post' || input.kind !== 'post' || root.id === id) return { error: 'bad_thread' };
  }
  const publishAt = input.publishAt ?? existing?.publishAt ?? now;
  let bodyHtml, toc = [], readingMinutes = null;
  if (input.kind === 'article') { const r = renderArticle(input.bodyMd); bodyHtml = r.html; toc = r.toc; readingMinutes = r.minutes; } else bodyHtml = renderLite(input.bodyMd);
  let highlightId = input.highlightId ?? null;
  if (input.kind === 'story' && input.newHighlight) highlightId = await saveHighlight(input.newHighlight, db);
  if (input.kind !== 'story') highlightId = null;
  const expiresAt = input.kind === 'story' && !highlightId ? publishAt + (input.expiresInHours ?? 24) * 3600e3 : null;
  const slug = input.kind === 'article' ? await uniqueSlug(input.slug || existing?.slug || slugify(input.title), id, db) : null;
  const row = {
    kind: input.kind, status: input.status, title: input.title || null, slug, bodyMd: input.bodyMd, bodyHtml,
    excerpt: excerptOf(bodyHtml) || input.title || '', media: JSON.stringify(input.media), tags: JSON.stringify(input.tags),
    updateType: input.kind === 'update' ? input.updateType : null, threadId: input.threadId ?? null, pinned: input.kind === 'story' ? false : input.pinned,
    publishAt, expiresAt, highlightId, bg: input.kind === 'story' ? input.bg || 'ink' : null, readingMinutes, toc: JSON.stringify(toc),
    linkPreview: linkPreview ? JSON.stringify(linkPreview) : null, updatedAt: now,
  };
  if (existing) { await db.update(posts).set(row).where(eq(posts.id, id)); return { post: await getPost(id, { any: true, db }) }; }
  const newPostId = newId();
  await db.insert(posts).values({ id: newPostId, createdAt: now, ...row });
  return { post: await getPost(newPostId, { any: true, db }) };
}

export async function deletePost(id, db = getDb()) {
  await db.update(posts).set({ threadId: null }).where(eq(posts.threadId, id));
  await db.delete(comments).where(eq(comments.postId, id));
  await db.delete(reactions).where(eq(reactions.postId, id));
  return (await db.delete(posts).where(eq(posts.id, id))).rowsAffected > 0;
}
export const setPinned = async (id, pinned, db = getDb()) => (await db.update(posts).set({ pinned }).where(and(eq(posts.id, id), inArray(posts.kind, ['post', 'article', 'update'])))).rowsAffected > 0;

export const adminList = (db = getDb()) => db.select().from(posts).orderBy(desc(posts.createdAt)).limit(300).then((r) => r.map(hydrate));
export const rootPosts = (db = getDb()) => db.select({ id: posts.id, excerpt: posts.excerpt }).from(posts).where(and(eq(posts.kind, 'post'), isNull(posts.threadId))).orderBy(desc(posts.createdAt)).limit(30);
export const listHighlightNames = (db = getDb()) => db.select().from(highlights).orderBy(asc(highlights.name));
export const forSitemap = (now = Date.now(), db = getDb()) => db.select().from(posts).where(and(visible(now), inArray(posts.kind, KINDS_BY_TAB.all))).orderBy(desc(posts.publishAt)).limit(1000).then((r) => r.map(hydrate));
