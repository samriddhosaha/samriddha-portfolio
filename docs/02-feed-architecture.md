# Feed architecture

## Shape

```
browser ──► Vercel (static files: /, /work/*, /assets/*)
        └─► vercel.json rewrites  /feed/*  /admin/*  /api/*   ──►  api/r.js  ──►  lib/router.js
                                                                        │
                       lib/public.js (pages + public JSON)   lib/admin.js (owner-only JSON)
                                                                        │
                    lib/repo.js (Drizzle queries)  ──►  Turso / libSQL        lib/media.js ──► Cloudinary
                                                        lib/mailer.js ──► Resend
```

One function serves every dynamic route (Vercel Hobby allows 12). The rewrite passes the original path as `?__p=...` so routing does not depend on how the platform presents `request.url` after a rewrite. Handlers are Web-standard (`Request` in, `Response` out), which is also what `dev/server.mjs` and the unit tests call. All internal URLs end in `/` because `vercel.json` sets `trailingSlash: true` (a missing slash would cost a 308 on every API call).

Pages are server-rendered with the same header, footer and CSS as the static site; JavaScript only enhances (reactions, share, load more, story viewer, forms). Forms, tabs, search, tags and "load more" all work without JavaScript, except reactions and the story viewer (they are hidden or inert without it).

## Data model (`lib/schema.js`, migration `drizzle/0000_init.sql`)

| Table | Purpose | Notes |
|---|---|---|
| `posts` | every content item | `kind` = post / story / article / update. `status` = draft / published; `publish_at` in the future means scheduled; `expires_at` is set for stories without a highlight (default 24h). `thread_id` = root post id for replies in a thread. `media`, `tags`, `toc`, `link_preview` are JSON text, validated by zod on the way in. `body_md` is the source, `body_html` is the sanitised render stored at save time. Indexes on `(status, publish_at)`, `kind`, `thread_id`. |
| `highlights` | named story collections | a story with a `highlight_id` never expires |
| `reactions` | one row per (post, visitor, emoji) | primary key makes duplicates impossible; `visitor` is an HMAC of an anonymous cookie |
| `comments` | visitor comments | `pending` until approved; only `approved` is ever rendered |
| `subscribers` | newsletter list | `pending` / `active` / `unsubscribed`; one random token is both the confirm and unsubscribe key |
| `issues` | send log | `test` or `send`; gates sending (a test must exist, and a real send happens once) |
| `rate_limits` | fixed-window counters | key = action + HMAC of client IP; works across serverless instances |

**Visibility rule** (single place: `visible()` in `lib/repo.js`): published, `publish_at <= now`, and (not a story, or no expiry, or not expired). Every public read uses it, so drafts, scheduled items and expired stories cannot leak through any route, RSS or sitemap. Scheduling therefore needs no cron.

## Routes

| Route | What |
|---|---|
| `/feed/` | tabs `?tab=posts|stories|newsletter|journey`, filters `?tag=`, `?q=`, pagination `?cursor=` |
| `/feed/post/:id/` | permalink with the whole thread, OG/Twitter tags, comments |
| `/feed/newsletter/:slug/` | article: cover, reading time, table of contents, JSON-LD `Article`, subscribe, comments |
| `/feed/rss.xml`, `/feed/sitemap.xml`, `/sitemap.xml` (index) | feeds; stories are excluded (they are ephemeral) |
| `/feed/notice/`, `/feed/confirm/`, `/feed/unsubscribe/` | result pages and the confirm/unsubscribe buttons |
| `/admin/` | owner app shell (`noindex`, `Disallow` in robots.txt) |

Public JSON: `GET /api/feed/` (returns server-rendered HTML fragments + `next` cursor, used by "load more" and the home teaser with `?teaser=1`), `POST /api/react/`, `/api/comment/`, `/api/subscribe/`, `/api/confirm/`, `/api/unsubscribe/`.
Owner JSON (all under `/api/admin/`, all behind `requireAdmin`): `login`, `logout`, `me`, `bootstrap`, `posts` (POST, GET/PUT/DELETE `:id`, POST `:id/pin`), `preview`, `upload-sign`, `upload-local` (dev only), `subscribers`, `comments` (GET queue, POST moderate), `newsletter` (test / send).

Pagination is keyset (`publish_at`, `id`), so it is stable while new items arrive. In the "All" tab pinned items render once at the top of page 1 and are excluded from the stream.

## Auth flow (single owner, no sign-up)

