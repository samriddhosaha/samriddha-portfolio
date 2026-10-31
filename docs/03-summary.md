# Summary: QA pass + Feed

Branch `feat/qa-and-feed` (6 commits, nothing pushed, `master` untouched). The Feed has been exercised only against a local stand-in for Vercel; see "Not verified" before merging.

## What was fixed (QA, phases 1 and 2)

The existing site was already healthy (a previous overhaul: Lighthouse 98 to 100, axe clean). The new Playwright suite (15 routes x 8 viewports from 320x568 to 1920x1080, interactions, axe WCAG 2.2 AA) found **no Critical, High or Medium defects on the original pages**. Real changes:

- Asset caching: images, CSS and JS now carry `Cache-Control` (they revalidated on every visit).
- A test-harness trap: a stale Python server on :4200 made the first run test the wrong server. The dev server moved to :4310 and Playwright now refuses to reuse a running server.
- Regression suite kept: `npm run test:qa`.

Defects found in the *new* Feed work during phase 3 (all fixed, listed as F-01 to F-10 in `01-audit.md`): axe name mismatch on story rings, a contrast failure, a console 401 on the admin page, a layout shift, `[hidden]` overridden by CSS, a clipped tab, an admin crash (array children), and a login limiter that counted successes.

## What was built (phase 3)

- **Feed at `/feed/`**: tabs All, Posts, Stories, Newsletter, Journey; tag filter, search, "load more" (keyset pagination), pinned items, skeleton / empty / error states, RSS, sitemap entries, home page teaser of the latest three items, nav link.
- **Stories**: circular bar, full-screen viewer (tap zones, swipe, hold to pause, progress bars, arrow keys, Esc, focus return, reduced-motion manual advance), 24 h default expiry, highlights.
- **Posts**: markdown-lite, multiple images (alt required) or a video, hashtags, `@mentions` as links, link-preview cards, threads, permalinks with OG tags, reactions (4 emoji, no login), moderated comments, share (copy link, native share).
- **Newsletter**: Markdown articles with cover, reading time, table of contents, code blocks, own page and JSON-LD; double opt-in subscription; send from the admin with a mandatory test send first.
- **Updates + Journey timeline**: typed updates grouped by year, newest first.
- **Admin at `/admin/`**: single-owner login, composer with live preview, drag-and-drop uploads with progress, schedule, draft, edit, delete, pin; moderation queue; subscribers; newsletter send.
- **Data**: Turso (libSQL) + Drizzle, SQL migration, seed script. **Media**: Cloudinary direct upload. **Email**: Resend. Details and the reasoning in `00-discovery.md` and `02-feed-architecture.md`.
- **Security**: server-side auth on every write, CSRF (SameSite=Strict + Origin + custom header), zod on every input, sanitised markdown (11 XSS payloads in unit tests), rate limits on login/reactions/comments/subscribe, honeypots, SSRF-guarded link previews, strict CSP kept.

## Tests

| Suite | Count | Result |
|---|---|---|
| Unit (`npm run test:unit`) | 30 | pass |
| Playwright audit (route x viewport, axe) | 120 | pass |
| Playwright interactions | 12 | pass |
| Playwright Feed e2e (`npm run test:e2e`) | 26 | pass |
| `npm run lint`, `npm run typecheck` | n/a | clean |

Feed e2e covers: viewing the feed, tabs/filter/search/load more, opening a story (keyboard, Esc, reduced motion), permalink + OG, reactions, subscribing (with and without JS, confirm via email link, unsubscribe), honeypot, cross-origin refusal, rate limits, comment moderation (approve and reject), admin auth (anonymous 401 on every admin route, wrong password, cookie flags, CSRF header), creating a post with an image, a story, an update, an article, scheduling, edit, pin, draft privacy, delete, upload validation, newsletter test-then-send.

## Lighthouse before / after (local server, mobile)

| Page | Before | After |
|---|---|---|
| `/` | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 (now includes the feed teaser) |
| work pages | 100 / 100 / 100 / 100 | unchanged |
| `/feed/` (new) | n/a | 98 / 100 / 100 / 100 |
| `/feed/?tab=stories` (new) | n/a | 94 / 100 / 100 / 100 |
| article, permalink (new) | n/a | 99 and 100 / 100 / 100 / 100 |
| `/admin/` (new) | n/a | 100 / 100 / 100 / **SEO 66** |

