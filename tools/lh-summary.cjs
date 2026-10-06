// node tools/lh-summary.cjs file.json...  -> one line per report
for (const f of process.argv.slice(2)) {
  const r = JSON.parse(require('fs').readFileSync(f, 'utf8'));
  const c = Object.fromEntries(Object.entries(r.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
  const a = r.audits;
  console.log(f.split(/[\/]/).pop(), JSON.stringify(c), 'LCP', a['largest-contentful-paint'].displayValue, 'CLS', a['cumulative-layout-shift'].displayValue, 'TBT', a['total-blocking-time'].displayValue, 'KB', Math.round(a['total-byte-weight'].numericValue / 1024));
}
