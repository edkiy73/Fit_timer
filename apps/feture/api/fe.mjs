// `POST /api/fe` — the new FetUre command endpoint (docs/server/S2-API.md).
// `POST /api/fe?jobs=1` with `Authorization: Bearer <FETURE_JOBS_SECRET>` runs one queue-worker tick.
// Off (503 unavailable) until its environment is configured; the legacy /api/domain keeps working meanwhile.
import '../lib/product.js';
import postgres from 'postgres';
import { createRequire } from 'node:module';
import { createHash, timingSafeEqual } from 'node:crypto';
import { POSTGRES_TYPES, fromPostgres } from '../server/db.mjs';
import { createFeHandler } from '../server/handler.mjs';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { access } from '../server/commands/access.mjs';
import { couples } from '../server/commands/couples.mjs';
import { staff } from '../server/commands/staff.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { moderation } from '../server/commands/moderation.mjs';
import { staffCounts } from '../server/commands/staff-counts.mjs';
import { communities } from '../server/commands/communities.mjs';
import { events } from '../server/commands/events.mjs';
import { photos } from '../server/commands/photos.mjs';
import { gallery } from '../server/commands/gallery.mjs';
import { discover } from '../server/commands/discover.mjs';
import { chats } from '../server/commands/chats.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { people } from '../server/commands/people.mjs';
import { premium } from '../server/commands/premium.mjs';
import { verification } from '../server/commands/verification.mjs';
import { accounts } from '../server/commands/account.mjs';
import { support, takeHelp } from '../server/commands/support.mjs';
import { runJobs } from '../server/jobs.mjs';
import { dsa, takeNotice } from '../server/commands/dsa.mjs';
import { readJson } from '../server/handler.mjs';
import { createR2Storage } from '../server/media/r2.mjs';
import { bunnyFromEnv } from '../server/media/bunny.mjs';
import { uploadUrlFor } from '../server/media/upload-proxy.mjs';
import { createSupabaseStorage } from '../server/media/supabase-storage.mjs';
import { signedStorageDelivery, tokenDelivery } from '../server/media/delivery.mjs';
import { createSharpRenderer } from '../server/media/render.mjs';
import { broadcastSender, createSignals } from '../server/realtime.mjs';
import { pushTransport } from '../server/push.mjs';
import { webPushFromEnv } from '../server/webpush.mjs';
import { appUrl, coreMailer } from '../server/core-guard.mjs';

const require = createRequire(import.meta.url);
const { store } = require('../../../packages/core/server/store');
const { allowedOrigin, rateOkScoped, ipHash } = require('../../../packages/core/server/util');
const Supabase = require('../../../packages/core/server/supabase');
const CorePush = require('../../../packages/core/server/push');
const { authenticate } = require('../lib/feture/identity');

const env = process.env;
const configured = !!(env.FETURE_DATABASE_URL && env.FETURE_ID_PEPPER);

// One small pool per warm instance; Supavisor transaction mode needs prepare:false.
const POOL = 5;
const sql = configured
  ? postgres(env.FETURE_DATABASE_URL, { prepare: false, max: POOL, idle_timeout: 60, connect_timeout: 8, types: POSTGRES_TYPES })
  : null;

/** Media backend: bunny.net when configured (the self-hosted server), else Cloudflare R2 + media domain, else the
 * prelaunch Supabase Storage bucket with signed URLs (owner decision 27.10.2026). */
function mediaBackend() {
  // bunny.net (docs/infra/migration-plan.md): Edge Storage + signed Pull Zone links; uploads go through our own
  // `/api/fe-upload` (server/host.mjs), so this needs the API's public origin and the upload ticket secret.
  if (env.FETURE_UPLOAD_SECRET && env.FETURE_API_ORIGIN) {
    const storage = bunnyFromEnv(env, uploadUrlFor(env.FETURE_UPLOAD_SECRET, env.FETURE_API_ORIGIN));
    if (storage) return { storage, delivery: signedStorageDelivery(storage), renderer: createSharpRenderer() };
  }
  if (env.R2_ENDPOINT && env.R2_BUCKET && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.FETURE_MEDIA_TOKEN_SECRET && env.FETURE_MEDIA_ORIGIN) {
    const storage = createR2Storage({ endpoint: env.R2_ENDPOINT, bucket: env.R2_BUCKET, accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY });
    return { storage, delivery: tokenDelivery(env.FETURE_MEDIA_TOKEN_SECRET, env.FETURE_MEDIA_ORIGIN), renderer: null };
  }
  if (env.FETURE_MEDIA_BUCKET && Supabase.configured()) {
    const storage = createSupabaseStorage(Supabase, { bucket: env.FETURE_MEDIA_BUCKET, baseUrl: String(env.SUPABASE_URL).replace(/\/$/, '') });
    return { storage, delivery: signedStorageDelivery(storage), renderer: createSharpRenderer() };
  }
  return { storage: null, delivery: null, renderer: null };
}
const media = mediaBackend();

