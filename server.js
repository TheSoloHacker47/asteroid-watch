// Local dev server: serves the static page and proxies NASA/JPL APIs (they send
// no CORS headers). In production the Worker in src/worker.js does the same job.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES } from './src/routes.js';

const PORT = Number(process.env.PORT) || 5173;
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

async function fetchCached(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.body;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Upstream ${res.status}`);
  const body = await res.text();
  cache.set(url, { at: Date.now(), body });
  return body;
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

async function handleApi(res, build, search) {
  const target = build(search);
  if (!target) return send(res, 400, JSON.stringify({ error: 'Invalid request' }));
  try {
    send(res, 200, await fetchCached(target.toString()));
  } catch (err) {
    send(res, 502, JSON.stringify({ error: `Could not reach NASA/JPL: ${err.message}` }));
  }
}

async function handleStatic(res, pathname) {
  const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden', 'text/plain');
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    send(res, 404, 'Not found', 'text/plain');
  }
}

createServer((req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');
  if (req.method !== 'GET') return send(res, 405, 'Method not allowed', 'text/plain');
  const build = ROUTES[pathname];
  if (build) return handleApi(res, build, searchParams);
  return handleStatic(res, pathname);
}).listen(PORT, () => {
  console.log(`Asteroid tracker running at http://localhost:${PORT}`);
});
