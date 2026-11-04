// Server-side HTML for the Feed. Same header/footer/CSS as the static pages; no inline script or style (CSP).
import { esc, siteUrl } from './util.js';
import { mediaSrc, mediaSrcset, videoSrc, ogImage } from './media.js';
import { EMOJI } from './validators.js';

const SPRITE = '<svg class="sprite" width="0" height="0" aria-hidden="true" focusable="false"><symbol id="i-arrow" viewBox="0 0 24 24"><path d="M4 12h16M13 5l7 7-7 7"/></symbol><symbol id="i-ext" viewBox="0 0 24 24"><path d="M7 17 17 7M8 7h9v9"/></symbol><symbol id="i-copy" viewBox="0 0 24 24"><path d="M9 9h11v11H9zM5 15V4h11"/></symbol><symbol id="i-menu" viewBox="0 0 24 24"><path d="M3 7h18M3 12h18M3 17h18"/></symbol><symbol id="i-close" viewBox="0 0 24 24"><path d="M5 5l14 14M19 5 5 19"/></symbol><symbol id="i-share" viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5M5 13v8h14v-8"/></symbol><symbol id="i-play" viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></symbol></svg>';

export const ASSET_V = '20261105';
export const fmtDate = (ms, opts = { year: 'numeric', month: 'short', day: 'numeric' }) => new Date(ms).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
export const timeTag = (ms, opts) => `<time datetime="${new Date(ms).toISOString()}">${esc(fmtDate(ms, opts))}</time>`;
export const jsonScript = (id, data) => `<script type="application/json" id="${id}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
export const UPDATE_LABEL = { job: 'New role', project: 'Project shipped', cert: 'Certification', talk: 'Talk', learning: 'Learning', life: 'Personal' };

export function layout({ title, description, path, image, type = 'website', body, scripts = [], noindex = false, jsonld, nav = 'feed' }) {
  const url = siteUrl() + path;
  const img = image || siteUrl() + '/assets/img/og.png';
  const full = `${title} | Samriddha Saha`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="theme-color" content="#f5f2ec">
<meta name="author" content="Samriddha Saha">
${noindex ? '<meta name="robots" content="noindex,nofollow">' : ''}
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="Samriddha Saha">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/assets/img/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="alternate" type="application/rss+xml" title="Samriddha Saha: Feed" href="/feed/rss.xml">
<link rel="preload" href="/assets/fonts/fraunces-900.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/space-grotesk-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/site.css?v=${ASSET_V}">
<link rel="stylesheet" href="/assets/css/feed.css?v=${ASSET_V}">
<noscript><link rel="stylesheet" href="/assets/css/nojs.css?v=${ASSET_V}"></noscript>
<script defer src="/assets/js/site.js?v=${ASSET_V}"></script>
${scripts.map((s) => `<script defer src="${s}?v=${ASSET_V}"></script>`).join('\n')}
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${SPRITE}
<header class="site">
  <nav class="nav" aria-label="Main">
    <a href="/" class="mark">SAMRIDDHA<span>.</span></a>
    <button type="button" class="nav-toggle" id="navToggle" aria-expanded="false" aria-controls="navList" aria-label="Menu">
      <svg class="i i-open" aria-hidden="true"><use href="#i-menu"/></svg><svg class="i i-close" aria-hidden="true"><use href="#i-close"/></svg>
    </button>
    <ul id="navList">
      <li><a class="navlink" href="/#work">Work</a></li>
      <li><a class="navlink" href="/#experience">Experience</a></li>
      <li><a class="navlink" href="/#skills">Skills</a></li>
      <li><a class="navlink" href="/#about">About</a></li>
      <li><a class="navlink" href="/#contact">Contact</a></li>
    </ul>
    <a class="btn btn-solid nav-feed" href="/feed/"${nav === 'feed' ? ' aria-current="page"' : ''}>Feed</a>
  </nav>
</header>
<main id="main">
${body}
</main>
<footer>
  <div class="wrap foot-grid">
    <div><a class="mark" href="/">SAMRIDDHA SAHA</a><div class="foot-small">Senior Business Analyst</div></div>
    <ul class="foot-links">
      <li><a href="/feed/rss.xml">RSS</a></li>
      <li><a href="https://www.linkedin.com/in/samriddha-saha-12375a1a0/" target="_blank" rel="noopener">LinkedIn<span class="sr-only"> (opens in new tab)</span></a></li>
      <li><a href="https://github.com/samriddhosaha/" target="_blank" rel="noopener">GitHub<span class="sr-only"> (opens in new tab)</span></a></li>
    </ul>
    <div class="foot-small">© <span data-year>${new Date().getUTCFullYear()}</span> Samriddha Saha</div>
  </div>
</footer>
</body>
</html>`;
}

