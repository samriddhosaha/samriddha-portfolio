// Dev-only audit: node tools/audit.cjs <baseUrl> <outDir> [browser]
// Needs playwright + @axe-core/playwright resolvable (NODE_PATH or local install). No runtime deps for the site.
const fs = require('fs');
const path = require('path');
const { chromium, firefox, webkit } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;

const [base, out, browserName = 'chromium'] = process.argv.slice(2);
const engines = { chromium, firefox, webkit };
const WIDTHS = [360, 390, 768, 1024, 1440];
const PAGES = (process.env.PAGES || '/').split(',');
fs.mkdirSync(out, { recursive: true });
const save = (name, data) => fs.writeFileSync(path.join(out, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2));
const slug = p => (p === '/' ? 'home' : p.replace(/\W+/g, '_').replace(/^_|_$/g, ''));

async function scrollAll(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
    window.scrollTo(0, 0);
  });
}

(async () => {
  const browser = await engines[browserName].launch();
  const summary = { base, browser: browserName, pages: {} };
  for (const p of PAGES) {
    const s = (summary.pages[p] = { layout: {} });
    const tag = slug(p);
    const errors = [];
    // --- layouts + screenshots
    for (const w of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
      const page = await ctx.newPage();
      page.on('console', m => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', e => errors.push(String(e)));
      await page.goto(base + p, { waitUntil: 'networkidle' });
      await scrollAll(page);
      s.layout[w] = await page.evaluate(() => ({
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        pageHeight: document.documentElement.scrollHeight,
        headerHeight: document.querySelector('header')?.getBoundingClientRect().height ?? null,
      }));
      await page.screenshot({ path: path.join(out, `${tag}-${w}.png`), fullPage: true });
      if (w === 390 || w === 1440) {
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
        s['axe' + w] = axe.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }));
        save(`${tag}-axe-${w}.json`, axe.violations);
      }
      await ctx.close();
    }
    // --- keyboard pass (desktop)
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      await page.goto(base + p, { waitUntil: 'networkidle' });
      const stops = [];
      for (let i = 0; i < 60; i++) {
        await page.keyboard.press('Tab');
        const d = await page.evaluate(() => {
          const e = document.activeElement; if (!e || e === document.body) return null;
          const cs = getComputedStyle(e);
          return { tag: e.tagName.toLowerCase(), text: (e.getAttribute('aria-label') || e.innerText || '').trim().slice(0, 40), href: e.getAttribute('href'), inMain: !!e.closest('main'), outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 };
        });
        if (!d) break;
        stops.push(d);
      }
      s.keyboard = { stops: stops.length, beforeMain: stops.findIndex(x => x.inMain), noVisibleFocus: stops.filter(x => !x.outline).length };
      save(`${tag}-keyboard.json`, stops);
      await ctx.close();
    }
    // --- JS off
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, javaScriptEnabled: false });
      const page = await ctx.newPage();
      await page.goto(base + p, { waitUntil: 'load' });
      s.jsOff = await page.evaluate(() => ({
        textChars: document.body.innerText.length,
        deadLinks: [...document.querySelectorAll('a')].filter(a => !a.getAttribute('href') || a.getAttribute('href') === '#').length,
        emptyMain: !document.querySelector('main')?.innerText.trim(),
        hiddenBlocks: [...document.querySelectorAll('section,main > *')].filter(e => getComputedStyle(e).opacity === '0').length,
      }));
      await page.screenshot({ path: path.join(out, `${tag}-jsoff.png`), fullPage: true });
      await ctx.close();
    }
    // --- reduced motion + print + transfer
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto(base + p, { waitUntil: 'networkidle' });
      await page.screenshot({ path: path.join(out, `${tag}-reduced-motion.png`), fullPage: true });
      await ctx.close();
      if (browserName === 'chromium') {
        // print before scrolling, motion allowed: the case the original page broke
        const pctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await pctx.newPage();
        await page.goto(base + p, { waitUntil: 'networkidle' });
        await page.emulateMedia({ media: 'print' });
        s.print = await page.evaluate(() => ({ hiddenBlocks: [...document.querySelectorAll('section,.reveal')].filter(e => getComputedStyle(e).opacity === '0').length }));
        await page.pdf({ path: path.join(out, `${tag}-print.pdf`), format: 'A4', printBackground: false });
        await pctx.close();
      }
    }
    if (browserName === 'chromium') {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      const reqs = new Map();
      cdp.on('Network.responseReceived', e => reqs.set(e.requestId, { url: e.response.url, type: e.type, status: e.response.status }));
      cdp.on('Network.loadingFinished', e => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength; });
      await page.goto(base + p, { waitUntil: 'networkidle' });
      const list = [...reqs.values()];
      s.transfer = {
        totalBytes: list.reduce((a, r) => a + (r.bytes || 0), 0),
        exImagesBytes: list.filter(r => r.type !== 'Image').reduce((a, r) => a + (r.bytes || 0), 0),
        requests: list.length, thirdParty: list.filter(r => !r.url.startsWith(base)).map(r => new URL(r.url).host).filter((v, i, a) => a.indexOf(v) === i),
        failed: list.filter(r => r.status >= 400).map(r => r.url),
      };
      save(`${tag}-requests.json`, list);
      await ctx.close();
    }
    s.consoleErrors = errors;
  }
  save('summary.json', summary);
  console.log(JSON.stringify(summary, null, 1));
  await browser.close();
})();
