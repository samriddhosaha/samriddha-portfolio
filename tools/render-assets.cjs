// Renders assets/img/og.png (1200x630) and the PNG icons. Dev-only: node tools/render-assets.cjs (needs playwright).
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
const root = path.resolve(__dirname, '..');
const svg = require('fs').readFileSync(path.join(root, 'favicon.svg')).toString('base64');
const url = (...p) => pathToFileURL(path.join(root, ...p)).href;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.goto(url('tools', 'og.html'));
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(root, 'assets/img/og.png') });
  for (const [name, size] of [['favicon-32', 32], ['apple-touch-icon', 180], ['icon-192', 192], ['icon-512', 512]]) {
    const q = await b.newPage({ viewport: { width: size, height: size } });
    await q.setContent(`<body style="margin:0"><img src="data:image/svg+xml;base64,${svg}" width="${size}" height="${size}"></body>`);
    await q.waitForLoadState('load');
    await q.screenshot({ path: path.join(root, `assets/img/${name}.png`) });
  }
  await b.close();
})();
