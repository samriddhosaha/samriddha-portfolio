import { test, expect } from '@playwright/test';
import { PAGES as ROUTES } from './routes';

test.describe('home navigation', () => {
  for (const [w, h] of [[390, 844], [1440, 900]] as const) {
    test(`anchor links land below the sticky header @ ${w}`, async ({ browser }) => {
      const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
      await page.goto('/', { waitUntil: 'networkidle' });
      for (const id of ['work', 'experience', 'skills', 'about', 'contact']) {
        if (w < 820) await page.click('#navToggle');
        await page.click(`#navList a[href="/#${id}"]`);
        await page.waitForTimeout(900); // smooth scroll
        const headerBottom = await page.evaluate(() => document.querySelector('header.site')!.getBoundingClientRect().bottom);
        const headTop = await page.evaluate((i) => document.querySelector(`#${i} h2`)!.getBoundingClientRect().top, id);
        expect(headTop, `#${id} heading hidden under header`).toBeGreaterThanOrEqual(headerBottom - 1);
        expect(page.url()).toContain(`#${id}`);
      }
    });
  }

  test('mobile menu: open, Escape closes and returns focus, link closes', async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await page.goto('/');
    const toggle = page.locator('#navToggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#navList')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
    await toggle.click();
    await page.locator('#navList a').first().click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('skip link is first tab stop and jumps to main', async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
  });
});

test('external links open safely', async ({ page }) => {
  for (const route of ROUTES) {
    await page.goto(route);
    const bad = await page.$$eval('a[href^="http"]', (as) => as.filter((a) => !(a as HTMLAnchorElement).href.startsWith(location.origin)).filter((a) => a.getAttribute('target') !== '_blank' || !/noopener/.test(a.getAttribute('rel') || '')).map((a) => (a as HTMLAnchorElement).href));
    expect(bad, route).toEqual([]);
  }
});

test('internal links resolve', async ({ page, request }) => {
  const seen = new Set<string>();
  for (const route of ROUTES) {
    await page.goto(route);
    const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => (a as HTMLAnchorElement).href).filter((h) => h.startsWith(location.origin)));
    for (const h of hrefs) {
      const u = new URL(h); u.hash = '';
      if (seen.has(u.href)) continue; seen.add(u.href);
      expect((await request.get(u.href)).status(), u.href).toBeLessThan(400);
    }
  }
});

test('every focusable element shows a visible focus indicator', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const missing: string[] = [];
  for (let i = 0; i < 45; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const e = document.activeElement as HTMLElement | null;
      if (!e || e === document.body) return null;
      const cs = getComputedStyle(e);
      return { tag: e.tagName + (e.className ? '.' + e.className : ''), visible: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 };
    });
    if (r && !r.visible) missing.push(r.tag);
  }
  expect(missing).toEqual([]);
});

test('prefers-reduced-motion disables smooth scroll and transitions', async ({ browser }) => {
  const page = await (await browser.newContext({ reducedMotion: 'reduce' })).newPage();
  await page.goto('/');
  const r = await page.evaluate(() => ({ sb: getComputedStyle(document.documentElement).scrollBehavior, td: getComputedStyle(document.querySelector('.btn')!).transitionDuration }));
  expect(r.sb).toBe('auto');
  expect(parseFloat(r.td)).toBeLessThan(0.01);
});

test('hover state on button changes style', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const btn = page.locator('.btn-solid').first();
  const before = await btn.evaluate((e) => getComputedStyle(e).backgroundColor);
  await btn.hover();
  await page.waitForTimeout(300);
  expect(await btn.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(before);
});

test('copy-email button works and announces', async ({ browser }) => {
  const page = await (await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })).newPage();
  await page.goto('/');
  await page.locator('[data-copy-email]').first().click();
  await expect(page.locator('.copy-status').first()).toHaveText(/copied/i);
});

test('404 page offers a way home', async ({ page }) => {
  const res = await page.goto('/nope/');
  expect(res!.status()).toBe(404);
  await expect(page.locator('a[href="/"]').first()).toBeVisible();
});

test('SEO basics on every route', async ({ page }) => {
  for (const route of ROUTES) {
    await page.goto(route);
    for (const sel of ['title', 'meta[name=description]', 'link[rel=canonical]', 'meta[property="og:title"]', 'meta[property="og:image"]', 'meta[name="twitter:card"]', 'link[rel=icon]']) {
      await expect(page.locator(sel).first(), `${route} ${sel}`).toBeAttached();
    }
  }
});
