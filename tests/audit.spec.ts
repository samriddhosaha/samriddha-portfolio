import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { ROUTES, NOT_FOUND, VIEWPORTS } from './routes';

const OUT = 'qa/screenshots';
fs.mkdirSync(OUT, { recursive: true });
const slug = (p: string) => (p === '/' ? 'home' : p.replace(/\W+/g, '_').replace(/^_|_$/g, ''));

async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
    window.scrollTo(0, 0);
    // Lazy images must have finished loading before we judge them broken.
    await Promise.all(Array.from(document.images).map((i) => { i.loading = 'eager'; return i.decode().catch(() => {}); }));
  });
  await page.waitForLoadState('networkidle');
}

// In-page checks. Returns a list of human-readable problems.
function domChecks() {
  const problems: string[] = [];
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth) problems.push(`horizontal overflow: scrollWidth ${de.scrollWidth} > clientWidth ${de.clientWidth}`);
  const insideScroller = (el: Element) => { for (let e: Element | null = el.parentElement; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`;
  for (const img of Array.from(document.images)) {
    if (!img.complete || img.naturalWidth === 0) problems.push(`broken image: ${img.getAttribute('src')}`);
    if (img.getAttribute('alt') === null) problems.push(`img without alt: ${img.getAttribute('src')}`);
  }
  document.querySelectorAll('body *').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || (el as HTMLElement).closest('.sprite,.sr-only,.skip')) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if ((r.right > de.clientWidth + 1 || r.left < -1) && !insideScroller(el)) problems.push(`outside viewport: ${describe(el)} [${Math.round(r.left)}..${Math.round(r.right)}] vs ${de.clientWidth}`);
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth) problems.push(`truncated text: ${describe(el)}`);
  });
  // Tap targets: controls must be >=44px (WCAG 2.5.8 exempts inline text links inside prose).
  document.querySelectorAll('button, .btn, .navlink, .foot-links a, .links a, .crumb a, input:not([type=hidden]), select, textarea, [role=tab]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.height < 43.5) problems.push(`small tap target ${Math.round(r.width)}x${Math.round(r.height)}: ${describe(el)} "${(el.textContent || '').trim().slice(0, 30)}"`);
  });
  // Heading hierarchy: one h1, no skipped levels.
  const hs = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => +h.tagName[1]);
  if (hs.filter((l) => l === 1).length !== 1) problems.push(`expected exactly one h1, found ${hs.filter((l) => l === 1).length}`);
  hs.forEach((l, i) => { if (i && l - hs[i - 1] > 1) problems.push(`heading level skipped: h${hs[i - 1]} -> h${l}`); });
  for (const lm of ['main', 'header', 'footer']) if (!document.querySelector(lm)) problems.push(`missing <${lm}>`);
  return problems;
}

for (const route of [...ROUTES, NOT_FOUND]) {
  for (const [w, h] of VIEWPORTS) {
    test(`${route} @ ${w}x${h}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      const logs: string[] = [];
      page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !(route === NOT_FOUND && /status of 404/.test(m.text()))) logs.push(`console.${m.type()}: ${m.text()}`); });
      page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
      page.on('requestfailed', (r) => logs.push(`request failed: ${r.url()} ${r.failure()?.errorText}`));
      page.on('response', (r) => { if (r.status() >= 400 && !(route === NOT_FOUND && r.url().endsWith(route))) logs.push(`HTTP ${r.status()}: ${r.url()}`); });
      await page.addInitScript(() => {
        (window as any).__cls = 0;
        new PerformanceObserver((l) => { for (const e of l.getEntries() as any[]) if (!e.hadRecentInput) (window as any).__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      });
      const res = await page.goto(route, { waitUntil: 'networkidle' });
      expect(res!.status()).toBe(route === NOT_FOUND ? 404 : 200);
      await scrollThrough(page);
      await page.screenshot({ path: `${OUT}/${slug(route)}-${w}.png`, fullPage: true });

      const problems = await page.evaluate(domChecks);
      const cls = await page.evaluate(() => (window as any).__cls as number);
      if (cls > 0.1) problems.push(`layout shift ${cls.toFixed(3)} > 0.1`);
      expect([...logs, ...problems], `${route} @ ${w}`).toEqual([]);

      if (w === 390 || w === 1440) {
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
        expect(axe.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`), 'axe').toEqual([]);
      }
      await ctx.close();
    });
  }
}
