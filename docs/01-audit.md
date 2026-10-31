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
