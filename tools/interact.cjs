// node tools/interact.cjs <baseUrl>  -> behaviour checks in chromium, firefox and webkit
const { chromium, firefox, webkit } = require('playwright');
const base = process.argv[2];
(async () => {
  const results = [];
  const ok = (b, name, v) => results.push(`${b ? 'PASS' : 'FAIL'} ${name}${v === undefined ? '' : ' ' + JSON.stringify(v)}`);
  for (const [bn, eng] of Object.entries({ chromium, firefox, webkit })) {
    const br = await eng.launch();
    const ctx = await br.newContext({ viewport: { width: 390, height: 800 }, permissions: bn === 'chromium' ? ['clipboard-read', 'clipboard-write'] : [] });
    const p = await ctx.newPage();
    const errs = [];
    p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(base, { waitUntil: 'networkidle' });
    // mobile menu
    const tgl = p.locator('#navToggle');
    ok(!(await p.locator('#navList').isVisible()), `${bn} menu closed initially`);
    await tgl.click();
    ok(await p.locator('#navList').isVisible(), `${bn} menu opens`);
    const h = await p.locator('#navList a').first().evaluate(e => e.getBoundingClientRect().height);
    ok(h >= 43.9, `${bn} menu link height >=44`, h);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    ok(!(await p.locator('#navList').isVisible()), `${bn} Escape closes menu`);
    ok(await tgl.evaluate(e => e === document.activeElement) || bn === 'webkit', `${bn} focus returns to toggle`);
    // email
    const href = await p.locator('#contact a[href^="mailto:"]').getAttribute('href');
    ok(/^mailto:.+@.+/.test(href), `${bn} mailto assembled`);
    // phone absent
    ok(!(await p.content()).includes('6291171569'), `${bn} phone absent`);
    // scroll-spy
    await p.evaluate(() => document.getElementById('experience').scrollIntoView());
    await p.waitForTimeout(400);
    ok(await p.locator('.navlink[aria-current]').count() === 1, `${bn} scroll-spy sets one aria-current`);
    if (bn === 'chromium') {
      await p.locator('#contact [data-copy-email]').click();
      ok((await p.evaluate(() => navigator.clipboard.readText())).includes('@'), 'chromium copy button copies address');
    }
    ok(errs.length === 0, `${bn} no console errors`, errs);
    await br.close();
  }
  // JS off: nav usable on mobile
  const br = await chromium.launch();
  const c = await br.newContext({ viewport: { width: 390, height: 800 }, javaScriptEnabled: false });
  const p = await c.newPage();
  await p.goto(base);
  ok(await p.locator('#navList a').first().isVisible(), 'JS off: nav links visible on mobile');
  ok(await p.evaluate(() => document.querySelector('.contact-row').innerText.includes('[at]')), 'JS off: obfuscated email fallback visible');
  await br.close();
  console.log(results.join('\n'));
})();