(Performance / Accessibility / Best practices / SEO.) The only number under 90 is the admin's SEO, on purpose: it is `noindex`. These are local, unthrottled-server numbers; re-run `npm run lh` against the Vercel preview.

## Not verified (can only be checked on a real deployment)

1. **Vercel behaviour.** I could not deploy. Untested: the function's Web-standard `GET`/`POST` exports, the rewrites combined with `trailingSlash: true`, and the `libsql` native module bundling. If any fails on the first preview, the fix is local (rewrite destinations or export style in `api/r.js`).
2. **Live Cloudinary and Resend.** Signing, upload, delivery URLs, the `fl_strip_profile` incoming transformation, and real email delivery have only been exercised through the local adapters. EXIF/GPS removal relies on the browser re-encode (by construction, not asserted by a test).
3. **Browsers.** New features ran on Chromium only (the previous pass covered Firefox and WebKit for the old pages). Swipe and hold-to-pause in the story viewer are implemented but not covered by an automated test.
4. **Sample content.** `npm run db:seed` writes demonstration items. Facts come from the site (projects, roles, the certification) but **dates are relative to the seed day**, and a few lines are my wording. Replace or delete them from `/admin/` before presenting the Feed as yours; do not seed production unless you want them.

## Known limitations

- Sessions are stateless: sign-out clears the cookie but cannot revoke a stolen one (rotate `SESSION_SECRET` to revoke all).
- Reactions are deduplicated per cookie; clearing cookies allows another reaction, bounded by the per-IP limit. Client IP comes from `X-Forwarded-For` (set by Vercel; the local server trusts it so tests can vary it).
- `rate_limits` rows are never pruned (tiny; add a periodic delete if it ever matters).
- Newsletter send is batch-based: if a later batch fails after an earlier one succeeded, the issue is not recorded as sent and a retry would re-send to the first batch.
- Markdown only (MDX needs a build step this site deliberately does not have); no syntax highlighting; no per-post generated OG image (uses the first image, else the site image); video has a text description but no caption track; GPS metadata in uploaded *videos* is not stripped client-side.
- Link previews show title/description only (the CSP blocks remote images) and need public https pages.
- Story avatars and tiles without media show a letter or text excerpt.
- `@mention` links go to GitHub (a decision; change in `lib/markdown.js`).
- The `.gitignore` had an uncommitted trailing-newline change when I arrived; it is included in the Phase 0 commit.

## Recommended next steps

1. Deploy a preview, walk through `/feed/`, `/admin/`, a real upload, a subscribe and a test send; then merge.
2. Replace the seed content with your real first few items.
3. Add a custom sending domain in Resend (SPF/DKIM) before the first real issue.
4. Add a WebVTT caption upload for videos and a generated text-card OG image.
5. Move sessions to a table if you ever want server-side revocation.

## Manual steps for you (in order)

1. Review and merge `feat/qa-and-feed` (or open a PR); Vercel will build a preview.
2. Create a Turso database and token; add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in Vercel (or via the Marketplace integration).
3. Locally, with those two variables set: `npm run db:migrate` (and optionally `npm run db:seed -- --yes` on the new database only).
4. Create a Cloudinary account; add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
5. Create a Resend account, verify a domain (or use `onboarding@resend.dev` for tests to yourself); add `RESEND_API_KEY`, `MAIL_FROM`, `OWNER_EMAIL`.
6. `npm run hash-password -- "your passphrase"` and set `ADMIN_PASSWORD_HASH`; set `SESSION_SECRET` to 32+ random characters.
7. Set `SITE_URL` to the production origin; redeploy; sign in at `/admin/`.
8. Verify on the preview: items 1 and 2 under "Not verified", and re-run `npm run lh` against the preview URL.
9. Submit `https://samriddha-portfolio.vercel.app/sitemap.xml` (now a sitemap index) to Search Console if you use it.
