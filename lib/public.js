// Public Feed pages and JSON endpoints. Handlers take a Web `Request` and return a `Response`.
import { randomBytes } from 'node:crypto';
import * as repo from './repo.js';
import * as R from './render.js';
import { limit, tooMany } from './ratelimit.js';
import { sendMail, mailConfigured } from './mailer.js';
import { readLocal, sniff, LOCAL_MIME } from './media.js';
import { commentInput, feedQuery, reactInput, subscribeInput, tokenInput } from './validators.js';
import { cookie, esc, hmac, htmlRes, ipHash, json, parseCookies, readBody, redirect, sameOrigin, siteUrl } from './util.js';
import { toText } from './markdown.js';

const NOTICES = {
  check: ['Check your inbox', 'If that address can be subscribed, a confirmation link is on its way. The subscription starts once you click it.'],
  confirmed: ['You are subscribed', 'Thanks for confirming. Every issue includes a one-click unsubscribe link.'],
  unsubscribed: ['You are unsubscribed', 'You will not receive further issues.'],
  comment: ['Thanks for your comment', 'It is held for review and will appear once approved.'],
  invalid: ['Request could not be completed', 'Please check the form and try again. If you followed an older link, request a new one.'],
  rate: ['Too many requests', 'Too many requests were received from your network. Please try again later.'],
  error: ['Something went wrong', 'The request could not be completed. Please try again later.'],
};
const safeBack = (b) => (typeof b === 'string' && /^\/feed\/[A-Za-z0-9/_.-]*$/.test(b) ? b : '/feed/');
const wantsJson = (request) => (request.headers.get('accept') || '').includes('application/json') || (request.headers.get('content-type') || '').includes('application/json');
const qs = (o) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v) p.set(k, v); const s = p.toString(); return '/feed/' + (s ? '?' + s : ''); };
const visitorOf = (request) => { const vid = parseCookies(request).vid; return { vid, hash: vid ? hmac('vid:' + vid).slice(0, 24) : '' }; };

// Result of a public form POST: JSON for fetch(), redirect to a notice page for plain forms.
function reply(request, key, status = 200, extra = {}) {
  const back = safeBack(new URL(request.headers.get('referer') || siteUrl(), siteUrl()).pathname);
  if (wantsJson(request)) return json({ ok: status < 400, message: NOTICES[key][1], ...extra }, status);
  return redirect(`/feed/notice/?m=${key}&back=${encodeURIComponent(back)}`);
}

async function guard(request, action, max, windowMs) {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const r = await limit(`${action}:${ipHash(request)}`, max, windowMs);
  return r.ok ? null : tooMany(r);
}

// ---------- fragments shared by page + API ----------
async function renderItems(items, { tab, visitor, lastYear = null, now = Date.now() }) {
  if (!items.length) return '';
  if (tab === 'journey') {
    let y = lastYear;
    return items.map((p) => { const yr = new Date(p.publishAt).getUTCFullYear(); const head = yr !== y ? `<li class="tl-year"><h2>${yr}</h2></li>` : ''; y = yr; return head + R.timelineItem(p); }).join('');
  }
  const ids = items.map((i) => i.id);
  const [states, cc, ts] = await Promise.all([repo.reactionState(ids, visitor), repo.approvedCounts(ids), repo.threadSizes(ids, now)]);
  return items.map((p) => R.card(p, { state: states[p.id], comments: cc[p.id] || 0, thread: ts[p.id] || 0 })).join('');
}
const yearOfCursor = (c) => (c ? new Date(Number(c.split('_')[0])).getUTCFullYear() : null);

