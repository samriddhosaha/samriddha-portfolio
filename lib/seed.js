// Sample content so the Feed is never empty. Facts come from the existing site (projects, roles, certification).
// Dates are relative to "now" so the feed looks alive on any day. Replace or delete everything from /admin/.
import { sql } from 'drizzle-orm';
import { savePost } from './repo.js';
import { postInput } from './validators.js';

const D = 86400e3;
const img = (id, alt, w, h, caption) => ({ provider: 'static', type: 'image', id, alt, w, h, ...(caption ? { caption } : {}) });
const OLA = img('/assets/img/work/ola-cancellations/cancellation-dashboard.webp', 'Power BI cancellation page for July 2024: 103,024 bookings, 28,933 cancelled, a cancellation rate of 28.08.', 1262, 705);
const FORECAST = img('/assets/img/work/event-pricing/chart-forecast.svg', 'Four held-out matches: actual revenue sits inside the low-to-high scenario band, close to the base forecast. Synthetic data.', 750, 380);
const SKILLS = img('/assets/img/work/job-market/skill-demand.webp', 'Bar charts of the top five skills requested for the three most common data roles in Indian job postings.', 623, 472);
const TREND = img('/assets/img/work/job-market/skill-trend.webp', 'Line chart of monthly demand for the top five data analyst skills in India during 2023.', 621, 453);
const LAYERS = img('/assets/img/work/data-warehouse/layers.svg', 'Diagram: six CSV files flow into a bronze layer, then silver, then a gold star schema.', 800, 420);

const ARTICLE_SYNTH = `Every number on my event-pricing page comes with the word **synthetic** next to it. This note explains why, and what the numbers can and cannot tell you.

## The setup

The case study is a fictional 16-match event. I generated ticket sales from known price sensitivities per buyer segment, then asked the analysis to recover them. Because I wrote the generator, I know the true answer.

## What I held out

Four matches were held out of fitting. The forecast for those four lands within about 8% at cell level, and the actuals sit inside the low-to-high scenario band.

\`\`\`python
# the shape of the check, not the full script
held_out = matches.sample(4, random_state=7)
train = matches.drop(held_out.index)
model = fit_elasticity(train)
error = (model.forecast(held_out) - held_out.revenue).abs() / held_out.revenue
\`\`\`

## What the number means

An 8% error on data I generated says the method works when its assumptions hold. It says nothing about a real event. That is the point of labelling it: the claim is about the **method**, and the reader can verify it by running the code.

### Where it would break

- Demand that reacts to price *and* to scarcity at the same time.
- Segments that overlap or shift during the sales window.
- Capacity limits that censor observed demand.

## Takeaway

If you cannot show real client data, show a transparent simulation and say so. [The full case study](/work/event-pricing/) has the code and the outputs.
`;

const ARTICLE_OLA = `A dashboard is only useful if the first page answers the first question. For the July 2024 Ola booking data, the first question is: **how many bookings never completed?**

## The headline

Of 103,024 bookings, 63,967 succeeded and 28,933 were cancelled, a cancellation rate of 28.08%. The rest ended in other states such as incomplete rides.

## Why a rate and a count

| Measure | Value |
|---|---|
| Total bookings | 103,024 |
| Successful | 63,967 |
| Cancelled | 28,933 |
| Cancellation rate | 28.08% |

The count tells you the size of the problem; the rate tells you whether it is getting better. I keep both on the first page.

## Customer or driver

The next click is *who cancelled and why*. The report splits cancellations by customer and by driver, with reasons, so that an operations lead can act on one side without being distracted by the other.

## What I would add next

- A time axis, to see whether the rate moves by hour or by weekday.
- A cost view: lost revenue per cancelled booking.
`;

