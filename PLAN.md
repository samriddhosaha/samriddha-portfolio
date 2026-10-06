# Plan and assumptions

Branch `portfolio-overhaul`, small commits, nothing pushed, `master` untouched.

## Assumptions (inputs left blank)
- Target role: Senior Business Analyst / analytics consulting. Audience: recruiters on a phone.
- Event names: kept as on the old page (default) and flagged first in NEEDS_INPUT.md. The hero line is the neutral option.
- Résumé: "add later", so the button is a commented block, not a dead link.
- Screenshots: real ones pulled from your three GitHub repos. Course-looking diagrams were not used.
- Flagship case study: built (default yes), labelled synthetic everywhere.
- Language: US spelling, "Mon YYYY" dates, location stated once on the page.

## Phases
0. Baseline in `audit/baseline/`: Lighthouse mobile and desktop, axe, layout at 5 widths, keyboard, JS-off, reduced motion, print PDF, HTML validation, link check.
1. Fix-first: CSS/JS split, self-hosted fonts, P0/P1/P2 items.
2. Structure and copy.
3. Proof pages (`work/<slug>/`).
4. Synthetic case study (`case-studies/event-pricing/`).
5. QA in `audit/after/`, docs.

## Decisions worth knowing
- CSS and JS moved to files so a strict CSP (no `unsafe-inline`) works. No inline styles anywhere.
- `.reveal` removed rather than made fail-open; content is always visible.
- No-JS: `nojs.css` (via `<noscript>`) keeps the nav usable on mobile; the email shows as "name [at] domain [dot] com".
- Fallback font metrics were computed from glyph widths against Georgia, Arial and Courier New.
- Commits are grouped by area, not strictly P0/P1/P2, because the rewrite touched the same files.
- The proof-page HTML was produced by a throwaway script reading the case-study outputs (so figures are never retyped); the script is not in the repo and the pages are plain static files to edit by hand.
