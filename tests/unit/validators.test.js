import test from 'node:test';
import assert from 'node:assert/strict';
import { postInput, commentInput, subscribeInput, reactInput, uploadSignInput, feedQuery, mediaItem } from '../../lib/validators.js';

const ok = (s, v) => assert.equal(s.safeParse(v).success, true, JSON.stringify(s.safeParse(v).error?.issues));
const bad = (s, v, msg) => { const r = s.safeParse(v); assert.equal(r.success, false, 'expected failure: ' + JSON.stringify(v)); if (msg) assert.match(JSON.stringify(r.error.issues), msg); };
const img = { provider: 'static', type: 'image', id: '/assets/img/og.png', alt: 'x' };

test('images require alt text', () => { bad(mediaItem, { ...img, alt: '' }, /alt text/); ok(mediaItem, { provider: 'static', type: 'video', id: '/assets/v.mp4' }); });
test('media ids are constrained', () => { bad(mediaItem, { ...img, id: '/etc/../passwd' }); bad(mediaItem, { provider: 'static', type: 'image', id: '/other/x.png', alt: 'a' }); bad(mediaItem, { provider: 'local', type: 'image', id: 'x.png', alt: 'a' }); });
test('post rules per kind', () => {
  ok(postInput, { kind: 'post', bodyMd: 'hello #sql', tags: ['sql'] });
  bad(postInput, { kind: 'post', bodyMd: '' });
  bad(postInput, { kind: 'post', bodyMd: 'x'.repeat(1001) }, /1000/);
  bad(postInput, { kind: 'post', bodyMd: 'a', media: [{ ...img, type: 'video' }, { ...img, type: 'video' }] }, /one video/);
  bad(postInput, { kind: 'article', bodyMd: 'long enough body text here', title: '' }, /title/);
  bad(postInput, { kind: 'update', bodyMd: 'x', title: 't' }, /type/);
  ok(postInput, { kind: 'update', bodyMd: 'x', title: 't', updateType: 'job' });
  bad(postInput, { kind: 'story', bodyMd: '' });
  bad(postInput, { kind: 'story', bodyMd: 'x'.repeat(281) });
  ok(postInput, { kind: 'story', bodyMd: 'hi', bg: 'ink' });
});
test('tags are normalised and constrained', () => {
  assert.deepEqual(postInput.parse({ kind: 'post', bodyMd: 'a', tags: ['SQL'] }).tags, ['sql']);
  bad(postInput, { kind: 'post', bodyMd: 'a', tags: ['has space'] }); bad(postInput, { kind: 'post', bodyMd: 'a', tags: Array(11).fill('a') });
});
test('comment honeypot must be empty; lengths enforced', () => {
  ok(commentInput, { postId: 'abcdef1234', name: 'A', body: 'nice' });
  bad(commentInput, { postId: 'abcdef1234', name: 'A', body: 'nice', website: 'http://spam' });
  bad(commentInput, { postId: 'abcdef1234', name: '', body: 'nice' }); bad(commentInput, { postId: 'abcdef1234', name: 'A', body: 'x'.repeat(1001) });
});
test('subscribe email, emoji whitelist, uploads, feed query', () => {
  assert.equal(subscribeInput.parse({ email: ' A@B.co ' }).email, 'a@b.co'); bad(subscribeInput, { email: 'nope' });
  bad(reactInput, { id: 'abcdef1234', emoji: '💩' }); ok(reactInput, { id: 'abcdef1234', emoji: '🔥' });
  bad(uploadSignInput, { type: 'image/jpeg', size: 11 * 1024 * 1024 }, /too large/); ok(uploadSignInput, { type: 'video/mp4', size: 99 * 1024 * 1024 });
  bad(uploadSignInput, { type: 'image/svg+xml', size: 10 }); bad(uploadSignInput, { type: 'video/mp4', size: 101 * 1024 * 1024 });
  assert.equal(feedQuery.parse({}).limit, 10); bad(feedQuery, { tab: 'x' }); bad(feedQuery, { cursor: '1_a; drop' }); bad(feedQuery, { tag: 'A B' });
});
