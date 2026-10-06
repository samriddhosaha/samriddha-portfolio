# Portfolio overhaul

Branch `portfolio-overhaul` into `master`. Not pushed; no history rewritten.

## Summary
- Rebuilt the one-page site around proof: selected work first, four proof pages with real figures, a clearly labelled synthetic case study.
- Fixed credibility issues (dead notes, phone number, no résumé slot, contradictory dates), accessibility (axe 2 -> 0), and performance (mobile Lighthouse 85 -> 98 to 99).
- Self-hosted fonts, strict CSP, SEO and sharing metadata, 404, sitemap, `vercel.json`.

See `CHANGELOG.md` for the measured before/after table and `NEEDS_INPUT.md` for what only you can supply.

## Before merging
1. Answer NEEDS_INPUT #1 (can you name the events?) and #8 (project provenance).
2. Add the résumé PDF and uncomment the two blocks (#2).
3. Read the synthetic case study and tick the checklist (#13).

## After merging
- Verify security headers and clean URLs on the live site; re-scrape the LinkedIn preview.
- Rename `master` to `main` (README steps).

## Test plan (done locally)
- Lighthouse mobile and desktop, axe at 390 and 1440, layout at 360/390/768/1024/1440, keyboard pass, JS off, reduced motion, print PDF.
- Chromium, Firefox and WebKit via Playwright: menu, Escape, focus return, scroll-spy, email assembly, no console errors (30 checks pass), plus a CSP-injection run; copy button checked in Chromium.
- Not done: live deployment checks, Lighthouse in Firefox/WebKit.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
