import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';

const PASSWORD = 'test-password';
let ipN = 0;
// Distinct client IP per test so per-IP rate limits do not couple tests together (the dev server trusts X-Forwarded-For).
const nextIp = () => `192.0.2.${(++ipN % 250) + 1}`;
const outbox = () => (fs.existsSync('.data/outbox.jsonl') ? fs.readFileSync('.data/outbox.jsonl', 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
// 1x1 PNG, enough to pass magic-byte sniffing and the canvas re-encode.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function login(page: Page) {
  await page.goto('/admin/');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}
const section = (page: Page, name: RegExp) => page.locator('.admin-tabs').getByRole('button', { name }).click();

test.describe('public feed', () => {
  test('shows seeded content, tabs, tag filter, search and load more', async ({ page }) => {
    await page.goto('/feed/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Notes from the');
    await expect(page.locator('.feed-card').first()).toContainText('Welcome to my feed'); // pinned first
    await expect(page.locator('.feed-card.kind-article').first()).toBeVisible();

    await page.getByRole('link', { name: 'Newsletter', exact: true }).click();
    await expect(page).toHaveURL(/tab=newsletter/);
    await expect(page.locator('.feed-card')).toHaveCount(2);

    await page.getByRole('link', { name: 'Journey', exact: true }).click();
    await expect(page.locator('.tl-year h2').first()).toHaveText('2026');
    const years = await page.locator('.tl-year h2').allTextContents();
    expect(years).toEqual([...years].sort((a, b) => +b - +a)); // newest year first
    expect(years).toContain('2022');

    await page.goto('/feed/?tag=forecasting');
    await expect(page.locator('.feed-card').first()).toBeVisible();
    for (const t of await page.locator('.feed-card .feed-tags').allTextContents()) expect(t).toContain('#forecasting');

    await page.goto('/feed/');
    await page.getByLabel('Search the feed').fill('medallion');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page).toHaveURL(/q=medallion/);
    await expect(page.locator('.feed-card, .tl-item').first()).toContainText(/medallion/i);
    await page.getByLabel('Search the feed').fill('zzzz-no-such-thing');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.locator('.empty')).toContainText('Nothing matches');
  });

  test('load more appends items without a page reload', async ({ page }) => {
    await page.goto('/feed/?tab=posts');
    const before = await page.locator('.feed-card').count();
    // seed has fewer than 10 posts: create enough via the admin API to force a second page
    const ctx = page.context();
    await ctx.request.post('/api/admin/login/', { data: { password: PASSWORD }, headers: { 'x-requested-with': 'fetch', origin: new URL(page.url()).origin } });
    for (let i = 0; i < 12; i++) {
      const r = await ctx.request.post('/api/admin/posts/', { data: { kind: 'post', bodyMd: `pagination filler ${i} #filler`, tags: ['filler'], publishAt: Date.now() - 40 * 86400e3 - i * 1000 }, headers: { 'x-requested-with': 'fetch', origin: new URL(page.url()).origin } });
      expect(r.status()).toBe(201);
    }
    await page.goto('/feed/?tag=filler');
    await expect(page.locator('.feed-card')).toHaveCount(10);
    await page.getByRole('link', { name: 'Load more' }).click();
    await expect(page.locator('.feed-card')).toHaveCount(12);
    await expect(page.getByRole('link', { name: 'Load more' })).toHaveCount(0);
    expect(before).toBeGreaterThan(0);
  });

  test('opening a story: progress bars, keyboard, Esc, focus return', async ({ page }) => {
    await page.goto('/feed/');
    const ring = page.getByRole('button', { name: /Latest stories/ });
    await ring.click();
    const dlg = page.locator('#storyViewer');
    await expect(dlg).toBeVisible();
    await expect(dlg.locator('.sv-bars span')).toHaveCount(1);
    await expect(dlg).toContainText('New issue is out');
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(ring).toBeFocused();

    // highlight with two stories: arrows move between them, last one closes
    await page.getByRole('button', { name: /Projects stories/ }).click();
    await expect(dlg.locator('.sv-bars span')).toHaveCount(2);
    await expect(dlg.locator('img')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(dlg).toContainText('Synthetic data, always labelled');
    await page.keyboard.press('ArrowLeft');
    await expect(dlg.locator('img')).toBeVisible();
    await dlg.getByRole('button', { name: 'Next story' }).click(); // last story of Projects
    await dlg.getByRole('button', { name: 'Next story' }).click(); // rolls on to the next highlight
    await expect(dlg).toContainText('Bronze, silver, gold');
    await expect(dlg.locator('[data-sv-name]')).toHaveText('Learning');
    await dlg.getByRole('button', { name: 'Next story' }).click(); // last story overall closes the viewer
    await expect(dlg).toBeHidden();
  });

  test('story viewer works with reduced motion (manual advance)', async ({ browser }) => {
    const page = await (await browser.newContext({ reducedMotion: 'reduce' })).newPage();
    await page.goto('/feed/');
    await page.getByRole('button', { name: /Projects stories/ }).click();
    await page.waitForTimeout(6500);
    await expect(page.locator('#storyViewer')).toBeVisible(); // would have auto-advanced
  });

  test('permalink has OG tags, thread, share + reactions work', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/feed/?tab=posts');
    await page.locator('.feed-card', { hasText: 'A warehouse in layers' }).locator('a.when').click();
    await expect(page).toHaveURL(/\/feed\/post\/[a-z0-9]+\/$/);
    await expect(page.locator('.feed-card')).toHaveCount(3); // the whole thread
    for (const sel of ['meta[property="og:title"]', 'meta[property="og:description"]', 'meta[property="og:image"]', 'link[rel=canonical]', 'meta[name="twitter:card"]']) await expect(page.locator(sel)).toHaveCount(1);
    const first = page.locator('.feed-card').first();
    const fire = first.getByRole('button', { name: /React with 🔥/ });
    await fire.click();
    await expect(fire).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.locator('.feed-card').first().getByRole('button', { name: /React with 🔥/ })).toHaveAttribute('aria-pressed', 'true'); // remembered by cookie
    await page.locator('.feed-card').first().getByRole('button', { name: /React with 🔥/ }).click();
    await expect(page.locator('.feed-card').first().getByRole('button', { name: /React with 🔥/ })).toHaveAttribute('aria-pressed', 'false'); // toggles off
    await first.getByRole('button', { name: 'Copy link' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('/feed/post/');
  });

  test('article page: toc, reading time, schema, 404 for unknown/story ids', async ({ page, request }) => {
    await page.goto('/feed/newsletter/why-i-label-synthetic-data/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Why I label synthetic data as synthetic');
    await expect(page.getByRole('navigation', { name: 'Table of contents' })).toBeVisible();
    await expect(page.locator('.eyebrow')).toContainText('min read');
    await expect(page.locator('pre code.language-python')).toBeVisible();
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
    expect(ld['@type']).toBe('Article');
    expect((await request.get('/feed/post/nonexistent1/')).status()).toBe(404);
    expect((await request.get('/feed/newsletter/nope/')).status()).toBe(404);
  });

  test('drafts and scheduled items never leak', async ({ request }) => {
    const html = await (await request.get('/api/feed/?limit=20')).json();
    expect(html.html).not.toContain('Draft example');
    expect(html.html).not.toContain('Scheduled example');
    expect(await (await request.get('/feed/rss.xml')).text()).not.toContain('Draft example');
  });

  test('RSS and sitemap are valid XML with feed URLs', async ({ request }) => {
    const rss = await (await request.get('/feed/rss.xml')).text();
    expect(rss).toContain('<rss version="2.0"');
    expect(rss).toContain('/feed/newsletter/why-i-label-synthetic-data/');
    const sm = await (await request.get('/feed/sitemap.xml')).text();
    expect(sm).toContain('<urlset');
    expect(sm).toContain('/feed/post/');
    expect(await (await request.get('/sitemap.xml')).text()).toContain('/feed/sitemap.xml');
  });

  test('home page teaser lists the latest three items', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#feed .teaser-item')).toHaveCount(3);
    await expect(page.getByRole('link', { name: 'Feed', exact: true }).first()).toHaveAttribute('href', '/feed/');
  });

  test('home teaser shows an error state when the API fails', async ({ page }) => {
    await page.route('**/api/feed/**', (r) => r.fulfill({ status: 500, body: '{}' }));
    await page.goto('/');
    await expect(page.locator('#feed .err-inline')).toBeVisible();
  });
});

