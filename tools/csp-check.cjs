// node tools/csp-check.cjs <baseUrl>: injects the CSP from vercel.json on every response and reports console errors/violations.
const { chromium } = require('playwright');
const csp = require('../vercel.json').headers[0].headers.find(h => h.key === 'Content-Security-Policy').value;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 } });
  await ctx.route('**/*', async r => { const res = await r.fetch(); await r.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': csp } }); });
  for (const p of ['/', '/work/event-pricing/', '/work/ola-cancellations/', '/work/data-warehouse/', '/work/job-market/', '/404.html']) {
    const pg = await ctx.newPage(); const errs = [];
    pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await pg.goto(process.argv[2] + p, { waitUntil: 'networkidle' });
    if (p === '/') { await pg.click('#navToggle'); await pg.waitForTimeout(300); errs.push(...(await pg.locator('[data-email] a').count() ? [] : ['email slot not built'])); }
    console.log(p, errs.length ? errs : 'ok'); await pg.close();
  }
  await b.close();
})();
