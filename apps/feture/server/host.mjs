// @ts-check
/** FetUre on its own server (docs/infra/migration-plan.md): one Node process instead of Vercel functions.
 * Same `(req, res)` handlers as on Vercel; this file only does what Vercel did around them:
 *   - `/api/<name>` → api/<name>.js|mjs, with the body read once like Vercel does (`req.body` parsed JSON and
 *     `req.rawBody` the exact text, so payment webhooks can check signatures);
 *   - `/api/config` → `/api/admin?public_config=1` (vercel.json rewrite);
 *   - `PUT /api/fe-upload` → the media upload proxy (bytes streamed to Bunny, never buffered);
 *   - static `dist/` with the cache headers from vercel.json;
 *   - `GET /api/fe-events` → realtime signals over SSE (server/realtime-sse.mjs; on Supabase it was Broadcast);
 *   - the queue worker tick once a minute (on Supabase it was pg_cron + pg_net + Vault).
 * Runs behind Caddy: `X-Forwarded-For` is whatever Caddy set (it drops a client-supplied one), so the first entry is
 * the real client address that Core's rate limits read. The port must stay inside the compose network.
 * Env: PORT (3000), STATIC_DIR (../dist), plus everything api/*.js read. */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bunnyFromEnv } from './media/bunny.mjs';
import { createUploadHandler } from './media/upload-proxy.mjs';
import { hub } from './realtime-sse.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const PORT = Number(env.PORT || 3000);
const STATIC_DIR = path.resolve(here, env.STATIC_DIR || '../dist');
const MAX_BODY = 4 * 1024 * 1024; // Core's own ceiling; FetUre commands cap far lower themselves
const require = createRequire(import.meta.url);

/** @type {Record<string, (req: any, res: any) => any>} */
const api = {};
for (const name of ['admin', 'auth', 'billing', 'catalog', 'domain', 'health', 'sync']) api[name] = require(`../api/${name}.js`);
api.fe = (await import(pathToFileURL(path.resolve(here, '../api/fe.mjs')).href)).default;

const bunny = bunnyFromEnv(env, undefined);
const upload = bunny && env.FETURE_UPLOAD_SECRET
  ? createUploadHandler({ secret: env.FETURE_UPLOAD_SECRET, storage: bunny, log: code => console.warn(code) })
  : null;

const TYPES = /** @type {Record<string, string>} */ ({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wasm': 'application/wasm',
});

/** @param {import('node:http').ServerResponse} res @param {number} status @param {string} error */
function fail(res, status, error) {
  if (res.headersSent) return res.end();
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ ok: false, error }));
}

/** Reads the body like Vercel: parsed JSON in `body` when it is JSON, the exact text in `rawBody`. @param {any} req */
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('too_large'), { status: 413 });
    chunks.push(chunk);
  }
  req.rawBody = Buffer.concat(chunks).toString('utf8');
  if (/^application\/json\b/i.test(String(req.headers['content-type'] || '')) && req.rawBody.trim()) {
    try { req.body = JSON.parse(req.rawBody); } catch { throw Object.assign(new Error('bad_json'), { status: 400 }); }
  }
}

/** @param {URL} url @param {import('node:http').ServerResponse} res */
function serveStatic(url, res) {
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { return fail(res, 400, 'bad_url'); }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.resolve(STATIC_DIR, '.' + rel);
  if (!file.startsWith(STATIC_DIR + path.sep)) return fail(res, 404, 'not_found');
  let stat;
  try { stat = statSync(file); } catch { /* missing */ }
  if (!stat || !stat.isFile()) return fail(res, 404, 'not_found');
  res.statusCode = 200;
  res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Content-Length', String(stat.size));
  // vercel.json: hashed assets forever, the entry page never, App Links file five minutes.
  if (rel.startsWith('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  else if (rel === '/index.html') res.setHeader('Cache-Control', 'no-cache');
  else if (rel === '/.well-known/assetlinks.json') res.setHeader('Cache-Control', 'public, max-age=300');
  else res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  createReadStream(file).pipe(res);
}

/** @param {import('node:http').IncomingMessage & {query?: any, body?: any, rawBody?: string}} req @param {import('node:http').ServerResponse} res */
async function handle(req, res) {
  let url;
  try { url = new URL(req.url || '/', 'http://local'); } catch { return fail(res, 400, 'bad_url'); }
  if (url.pathname === '/healthz') { res.statusCode = 200; res.setHeader('Cache-Control', 'no-store'); return res.end('ok'); }
  if (url.pathname === '/api/fe-upload') return upload ? upload(req, res) : fail(res, 503, 'unavailable');
  if (url.pathname === '/api/fe-events') return env.FETURE_REALTIME === 'sse' ? hub.handle(req, res) : fail(res, 503, 'unavailable');
  if (url.pathname === '/api/config') { url = new URL('/api/admin?public_config=1', url); req.url = url.pathname + url.search; }
  const m = /^\/api\/([a-z0-9_-]+)$/.exec(url.pathname);
  if (m) {
    const handler = api[m[1]];
    if (!handler) return fail(res, 404, 'not_found');
    req.query = Object.fromEntries(url.searchParams.entries());
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') await readBody(req);
      await handler(req, res);
    } catch (error) {
      const status = Number(/** @type {any} */ (error)?.status);
      if (!res.writableEnded) fail(res, status === 413 || status === 400 ? status : 500, status === 413 ? 'too_large' : status === 400 ? 'bad_json' : 'server_error');
      if (status !== 413 && status !== 400) console.error('feture_host_handler', m[1], /** @type {any} */ (error)?.message);
    }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'method');
  return serveStatic(url, res);
}

const server = createServer((req, res) => { handle(/** @type {any} */ (req), res).catch(() => fail(res, 500, 'server_error')); });
server.requestTimeout = 15 * 60 * 1000; // a 100 MB clip over a slow phone connection
server.headersTimeout = 60 * 1000;
server.keepAliveTimeout = 65 * 1000;
server.listen(PORT, '0.0.0.0', () => console.log(`feture host on :${PORT}, static ${STATIC_DIR}, uploads ${upload ? 'on' : 'off'}`));

/* Queue worker tick: once a minute, never two at a time. The same authenticated call pg_cron made. */
let ticking = false;
async function tick() {
  if (ticking || !env.FETURE_JOBS_SECRET) return;
  ticking = true;
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/fe?jobs=1`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.FETURE_JOBS_SECRET}`, 'Content-Type': 'application/json' }, body: '{}',
      signal: AbortSignal.timeout(55_000),
    });
    if (!res.ok) console.warn('feture_jobs_tick', res.status);
  } catch (error) {
    console.warn('feture_jobs_tick', /** @type {any} */ (error)?.name || 'error');
  } finally { ticking = false; }
}
if (env.FETURE_JOBS_DISABLED !== '1') setInterval(tick, 60_000).unref();

const stop = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 10_000).unref(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