export const SAMPLE = [
  // --- pinned welcome + posts
  { d: 2, i: { kind: 'post', pinned: true, bodyMd: 'Welcome to my feed. Short notes on **analytics, pricing and forecasting**, a newsletter, and a running timeline of what I am working on. Only I post here. #meta #analytics', tags: ['meta', 'analytics'] } },
  { d: 4, i: { kind: 'post', bodyMd: 'Rule I keep coming back to: put the *count* and the *rate* on the same page. The count says how big the problem is, the rate says whether it is moving. #dashboards #power-bi', tags: ['dashboards', 'power-bi'], media: [OLA] } },
  { d: 9, i: { kind: 'post', bodyMd: 'Two charts from my job-postings analysis: which skills appear in postings, and how demand for the top five moves through the year. #python #data', tags: ['python', 'data'], media: [SKILLS, TREND] } },
  { d: 14, i: { kind: 'post', bodyMd: 'A warehouse in layers, thread 1/3. Bronze keeps the raw files exactly as they arrived, silver cleans and standardises, gold is the star schema people query. #data-warehouse #sql', tags: ['data-warehouse', 'sql'], media: [LAYERS] }, root: 'wh' },
  { d: 14 - 0.01, i: { kind: 'post', bodyMd: '2/3 Keeping bronze untouched means any bug in cleaning can be fixed and replayed without going back to the source system.', tags: ['data-warehouse'] }, reply: 'wh' },
  { d: 14 - 0.02, i: { kind: 'post', bodyMd: '3/3 Gold is where the business definitions live. If two dashboards disagree, the argument should happen in one place: the gold model. `fact_sales`, `dim_customers`, `dim_products`.', tags: ['data-warehouse', 'sql'] }, reply: 'wh' },
  { d: 21, i: { kind: 'post', bodyMd: 'Forecasts are a range, not a number. When I show a base case I always show the low and high scenario next to it. #forecasting', tags: ['forecasting'] } },
  // --- articles
  { d: 6, i: { kind: 'article', title: 'Why I label synthetic data as synthetic', slug: 'why-i-label-synthetic-data', bodyMd: ARTICLE_SYNTH, tags: ['forecasting', 'pricing', 'python'], media: [FORECAST] } },
  { d: 30, i: { kind: 'article', title: 'Reading a cancellation dashboard: 28% of 103,024 bookings', slug: 'reading-a-cancellation-dashboard', bodyMd: ARTICLE_OLA, tags: ['power-bi', 'dashboards'], media: [OLA] } },
  // --- updates (journey)
  { d: 3, i: { kind: 'update', updateType: 'life', title: 'Started this feed', bodyMd: 'A place for short notes and longer write-ups that do not fit a project page.', tags: ['meta'] } },
  { d: 12, i: { kind: 'update', updateType: 'project', title: 'Shipped the event-pricing case study', bodyMd: 'A synthetic 16-match event, with the generator, analysis and charts published. Every figure is labelled synthetic.', tags: ['forecasting', 'pricing', 'python'] } },
  { d: 45, i: { kind: 'update', updateType: 'cert', title: 'Microsoft Certified: Power BI Data Analyst Associate', bodyMd: 'Listed on the home page. The exam covers modelling, DAX and report design.', tags: ['power-bi', 'certification'] } },
  { at: Date.UTC(2025, 8, 1), i: { kind: 'update', updateType: 'job', title: 'Joined Accordion as Senior Business Analyst', bodyMd: 'Pricing and revenue forecasting, plus CRM and HR dashboards.', tags: ['career'] } },
  { at: Date.UTC(2022, 5, 1), i: { kind: 'update', updateType: 'job', title: 'Started at Deloitte USI as Technology Analyst', bodyMd: 'Python automation of reporting workflows and Power BI dashboards.', tags: ['career'] } },
  { d: 60, i: { kind: 'update', updateType: 'learning', title: 'Medallion architecture, hands on', bodyMd: 'Built a bronze, silver and gold warehouse from six ERP and CRM files with SQL Server stored procedures.', tags: ['data-warehouse', 'sql'] } },
  // --- stories
  { d: 0.05, i: { kind: 'story', bodyMd: 'New issue is out: why I label synthetic data as synthetic.', bg: 'vermilion' } },
  { d: 5.1, i: { kind: 'story', media: [OLA], bodyMd: '28% of 103,024 bookings cancelled.', newHighlight: 'Projects' } },
  { d: 5, i: { kind: 'story', bodyMd: 'Synthetic data, always labelled.', bg: 'ink', newHighlight: 'Projects' } },
  { d: 8, i: { kind: 'story', bodyMd: 'Bronze, silver, gold. Raw stays raw.', bg: 'green', newHighlight: 'Learning' } },
  // --- admin examples: one scheduled, one draft (not public)
  { d: -3, i: { kind: 'post', bodyMd: 'Scheduled example: this one appears three days from seeding.', tags: ['meta'] } },
  { d: 0, i: { kind: 'post', status: 'draft', bodyMd: 'Draft example: only visible in the admin.', tags: ['meta'] } },
];

export async function seedAll(db, { reset = true, now = Date.now() } = {}) {
  if (reset) for (const tbl of ['posts', 'highlights', 'reactions', 'comments', 'subscribers', 'issues', 'rate_limits']) await db.run(sql.raw(`DELETE FROM ${tbl}`));
  const roots = {};
  let n = 0;
  for (const s of SAMPLE) {
    const publishAt = s.at ?? Math.round(now - s.d * D);
    const input = postInput.parse({ ...s.i, publishAt, ...(s.reply ? { threadId: roots[s.reply] } : {}) });
    const r = await savePost(input, { db, now: publishAt });
    if (r.error) throw new Error(`seed failed (${r.error}): ${JSON.stringify(s.i).slice(0, 80)}`);
    if (s.root) roots[s.root] = r.post.id;
    n++;
  }
  return n;
}