// ---------- media ----------
export function mediaHtml(post) {
  const items = post.media || [];
  if (!items.length) return '';
  const cls = items.length === 1 ? 'g1' : items.length === 2 ? 'g2' : 'g3';
  const one = (m) => {
    const cap = m.caption ? `<figcaption>${esc(m.caption)}</figcaption>` : '';
    if (m.type === 'video') {
      return `<figure class="m m-video"><video controls preload="none" playsinline poster="${esc(mediaSrc(m, 960))}" src="${esc(videoSrc(m))}" aria-label="${esc(m.alt || m.caption || 'Video')}" width="${m.w || 1280}" height="${m.h || 720}"></video>${cap}</figure>`;
    }
    const set = mediaSrcset(m);
    return `<figure class="m"><img src="${esc(mediaSrc(m, 960))}"${set ? ` srcset="${esc(set)}" sizes="(max-width: 700px) 100vw, 680px"` : ''} alt="${esc(m.alt)}" width="${m.w || 1200}" height="${m.h || 800}" loading="lazy" decoding="async">${cap}</figure>`;
  };
  return `<div class="gallery ${cls}">${items.map(one).join('')}</div>`;
}
export const postImage = (post) => { const m = (post.media || []).find((x) => x.type === 'image') || (post.media || [])[0]; return m ? ogImage(m) || (m.provider === 'static' ? siteUrl() + m.id : null) : null; };

// ---------- pieces ----------
export function reactionBar(post, state = { counts: {}, mine: [] }) {
  return `<div class="reacts" role="group" aria-label="Reactions" data-id="${post.id}" hidden>${EMOJI.map((e) => {
    const n = state.counts[e] || 0, on = state.mine.includes(e);
    return `<button type="button" class="react" data-emoji="${e}" aria-pressed="${on}"><span aria-hidden="true">${e}</span><span class="n" aria-hidden="true">${n || ''}</span><span class="sr-only">React with ${e}. ${n} so far.</span></button>`;
  }).join('')}</div><p class="reacts-static foot-small" data-noscript-only>${Object.entries(state.counts).map(([e, n]) => `${e} ${n}`).join('  ') || ''}</p>`;
}

export const permalink = (post) => (post.kind === 'article' ? `/feed/newsletter/${post.slug}/` : `/feed/post/${post.id}/`);

export function shareBar(post) {
  const url = siteUrl() + permalink(post);
  return `<div class="share" data-share data-url="${esc(url)}" data-title="${esc(post.title || post.excerpt.slice(0, 80))}"><button type="button" class="btn btn-ghost" data-copy hidden><svg class="i" aria-hidden="true"><use href="#i-copy"/></svg><span data-label>Copy link</span></button><button type="button" class="btn btn-ghost" data-native hidden><svg class="i" aria-hidden="true"><use href="#i-share"/></svg>Share</button><span class="sr-only" role="status" data-share-status></span></div>`;
}

export function tagList(tags) {
  return tags.length ? `<ul class="tags feed-tags">${tags.map((t) => `<li><a class="tag" href="/feed/?tag=${esc(t)}">#${esc(t)}</a></li>`).join('')}</ul>` : '';
}

function linkCard(p) {
  if (!p?.linkPreview) return '';
  const l = p.linkPreview;
  return `<a class="link-card" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer nofollow"><span class="link-site">${esc(l.site)}</span><strong>${esc(l.title)}</strong>${l.description ? `<span class="link-desc">${esc(l.description)}</span>` : ''}<span class="sr-only"> (opens in new tab)</span></a>`;
}

