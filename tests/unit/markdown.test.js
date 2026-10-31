import test from 'node:test';
import assert from 'node:assert/strict';
import { renderLite, renderArticle, linkify } from '../../lib/markdown.js';

const attacks = [
  '<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '[x](javascript:alert(1))', '[x](data:text/html;base64,PHNjcmlwdD4=)',
  '<a href="javascript:alert(1)">x</a>', '![x](https://evil.example/a.png)', '<iframe src="https://evil.example"></iframe>', '<svg onload=alert(1)>',
  '[x](vbscript:alert(1))', '<style>*{display:none}</style>', '"><script>alert(1)</script>',
];
test('XSS payloads never reach the output (lite + article)', () => {
  for (const a of attacks) for (const out of [renderLite(a), renderArticle(a).html]) {
    // Escaped text such as "&lt;img onerror=...&gt;" is inert; what must never appear is a real tag, an on* attribute on a tag, or a script-capable URL.
    assert.doesNotMatch(out, /<(script|iframe|svg|style|img)|<[a-z]+\s[^>]*\son\w+=|<[a-z]+\s[^>]*(href|src)="(javascript|vbscript|data):|<img[^>]*evil\.example\/a\.png/i, `${a} -> ${out}`);
  }
});
test('lite markdown: bold, italic, code, links; external links are hardened', () => {
  const h = renderLite('**b** *i* `c` [l](https://example.com)');
  assert.match(h, /<strong>b<\/strong>/); assert.match(h, /<em>i<\/em>/); assert.match(h, /<code>c<\/code>/);
  assert.match(h, /href="https:\/\/example.com" rel="noopener noreferrer nofollow ugc" target="_blank"/);
});
test('lite markdown has no headings or images', () => {
  assert.doesNotMatch(renderLite('# big\n\n![a](https://res.cloudinary.com/x/a.png)'), /<h1|<img/);
});
test('hashtags and mentions become links, but not inside code', () => {
  const h = renderLite('hi #SQL and @octocat `#nope` a@b.com');
  assert.match(h, /href="\/feed\/\?tag=sql"/); assert.match(h, /href="https:\/\/github.com\/octocat"/);
  assert.doesNotMatch(h, /tag=nope/);
  assert.equal(linkify('```\n#x\n```'), '```\n#x\n```');
});
test('article: toc, unique heading ids, reading time, code blocks', () => {
  const r = renderArticle('## One\n\ntext\n\n## One\n\n### Two\n\n```sql\nselect 1;\n```\n');
  assert.deepEqual(r.toc.map((t) => t.id), ['h-one', 'h-one-2', 'h-two']);
  assert.match(r.html, /<h2 id="h-one">/); assert.match(r.html, /<code class="language-sql">/);
  assert.equal(r.minutes, 1);
});
test('article images only from allowed hosts; local paths ok', () => {
  assert.match(renderArticle('![ok](/assets/img/og.png)').html, /<img src="\/assets\/img\/og.png"/);
  assert.doesNotMatch(renderArticle('![no](https://evil.example/x.png)').html, /<img/);
});
test('::video embeds only allowed URLs', () => {
  assert.match(renderArticle('::video[clip](/api/media/abcdef0123456789.mp4)').html, /<video src="\/api\/media\/abcdef0123456789.mp4" controls/);
  assert.doesNotMatch(renderArticle('::video[clip](https://evil.example/v.mp4)').html, /<video/);
});
