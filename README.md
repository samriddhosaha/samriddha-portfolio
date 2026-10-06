# Samriddha Saha — portfolio

Static one-page portfolio plus four proof pages. Plain HTML, CSS and vanilla JS. No framework, no bundler, no runtime dependencies, no trackers. Hosted on Vercel at https://samriddha-portfolio.vercel.app.

## Structure

```
index.html                 home: hero, work, experience, toolkit, about, contact
work/<slug>/index.html     proof pages: event-pricing, ola-cancellations, data-warehouse, job-market
assets/css/site.css        the one stylesheet (nojs.css loads only when JavaScript is off)
assets/js/site.js          menu, runtime email + copy button, scroll-spy, footer year
assets/fonts/              self-hosted WOFF2 (Fraunces, Space Grotesk, JetBrains Mono), latin subset
assets/img/                OG image, icons; work/<slug>/ holds project figures
case-studies/event-pricing/ code for the synthetic case study (Python)
tools/                     dev-only scripts (audit, Lighthouse, OG/icon renderer); not deployed
audit/                     baseline and after measurements
404.html, vercel.json, sitemap.xml, robots.txt, site.webmanifest, favicon.svg
```

## Run locally

```
python -m http.server 4200      # then open http://localhost:4200
```

Links are root-relative (`/assets/...`), so serve from the repo root.

## Deploy

Vercel serves the repo root as a static site (no build command). `vercel.json` sets clean URLs, trailing slashes, a strict Content-Security-Policy and other security headers. Because the CSP allows only same-origin scripts and styles, do not add inline `<style>`, `style=""` or inline `<script>`.

## Edit content

- **Text**: edit `index.html` or `work/<slug>/index.html` directly. Search for `TODO(owner)` to find open gaps; see `NEEDS_INPUT.md`.
- **Résumé**: put the PDF at `assets/Samriddha-Saha-Resume.pdf` and uncomment the two marked blocks in `index.html`.
- **New project**: copy a `work/<slug>/` page, add a card to the Work section of `index.html`, add the URL to `sitemap.xml`.
- **Images**: WebP, SVG or AVIF with `width`, `height`, `alt` and `loading="lazy"`.
- **Fonts**: only the weights declared at the top of `site.css` are shipped; add a weight only if used.
- **Colours**: vermilion is for rules, large type and emphasis; small text uses ink or green (contrast checked).

## Dev tooling (not part of the site)

```
npm i --no-save playwright @axe-core/playwright lighthouse html-validate linkinator
npx playwright install chromium firefox webkit
node tools/audit.cjs http://localhost:4200 audit/after     # layouts, axe, keyboard, JS-off, print, transfer
node tools/interact.cjs http://localhost:4200              # menu, copy, scroll-spy in 3 browsers
sh tools/lh.sh http://localhost:4200/ audit/after home     # Lighthouse mobile + desktop
node tools/render-assets.cjs                               # regenerate og.png and icons
```

## Renaming `master` to `main`

Not done here because it affects Vercel. Steps: rename the branch on GitHub (Settings > Branches), then locally `git branch -m master main && git fetch origin && git branch -u origin/main main`, and in Vercel (Project > Settings > Git) set the production branch to `main`. GitHub links in the site use `HEAD` or explicit `main` paths of other repos, so none need changing.
