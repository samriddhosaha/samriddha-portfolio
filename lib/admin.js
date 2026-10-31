// Owner-only endpoints. Every handler except login/page runs behind requireAdmin() in the router.
import * as repo from './repo.js';
import { layout, absolutize } from './render.js';
import { clearSessionCookie, isAdmin, sessionCookie, verifyPassword } from './auth.js';
import { limit, resetLimit, tooMany } from './ratelimit.js';
import { sendMail } from './mailer.js';
import { fetchPreview, firstUrl } from './linkpreview.js';
import { provider, saveLocal, signUpload } from './media.js';
import { renderArticle, renderLite } from './markdown.js';
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, moderateInput, postInput, previewInput, sendInput, uploadSignInput, KINDS, UPDATE_TYPES, BG_PRESETS, EMOJI } from './validators.js';
import { htmlRes, ipHash, isProd, json, readBody, sameOrigin, siteUrl } from './util.js';

const invalid = (err) => json({ error: 'invalid', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, 400);

export function adminPage() {
  const body = `<section class="feed-hero slim"><div class="wrap"><p class="eyebrow">Owner only</p><h1>Feed admin</h1></div></section>
<section class="feed-section"><div class="wrap"><div id="admin-root" data-provider="${provider() || ''}"><p>Loading…</p></div><noscript><p class="notice">The admin panel needs JavaScript.</p></noscript></div></section>`;
  return htmlRes(layout({ title: 'Admin', description: 'Feed admin', path: '/admin/', body, scripts: ['/assets/js/admin.js'], noindex: true, nav: 'admin' }), 200, { 'cache-control': 'no-store' });
}

export async function login(request) {
  if (!sameOrigin(request) || request.headers.get('x-requested-with') !== 'fetch') return json({ error: 'forbidden' }, 403);
  const key = `login:${ipHash(request)}`;
  const rl = await limit(key, 10, 15 * 60e3);
  if (!rl.ok) return tooMany(rl);
  const body = await readBody(request);
  if (typeof body.password !== 'string' || !verifyPassword(body.password)) {
    await new Promise((r) => setTimeout(r, 400)); // slow down guessing
    return json({ error: 'invalid_credentials' }, 401);
  }
  await resetLimit(key); // only failures count against the owner
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie() });
}
export const logout = () => json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
// Always 200 so an anonymous visit to /admin/ does not log a console error.
export const me = (request) => json({ authenticated: isAdmin(request) });

const brief = (p) => ({ id: p.id, kind: p.kind, status: p.status, title: p.title, excerpt: p.excerpt.slice(0, 120), publishAt: p.publishAt, expiresAt: p.expiresAt, pinned: p.pinned, tags: p.tags, slug: p.slug, updateType: p.updateType, highlightId: p.highlightId, threadId: p.threadId });

export async function bootstrap() {
  const [posts, highlights, roots, pending, subs] = await Promise.all([repo.adminList(), repo.listHighlightNames(), repo.rootPosts(), repo.moderationQueue('pending'), repo.listSubscribers()]);
  return json({
    posts: posts.map(brief), highlights, rootPosts: roots, pendingComments: pending.length,
    subscribers: { active: subs.filter((s) => s.status === 'active').length, pending: subs.filter((s) => s.status === 'pending').length },
    provider: provider(), enums: { KINDS, UPDATE_TYPES, BG_PRESETS, EMOJI }, limits: { image: MAX_IMAGE_BYTES, video: MAX_VIDEO_BYTES }, ownerEmail: !!process.env.OWNER_EMAIL,
  });
}

export async function getPost(request, { id }) {
  const p = await repo.getPost(id, { any: true });
  return p ? json({ post: p }) : json({ error: 'not_found' }, 404);
}

async function save(request, id) {
  const v = postInput.safeParse(await readBody(request));
  if (!v.success) return invalid(v.error);
  let linkPreview = null;
  if (['post', 'update'].includes(v.data.kind) && process.env.NODE_ENV !== 'test') { const u = firstUrl(v.data.bodyMd); if (u) linkPreview = await fetchPreview(u); }
  const r = await repo.savePost(v.data, { id, linkPreview });
  if (r.error) return json({ error: r.error }, r.error === 'not_found' ? 404 : 400);
  return json({ post: brief(r.post), url: r.post.kind === 'article' ? `/feed/newsletter/${r.post.slug}/` : r.post.kind === 'story' ? '/feed/?tab=stories' : `/feed/post/${r.post.id}/` }, id ? 200 : 201);
}
export const createPost = (request) => save(request);
export const updatePost = (request, { id }) => save(request, id);
export const deletePost = async (request, { id }) => ((await repo.deletePost(id)) ? json({ ok: true }) : json({ error: 'not_found' }, 404));
export async function pinPost(request, { id }) {
  const b = await readBody(request);
  return (await repo.setPinned(id, b.pinned === true)) ? json({ ok: true }) : json({ error: 'not_found' }, 404);
}