// ---------- pages ----------
export async function feedPage(request) {
  const url = new URL(request.url);
  const q = feedQuery.safeParse(Object.fromEntries(url.searchParams));
  const f = q.success ? q.data : feedQuery.parse({});
  const visitor = visitorOf(request).hash;
  const now = Date.now();
  const [latest, highlights, tags] = await Promise.all([repo.activeStories(now), repo.listHighlights(now), repo.allTags(now)]);
  const groups = R.storyGroups(latest, highlights);

  const filtered = !!(f.tag || f.q);
  let stream, more = '';
  if (f.tab === 'stories') {
    stream = groups.length ? groups.map((g) => `<section class="story-collection" aria-labelledby="sc-${esc(g.id)}"><h2 id="sc-${esc(g.id)}">${esc(g.name)}</h2><ul class="story-tiles">${g.items.map((it, i) => `<li><button type="button" class="story-tile bg-${esc(it.bg)}" data-group="${esc(g.id)}" data-index="${i}"><span class="sr-only">Story ${i + 1} of ${g.items.length} in ${esc(g.name)}. </span>${it.type === 'image' ? `<img src="${esc(it.src)}" alt="${esc(it.alt)}" width="160" height="240" loading="lazy">` : it.type === 'video' ? `<img src="${esc(it.poster)}" alt="${esc(it.alt)}" width="160" height="240" loading="lazy"><span class="tile-play" aria-hidden="true">▶</span>` : `<span class="tile-text">${esc(toText(it.text).slice(0, 80))}</span>`}</button></li>`).join('')}</ul></section>`).join('') : R.emptyState('No stories right now', 'Stories last 24 hours unless pinned to a highlight. Check back soon.');
  } else {
    const pinned = f.tab === 'all' && !filtered && !f.cursor ? await repo.listPinned(now) : [];
    const { items, next } = await repo.listFeed({ ...f, now, skipPinned: f.tab === 'all' && !filtered });
    const html = (await renderItems(pinned, { tab: f.tab, visitor, now })) + (await renderItems(items, { tab: f.tab, visitor, lastYear: yearOfCursor(f.cursor), now }));
    stream = html || R.emptyState(filtered ? 'No results found' : 'Nothing published yet', filtered ? 'Try a different tag or search term.' : 'New posts will appear here.');
    if (filtered && !html) stream += `<p><a class="btn btn-outline" href="${qs({ tab: f.tab })}">Clear filters</a></p>`;
    if (next) more = `<p class="more"><a class="btn btn-outline" href="${qs({ tab: f.tab, tag: f.tag, q: f.q, cursor: next })}" data-more data-next="${next}">Load more</a></p><p class="sr-only" role="status" data-more-status></p>`;
  }
  const tabs = [['all', 'All'], ['posts', 'Posts'], ['stories', 'Stories'], ['newsletter', 'Newsletter'], ['journey', 'Journey']];
  const wrapTag = f.tab === 'journey' ? 'ol' : 'div';
  const body = `<section class="feed-hero"><div class="wrap">
  <p class="crumb"><a href="/">&larr; Home</a></p>
  <p class="eyebrow">Feed</p>
  <h1>Notes, writing and <em>updates</em>.</h1>
  <p class="lede">Short posts, stories, newsletter issues and a timeline of my professional journey. All content is published by me.</p>
  <div class="btn-row"><a class="btn btn-outline" href="#subscribe">Subscribe</a><a class="btn btn-ghost" href="/feed/rss.xml">RSS feed</a></div>
</div></section>
<section class="feed-section"><div class="wrap">
  ${R.storyBar(groups)}
  <nav class="tabs" aria-label="Feed sections">${tabs.map(([k, l]) => `<a href="${qs({ tab: k === 'all' ? '' : k, tag: f.tag, q: f.q })}"${f.tab === k ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
  <form class="feed-search" role="search" method="get" action="/feed/">
    ${f.tab !== 'all' ? `<input type="hidden" name="tab" value="${esc(f.tab)}">` : ''}${f.tag ? `<input type="hidden" name="tag" value="${esc(f.tag)}">` : ''}
    <label class="sr-only" for="feed-q">Search the Feed</label><input id="feed-q" type="search" name="q" value="${esc(f.q || '')}" placeholder="Search posts, tags, issues" maxlength="100"><button class="btn btn-outline" type="submit">Search</button>
  </form>
  ${tags.length ? `<ul class="tag-chips" aria-label="Filter by tag">${tags.slice(0, 14).map((t) => `<li><a class="tag${f.tag === t.name ? ' on' : ''}" href="${qs({ tab: f.tab === 'all' ? '' : f.tab, tag: f.tag === t.name ? '' : t.name, q: f.q })}"${f.tag === t.name ? ' aria-current="true"' : ''}>#${esc(t.name)} <span class="sr-only">(${t.count})</span></a></li>`).join('')}</ul>` : ''}
  ${f.tag ? `<p class="active-filter">Tag <strong>#${esc(f.tag)}</strong> · <a href="${qs({ tab: f.tab === 'all' ? '' : f.tab, q: f.q })}">clear</a></p>` : ''}
  <div class="feed-layout">
    <div class="stream-col">
      <${wrapTag} id="stream" class="stream${f.tab === 'journey' ? ' feed-timeline' : ''}" data-tab="${esc(f.tab)}" data-tag="${esc(f.tag || '')}" data-q="${esc(f.q || '')}" aria-live="polite">${stream}</${wrapTag}>
      ${more}
    </div>
    <aside class="side" id="subscribe" aria-label="Newsletter signup">${R.subscribeBox('sub')}</aside>
  </div>
</div></section>`;
  return htmlRes(R.layout({ title: 'Feed', description: 'Posts, stories, newsletter issues and a journey timeline from Samriddha Saha.', path: '/feed/', body, scripts: ['/assets/js/feed.js', '/assets/js/stories.js'], noindex: !!f.cursor || filtered }));
}

async function thread(post, now) {
  return repo.getThread(post.threadId || post.id, now);
}

export async function postPage(request, { id }) {
  const now = Date.now();
  const post = await repo.getPost(id, { now });
  if (!post || post.kind === 'story' || post.kind === 'article') return post?.kind === 'article' ? redirect(R.permalink(post)) : notFound();
  const visitor = visitorOf(request).hash;
  const list = await thread(post, now);
  const ids = list.map((p) => p.id);
  const [states, comments] = await Promise.all([repo.reactionState(ids, visitor), repo.approvedComments(post.id)]);
  const notice = new URL(request.url).searchParams.get('notice') === 'comment' ? NOTICES.comment[1] : '';
  const cards = list.map((p) => R.card(p, { state: states[p.id], full: true, comments: p.id === post.id ? comments.length : 0 }).replace(/(<article class="feed-card)/, p.id === post.id ? '$1 current' : '$1')).join('');
  const body = `<section class="feed-hero slim"><div class="wrap"><p class="crumb"><a href="/feed/">&larr; Back to the Feed</a></p>${list.length > 1 ? `<p class="eyebrow">Thread · ${list.length} posts</p>` : ''}<h1 class="sr-only">${esc(post.title || 'Post from ' + R.fmtDate(post.publishAt))}</h1></div></section>
<section class="feed-section narrow"><div class="wrap"><div class="stream">${cards}</div>${R.commentsSection(post, comments, notice)}<aside class="side-inline">${R.subscribeBox('sub')}</aside></div></section>`;
  const title = post.title || post.excerpt.slice(0, 70) || 'Post';
  return htmlRes(R.layout({ title, description: post.excerpt.slice(0, 200) || title, path: `/feed/post/${post.id}/`, image: R.postImage(post), type: 'article', body, scripts: ['/assets/js/feed.js'] }));
}

export async function articlePage(request, { slug }) {
  const now = Date.now();
  const post = await repo.getBySlug(slug, { now });
  if (!post) return notFound();
  const visitor = visitorOf(request).hash;
  const [states, comments] = await Promise.all([repo.reactionState([post.id], visitor), repo.approvedComments(post.id)]);
  const cover = post.media.find((m) => m.type === 'image');
  const toc = post.toc.length >= 3 ? `<nav class="toc" aria-label="Table of contents"><h2>On this page</h2><ol>${post.toc.map((t) => `<li class="l${t.level}"><a href="#${esc(t.id)}">${esc(t.text)}</a></li>`).join('')}</ol></nav>` : '';
  const notice = new URL(request.url).searchParams.get('notice') === 'comment' ? NOTICES.comment[1] : '';
  const body = `<article class="article"><header class="feed-hero slim"><div class="wrap"><p class="crumb"><a href="/feed/?tab=newsletter">&larr; All issues</a></p>
  <p class="eyebrow">Newsletter · ${R.timeTag(post.publishAt)} · ${post.readingMinutes} min read</p>
  <h1>${esc(post.title)}</h1>${R.tagList(post.tags)}</div></header>
<div class="wrap article-wrap">${cover ? `<div class="article-cover">${R.mediaHtml({ media: [cover] })}</div>` : ''}
  <div class="article-grid">${toc}<div class="article-body">${post.bodyHtml}</div></div>
  <div class="feed-actions">${R.reactionBar(post, states[post.id])}${R.shareBar(post)}</div>
  ${R.subscribeBox('sub')}
  ${R.commentsSection(post, comments, notice)}
</div></article>`;
  const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: post.title, datePublished: new Date(post.publishAt).toISOString(), dateModified: new Date(post.updatedAt).toISOString(), author: { '@type': 'Person', name: 'Samriddha Saha', url: siteUrl() + '/' }, mainEntityOfPage: siteUrl() + `/feed/newsletter/${post.slug}/`, ...(R.postImage(post) ? { image: R.postImage(post) } : {}) };
  return htmlRes(R.layout({ title: post.title, description: post.excerpt, path: `/feed/newsletter/${post.slug}/`, image: R.postImage(post), type: 'article', body, scripts: ['/assets/js/feed.js'], jsonld: ld }));
}

function notFound() {
  const body = `<div class="wrap err"><h1>404</h1><p class="lede">This item could not be found. It may have been removed or may not be published yet.</p><a class="btn btn-solid" href="/feed/">Back to the Feed</a></div>`;
  return htmlRes(R.layout({ title: 'Not found', description: 'Not found', path: '/feed/', body, noindex: true }), 404);
}
export const notFoundPage = notFound;

export function unavailablePage() {
  const body = `<div class="wrap err"><p class="eyebrow">Feed</p><h1 class="notice-h">The Feed is being set up</h1><p class="lede">This section is not available yet. Please check back soon.</p><a class="btn btn-solid" href="/">Return to the home page</a></div>`;
  return htmlRes(R.layout({ title: 'Feed unavailable', description: 'The Feed is not available yet.', path: '/feed/', body, noindex: true }), 503, { 'cache-control': 'no-store' });
}

export function noticePage(request) {
  const u = new URL(request.url);
  const key = u.searchParams.get('m');
  const [h, p] = NOTICES[Object.hasOwn(NOTICES, key) ? key : 'error'];
  const back = safeBack(u.searchParams.get('back'));
  const body = `<div class="wrap err"><p class="eyebrow">Feed</p><h1 class="notice-h">${esc(h)}</h1><p class="lede">${esc(p)}</p><a class="btn btn-solid" href="${esc(back)}">Back <svg class="i" aria-hidden="true"><use href="#i-arrow"/></svg></a></div>`;
  return htmlRes(R.layout({ title: h, description: p, path: '/feed/notice/', body, noindex: true }));
}

// Confirm / unsubscribe: GET shows a button (so mail scanners that prefetch links change nothing); POST acts.
const tokenPage = (kind) => (request) => {
  const t = tokenInput.safeParse({ token: new URL(request.url).searchParams.get('token') });
  const copy = kind === 'confirm' ? ['Confirm your subscription', 'One more click to start receiving the newsletter.', 'Confirm subscription'] : ['Unsubscribe', 'Stop receiving the newsletter.', 'Unsubscribe'];
  if (!t.success) return redirect('/feed/notice/?m=invalid');
  const body = `<div class="wrap err"><p class="eyebrow">Newsletter</p><h1 class="notice-h">${copy[0]}</h1><p class="lede">${copy[1]}</p><form method="post" action="/api/${kind === 'confirm' ? 'confirm' : 'unsubscribe'}/"><input type="hidden" name="token" value="${t.data.token}"><button class="btn btn-solid" type="submit">${copy[2]}</button></form></div>`;
  return htmlRes(R.layout({ title: copy[0], description: copy[1], path: `/feed/${kind}/`, body, noindex: true }));
};
export const confirmPage = tokenPage('confirm');
export const unsubscribePage = tokenPage('unsubscribe');

// ---------- JSON API ----------
export async function apiFeed(request) {
  const u = new URL(request.url);
  const q = feedQuery.safeParse(Object.fromEntries(u.searchParams));
  if (!q.success) return json({ error: 'invalid_query' }, 400);
  const f = q.data;
  const now = Date.now();
  const teaser = u.searchParams.get('teaser') === '1';
  const { items, next } = await repo.listFeed({ ...f, limit: teaser ? Math.min(f.limit, 6) : f.limit, now, skipPinned: !teaser && f.tab === 'all' && !f.tag && !f.q });
  const html = teaser ? items.map(R.teaserItem).join('') : await renderItems(items, { tab: f.tab, visitor: visitorOf(request).hash, lastYear: yearOfCursor(f.cursor), now });
  return json({ html, next, count: items.length }, 200, { 'cache-control': teaser ? 'public, s-maxage=60, stale-while-revalidate=300' : 'no-store' });
}

export async function apiReact(request) {
  const blocked = await guard(request, 'react', 120, 3600e3);
  if (blocked) return blocked;
  const v = reactInput.safeParse(await readBody(request));
  if (!v.success) return json({ error: 'invalid' }, 400);
  let { vid, hash } = visitorOf(request);
  const headers = {};
  if (!vid) { vid = randomBytes(16).toString('hex'); hash = hmac('vid:' + vid).slice(0, 24); headers['set-cookie'] = cookie('vid', vid, { maxAge: 365 * 86400, sameSite: 'Lax' }); }
  const state = await repo.toggleReaction(v.data.id, hash, v.data.emoji);
  return state ? json({ ok: true, ...state }, 200, headers) : json({ error: 'not_found' }, 404);
}

export async function apiComment(request) {
  const blocked = await guard(request, 'comment', 5, 3600e3);
  if (blocked) return blocked;
  const raw = await readBody(request);
  const v = commentInput.safeParse(raw);
  if (!v.success) return wantsJson(request) ? json({ error: 'invalid', issues: v.error.issues.map((i) => i.message) }, 400) : reply(request, 'invalid', 400);
  const id = await repo.addComment({ postId: v.data.postId, name: v.data.name, body: v.data.body });
  if (!id) return reply(request, 'invalid', 404);
  return reply(request, 'comment');
}

export async function apiSubscribe(request) {
  const blocked = await guard(request, 'subscribe', 5, 3600e3);
  if (blocked) return blocked;
  const raw = await readBody(request);
  if (raw.website) return reply(request, 'check'); // honeypot: pretend it worked
  const v = subscribeInput.safeParse(raw);
  if (!v.success) return wantsJson(request) ? json({ error: 'invalid', issues: ['Enter a valid email address.'] }, 400) : reply(request, 'invalid', 400);
  if (!mailConfigured()) return reply(request, 'error', 503);
  const r = await repo.subscribe(v.data.email);
  if (r.status === 'pending') {
    const link = `${siteUrl()}/feed/confirm/?token=${r.token}`;
    try {
      await sendMail([{ to: v.data.email, subject: 'Confirm your subscription', text: `Confirm your subscription to Samriddha Saha's newsletter:\n\n${link}\n\nIf you did not ask for this, ignore this email.`, html: `<p>Confirm your subscription to Samriddha Saha's newsletter:</p><p><a href="${link}">Confirm subscription</a></p><p>If you did not ask for this, ignore this email.</p>` }]);
    } catch (e) { console.error('confirm mail failed', e.message); return reply(request, 'error', 502); }
  }
  return reply(request, 'check'); // same answer whether or not the address was already subscribed
}

const tokenAction = (fn, key) => async (request) => {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const v = tokenInput.safeParse(await readBody(request));
  if (!v.success || !(await fn(v.data.token))) return redirect('/feed/notice/?m=invalid');
  return redirect(`/feed/notice/?m=${key}`);
};
export const apiConfirm = tokenAction((t) => repo.confirmSubscriber(t), 'confirmed');
export const apiUnsubscribe = tokenAction((t) => repo.unsubscribe(t), 'unsubscribed');

// Dev-only disk media (production uses Cloudinary).
export function devMedia(request, { name }) {
  const buf = readLocal(name);
  if (!buf) return new Response('Not found', { status: 404 });
  return new Response(buf, { headers: { 'content-type': LOCAL_MIME[sniff(buf)] || 'application/octet-stream', 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' } });
}

// ---------- RSS + sitemap ----------
export async function rss() {
  const items = (await repo.forSitemap(Date.now())).slice(0, 30);
  const base = siteUrl();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
<title>Samriddha Saha: Feed</title><link>${base}/feed/</link><description>Posts, newsletter issues and updates from Samriddha Saha.</description><language>en</language>
<atom:link href="${base}/feed/rss.xml" rel="self" type="application/rss+xml"/>
${items.map((p) => `<item><title>${esc(p.title || p.excerpt.slice(0, 80))}</title><link>${base}${R.permalink(p)}</link><guid isPermaLink="true">${base}${R.permalink(p)}</guid><pubDate>${new Date(p.publishAt).toUTCString()}</pubDate><description>${esc(p.excerpt)}</description>${p.kind === 'article' ? `<content:encoded><![CDATA[${R.absolutize(p.bodyHtml).replace(/]]>/g, ']]&gt;')}]]></content:encoded>` : ''}${p.tags.map((t) => `<category>${esc(t)}</category>`).join('')}</item>`).join('\n')}
</channel></rss>`;
  return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, s-maxage=300, stale-while-revalidate=3600' } });
}

export async function feedSitemap() {
  const items = await repo.forSitemap(Date.now());
  const base = siteUrl();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${base}/feed/</loc></url>
${items.map((p) => `<url><loc>${base}${R.permalink(p)}</loc><lastmod>${new Date(p.updatedAt).toISOString().slice(0, 10)}</lastmod></url>`).join('\n')}
</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, s-maxage=300, stale-while-revalidate=3600' } });
}
