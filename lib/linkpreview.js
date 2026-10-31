// Link preview cards (title/description/site only; remote images are not hotlinked because the CSP forbids them).
// SSRF guard: https only, every hop's resolved address must be public.
import dns from 'node:dns/promises';
import net from 'node:net';

export function isPrivateIp(ip) {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertPublic(u) {
  if (u.protocol !== 'https:' || u.port) throw new Error('only plain https URLs');
  const addrs = net.isIP(u.hostname) ? [{ address: u.hostname }] : await dns.lookup(u.hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('non-public address');
}

const meta = (html, prop) => {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i'))?.[0] || '';
  return m.match(/content=["']([^"']*)["']/i)?.[1] || '';
};
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export async function fetchPreview(url) {
  try {
    let u = new URL(url);
    for (let hop = 0; hop < 3; hop++) {
      await assertPublic(u);
      const res = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(4000), headers: { 'user-agent': 'portfolio-linkpreview/1.0', accept: 'text/html' } });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { u = new URL(res.headers.get('location'), u); continue; }
      if (!res.ok || !(res.headers.get('content-type') || '').includes('text/html')) return null;
      const reader = res.body.getReader();
      let html = '', bytes = 0;
      while (bytes < 300_000) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; html += Buffer.from(value).toString('utf8'); if (/<\/head>/i.test(html)) break; }
      reader.cancel().catch(() => {});
      const title = decode(meta(html, 'og:title') || html.match(/<title[^>]*>([^<]*)/i)?.[1] || '').trim().slice(0, 140);
      if (!title) return null;
      return { url: u.href, title, description: decode(meta(html, 'og:description') || meta(html, 'description')).trim().slice(0, 200), site: decode(meta(html, 'og:site_name')).trim().slice(0, 60) || u.hostname };
    }
  } catch { /* preview is best-effort */ }
  return null;
}
export const firstUrl = (md) => (md.match(/(?<![(\]])https:\/\/[^\s)<>]+/) || [])[0] || null;
