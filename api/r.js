// Single Vercel Function for /feed, /admin and /api (see vercel.json rewrites).
// The router is imported lazily so a module-load failure is reported instead of crashing the invocation.
let loaded;

async function handle(request) {
  try {
    loaded ??= import('../lib/router.js');
    return await (await loaded).route(request);
  } catch (e) {
    loaded = undefined;
    console.error('feed function failed to load', e);
    // ponytail: message is shown while the deployment is being verified; drop it once /feed/ is confirmed healthy.
    return new Response(`Feed temporarily unavailable (${e.code || e.name}: ${String(e.message).split('\n')[0].slice(0, 200)})`, { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
