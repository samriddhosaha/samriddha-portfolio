// node tools/lh-run.mjs [outFile] [route,route...]   (starts its own dev server on :4311)
// Lighthouse mobile + desktop for each route; writes a table to qa/lighthouse.md and JSON to qa/lighthouse.json.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const out = process.argv[2] || 'qa/lighthouse';
const routes = (process.argv[3] || process.env.LH_ROUTES || '/,/work/event-pricing/,/work/ola-cancellations/,/work/data-warehouse/,/work/job-market/,/feed/').split(',');
const PORT = 4311;
const server = spawn('node', ['dev/server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const chrome = await chromeLauncher.launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless=new', '--no-sandbox'] });
const rows = [];
try {
  for (const route of routes) {
    for (const form of ['mobile', 'desktop']) {
      const flags = { port: chrome.port, output: 'json', logLevel: 'error' };
      const config = form === 'desktop' ? { extends: 'lighthouse:default', settings: { formFactor: 'desktop', screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }, throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 } } } : undefined;
      const { lhr } = await lighthouse(`http://localhost:${PORT}${route}`, flags, config);
      const s = Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
      const failed = Object.values(lhr.audits).filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'notApplicable' && a.scoreDisplayMode !== 'manual').map((a) => a.id);
      rows.push({ route, form, ...s, LCP: lhr.audits['largest-contentful-paint'].displayValue, CLS: lhr.audits['cumulative-layout-shift'].displayValue, TBT: lhr.audits['total-blocking-time'].displayValue, failed });
      console.log(route, form, JSON.stringify(s), failed.join(','));
    }
  }
} finally {
  await chrome.kill();
  server.kill();
}
fs.mkdirSync('qa', { recursive: true });
fs.writeFileSync(out + '.json', JSON.stringify(rows, null, 2));
fs.writeFileSync(out + '.md', ['| Route | Device | Perf | A11y | Best practices | SEO | LCP | CLS | TBT | Audits < 0.9 |', '|---|---|---|---|---|---|---|---|---|---|', ...rows.map((r) => `| ${r.route} | ${r.form} | ${r.performance} | ${r.accessibility} | ${r['best-practices']} | ${r.seo} | ${r.LCP} | ${r.CLS} | ${r.TBT} | ${r.failed.join(', ') || '-'} |`)].join('\n') + '\n');
