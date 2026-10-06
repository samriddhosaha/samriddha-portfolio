# Changelog: portfolio overhaul

All numbers are from real runs saved in `audit/baseline/` (original `index.html` from `master`) and `audit/after/`. Both were served locally by a plain static server on this machine, with Lighthouse using its default mobile and desktop throttling and Playwright Chromium. The "after (compressed)" rows use the `serve` package, which gzips responses like Vercel does; the baseline was not re-measured with compression. Live Vercel was not measured.

## Before and after

| Measure | Before | After |
|---|---|---|
| Lighthouse mobile (perf / a11y / best practices / SEO), home | 85 / 95 / 96 / 100 | 98 / 100 / 100 / 100 (uncompressed), 99 / 100 / 100 / 100 (compressed) |
| Lighthouse desktop, home | 96 / 92 / 96 / 100 | 100 / 100 / 100 / 100 |
| LCP, throttled mobile, home | 3.3 s | 2.2 s uncompressed (**misses the 2.0 s target**), 1.7 to 1.8 s compressed (3 runs) |
| CLS, mobile | 0 | 0 |
| Proof pages, Lighthouse mobile perf (event-pricing, job-market) | n/a | 99, 99 (LCP 1.8 s, 1.9 s, uncompressed) |
| First-load transfer excluding images, 390 px | 190,340 B | 146,254 B (uncompressed); images are lazy |
| Third-party requests | 2 hosts (Google Fonts) | 0 |
| axe violations, home at 390 and 1440 px | 2 (color-contrast, region) | 0; also 0 on all four proof pages |
| Text contrast "Email me" button | 3.62:1 | paper on vermilion, 4.67:1 |
| Tab stops before main content | 7, no skip link | skip link is the first stop; links are 44 px tall |
| Dead `href="#"` links | 3 | 0 |
| Print before scrolling: hidden blocks | 5 of 5 | 0, with `@media print` |
| JS off, home: visible text | 3,755 chars (no notes, year blank) | 4,366 chars; nav usable on mobile; email fallback shown |
| Phone number on page | public | removed |
| Images on home | 0 | 4 (WebP and SVG, with width, height, alt, lazy) |
| HTML validation (html-validate recommended) | 8 errors | 1: title is 74 characters, over the 70-character style rule; kept as specified |
| Console errors (3 browsers) | 0 | 0, also with the vercel.json CSP injected |
| Link check, local | 6 links OK | all local links OK; the 11 failures are production URLs and the GitHub `case-studies` path that exist only after merge and deploy |
| Page structure | one file, 541 lines, inline CSS and JS | `index.html` + 1 CSS + 1 JS + 4 proof pages |

## Targets not fully met, or not verifiable here
- LCP under 2.0 s: met only with compression (1.7 to 1.8 s). Uncompressed local serving gives 2.2 s. Expect Vercel (brotli) to land with the compressed numbers, unverified.
- `vercel.json` itself could not be tested without deploying. The CSP from it was injected into every response in Playwright (`tools/csp-check.cjs`): 0 violations on all pages. Whether Vercel sends the headers and clean URLs as configured is **untested; check after deploy**.
- Firefox and WebKit: layout (no overflow at 5 widths), axe and the behaviour checks pass. Lighthouse is Chromium only.
- Lighthouse for `ola-cancellations` and `data-warehouse` pages was not run; axe and layout were.

## What changed

**P0**
- Removed the Thoughts section, nav link and three `url:"#"` notes.
- Résumé slot prepared (commented, activates with the PDF); phone removed; email built at runtime with a copy button and a `[at]` fallback.
- Each project now has a visual and a proof page.
- Contact button: paper text on vermilion.

**P1**
- Skip link; contact inside `<main>`; menu closes on Escape and returns focus; menu is anchored under the header instead of a hard-coded 65 px; 44 px tap targets.
- Inline SVG icons; arrows hidden from assistive tech; "(opens in new tab)" for screen readers.
- Hover text contrast fixed by using ink and green for small text on the tinted row.
- Content is plain HTML; `.reveal` removed; static year fallback; `@media print`; scroll-spy with `aria-current`.

**P2**
- CSS: unscoped `.mark`; nav padding follows the page gutter; no `transition: all`; no `padding-left` animation; `--line` removed; no inline styles.
- Fonts: Google Fonts removed; 9 subset WOFF2 files (about 102 KB), only used weights, two preloaded, metric-matched fallbacks.
- SEO: title, description (135 chars), canonical, Open Graph and Twitter tags with a rendered 1200 x 630 image, JSON-LD (`Person`, `WebSite`, no phone or email), favicon set, manifest, `theme-color`, sitemap, robots, 404, `vercel.json` (clean URLs, CSP, nosniff, referrer, permissions, frame headers).
- README, PLAN, NEEDS_INPUT, PR.

**Structure and copy**: Hero (value line, proof strip, CTAs) -> Work -> Experience -> Toolkit -> About with Education and Certifications -> Contact. Bullets merged and rewritten, US spelling, one date style, location once, skills in five groups (every skill kept), About keeps your two voice paragraphs.

**Proof pages**: Ola (real numbers read from your dashboard), data warehouse, job market (credits the course dataset), and the synthetic event-pricing case study with code in `case-studies/event-pricing/`.

## Facts I touched that you should check
- Ola card: "projected to cut cancellations by ~10%" became a description of the 28% cancellation rate; the README calls 10% a target.
- Job-market and warehouse dates (Nov 2024, Feb 2025) and "Jan 2025" for Ola are from the old page; the Ola dataset is July 2024.
- "Built Oct 2026" and "Last updated 6 Oct 2026" on proof pages use today's date.
