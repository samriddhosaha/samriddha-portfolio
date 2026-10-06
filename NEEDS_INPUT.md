# Needs your input (highest impact first)

Each item names the exact location and what to do once answered. Nothing below is shown as a placeholder on the page; gaps are `TODO(owner)` comments (`grep -rn "TODO(owner)" .`).

## 1. Clearance to name FIFA World Cup 2026 and LA 2028 (and your target role)

Default applied: wording kept as it was. The hero sentence is the neutral option, so only two places name the events.

If **not cleared**, replace with "major international sporting events" in:
- `index.html` hero proof strip: `<strong>FIFA World Cup 2026 and LA 2028</strong>` -> `<strong>Major international sporting events</strong>`
- `index.html` Experience, first Accordion bullet: "for FIFA World Cup 2026 and LA 2028" -> "for major international sporting events"
- `audit/baseline/` holds screenshots of the original page, which names the events. It is excluded from the Vercel deploy by `.vercelignore` but is visible in the GitHub repo. Delete the folder if needed.

Also tell me: target role (assumed Senior Business Analyst / analytics consulting) and one sentence for About: "I'm looking for [roles / problems]." (comment in About).

## 2. Résumé PDF

Not supplied, so no dead link is shipped. Save it as `assets/Samriddha-Saha-Resume.pdf`, then uncomment the two `TODO(owner)` blocks in `index.html` (hero and contact).

## 3. Screenshots

Used real figures from your repos: the Ola Cancellation page and the job-market charts. The warehouse figure is a diagram I drew from your README (no course diagrams used). To add more, drop files in and add one `<figure>` line:
- `assets/img/work/ola-cancellations/overview.webp`, `vehicle-type.webp`, `revenue.webp`, `ratings.webp`: 1262 x 705 (your repo has `Page-1..5.PNG`). **Page 1 labels a "35M" tile as "Total Bookings", which looks like a labelling error; fix the report before showing it.**
- `assets/img/work/data-warehouse/data-model.webp`: your own star-schema diagram, if you drew it (the repo's `docs/data_model.png` may come from a course template).
- Optional: a published Power BI or Tableau version of the event-pricing outputs.

## 4. Numbers for the bullets

Shipped without brackets. Better versions once you supply numbers (edit in `index.html`, Experience):
- Accordion 1: "Built ticket-pricing and revenue-forecast models for FIFA World Cup 2026 and LA 2028, segmenting demand by [match tier / buyer type / market] to [set prices / size revenue at risk]. [Forecast vs actual: within X%.]"
- Accordion 2: "Built CRM and HR dashboards for [N] leaders, replacing [manual reports] and giving [weekly / real-time] visibility into [pipeline stages / attrition]. [One decision it changed.]"
- Accordion 3: "Identified [N] revenue levers worth [$ or %] and put them on an executive KPI dashboard used in [forum / cadence]."
- Accordion 4: "Turned ambiguous requests into agreed KPI definitions and a metric dictionary signed off by [teams]."
- Deloitte 1: "Automated [report] in Python (pandas), cutting [X h] to [Y h] per [cycle] (-80%) and removing [type of] errors."
- Deloitte 2: "Built Power BI dashboards tracking KPIs and delivery for [N] projects, used by [audience] to [decision]."
- Deloitte 3: "Led a [N-person] cross-functional initiative to [goal], delivering [result] by [date]."
- Deloitte 4: "Coordinated the [system] upgrade for [N users / sites], [with minimal downtime]."

## 5. Education and certifications

Comments in About. Education: branch and graduation year. Each certificate: year, verify link (Credly or freeCodeCamp), and for Microsoft the **valid-through date** (associate certifications expire yearly). The hero proof strip says "Microsoft Certified"; remove it if the certification has lapsed.

## 6. Skills with no visible evidence

Snowflake, AWS, Azure, Tableau, VBA, Power Automate. All kept; none appears in a role or project. Keep only those you could discuss for ten minutes (comment above the Toolkit grid).

## 7. Hero line

Shipped: **B** "I turn operational data into forecasts, pricing models and dashboards that leaders use to decide." Alternatives:
- A (only if cleared): "I build the pricing models, forecasts and dashboards leaders use to decide, most recently for the FIFA World Cup 2026 and LA 2028."
- C (plain): "I help teams decide with data: revenue forecasting, pricing analytics and BI dashboards."

## 8. Project provenance (please answer; I did not guess)

- **Ola**: dataset source? Course or self-initiated? I changed "projected to cut cancellations by ~10%" to what the README says: 10% is a **target**. The page's "what I'd do next" shows illustrative arithmetic from dashboard numbers (about 10,500 customer cancellations, 55.7% pickup-related; halving them is about a 10% relative drop). Check you are comfortable with it. The Power BI link carries a tenant id; confirm it opens for people outside your organisation.
- **Data warehouse**: the README reads like a public course template (Notion steps, "excellent resource for professionals and students"). If it follows a course, add a "what I changed or extended" paragraph (comment in the page). Card date "Feb 2025" kept from the old page.
- **Job market**: the README says the dataset and course are Luke Barousse's; the page says so. Tell me what else you changed. README inconsistencies to fix at source: the text says "United States" while the code filters India, and salaries are quoted in both $ and ₹.

## 9. Name spelling

Site says "Samriddha"; email and GitHub say "Samriddho". If you want search to match both, confirm and I add `alternateName` to the JSON-LD in `index.html`.

## 10. Analytics

None added. Proposal: Vercel Web Analytics (cookie-free, one toggle) or Plausible. Either needs a CSP change (`script-src` / `connect-src`) in `vercel.json`.

## 11. Writing section

Removed. Restore only with at least two real, dated notes, each on its own page. Ideas without client information: why KPI dashboards fail without a shared metric definition; medallion architecture explained through your warehouse.

## 12. Deployment checks (after merge)

- Rename `master` to `main` (steps in `README.md`).
- Check the security headers on the live URL (`vercel.json` could not be tested locally).
- Production links to the new pages, the OG image and the GitHub `case-studies` folder return 404 until this branch is merged and deployed (the link check flagged exactly these). LinkedIn caches previews; re-scrape after deploy.
- Optional: a photo (audit D7).

## 13. Review before publishing the synthetic case study

I must be able to explain every step. Tick each:
- [ ] How the data is generated: seed, the hidden true elasticities, how capacity caps sales.
- [ ] What elasticity means; why log-log; why the price coefficient is the elasticity.
- [ ] Why sold-out groups are excluded from the fit.
- [ ] Why the held-out period is the last four matches, not random rows.
- [ ] What WAPE is, and why cell-level error (8.4%) is more honest than match-revenue error (0.9%).
- [ ] Why the accuracy is flattering (the model matches the generator) and what real-world price endogeneity would do.
- [ ] That the +/-15% scenario band is an assumption, not an estimate.
- [ ] How the sensitivity table follows from the elasticity (and why it flips at 1.3x).
- [ ] That nothing implies a real client's method. "Synthetic" labels are on the page notice, README, code headers and the case-study meta description.
