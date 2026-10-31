import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SESSION_SECRET = 'unit-test-secret-unit-test-secret-1234';
const { hashPassword, verifyPassword, sessionCookie, isAdmin, requireAdmin, SESSION_COOKIE } = await import('../../lib/auth.js');
const { isPrivateIp } = await import('../../lib/linkpreview.js');

const req = (cookie, method = 'GET', headers = {}) => new Request('http://localhost:4310/api/admin/x', { method, headers: { host: 'localhost:4310', ...(cookie ? { cookie } : {}), ...headers } });
const cookieOf = (setCookie) => setCookie.split(';')[0];

test('scrypt hash round-trips and rejects wrong passwords', () => {
  process.env.ADMIN_PASSWORD_HASH = hashPassword('correct horse battery');
  assert.equal(verifyPassword('correct horse battery'), true); assert.equal(verifyPassword('wrong'), false); assert.equal(verifyPassword(''), false);
  delete process.env.ADMIN_PASSWORD_HASH;
});
test('no password configured means nobody gets in', () => { delete process.env.ADMIN_PASSWORD_HASH; delete process.env.ADMIN_PASSWORD; assert.equal(verifyPassword('anything'), false); });
test('plain ADMIN_PASSWORD works outside production only', () => {
  process.env.ADMIN_PASSWORD = 'dev-pass'; assert.equal(verifyPassword('dev-pass'), true);
  process.env.NODE_ENV = 'production'; assert.equal(verifyPassword('dev-pass'), false); process.env.NODE_ENV = 'test'; delete process.env.ADMIN_PASSWORD;
});
test('session cookie is HttpOnly + SameSite=Strict, verifies, and tampering fails', () => {
  const sc = sessionCookie();
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/);
  const c = cookieOf(sc);
  assert.equal(isAdmin(req(c)), true);
  assert.equal(isAdmin(req(c.slice(0, -2) + 'ab')), false);
  assert.equal(isAdmin(req(`${SESSION_COOKIE()}=${Date.now() + 1e9}.deadbeef`)), false);
  assert.equal(isAdmin(req(`${SESSION_COOKIE()}=${Date.now() - 1}.x`)), false);
  assert.equal(isAdmin(req()), false);
});
test('requireAdmin: 401 without session; writes need same-origin + X-Requested-With', () => {
  assert.equal(requireAdmin(req())?.status, 401);
  const c = cookieOf(sessionCookie());
  assert.equal(requireAdmin(req(c)), null);
  assert.equal(requireAdmin(req(c, 'POST'))?.status, 403);
  assert.equal(requireAdmin(req(c, 'POST', { origin: 'http://evil.example', 'x-requested-with': 'fetch' }))?.status, 403);
  assert.equal(requireAdmin(req(c, 'POST', { origin: 'http://localhost:4310' }))?.status, 403);
  assert.equal(requireAdmin(req(c, 'POST', { origin: 'http://localhost:4310', 'x-requested-with': 'fetch' })), null);
});
test('SSRF guard flags private ranges', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.16.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1', '100.64.0.1']) assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700::1111']) assert.equal(isPrivateIp(ip), false, ip);
});
