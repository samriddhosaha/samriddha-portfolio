# Samriddha Saha — portfolio

A static one-page portfolio plus four proof pages (plain HTML, CSS and vanilla JS, no framework, no bundler, no trackers), and a **Feed** at `/feed/` (posts, stories, newsletter, journey timeline) with an owner-only admin at `/admin/`. The Feed is server-rendered by one Vercel Function; the static pages stay dependency-free. Hosted on Vercel at https://samriddha-portfolio.vercel.app.

## Structure

```
index.html                 home: hero, work, experience, toolkit, about, feed teaser, contact
work/<slug>/index.html     proof pages: event-pricing, ola-cancellations, data-warehouse, job-market
assets/css/site.css        the site stylesheet (nojs.css loads only when JavaScript is off)
assets/css/feed.css        Feed + admin styles (same design tokens)
assets/js/site.js          menu, runtime email + copy button, scroll-spy
assets/js/feed.js          reactions, share, forms, load more, home teaser
assets/js/stories.js       story viewer      assets/js/admin.js   admin composer
api/r.js                   the single Vercel Function; vercel.json rewrites /feed/*, /admin/*, /api/* to it
lib/                       router, public + admin handlers, data layer (Drizzle), markdown sanitiser, auth, media, mail
drizzle/                   SQL migrations      scripts/   migrate, seed, hash-password
dev/server.mjs             local stand-in for Vercel (static files + vercel.json headers/rewrites + the function)
tests/                     unit (node:test), Playwright audit + interactions + Feed e2e
tools/                     older dev scripts (audit, Lighthouse, OG/icon renderer); not deployed
docs/                      00-discovery, 01-audit, 02-feed-architecture, 03-summary
audit/, qa/                earlier measurements; qa/ holds the Lighthouse tables from this pass
404.html, vercel.json, sitemap.xml (index), sitemap-pages.xml, robots.txt, site.webmanifest, favicon.svg
```

## Run locally

```
npm install
npm run db:migrate         # creates .data/dev.db (SQLite file; no account needed)
npm run db:seed            # optional: sample posts, stories, articles, updates
ADMIN_PASSWORD=change-me npm run dev      # http://localhost:4310  (admin at /admin/)
```

With no environment variables: the database is a local file, uploads go to `.data/uploads`, and emails are written to `.data/outbox.jsonl` (open it to find confirmation links). `ADMIN_PASSWORD` is honoured only outside production. Serve from the repo root; links are root-relative (`/assets/...`).

Why not `vercel dev`? It needs a Vercel login and a linked project. `dev/server.mjs` reads the same `vercel.json`, so headers (including the CSP) and rewrites cannot drift.

## Tests

```
npm run lint          # ESLint
npm run typecheck     # tsc over the TypeScript tests
npm run test:unit     # validators, markdown XSS, auth, SSRF guard, data layer, rate limiter
npm run test:qa       # every route x 8 viewports (320 to 1920): overflow, clipping, tap targets, console/network errors, CLS, headings, axe; plus interactions
npm run test:e2e      # Feed: stories, subscribe (double opt-in), comments + moderation, admin login, create each type, newsletter, CSRF, rate limits
npm test              # unit + everything in Playwright
npm run lh            # Lighthouse mobile + desktop (LH_ROUTES="/,/feed/" node tools/lh-run.mjs; set MSYS_NO_PATHCONV=1 in Git Bash)
```

Playwright starts its own server on :4310 with a freshly migrated and seeded `.data/test.db`, and refuses to reuse a server that is already running.

## Deploy to Vercel

1. **Push the branch / merge to `master`.** Vercel serves the static files and builds `api/r.js` (no build command; `npm install` runs automatically).
2. **Database.** Create a Turso database (`turso db create portfolio-feed`, `turso db tokens create portfolio-feed`) or add Turso from *Vercel Dashboard > Storage / Marketplace*. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
3. **Run migrations once from your machine** with those two variables set: `npm run db:migrate`. Optional sample content: `npm run db:seed -- --yes` (wipes feed tables first, so only on a new database).
4. **Media.** Create a free Cloudinary account and set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
5. **Email.** Create a Resend account, verify a sending domain (or test with `onboarding@resend.dev` to yourself), set `RESEND_API_KEY`, `MAIL_FROM`, `OWNER_EMAIL`.
6. **Owner login.** `npm run hash-password -- "a passphrase of 12+ chars"` and put the output in `ADMIN_PASSWORD_HASH`. Set `SESSION_SECRET` to 32+ random characters (rotate it to sign out all sessions).
7. Set `SITE_URL` to the production origin, redeploy, open `/admin/`.

Every variable is documented in `.env.example`. Do not add inline `<style>`, `style=""` or inline `<script>`: the CSP (`vercel.json`) allows only same-origin scripts and styles. It additionally allows `res.cloudinary.com` for images and video and `api.cloudinary.com` for uploads.

## How to post

Open `/admin/` and sign in.

- **Post**: up to 1000 characters of markdown-lite (`**bold**`, `*italic*`, `` `code` ``, links, `#tags`, `@name` links to GitHub), up to 12 images (alt text required) or one video. To make a thread, pick the post you are continuing under *Continue a thread*.
- **Story**: one image, video or a text card (pick a background). Expires after 24 hours (editable) unless you choose a highlight or type a new highlight name to pin it for good.
- **Article (newsletter)**: Markdown with a title, optional slug, cover (first image), table of contents from `##`/`###`, fenced code, images from your uploads, `::video[description](url)` on its own line. Reading time is computed.
- **Update**: a headline, a type (new role, project shipped, certification, talk, learning, life) and text; it appears on the Journey timeline.
- **Schedule**: set *Publish at* in the future; it goes live automatically (no cron needed). **Draft**: *Save draft*. **Pin**: from the Posts list.
- **Comments** are hidden until you approve them under *Comments*. **Newsletter**: *Newsletter* tab > *Send test to me*, then *Send to subscribers* (once per issue).

## Edit the static content

- **Text**: edit `index.html` or `work/<slug>/index.html` directly. Search for `TODO(owner)` to find open gaps; see `NEEDS_INPUT.md`.
- **Résumé**: put the PDF at `assets/Samriddha-Saha-Resume.pdf` and uncomment the two marked blocks in `index.html`.
- **New project**: copy a `work/<slug>/` page, add a card to the Work section of `index.html`, add the URL to `sitemap-pages.xml`.
- **Images**: WebP, SVG or AVIF with `width`, `height`, `alt` and `loading="lazy"`.
- **Fonts**: only the weights declared at the top of `site.css` are shipped; add a weight only if used.
- **Colours**: vermilion is for rules, large type and emphasis; small text uses ink or green (contrast checked).

## Renaming `master` to `main`

Not done here because it affects Vercel. Steps: rename the branch on GitHub (Settings > Branches), then locally `git branch -m master main && git fetch origin && git branch -u origin/main main`, and in Vercel (Project > Settings > Git) set the production branch to `main`. GitHub links in the site use `HEAD` or explicit `main` paths of other repos, so none need changing.