// One feed item. ctx: { state, comments, thread, full }
export function card(post, ctx = {}) {
  const { state, comments = 0, thread = 0, full = false } = ctx;
  const href = permalink(post);
  const meta = `<p class="feed-meta">${post.kind === 'update' ? `<span class="badge-update">${esc(UPDATE_LABEL[post.updateType] || 'Update')}</span>` : post.kind === 'article' ? '<span class="badge-update">Newsletter</span>' : ''}<a href="${href}" class="when">${timeTag(post.publishAt)}</a>${post.kind === 'article' ? `<span>${post.readingMinutes} min read</span>` : ''}${post.pinned ? '<span class="pin">Pinned</span>' : ''}</p>`;
  let inner;
  if (post.kind === 'article') {
    const cover = (post.media || []).find((m) => m.type === 'image');
    inner = `${cover ? `<a href="${href}" class="cover" tabindex="-1" aria-hidden="true">${mediaHtml({ media: [{ ...cover, caption: '' }] })}</a>` : ''}<h2 class="feed-title"><a href="${href}">${esc(post.title)}</a></h2><p class="feed-excerpt">${esc(post.excerpt)}</p><p><a class="read-more" href="${href}">Read the issue <svg class="i" aria-hidden="true"><use href="#i-arrow"/></svg></a></p>`;
  } else {
    inner = `${post.title ? `<h2 class="feed-title">${full ? '' : `<a href="${href}">`}${esc(post.title)}${full ? '' : '</a>'}</h2>` : ''}<div class="feed-body-md">${post.bodyHtml}</div>${mediaHtml(post)}${linkCard(post)}`;
  }
  const actions = `<div class="feed-actions">${state ? reactionBar(post, state) : ''}<a class="btn btn-ghost" href="${href}#comments">${comments ? `${comments} comment${comments === 1 ? '' : 's'}` : 'Comment'}</a>${thread > 1 && !full ? `<a class="btn btn-ghost" href="${href}">Thread · ${thread} posts</a>` : ''}${shareBar(post)}</div>`;
  return `<article class="feed-card kind-${post.kind}" id="p-${post.id}" aria-label="${esc(post.title || post.excerpt.slice(0, 60))}">${meta}${inner}${tagList(post.tags)}${actions}</article>`;
}

// Journey timeline entries are compact.
export function timelineItem(post) {
  return `<li class="tl-item"><p class="feed-meta"><span class="badge-update">${esc(UPDATE_LABEL[post.updateType] || 'Update')}</span>${timeTag(post.publishAt, { month: 'short', day: 'numeric' })}</p><h3><a href="${permalink(post)}">${esc(post.title)}</a></h3><div class="feed-body-md">${post.bodyHtml}</div>${tagList(post.tags)}</li>`;
}

export function teaserItem(post) {
  return `<li class="teaser-item"><p class="feed-meta"><span class="badge-update">${esc(post.kind === 'update' ? UPDATE_LABEL[post.updateType] : post.kind === 'article' ? 'Newsletter' : 'Post')}</span>${timeTag(post.publishAt)}</p><h3><a href="${permalink(post)}">${esc(post.title || post.excerpt.slice(0, 90))}</a></h3>${post.title ? `<p class="feed-excerpt">${esc(post.excerpt.slice(0, 140))}</p>` : ''}</li>`;
}

export const hp = '<div class="hp" aria-hidden="true"><label>Leave this field empty<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>';

export function subscribeBox(id = 'sub') {
  return `<form class="subscribe" method="post" action="/api/subscribe/" data-subscribe aria-labelledby="${id}-h">
  <h2 id="${id}-h" class="sub-title">Subscribe to the newsletter</h2>
  <p class="sub-copy">Occasional long-form articles on analytics, pricing and forecasting. Subscriptions require email confirmation, and every issue includes an unsubscribe link.</p>
  <div class="sub-row"><label class="sr-only" for="${id}-email">Email address</label><input id="${id}-email" type="email" name="email" required autocomplete="email" placeholder="you@example.com" maxlength="200">${hp}<button class="btn btn-solid" type="submit">Subscribe</button></div>
  <p class="sub-status" role="status" aria-live="polite" data-status></p>
</form>`;
}