export async function preview(request) {
  const v = previewInput.safeParse(await readBody(request));
  if (!v.success) return invalid(v.error);
  return json(v.data.kind === 'article' ? renderArticle(v.data.md) : { html: renderLite(v.data.md) });
}

export async function uploadSign(request) {
  const v = uploadSignInput.safeParse(await readBody(request));
  if (!v.success) return invalid(v.error);
  const rt = v.data.type.startsWith('image/') ? 'image' : 'video';
  if (provider() === 'cloudinary') return json(signUpload(rt));
  if (provider() === 'local') return json({ provider: 'local', url: '/api/admin/upload-local' });
  return json({ error: 'storage_not_configured', message: 'Set the CLOUDINARY_* variables.' }, 503);
}

// Dev/test only: raw body upload to disk. Type is decided by magic bytes, not the client's claim.
export async function uploadLocal(request) {
  if (provider() !== 'local' || isProd()) return json({ error: 'not_available' }, 404);
  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length > MAX_VIDEO_BYTES) return json({ error: 'too_large' }, 413);
  const saved = saveLocal(buf);
  if (!saved) return json({ error: 'unsupported_type' }, 415);
  if (saved.type === 'image' && buf.length > MAX_IMAGE_BYTES) return json({ error: 'too_large' }, 413);
  return json({ provider: 'local', id: saved.name, type: saved.type });
}

export const subscribersList = async () => json({ subscribers: (await repo.listSubscribers()).map(({ token, ...s }) => s) });
export async function commentsList(request) {
  const s = new URL(request.url).searchParams.get('status');
  return json({ comments: await repo.moderationQueue(['pending', 'approved', 'rejected'].includes(s) ? s : 'pending') });
}
export async function moderate(request) {
  const v = moderateInput.safeParse(await readBody(request));
  if (!v.success) return invalid(v.error);
  return (await repo.moderateComment(v.data.id, v.data.status)) ? json({ ok: true }) : json({ error: 'not_found' }, 404);
}

export async function newsletter(request) {
  const v = sendInput.safeParse(await readBody(request));
  if (!v.success) return invalid(v.error);
  const post = await repo.getPost(v.data.postId, { any: true });
  if (!post || post.kind !== 'article' || post.status !== 'published') return json({ error: 'not_sendable', message: 'Only published articles can be sent.' }, 400);
  const base = siteUrl();
  const url = `${base}/feed/newsletter/${post.slug}/`;
  const build = (to, unsub) => ({
    to, subject: post.title,
    text: `${post.title}\n\n${post.excerpt}\n\nRead online: ${url}\n\nUnsubscribe: ${unsub}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto"><h1>${post.title.replace(/</g, '&lt;')}</h1>${absolutize(post.bodyHtml)}<hr><p style="font-size:13px;color:#555"><a href="${url}">Read online</a> · <a href="${unsub}">Unsubscribe</a></p></div>`,
    headers: { 'List-Unsubscribe': `<${unsub}>` },
  });
  if (v.data.mode === 'test') {
    const to = process.env.OWNER_EMAIL;
    if (!to) return json({ error: 'owner_email_missing', message: 'Set OWNER_EMAIL to receive test sends.' }, 400);
    try { await sendMail([build(to, `${base}/feed/unsubscribe/?token=${'0'.repeat(32)}`)]); } catch (e) { return json({ error: 'mail_failed', message: e.message }, 502); }
    await repo.recordIssue(post.id, 'test', 1);
    return json({ ok: true, sent: 1 });
  }
  if (!(await repo.lastTest(post.id))) return json({ error: 'test_first', message: 'Send a test to yourself first.' }, 400);
  if (await repo.lastSend(post.id)) return json({ error: 'already_sent', message: 'This issue was already sent.' }, 409);
  const subs = await repo.activeSubscribers();
  if (!subs.length) return json({ error: 'no_subscribers', message: 'No confirmed subscribers yet.' }, 400);
  try { await sendMail(subs.map((s) => build(s.email, `${base}/feed/unsubscribe/?token=${s.token}`))); } catch (e) { return json({ error: 'mail_failed', message: e.message }, 502); }
  await repo.recordIssue(post.id, 'send', subs.length);
  return json({ ok: true, sent: subs.length });
}
