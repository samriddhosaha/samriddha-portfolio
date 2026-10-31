# Phase 1 + 2: QA audit

Method: `tests/audit.spec.ts` (every route x 8 viewports: 320x568, 375x667, 390x844, 768x1024, 1024x768, 1280x800, 1440x900, 1920x1080), `tests/interactions.spec.ts`, Lighthouse (`tools/lh-run.mjs`, mobile + desktop) and axe (WCAG 2.2 AA + best-practice at 390 and 1440). Run against `dev/server.mjs`, which applies `vercel.json` headers including the CSP, so a CSP violation shows up as a console error. Screenshots land in `qa/screenshots/` (git-ignored; regenerate with `npm run test:qa`). I viewed home at 320 and 1920 by eye.

Checked per route and viewport: horizontal overflow, elements outside the viewport, truncated text, broken or alt-less images, console errors and warnings, failed requests and HTTP >= 400, layout shift (< 0.1), tap targets >= 44px, one `h1` and no skipped heading levels, landmarks, axe.
Interactions: anchor links vs. sticky header, mobile menu open/close/Escape/focus return, skip link, external link `target`/`rel`, internal link status, visible focus ring on 45 tab stops, `prefers-reduced-motion`, hover state, copy-email button, 404 page, SEO/OG tags.
Not applicable on this site today: forms and a theme toggle (the contact is a runtime-assembled `mailto:`). Forms arrive with the Feed and are covered in `tests/feed.spec.ts`.

## Result

The existing site was already in good shape (a prior overhaul is recorded in `audit/`). The audit found no Critical, High or Medium defects.

| ID | Page/Section | Viewport | Severity | Description | Screenshot | Fix status |
|---|---|---|---|---|---|---|
| A-01 | All static assets | all | Low | Images, CSS and JS had no `Cache-Control` (Vercel default is `max-age=0, must-revalidate`), so every repeat visit revalidates ~200 KB. Fonts were already immutable. | n/a (header) | Fixed: `vercel.json` sets `max-age=86400, stale-while-revalidate=604800` for `/assets/{img,css,js}/` (filenames are not hashed, so not `immutable`). |
| A-02 | Work pages | all | Low | Lighthouse "unused CSS rules": the single shared stylesheet (17 KB) carries home-page rules. | n/a | Won't fix: one cached file beats per-page CSS at this size; score is 100. |
| A-03 | Home, sitemap | all | Low | `sitemap.xml` has no `lastmod`. | n/a | Left: Google ignores it unless accurate. Feed URLs get real dates (Phase 3). |
| A-04 | Test harness | n/a | n/a | Not a site bug: a stale `python -m http.server` held port 4200, so the first run tested the wrong server. | n/a | Dev server moved to :4310; Playwright now refuses to reuse a running server. |

## Before / after

| Check | Before (this audit's first clean run) | After |
|---|---|---|
| Route x viewport tests (48) | 48 pass | 48 pass |
| Interaction tests (12) | 12 pass | 12 pass |
| axe violations (WCAG 2.2 AA + best practice) | 0 | 0 |
| Lighthouse, 5 routes x mobile/desktop | 100 / 100 / 100 / 100 (perf, a11y, best practices, SEO) | unchanged |

Full Lighthouse table: `qa/lighthouse-before.md` (local server, so network-dependent insights such as caching and document latency are not representative; run it against the Vercel preview for a field-like number).

Regression suite: `npm run test:qa` (audit) and `npx playwright test` (everything). Feed routes are added to `tests/routes.ts` in Phase 3.

## Phase 3 re-audit (Feed and admin added to the suite)

The Feed routes (`/feed/`, four tabs, an article, a post permalink resolved at runtime, a notice page, `/admin/`) now run through the same 8-viewport audit, axe, interaction and Lighthouse checks. Everything below was found by the suite, by reading screenshots, or by review while building, and fixed before this commit.

| ID | Page/Section | Viewport | Severity | Description | Screenshot | Fix status |
|---|---|---|---|---|---|---|
| F-01 | /feed/ story bar, Stories tab tiles | 390, 1440 | Medium | axe `label-content-name-mismatch`: `aria-label` did not contain the visible text (the avatar letter, the tile text). | `qa/screenshots/feed-390.png` | Fixed: no `aria-label`; name comes from content plus hidden "stories, N items" text. |
| F-02 | /feed/post/:id/ pinned label | 1440 | Medium | axe `color-contrast`: vermilion "Pinned" on the highlighted card background (about 4.2:1). | `qa/screenshots/post-1440.png` | Fixed: label inherits the green meta colour. |
| F-03 | /admin/ | all | Low | Anonymous visit logged a 401 for the session probe (console error + failed request). | `qa/screenshots/admin-1440.png` | Fixed: `GET /api/admin/me/` returns 200 `{authenticated}`. |
| F-04 | /admin/ | 320 | Medium | Layout shift 0.194 when "Loading…" was replaced by the login form. | `qa/screenshots/admin-320.png` | Fixed: container reserves `min-height: 70vh`. |
| F-05 | Admin composer | 1280 | Medium | `[hidden]` was overridden by `.field{display:grid}`, so Title, URL slug and Update type showed for every type. Found by looking at the screenshot. | `qa/screenshots/zz-admin-1280.png` | Fixed: global `[hidden]{display:none !important}`. |
| F-06 | /feed/ tabs | 390 | Low | "Newsletter" tab clipped inside a horizontal scroller. | `qa/screenshots/feed_tab_journey-390.png` | Fixed: tabs wrap in a grid. |
| F-07 | Admin app | all | High | `h()` DOM helper did not accept arrays of children, so the admin crashed after login (caught by the e2e login test). | n/a | Fixed. |
| F-08 | Admin login | n/a | Medium | The login rate limiter counted successful logins, so the owner could lock themselves out after 10 sign-ins in 15 minutes. | n/a | Fixed: success resets the counter; only failures accumulate. |
| F-09 | /admin/ | all | Info | Lighthouse SEO 66 (`is-crawlable`). | n/a | By design: the admin is `noindex` and disallowed in `robots.txt`. |
| F-10 | /feed/ Stories tab | mobile | Low | Lighthouse performance 94 (others 96 to 100): seeded sample images are the unscaled static WebP/SVG from the project pages. | n/a | Accepted: images uploaded through Cloudinary are served resized with `srcset`. |

### Lighthouse after (local server, mobile + desktop)

`qa/lighthouse-after.md`. Accessibility, best practices and SEO are 100 on every page except `/admin/` SEO (F-09). Performance is 94 to 100; LCP 1.1 to 2.0 s on mobile emulation; CLS at most 0.018.

| Page | Mobile perf | Desktop perf |
|---|---|---|
| `/` (with feed teaser) | 100 | 100 |
| `/feed/` | 98 | 100 |
| `/feed/?tab=journey` | 96 | 100 |
| `/feed/?tab=stories` | 94 | 100 |
| `/feed/newsletter/why-i-label-synthetic-data/` | 99 | 100 |
| `/feed/post/:id/` | 100 | 100 |
| `/admin/` | 100 | 100 |

Final suite state: 158 Playwright tests (audit: 15 routes including the 404 page x 8 viewports = 120; interactions 12; Feed e2e 26) and 30 unit tests pass; lint and type-check are clean.