/** Core's origin policy with this endpoint's headers. Core's cors() answers the preflight before a caller
 * could add X-Fe-Profile, so the headers are set here, before any response is sent. */
export function cors(/** @type {any} */ req, /** @type {any} */ res) {
  const origin = allowedOrigin(req);
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  if (origin && origin !== '*') res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Fit-Email, X-Fit-Device, X-Fit-Token, X-Fe-Profile');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return true; }
  return false;
}

const db = sql ? fromPostgres(sql, POOL) : null;

/** Web push with our own VAPID keys (FE_VAPID_PUBLIC_KEY / FE_VAPID_PRIVATE_KEY / FE_VAPID_SUBJECT); off without them. */
const webPush = configured ? webPushFromEnv(env) : null;

/** Realtime «something new» signals (S2 §8): public Broadcast channels named by an opaque per-profile token, so no
 * JWT secret is needed. The URL and publishable key are public (they go to the client); the secret key only sends. */
const supabaseUrl = String(env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const realtimeOn = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl) && !!env.SUPABASE_PUBLISHABLE_KEY && !!env.SUPABASE_SECRET_KEY;
const signals = db && realtimeOn ? createSignals({
  db, pepper: env.FETURE_ID_PEPPER ?? '',
  sender: broadcastSender({ url: supabaseUrl, secret: String(env.SUPABASE_SECRET_KEY) }),
  onError: code => console.warn('feture_fe_realtime', code),
}) : null;
/** A verified Core session is reused for 30 s per warm instance (keyed by a hash of the identity headers), so most
 * requests skip one store round trip. A sign-out reaches every instance within 30 s. */
const AUTH_TTL = 30000;
/** @type {Map<string, {at: number, core: Promise<any>}>} */
const authCache = new Map();
/** @param {any} req */
async function cachedAuth(req) {
  const h = (/** @type {string} */ n) => String(req.headers?.[n] ?? '');
  const key = createHash('sha256').update([h('x-fit-email'), h('x-fit-device'), h('x-fit-token')].join('\n')).digest('base64url');
  const hit = authCache.get(key);
  if (hit && Date.now() - hit.at < AUTH_TTL) return hit.core;
  // The promise is cached, not the result: the screen's first requests arrive together and share one check.
  const core = authenticate(req, store);
  if (authCache.size > 5000) authCache.clear();
  const entry = { at: Date.now(), core };
  authCache.set(key, entry);
  core.catch(() => { if (authCache.get(key) === entry) authCache.delete(key); }); // a refusal or an outage is never kept
  return core;
}

const handler = db && createFeHandler({
  db,
  pepper: env.FETURE_ID_PEPPER ?? '',
  cfg: { media: { storage: media.storage, delivery: media.delivery }, realtime: signals ? { url: supabaseUrl, key: String(env.SUPABASE_PUBLISHABLE_KEY) } : null,
    push: webPush ? { webKey: webPush.publicKey } : null,
    // Payment providers plug in here once their keys exist (server/commands/premium.mjs «Payments»); none yet.
    billing: { providers: [] } },
  signals,
  commands: { ...platform, ...me, ...access, ...couples, ...staff, ...staffCounts, ...social, ...posts, ...moderation, ...communities, ...events, ...photos, ...gallery, ...discover, ...chats, ...inbox, ...people, ...premium, ...verification, ...accounts, ...dsa, ...support },
  authenticate: req => cachedAuth(req),
  quota: async (req, coreKey) => { // coreKey: Core account hash, only for the ephemeral rate-limit key
    // Same budget as /api/domain: per account across devices and IPs, plus a per-IP cap (the same keys
    // rateOkScoped(req, 'feture-fe-ip', 1200, '', 60, true) uses). Both counters and their expiry go in ONE store
    // request: each separate one is a full round trip to the store (60–300 ms seen in the access log).
    const window = Math.floor(Date.now() / 60000);
    const account = `rl:feture-fe-account:${coreKey}:${window}`;
    const ip = `rl:feture-fe-ip:${ipHash(req)}:${window}`;
    const [count, , ipCount] = await store.pipe([['INCR', account], ['EXPIRE', account, '65'], ['INCR', ip], ['EXPIRE', ip, '65']]);
    const ipMax = process.env.ALLOW_MEMORY_STORE === '1' ? 1200 * 50 : 1200;
    return Number(count) <= 600 && Number(ipCount) <= ipMax;
  },
  cors,
  log: event => console.info('feture_fe_access', JSON.stringify(event)),
  // The new-device email goes straight to the signed-in address (never stored): server/signin.mjs.
  mail: configured ? coreMailer() : null,
  appUrl: appUrl(),
});

/** @param {string} given @param {string} expected */
function sameSecret(given, expected) {
  const a = Buffer.from(given), b = Buffer.from(expected);
  return expected.length >= 32 && a.length === b.length && timingSafeEqual(a, b);
}

/** @param {any} res @param {number} status @param {object} body */
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

/** @param {any} req @param {string} name */
const flag = (req, name) => new URL(String(req.url || '/'), 'http://x').searchParams.get(name) === '1';