export function commentsSection(post, list, ctxNotice) {
  const items = list.map((c) => `<li class="comment"><p class="foot-small"><strong>${esc(c.name)}</strong> · ${timeTag(c.createdAt)}</p><p>${esc(c.body)}</p></li>`).join('');
  return `<section class="comments" id="comments" aria-labelledby="comments-h"><h2 id="comments-h">Comments</h2>
  ${ctxNotice ? `<p class="notice" role="status">${esc(ctxNotice)}</p>` : ''}
  ${items ? `<ul class="comment-list">${items}</ul>` : '<p class="empty-inline">No comments yet.</p>'}
  <form class="comment-form" method="post" action="/api/comment/" data-comment>
    <input type="hidden" name="postId" value="${post.id}">
    <h3>Leave a comment</h3>
    <label for="c-name">Name</label><input id="c-name" name="name" required maxlength="60" autocomplete="name">
    <label for="c-body">Comment</label><textarea id="c-body" name="body" required minlength="2" maxlength="1000" rows="4"></textarea>
    ${hp}
    <p class="foot-small">Comments are reviewed before they appear.</p>
    <button class="btn btn-solid" type="submit">Post comment</button>
    <p class="sub-status" role="status" aria-live="polite" data-status></p>
  </form></section>`;
}

export const emptyState = (title, text) => `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
export const skeleton = (n = 3) => Array.from({ length: n }, () => '<div class="skel" aria-hidden="true"><span></span><span></span><span></span></div>').join('');

export function storyGroups(latest, highlights) {
  const item = (s) => {
    const m = s.media[0];
    return { id: s.id, type: m ? m.type : 'text', src: m ? (m.type === 'video' ? videoSrc(m) : mediaSrc(m, 1080)) : '', poster: m?.type === 'video' ? mediaSrc(m, 720) : '', alt: m?.alt || '', text: s.bodyMd ? s.bodyHtml : '', bg: s.bg || 'ink', at: s.publishAt };
  };
  const cover = (list) => { const m = list.map((s) => s.media[0]).find((x) => x && x.type === 'image'); return m ? mediaSrc(m, 160) : ''; };
  const groups = [];
  if (latest.length) groups.push({ id: 'latest', name: 'Latest', cover: cover(latest), items: latest.map(item) });
  for (const h of highlights) groups.push({ id: 'h-' + h.id, name: h.name, cover: cover(h.stories), items: h.stories.map(item) });
  return groups;
}

export function storyBar(groups) {
  if (!groups.length) return '';
  return `<div class="story-bar" role="list" aria-label="Stories and highlights">${groups.map((g) => `<div role="listitem"><button type="button" class="story-ring" data-group="${esc(g.id)}"><span class="ring">${g.cover ? `<img src="${esc(g.cover)}" alt="" width="64" height="64" loading="lazy">` : `<span class="ring-text" aria-hidden="true">${esc(g.name.slice(0, 1))}</span>`}</span><span class="story-label">${esc(g.name)}</span><span class="sr-only"> stories, ${g.items.length} item${g.items.length === 1 ? '' : 's'}</span></button></div>`).join('')}</div>
${jsonScript('story-data', groups)}
<dialog class="story-viewer" id="storyViewer" aria-label="Story viewer"><div class="sv-bars" data-bars></div><div class="sv-head"><span data-sv-name></span><button type="button" class="sv-close" data-sv-close aria-label="Close stories"><svg class="i" aria-hidden="true"><use href="#i-close"/></svg></button></div><div class="sv-stage" data-stage></div><button type="button" class="sv-nav sv-prev" data-sv-prev aria-label="Previous story"></button><button type="button" class="sv-nav sv-next" data-sv-next aria-label="Next story"></button><p class="sr-only" role="status" data-sv-status></p></dialog>`;
}

export const absolutize = (html) => html.replace(/(src|href)="\//g, `$1="${siteUrl()}/`);