test.describe('subscribe, comments and abuse protection', () => {
  test('double opt-in: subscribe, confirm via email link, then unsubscribe', async ({ page, context }) => {
    await context.setExtraHTTPHeaders({ 'x-forwarded-for': nextIp() });
    const email = `reader${Date.now()}@example.com`;
    await page.goto('/feed/');
    await page.locator('aside').getByLabel('Email address').fill(email);
    await page.locator('aside').getByRole('button', { name: 'Subscribe' }).click();
    await expect(page.locator('aside [data-status]')).toContainText(/confirmation link is on its way/i);
    const mail = outbox().filter((m) => m.to === email).pop();
    expect(mail.subject).toMatch(/confirm/i);
    const link = /https?:\/\/[^\s"]+\/feed\/confirm\/\?token=[a-f0-9]{32}/.exec(mail.text)![0];
    const path = new URL(link).pathname + new URL(link).search;
    await page.goto(path);
    await page.getByRole('button', { name: 'Confirm subscription' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('You are subscribed');
    const token = /token=([a-f0-9]{32})/.exec(link)![1];
    await page.goto(`/feed/unsubscribe/?token=${token}`);
    await page.getByRole('button', { name: 'Unsubscribe' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('You are unsubscribed');
  });

  test('subscribe works without JavaScript', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, extraHTTPHeaders: { 'x-forwarded-for': nextIp() } });
    const page = await ctx.newPage();
    const email = `nojs${Date.now()}@example.com`;
    await page.goto('/feed/');
    await page.locator('aside').getByLabel('Email address').fill(email);
    await page.locator('aside').getByRole('button', { name: 'Subscribe' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check your inbox');
    expect(outbox().some((m) => m.to === email)).toBe(true);
  });

  test('invalid email and honeypot are handled', async ({ request, baseURL }) => {
    const h = { origin: baseURL!, 'content-type': 'application/json', accept: 'application/json', 'x-forwarded-for': nextIp() };
    expect((await request.post('/api/subscribe/', { data: { email: 'not-an-email' }, headers: h })).status()).toBe(400);
    const before = outbox().length;
    const bot = await request.post('/api/subscribe/', { data: { email: 'bot@example.com', website: 'http://spam' }, headers: h });
    expect(bot.status()).toBe(200); // looks successful to the bot...
    expect(outbox().length).toBe(before); // ...but nothing is sent or stored
  });

  test('cross-origin writes are refused', async ({ request }) => {
    const r = await request.post('/api/subscribe/', { data: { email: 'a@example.com' }, headers: { origin: 'https://evil.example', 'content-type': 'application/json' } });
    expect(r.status()).toBe(403);
    const r2 = await request.post('/api/react/', { data: { id: 'abcdef1234', emoji: '🔥' }, headers: { 'content-type': 'application/json' } });
    expect(r2.status()).toBe(403);
  });

  test('subscribe is rate limited', async ({ request, baseURL }) => {
    const h = { origin: baseURL!, 'content-type': 'application/json', accept: 'application/json', 'x-forwarded-for': '203.0.113.77' };
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await request.post('/api/subscribe/', { data: { email: `rl${i}-${Date.now()}@example.com` }, headers: h })).status());
    expect(codes.slice(0, 5).every((c) => c === 200)).toBe(true);
    expect(codes[6]).toBe(429);
  });

  test('comment is hidden until approved in the moderation queue', async ({ page, browser, context }) => {
    await context.setExtraHTTPHeaders({ 'x-forwarded-for': nextIp() });
    const text = `Great read ${Date.now()}`;
    await page.goto('/feed/newsletter/why-i-label-synthetic-data/');
    await page.getByLabel('Name').fill('Reader Ann');
    await page.getByLabel('Comment', { exact: true }).fill(text);
    await page.getByRole('button', { name: 'Post comment' }).click();
    await expect(page.locator('.comment-form [data-status]')).toContainText(/awaiting review|held for review/i);
    await page.reload();
    await expect(page.locator('.comments')).not.toContainText(text);

    const admin = await (await browser.newContext()).newPage();
    await login(admin);
    await section(admin, /Comments/);
    const item = admin.locator('[data-comment]', { hasText: text });
    await expect(item).toBeVisible();
    await item.getByRole('button', { name: /Approve comment by Reader Ann/ }).click();
    await expect(item).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.comments')).toContainText(text);

    // reject path
    await admin.getByLabel('Show').selectOption('approved');
    const again = admin.locator('[data-comment]', { hasText: text });
    await again.getByRole('button', { name: /Reject comment/ }).click();
    await page.reload();
    await expect(page.locator('.comments')).not.toContainText(text);
  });

  test('comment form: honeypot and validation', async ({ request, baseURL }) => {
    const h = { origin: baseURL!, 'content-type': 'application/json', accept: 'application/json' };
    const id = /\/feed\/post\/([a-z0-9]+)\//.exec((await (await request.get('/api/feed/?tab=posts&limit=1')).json()).html)![1];
    expect((await request.post('/api/comment/', { data: { postId: id, name: 'x', body: 'spammy spam', website: 'http://x' }, headers: h })).status()).toBe(400);
    expect((await request.post('/api/comment/', { data: { postId: id, name: '', body: 'hello there' }, headers: h })).status()).toBe(400);
  });
});

test.describe('admin', () => {
  test('anonymous visitors cannot call any admin API', async ({ request, baseURL }) => {
    const h = { origin: baseURL!, 'x-requested-with': 'fetch', 'content-type': 'application/json' };
    for (const [m, u] of [['GET', '/api/admin/bootstrap/'], ['POST', '/api/admin/posts/'], ['PUT', '/api/admin/posts/abcdef1234/'], ['DELETE', '/api/admin/posts/abcdef1234/'], ['GET', '/api/admin/subscribers/'], ['GET', '/api/admin/comments/'], ['POST', '/api/admin/comments/'], ['POST', '/api/admin/newsletter/'], ['POST', '/api/admin/upload-sign/'], ['POST', '/api/admin/upload-local/'], ['POST', '/api/admin/preview/'], ['POST', '/api/admin/posts/abcdef1234/pin/']] as const) {
      const r = await request.fetch(u, { method: m, headers: h, data: m === 'GET' || m === 'DELETE' ? undefined : {} });
      expect(r.status(), `${m} ${u}`).toBe(401);
    }
  });

  test('wrong password is rejected; right one logs in; logout works', async ({ page }) => {
    await page.goto('/admin/');
    await page.getByLabel('Password').fill('nope');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('#login-status')).toHaveText('Wrong password.');
    await login(page);
    const cookie = (await page.context().cookies()).find((c) => c.name === 'sid')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Strict');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('writes need the CSRF header even with a valid session', async ({ page, baseURL }) => {
    await login(page);
    const r = await page.request.post('/api/admin/posts/', { data: { kind: 'post', bodyMd: 'csrf attempt' }, headers: { origin: baseURL! } });
    expect(r.status()).toBe(403);
    const r2 = await page.request.post('/api/admin/posts/', { data: { kind: 'post', bodyMd: 'csrf attempt' }, headers: { origin: 'https://evil.example', 'x-requested-with': 'fetch' } });
    expect(r2.status()).toBe(403);
  });

  test('login is rate limited', async ({ request, baseURL }) => {
    const h = { origin: baseURL!, 'x-requested-with': 'fetch', 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.9' };
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await request.post('/api/admin/login/', { data: { password: 'wrong' + i }, headers: h })).status();
    expect(last).toBe(429);
  });

  test('create a post with an image upload (alt text required) and see it live', async ({ page }) => {
    await login(page);
    await page.locator('#f-kind').selectOption('post');
    await page.getByLabel(/^Text/).fill('E2E post with **bold** and #e2e');
    await expect(page.locator('#preview strong')).toHaveText('bold');
    await page.getByLabel('Tags (comma separated)').fill('e2e, testing');
    await page.locator('#f-files').setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.locator('.up-item')).toBeVisible();
    await expect(page.locator('.up-item progress')).toHaveCount(0, { timeout: 10000 });
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.locator('#form-errors')).toContainText(/alt text/i); // blocked: no alt yet
    await page.getByLabel('Alt text (required)').fill('A single dark pixel used as a test image');
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.locator('#toast')).toContainText('Published');
    await page.goto('/feed/?tab=posts');
    const card = page.locator('.feed-card', { hasText: 'E2E post with' });
    await expect(card.locator('strong')).toHaveText('bold');
    await expect(card.locator('img[alt="A single dark pixel used as a test image"]')).toBeVisible();
    await expect(card.locator('img')).toHaveAttribute('src', /\/api\/media\/[a-z0-9]{16}\.webp/);
  });

  test('create a story, an update and an article, then edit, pin, schedule and delete', async ({ page }) => {
    await login(page);
    // story pinned to a new highlight
    await page.locator('#f-kind').selectOption('story');
    await page.getByLabel(/^Story text/).fill('E2E story text');
    await page.getByLabel('...or new highlight name').fill('E2E highlights');
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.locator('#toast')).toContainText('Published');
    await page.goto('/feed/');
    await expect(page.getByRole('button', { name: /E2E highlights stories/ })).toBeVisible();

    // update
    await page.goto('/admin/');
    await page.locator('#f-kind').selectOption('update');
    await page.getByLabel('Title').fill('E2E talk given');
    await page.getByLabel('Update type').selectOption('talk');
    await page.getByLabel(/^Text/).fill('Gave a talk about testing.');
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.locator('#toast')).toContainText('Published');
    await page.goto('/feed/?tab=journey');
    await expect(page.locator('.tl-item', { hasText: 'E2E talk given' }).locator('.badge-update')).toHaveText('Talk');

    // article, scheduled in the future: invisible now
    await page.goto('/admin/');
    await page.locator('#f-kind').selectOption('article');
    await page.getByLabel('Title').fill('E2E scheduled article');
    await page.getByLabel(/^Article/).fill('## Section\n\nSome body text for the article.\n\n```js\nconsole.log(1)\n```');
    await page.getByLabel(/^Publish at/).fill(new Date(Date.now() + 3 * 86400e3).toISOString().slice(0, 16));
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.locator('#toast')).toContainText('Published');
    expect((await page.request.get('/feed/newsletter/e2e-scheduled-article/')).status()).toBe(404);

    // edit: clear the schedule so it goes live, then pin it
    await page.getByRole('row', { name: /E2E scheduled article/ }).getByRole('button', { name: /Edit/ }).click();
    await page.getByLabel(/^Publish at/).fill(new Date(Date.now() - 60e3).toISOString().slice(0, 16));
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.locator('#toast')).toContainText('Saved');
    expect((await page.request.get('/feed/newsletter/e2e-scheduled-article/')).status()).toBe(200);
    await page.getByRole('row', { name: /E2E scheduled article/ }).getByRole('button', { name: 'Pin' }).click();
    await page.goto('/feed/');
    await expect(page.locator('.feed-card').first()).toContainText('E2E scheduled article');

    // draft stays private, delete removes
    await page.goto('/admin/');
    await page.locator('#f-kind').selectOption('post');
    await page.getByLabel(/^Text/).fill('E2E private draft');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.locator('#toast')).toContainText('Draft saved');
    await page.goto('/feed/?q=E2E+private+draft');
    await expect(page.locator('.empty')).toBeVisible();
    await page.goto('/admin/');
    await page.getByRole('button', { name: /^Posts/ }).click();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('row', { name: /E2E private draft/ }).getByRole('button', { name: /Delete/ }).click();
    await expect(page.getByRole('row', { name: /E2E private draft/ })).toHaveCount(0);
  });

  test('validation errors from the server are shown in the composer', async ({ page }) => {
    await login(page);
    await page.locator('#f-kind').selectOption('post');
    await page.getByLabel(/^Text/).fill('x'.repeat(1001));
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.locator('#form-errors')).toContainText('1000 characters');
  });

  test('upload validation: wrong type and disguised files are rejected', async ({ page }) => {
    await login(page);
    await page.locator('#f-files').setInputFiles({ name: 'evil.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg onload=alert(1)/>') });
    await expect(page.locator('.up-item .err-text')).toContainText('Unsupported type');
    const r = await page.request.post('/api/admin/upload-local/', { data: Buffer.from('<?php echo 1;'), headers: { 'x-requested-with': 'fetch', origin: new URL(page.url()).origin, 'content-type': 'image/png' } });
    expect(r.status()).toBe(415);
    const big = await page.request.post('/api/admin/upload-sign/', { data: { type: 'video/mp4', size: 101 * 1024 * 1024 }, headers: { 'x-requested-with': 'fetch', origin: new URL(page.url()).origin } });
    expect(big.status()).toBe(400);
  });

  test('newsletter: send requires a test first, then reaches confirmed subscribers only', async ({ page, context }) => {
    await context.setExtraHTTPHeaders({ 'x-forwarded-for': nextIp() });
    // one confirmed subscriber via the public flow
    const email = `issue${Date.now()}@example.com`;
    await page.goto('/feed/');
    await page.locator('aside').getByLabel('Email address').fill(email);
    await page.locator('aside').getByRole('button', { name: 'Subscribe' }).click();
    await expect(page.locator('aside [data-status]')).toContainText(/confirmation link is on its way/i);
    const mail = outbox().filter((m) => m.to === email).pop();
    const token = /token=([a-f0-9]{32})/.exec(mail.text)![1];
    await page.goto(`/feed/confirm/?token=${token}`);
    await page.getByRole('button', { name: 'Confirm subscription' }).click();

    await login(page);
    await section(page, /Newsletter/);
    const row = page.locator('[data-article]', { hasText: 'Why I label synthetic data' });
    page.on('dialog', (d) => d.accept());
    await row.getByRole('button', { name: /Send .* to subscribers/ }).click();
    await expect(page.locator('#toast')).toContainText('Send a test to yourself first');
    await row.getByRole('button', { name: /test/i }).click();
    await expect(page.locator('#toast')).toContainText('Test sent to you');
    expect(outbox().some((m) => m.to === 'owner@example.com' && /Why I label/.test(m.subject))).toBe(true);
    await row.getByRole('button', { name: /Send .* to subscribers/ }).click();
    await expect(page.locator('#toast')).toContainText(/Sent to \d+ subscriber/);
    const got = outbox().find((m) => m.to === email && /Why I label/.test(m.subject));
    expect(got.headers['List-Unsubscribe']).toContain(token);
    expect(got.html).toContain('/feed/newsletter/why-i-label-synthetic-data/');
    expect(outbox().some((m) => m.to === 'bot@example.com')).toBe(false); // unconfirmed / honeypot addresses never receive issues
    await row.getByRole('button', { name: /Send .* to subscribers/ }).click();
    await expect(page.locator('#toast')).toContainText('already sent');
  });
});
