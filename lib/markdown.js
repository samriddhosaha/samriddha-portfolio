// Markdown -> sanitized HTML. Raw HTML in the source is disabled, output is allow-listed again by sanitize-html.
import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
import { allowedMediaUrl } from './media.js';
import { esc } from './util.js';

const full = new MarkdownIt({ html: false, linkify: true, breaks: false });
// Posts/updates/stories get "markdown-lite": no headings, images, tables, rules.
const lite = new MarkdownIt({ html: false, linkify: true, breaks: true }).disable(['heading', 'lheading', 'table', 'hr', 'image', 'html_block']);

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';

// #tags and @mentions outside code become links. @name -> github.com/name.
export function linkify(md) {
  return md.split(/(```[\s\S]*?```|`[^`\n]*`)/).map((seg, i) => (i % 2 ? seg
    : seg.replace(/(^|[\s(])#([a-zA-Z][\w-]{1,29})\b/g, (_, p, t) => `${p}[#${t}](/feed/?tag=${t.toLowerCase()})`)
      .replace(/(^|[\s(])@([A-Za-z0-9_-]{1,39})\b/g, (_, p, h) => `${p}[@${h}](https://github.com/${h})`))).join('');
}

const clean = (html) => sanitizeHtml(html, {
  allowedTags: ['p', 'br', 'strong', 'em', 'del', 'a', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote', 'h2', 'h3', 'h4', 'hr', 'img', 'video', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'figure', 'figcaption'],
  allowedAttributes: { a: ['href', 'rel', 'target'], img: ['src', 'alt', 'loading'], video: ['src', 'poster', 'controls', 'preload', 'playsinline'], h2: ['id'], h3: ['id'], h4: ['id'], code: ['class'] },
  allowedClasses: { code: [/^language-[a-z0-9+-]+$/] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['https'], video: ['https'] },
  allowProtocolRelative: false,
  transformTags: {
    a: (tag, attribs) => {
      const external = /^https?:/i.test(attribs.href || '');
      return { tagName: 'a', attribs: { href: attribs.href || '', ...(external ? { rel: 'noopener noreferrer nofollow ugc', target: '_blank' } : {}) } };
    },
    img: (tag, attribs) => ({ tagName: 'img', attribs: { src: attribs.src, alt: attribs.alt || '', loading: 'lazy' } }),
  },
  exclusiveFilter: (f) => (f.tag === 'img' || f.tag === 'video') && !allowedMediaUrl(f.attribs.src),
});

// ::video[alt](url) on its own line becomes a <video>. The URL must pass allowedMediaUrl.
const embedVideos = (html) => html.replace(/<p>::video<a href="([^"]+)"[^>]*>[^<]*<\/a><\/p>/g, (m, url) => {
  const u = url.replace(/&amp;/g, '&');
  return allowedMediaUrl(u) ? `<video src="${esc(u)}" controls preload="none" playsinline></video>` : '';
});

export function renderLite(md) { return clean(lite.render(linkify(md || ''))); }

export function renderArticle(md) {
  const toc = [];
  const used = new Set();
  const env = {};
  const tokens = full.parse(linkify(md || ''), env);
  tokens.forEach((t, i) => {
    if (t.type !== 'heading_open' || !['h2', 'h3'].includes(t.tag)) return;
    const text = tokens[i + 1].children?.filter((c) => c.type === 'text' || c.type === 'code_inline').map((c) => c.content).join('') || '';
    let id = 'h-' + slugify(text), n = 2;
    while (used.has(id)) id = `h-${slugify(text)}-${n++}`;
    used.add(id);
    t.attrSet('id', id);
    toc.push({ id, text, level: +t.tag[1] });
  });
  const html = clean(embedVideos(full.renderer.render(tokens, full.options, env)));
  const words = (md || '').replace(/```[\s\S]*?```/g, ' ').split(/\s+/).filter(Boolean).length;
  return { html, toc, minutes: Math.max(1, Math.round(words / 200)) };
}

export const toText = (html) => sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
export const excerptOf = (html, n = 200) => { const t = toText(html); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
