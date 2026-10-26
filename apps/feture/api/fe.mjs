// `POST /api/fe` — the new FetUre command endpoint (docs/server/S2-API.md).
// `POST /api/fe?jobs=1` with `Authorization: Bearer <FETURE_JOBS_SECRET>` runs one queue-worker tick.
// Off (503 unavailable) until its environment is configured; the legacy /api/domain keeps working meanwhile.
import '../lib/product.js';
import postgres from 'postgres';
import { createRequire } from 'node:module';
import { timingSafeEqual } from 'node:crypto';
import { fromPostgres } from '../server/db.mjs';
import { createFeHandler } from '../server/handler.mjs';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { access } from '../server/commands/access.mjs';
import { couples } from '../server/commands/couples.mjs';
import { staff } from '../server/commands/staff.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { moderation } from '../server/commands/moderation.mjs';
import { communities } from '../server/commands/communities.mjs';
import { events } from '../server/commands/events.mjs';
import { photos } from '../server/commands/photos.mjs';
import { discover } from '../server/commands/discover.mjs';
import { chats } from '../server/commands/chats.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { people } from '../server/commands/people.mjs';
import { runJobs } from '../server/jobs.mjs';
import { createR2Storage } from '../server/media/r2.mjs';
import { createSupabaseStorage } from '../server/media/supabase-storage.mjs';
import { signedStorageDelivery, tokenDelivery } from '../server/media/delivery.mjs';
import { createSharpRenderer } from '../server/media/render.mjs';

const require = createRequire(import.meta.url);
const { store } = require('../../../packages/core/server/store');
const { allowedOrigin, rateOkScoped } = require('../../../packages/core/server/util');
const Supabase = require('../../../packages/core/server/supabase');
const { authenticate } = require('../lib/feture/identity');

const env = process.env;
const configured = !!(env.FETURE_DATABASE_URL && env.FETURE_ID_PEPPER);

// One small pool per warm instance; Supavisor transaction mode needs prepare:false.
const sql = configured
  ? postgres(env.FETURE_DATABASE_URL, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 8 })
  : null;

/** Media backend: Cloudflare R2 + media domain when configured (after launch), otherwise the prelaunch
 * Supabase Storage bucket with signed URLs (owner decision 27.10.2026). */
function mediaBackend() {
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

const db = sql ? fromPostgres(sql) : null;
const handler = db && createFeHandler({
  db,
  pepper: env.FETURE_ID_PEPPER ?? '',
  cfg: { media: { storage: media.storage, delivery: media.delivery } },
  commands: { ...platform, ...me, ...access, ...couples, ...staff, ...social, ...posts, ...moderation, ...communities, ...events, ...photos, ...discover, ...chats, ...inbox, ...people },
  authenticate: req => authenticate(req, store),
  quota: async (req, coreKey) => { // coreKey: Core account hash, only for the ephemeral rate-limit key
    // Same budget as /api/domain: per account across devices and IPs, plus a per-IP cap.
    const window = Math.floor(Date.now() / 60000);
    const count = await store.incr(`rl:feture-fe-account:${coreKey}:${window}`, 65);
    return count <= 120 && await rateOkScoped(req, 'feture-fe-ip', 240, '', 60, true);
  },
  cors,
  log: event => console.info('feture_fe_access', JSON.stringify(event)),
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

export default async function fe(/** @type {any} */ req, /** @type {any} */ res) {
  if (String(req.url || '').includes('jobs=1')) {
    const auth = String(req.headers?.authorization || '');
    if (req.method !== 'POST' || !sameSecret(auth.replace(/^Bearer /, ''), env.FETURE_JOBS_SECRET ?? '')) return json(res, 401, { ok: false });
    if (!db) return json(res, 503, { ok: false, error: 'unavailable' });
    try {
      const scan = media.storage ? { storage: /** @type {any} */ (media.storage), scanner: null, classifier: null, renderer: media.renderer } : null;
      return json(res, 200, { ok: true, ...(await runJobs(db, { scan })) });
    } catch {
      return json(res, 503, { ok: false, error: 'unavailable' });
    }
  }
  if (handler) return handler(req, res);
  if (cors(req, res)) return;
  return json(res, 503, { ok: false, error: 'unavailable' });
}