1. `POST /api/admin/login/` with the password. The check is `scrypt` against `ADMIN_PASSWORD_HASH` with a constant-time compare. Failures sleep 400 ms and count toward 10 attempts per 15 minutes per IP (success resets the counter, so the owner is never locked out by their own logins).
2. Success sets `__Host-sid` (production; `sid` on http localhost): `expiry.HMAC(SESSION_SECRET, expiry)`, `HttpOnly; Secure; SameSite=Strict; Path=/`, 7 days. There is no server-side session store.
3. Every `/api/admin/*` handler except login and `me` is wrapped by `requireAdmin`, which checks the cookie (401), and for any non-GET also requires `Origin` equal to the host and `X-Requested-With: fetch` (403). So even a cookie-bearing cross-site request is rejected: SameSite=Strict, the Origin check and the custom header are three independent layers. The UI is never trusted; hiding a button protects nothing.
4. Sign out clears the cookie. To revoke every session, rotate `SESSION_SECRET`.
5. `ADMIN_PASSWORD` (plain) is accepted only when `NODE_ENV !== 'production'`.

## Public write endpoints

Reactions, comments and subscribe all: require same-origin `Origin` (403 otherwise), are zod-validated, and are rate limited per IP (reactions 120/h, comments 5/h, subscribe 5/h; 429 with `Retry-After`). Comment and subscribe forms carry a hidden honeypot field; a filled honeypot is answered as a success and discarded. Comments are stored `pending` and only shown after approval. Reactions are deduplicated by the primary key (post, visitor cookie, emoji) and toggle off on a second click; clearing cookies lets someone react again, which the IP limit bounds.

Subscribe is double opt-in. The response is identical whether or not the address already exists (no enumeration). The email contains a link to `/feed/confirm/?token=`; the page shows a button and the **POST** confirms, so mail scanners that prefetch links cannot subscribe or unsubscribe anyone. Issues include a `List-Unsubscribe` header and an unsubscribe link per recipient.

## Markdown and XSS

`markdown-it` runs with raw HTML disabled; the result goes through `sanitize-html` with an allow-list of tags and attributes. Links get `rel="noopener noreferrer nofollow ugc"` and `target="_blank"` when external; `javascript:`, `data:` and `vbscript:` URLs are dropped; `<img>` and `<video>` survive only when the URL is under `/assets/`, `/api/media/` or this account's `res.cloudinary.com/<cloud>/`. Posts, updates and stories use "markdown-lite" (no headings, images, tables). `#tags` become `/feed/?tag=` links and `@name` becomes a GitHub link, outside code spans only. Unit tests run eleven XSS payloads through both renderers. Everything else is escaped at render time (`esc`), JSON-in-HTML escapes `<`, and the CSP forbids inline script and style, so a missed escape would still not execute.

## Media pipeline

Uploads go **straight from the browser to Cloudinary**, so Vercel's 4.5 MB request limit never applies to a 100 MB video.

1. The composer validates type and size (images JPEG/PNG/WebP up to 10 MB, MP4/WebM video up to 100 MB; SVG and everything else is refused).
2. Images are decoded and **re-encoded to WebP on a canvas** in the browser, capped at 2400 px on the long side. That drops all EXIF, including GPS, and bakes in the orientation. This is a trusted-client step (only the owner uploads).
3. The browser asks `POST /api/admin/upload-sign/` (type and size validated again) for a signed Cloudinary upload (`allowed_formats`, `folder`, timestamp; images also get the incoming transformation `fl_strip_profile`, a second metadata strip on the stored original). It uploads with `XMLHttpRequest` for progress.
4. The returned `public_id`, dimensions, required alt text (images) and optional caption are saved on the post as `{provider, type, id, w, h, alt, caption}`.
5. On the page, URLs are built from `id`: images use `f_auto,q_auto,w_480/960/1600` with `srcset`/`sizes`, `width`/`height` set to prevent layout shift, `loading="lazy"`; videos are `preload="none"` with a poster frame (`so_0`), `controls`, never autoplay with sound (story videos start muted). Thumbnails and OG images (`w_1200,h_630,c_fill`) are URL transforms; nothing is stored twice.

Development without Cloudinary: `provider()` returns `local`, files are written to `.data/uploads` by `upload-local`, and the **type is decided by magic bytes**, not the client's claim. That endpoint answers 404 in production. Seed content uses `provider: "static"` (files under `/assets/`).

## Email

`lib/mailer.js` posts batches of up to 100 to Resend. Without `RESEND_API_KEY` outside production it appends JSON lines to `.data/outbox.jsonl` (the e2e tests read confirmation links from there); in production it refuses rather than pretending. Sending is gated: only a published article, a prior test send, at least one confirmed subscriber, and once per issue.

## Security headers

`vercel.json` keeps the strict CSP (`script-src 'self'`, `style-src 'self'`, `frame-ancestors 'none'`) and widens only what is needed: `img-src` and `media-src` `https://res.cloudinary.com`, `connect-src` `https://api.cloudinary.com`, `form-action 'self'` (was `'none'`) for the no-JS forms. These apply site-wide, including the static pages.

## Link previews

`lib/linkpreview.js` fetches the first https URL in a post at save time to render a title/description card (images are not hotlinked because the CSP forbids remote images). It is SSRF-guarded: https and default port only, every redirect hop re-resolved, any private/loopback/link-local address refused, 4 s timeout, 300 KB cap. It is skipped when `NODE_ENV=test`.