export default async function fe(/** @type {any} */ req, /** @type {any} */ res) {
  if (flag(req, 'jobs')) {
    const auth = String(req.headers?.authorization || '');
    if (req.method !== 'POST' || !sameSecret(auth.replace(/^Bearer /, ''), env.FETURE_JOBS_SECRET ?? '')) return json(res, 401, { ok: false });
    if (!db) return json(res, 503, { ok: false, error: 'unavailable' });
    try {
      const scan = media.storage ? { storage: /** @type {any} */ (media.storage), scanner: null, classifier: null, renderer: media.renderer } : null;
      // Browsers get web push with our VAPID keys; phones go through Core's FCM/APNs once its keys are set.
      const info = CorePush.pushInfo();
      const push = pushTransport({ native: info.android || info.ios ? CorePush.sendToDevice : null, web: webPush });
      // Only a real sending domain: Resend's test domain delivers to its owner alone.
      const mail = coreMailer();
      return json(res, 200, { ok: true, ...(await runJobs(db, { scan, push, mail, signals })) });
    } catch {
      return json(res, 503, { ok: false, error: 'unavailable' });
    }
  }
  if (flag(req, 'notice')) {
    // The public notice form (DSA art. 16): no account needed. JSON only (so another site cannot post it through its
    // visitors without a preflight), from our own origins, a few an hour per network address, a cap for everyone
    // together, and at most three a day naming the same reply address (we never become a way to mail strangers).
    if (cors(req, res)) return;
    if (req.method !== 'POST') return json(res, 405, { ok: false });
    if (!/^application\/json\b/i.test(String(req.headers?.['content-type'] || ''))) return json(res, 415, { ok: false, error: 'json_only' });
    const origin = req.headers?.origin;
    const allowed = allowedOrigin(req);
    if (origin && allowed !== '*' && allowed !== origin) return json(res, 403, { ok: false });
    if (!db) return json(res, 503, { ok: false, error: 'unavailable' });
    if (!(await rateOkScoped(req, 'feture-notice-ip', 5, '', 3600, true))) return json(res, 429, { ok: false, error: 'rate_limited' });
    if (!(await rateOkScoped(req, 'feture-notice-all', 200, 'all', 3600, true))) return json(res, 429, { ok: false, error: 'rate_limited' });
    try {
      const body = await readJson(req);
      const email = typeof body.senderEmail === 'string' ? body.senderEmail.trim().toLowerCase() : '';
      if (email && !(await rateOkScoped(req, 'feture-notice-to', 3, createHash('sha256').update(email).digest('hex'), 86400, true))) return json(res, 429, { ok: false, error: 'rate_limited' });
      const out = await takeNotice(db, body);
      return json(res, out.status, out.body);
    } catch (error) {
      const status = /** @type {any} */ (error)?.status;
      return json(res, status === 400 || status === 413 ? status : 503, { ok: false, error: status === 413 ? 'too_large' : status === 400 ? 'invalid_input' : 'unavailable' });
    }
  }
  if (flag(req, 'help')) {
    // «Нужна помощь со входом»: a message to support without an account. Same guards as the public notice form: JSON
    // only, our own origins, a few an hour per network address, a cap for everyone together, and at most three an hour
    // naming the same contact (we never become a way to flood one mailbox).
    if (cors(req, res)) return;
    if (req.method !== 'POST') return json(res, 405, { ok: false });
    if (!/^application\/json\b/i.test(String(req.headers?.['content-type'] || ''))) return json(res, 415, { ok: false, error: 'json_only' });
    const origin = req.headers?.origin;
    const allowed = allowedOrigin(req);
    if (origin && allowed !== '*' && allowed !== origin) return json(res, 403, { ok: false });
    if (!db) return json(res, 503, { ok: false, error: 'unavailable' });
    if (!(await rateOkScoped(req, 'feture-help-ip', 5, '', 3600, true))) return json(res, 429, { ok: false, error: 'rate_limited' });
    if (!(await rateOkScoped(req, 'feture-help-all', 100, 'all', 3600, true))) return json(res, 429, { ok: false, error: 'rate_limited' });
    try {
      const body = await readJson(req);
      const contact = typeof body.contact === 'string' ? body.contact.trim().toLowerCase() : '';
      if (contact && !(await rateOkScoped(req, 'feture-help-to', 3, createHash('sha256').update(contact).digest('hex'), 3600, true))) return json(res, 429, { ok: false, error: 'rate_limited' });
      const out = await takeHelp(db, body);
      return json(res, out.status, out.body);
    } catch (error) {
      const status = /** @type {any} */ (error)?.status;
      return json(res, status === 400 || status === 413 ? status : 503, { ok: false, error: status === 413 ? 'too_large' : status === 400 ? 'invalid_input' : 'unavailable' });
    }
  }
  if (handler) return handler(req, res);
  if (cors(req, res)) return;
  return json(res, 503, { ok: false, error: 'unavailable' });
}
