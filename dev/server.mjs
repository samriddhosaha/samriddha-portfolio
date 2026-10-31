// Local stand-in for Vercel: static files + vercel.json (cleanUrls, trailingSlash, headers, rewrites) + /api/*.js
// Web-standard handlers: `export function GET(request) {}` / `export function POST(request) {}`.
// Run: node dev/server.mjs   (PORT=4200 by default)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const port = Number(process.env.PORT || 4310);
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json', '.csv': 'text/csv', '.pdf': 'application/pdf' };

// "/a/:id/:rest*" -> RegExp + param names (enough for the patterns vercel.json uses)
const compile = (src) => {
  const names = [];
  const re = src.replace(/\(\.\*\)/g, '(.*)').replace(/\/:(\w+)\*/g, (_, n) => { names.push(n); return '(?:/(.*))?'; }).replace(/:(\w+)/g, (_, n) => { names.push(n); return '([^/]+)'; });
  return { re: new RegExp('^' + re + '$'), names };
};
const headerRules = (cfg.headers || []).map((h) => ({ ...compile(h.source), headers: h.headers }));
const rewriteRules = (cfg.rewrites || []).map((r) => ({ ...compile(r.source), destination: r.destination }));

const fileFor = (p) => {
  const abs = path.join(root, p);
  if (!abs.startsWith(root)) return null;
  const tries = [abs, abs + '.html', path.join(abs, 'index.html')];
  return tries.find((f) => fs.existsSync(f) && fs.statSync(f).isFile()) || null;
};
// Never serve repo internals that .vercelignore excludes from the real deploy.
const hidden = /^\/(\.git|node_modules|audit|tools|dev|tests|qa|docs|drizzle|lib|api|\.data|\.env|package|playwright|PLAN|NEEDS_INPUT|PR\.md|CHANGELOG|case-studies\/.*\/(output|__pycache__))/;

async function toWebRequest(req, url) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  return new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body, duplex: 'half' });
}

async function sendWeb(res, response, extra) {
  const h = {};
  response.headers.forEach((v, k) => { h[k] = v; });
  const cookies = response.headers.getSetCookie?.() || [];
  if (cookies.length) h['set-cookie'] = cookies;
  res.writeHead(response.status, { ...extra, ...h });
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function runApi(req, res, dest, extra) {
  const u = new URL(dest, `http://${req.headers.host}`);
  const file = path.join(root, u.pathname + '.js');
  const mod = await import(pathToFileURL(file).href + `?t=${process.env.DEV_NO_CACHE ? Date.now() : ''}`);
  const handler = mod[req.method] || mod.default?.fetch || (typeof mod.default === 'function' ? mod.default : null);
  if (!handler) return sendWeb(res, new Response('Method Not Allowed', { status: 405 }), extra);
  const request = await toWebRequest(req, u.href);
  return sendWeb(res, await handler(request), extra);
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let p = decodeURIComponent(url.pathname);
    const extra = {};
    for (const r of headerRules) if (r.re.test(p)) for (const h of r.headers) extra[h.key.toLowerCase()] = h.value;

    // trailingSlash: true -> redirect /work/x to /work/x/ (extension-less paths only)
    if (cfg.trailingSlash && !p.endsWith('/') && !path.extname(p)) {
      res.writeHead(308, { location: p + '/' + url.search });
      return res.end();
    }

    // Rewrites (same rules as vercel.json) send dynamic routes to the single router function
    for (const r of rewriteRules) {
      const m = r.re.exec(p) || (!p.endsWith('/') && r.re.exec(p + '/'));
      if (!m) continue;
      let dest = r.destination;
      r.names.forEach((n, i) => { dest = dest.replace(new RegExp(`:${n}\\*?`, 'g'), encodeURIComponent(m[i + 1] || '').replace(/%2F/g, '/')); });
      const d = new URL(dest, 'http://x');
      url.searchParams.forEach((v, k) => d.searchParams.append(k, v));
      return await runApi(req, res, d.pathname + d.search, extra);
    }
    if (/^\/api\/[^/]+$/.test(p) && fs.existsSync(path.join(root, p + '.js'))) return await runApi(req, res, p + url.search, extra);

    const clean = p.replace(/\/$/, '') || '/index';
    const f = hidden.test(p) ? null : fileFor(clean === '/index' ? '/index.html' : clean);
    if (!f) {
      res.writeHead(404, { ...extra, 'content-type': MIME['.html'] });
      return res.end(fs.readFileSync(path.join(root, '404.html')));
    }
    res.writeHead(200, { ...extra, 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  } catch (e) {
    console.error(e);
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('dev server error: ' + e.message);
  }
}).listen(port, () => console.log(`dev server: http://localhost:${port}`));
