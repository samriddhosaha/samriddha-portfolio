# Phase 0: Discovery

Branch `feat/qa-and-feed`. No code changed in this phase.

## Stack today

| Area | What exists |
|---|---|
| Framework | None. Hand-written static HTML, one stylesheet, one vanilla JS file. No `package.json`, no bundler, no build command. |
| Hosting | Vercel serves the repo root as a static site. `vercel.json`: `cleanUrls`, `trailingSlash`, security headers, strict CSP. |
| Routes | `/`, `/work/{event-pricing,ola-cancellations,data-warehouse,job-market}/`, `404.html` |
| Styling | `assets/css/site.css` (one file, CSS custom properties, no preprocessor). `nojs.css` loads only inside `<noscript>`. |
| JS | `assets/js/site.js`: footer year, mobile menu, runtime-assembled email, copy button, scroll-spy. No dependencies. |
| Fonts | Self-hosted WOFF2 (Fraunces, Space Grotesk, JetBrains Mono), `font-display: swap`, metric-matched fallbacks, two preloads. |
| Images | WebP/SVG with width/height/alt/lazy. OG image and icon set rendered by `tools/render-assets.cjs`. |
| QA tooling | `tools/*.cjs` (Playwright, axe, Lighthouse, CSP check), run with `npm i --no-save`. Prior results in `audit/after/`. |
| Data sources | None. All content is hard-coded in HTML. |

Last measured (previous overhaul, `audit/after/`): Lighthouse mobile 98 to 99 performance, 100 for accessibility, best-practices and SEO; axe clean; no horizontal overflow at 360 to 1440.

## Design language (reuse, do not restyle)

- **Editorial / brutalist-paper**: off-white paper `#f5f2ec`, ink `#111`, secondary paper `#ece7dc`, vermilion accent `#c1401f` (rules, large type, emphasis only), green `#1f4a3d` for small labels, muted `#5b5648`.
- **Type**: Fraunces (serif, 500 to 900) for headings, Space Grotesk for body, JetBrains Mono uppercase for labels and metadata.
- **Shape**: square corners, 2px solid ink borders, hard dividers between sections, no shadows, no gradients.
- **Layout**: `.wrap` max 1280px, `--pad` 32px (20px under 640px), sections 80px vertical (56px on mobile), sticky 82px header, `scroll-padding-top` accounts for it.
- **Motion**: only 0.2s colour/border transitions. `prefers-reduced-motion` already honoured. No scroll-reveal.
- **Controls**: 44 to 48px tap targets, 3px vermilion focus ring, skip link.
- **Constraint worth knowing**: CSP is `script-src 'self'; style-src 'self'; form-action 'none'; img-src 'self' data:`. No inline script or style, no `style=""`. The Feed has to live inside this (see below).

## What the brief asks vs. what the stack allows

The brief wants a database, auth, uploads, email, rate limiting and server-rendered permalink pages with OG tags. A pure static site cannot do any of that, and the brief says not to introduce a new framework. Reconciling the two:

**Decision: keep the static site as is. Add Vercel Functions (plain Node, ESM, Web-standard `Request`/`Response`) under `/api`, and server-render the Feed pages from them using the same CSS.** Vercel supports this with zero framework and no build step. The existing pages are untouched.

## Choices (all free-tier)

| Need | Choice | Why |
|---|---|---|
| Database | **Turso (libSQL/SQLite)** | Free tier is generous. `@libsql/client` also opens a plain local `file:` database, so dev, unit tests and Playwright e2e run with no account or network. Neon would need a cloud DB (or a Postgres emulator) just to run tests. |
| ORM / migrations | **Drizzle ORM + drizzle-kit** | Typed, thin, SQL migrations checked in. |
| Auth | **Single owner, env credentials**: `ADMIN_PASSWORD_HASH` (scrypt) + `SESSION_SECRET`; HMAC-signed `HttpOnly; Secure; SameSite=Strict` cookie. | Auth.js needs a framework runtime and a provider; this is ~60 lines of `node:crypto`, no sign-ups exist to attack. All write endpoints check the cookie server-side. |
| CSRF | `SameSite=Strict` + `Origin` check + required custom header on every state-changing request. | No extra dependency. |
| Rate limiting | Counter table in the same database (keyed by hashed IP + action). | Serverless instances share no memory; no Upstash account needed. |
| Media | **Cloudinary** (signed direct upload from the admin page). | Browsers upload straight to Cloudinary, so Vercel's 4.5 MB body limit does not apply to 100 MB videos. No browser bundle or SDK needed (plain `XMLHttpRequest` gives upload progress). Delivery URLs give responsive sizes, video posters and thumbnails for free, and metadata is stripped (incoming transformation `fl_strip_profile`). Vercel Blob's client upload needs an npm module in the browser, which this no-bundler site cannot use. |
| Local media in dev/test | Disk adapter writing to `.data/uploads`, used only when Cloudinary env vars are absent and `NODE_ENV !== production`. | Lets e2e tests cover upload with no account. |
| Email | **Resend** over `fetch` (no SDK). | Free tier, one HTTP call. Double opt-in with signed tokens, one-click unsubscribe. |
| Markdown | `markdown-it` with raw HTML disabled, then `sanitize-html`; rendered server-side and stored. | No XSS path; no client-side renderer needed under the CSP. "MDX" is out: it needs a build step. Articles are Markdown. |
| Local/CI server | `dev/server.mjs`: ~80-line Node server that serves the static files and applies `vercel.json` rewrites to `/api/*.js`. | `vercel dev` requires a Vercel login and linked project. This reads the same `vercel.json`, so rewrites cannot drift. |
| Tests | Playwright (`@playwright/test`) for audit and e2e; Node's built-in `node:test` for unit tests. | No Jest/Vitest dependency. |

## Constraints and risks I am carrying forward

1. **Function count.** Vercel Hobby allows 12 functions. One router function (`api/r.js`) behind rewrites keeps this at 1.
2. **CSP changes.** The Feed adds `https://res.cloudinary.com` to `img-src` and `media-src`. The admin routes additionally allow `connect-src https://api.cloudinary.com`. Public pages keep `form-action 'self'` only where a no-JS form needs it (subscribe, comment), otherwise unchanged.
3. **I cannot deploy from here.** I verify with the local emulator and Playwright. Vercel-specific behaviour (rewrites with trailing slash, function cold starts, Cloudinary and Resend live calls) can only be confirmed on a Vercel preview. It will be listed under manual steps.
4. **Package.json will now exist.** Vercel will run `npm install` for the functions. The static pages still ship zero JS dependencies; the README line "no runtime dependencies" gets reworded to say the static site has none and only `/api` does.
5. **Prior QA is not discarded.** `audit/` and `tools/` stay. Phase 1 adds the Playwright spec you asked for (8 viewports, console/network capture, interaction tests) and measures what the earlier pass did not.
6. **Uncommitted change on arrival:** `.gitignore` had a trailing-newline-only edit. It is kept and extended.
