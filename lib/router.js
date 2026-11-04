// One function serves every dynamic route (Vercel Hobby allows 12 functions). vercel.json rewrites pass the original path as ?__p=
import * as pub from './public.js';
import * as adm from './admin.js';
import { requireAdmin } from './auth.js';
import { json } from './util.js';

const A = (fn) => async (request, params) => requireAdmin(request) || fn(request, params);

const routes = [
  ['GET', 'feed', pub.feedPage],
  ['GET', 'feed/post/:id', pub.postPage],
  ['GET', 'feed/newsletter/:slug', pub.articlePage],
  ['GET', 'feed/notice', pub.noticePage],
  ['GET', 'feed/confirm', pub.confirmPage],
  ['GET', 'feed/unsubscribe', pub.unsubscribePage],
  ['GET', 'feed/rss.xml', pub.rss],
  ['GET', 'feed/sitemap.xml', pub.feedSitemap],
  ['GET', 'admin', adm.adminPage],

  ['GET', 'api/feed', pub.apiFeed],
  ['POST', 'api/react', pub.apiReact],
  ['POST', 'api/comment', pub.apiComment],
  ['POST', 'api/subscribe', pub.apiSubscribe],
  ['POST', 'api/confirm', pub.apiConfirm],
  ['POST', 'api/unsubscribe', pub.apiUnsubscribe],
  ['GET', 'api/media/:name', pub.devMedia],

  ['POST', 'api/admin/login', adm.login],
  ['POST', 'api/admin/logout', A(adm.logout)],
  ['GET', 'api/admin/me', adm.me],
  ['GET', 'api/admin/bootstrap', A(adm.bootstrap)],
  ['POST', 'api/admin/posts', A(adm.createPost)],
  ['GET', 'api/admin/posts/:id', A(adm.getPost)],
  ['PUT', 'api/admin/posts/:id', A(adm.updatePost)],
  ['DELETE', 'api/admin/posts/:id', A(adm.deletePost)],
  ['POST', 'api/admin/posts/:id/pin', A(adm.pinPost)],
  ['POST', 'api/admin/preview', A(adm.preview)],
  ['POST', 'api/admin/upload-sign', A(adm.uploadSign)],
  ['POST', 'api/admin/upload-local', A(adm.uploadLocal)],
  ['GET', 'api/admin/subscribers', A(adm.subscribersList)],
  ['GET', 'api/admin/comments', A(adm.commentsList)],
  ['POST', 'api/admin/comments', A(adm.moderate)],
  ['POST', 'api/admin/newsletter', A(adm.newsletter)],
];

function match(method, path) {
  const segs = path.split('/').filter(Boolean);
  let methodMismatch = false;
  for (const [m, pattern, handler] of routes) {
    const ps = pattern.split('/');
    if (ps.length !== segs.length) continue;
    const params = {};
    if (!ps.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = decodeURIComponent(segs[i])), true) : p === segs[i]))) continue;
    if (m === method || (method === 'HEAD' && m === 'GET')) return { handler, params };
    methodMismatch = true;
  }
  return { methodMismatch };
}

export async function route(request) {
  const url = new URL(request.url);
  const path = url.searchParams.get('__p') ?? url.pathname;
  const { handler, params, methodMismatch } = match(request.method, path);
  try {
    if (handler) return await handler(request, params);
  } catch (e) {
    if (e?.name === 'NotConfigured') return path.startsWith('api/') ? json({ error: 'not_configured' }, 503) : pub.unavailablePage();
    console.error('route error', path, e);
    return json({ error: 'server_error' }, 500);
  }
  if (methodMismatch) return json({ error: 'method_not_allowed' }, 405);
  return path.startsWith('api/') ? json({ error: 'not_found' }, 404) : pub.notFoundPage();
}
