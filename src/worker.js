// Cloudflare Worker: proxies the allow-listed NASA/JPL APIs and serves the static
// page from ./public via the ASSETS binding.
import { ROUTES } from './routes.js';

const CACHE_SECONDS = 600;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const build = ROUTES[url.pathname];
    if (!build) {
      if (url.pathname.startsWith('/api/')) return json(404, { error: 'Not found' });
      return env.ASSETS.fetch(request);
    }
    if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });

    const target = build(url.searchParams);
    if (!target) return json(400, { error: 'Invalid request' });
    try {
      const upstream = await fetch(target, {
        cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
        signal: AbortSignal.timeout(20_000),
      });
      if (!upstream.ok) return json(502, { error: `Could not reach NASA/JPL: Upstream ${upstream.status}` });
      return new Response(upstream.body, {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': `public, max-age=${CACHE_SECONDS}`,
        },
      });
    } catch (err) {
      return json(502, { error: `Could not reach NASA/JPL: ${err.message}` });
    }
  },
};
