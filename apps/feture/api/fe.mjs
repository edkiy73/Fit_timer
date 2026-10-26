// `POST /api/fe` — the new FetUre command endpoint (docs/server/S2-API.md).
// Off (503 unavailable) until its environment is configured; the legacy /api/domain keeps working meanwhile.
import '../lib/product.js';
import postgres from 'postgres';
import { createRequire } from 'node:module';
import { fromPostgres } from '../server/db.mjs';
import { createFeHandler } from '../server/handler.mjs';
import { platform } from '../server/commands/platform.mjs';
import { createR2Storage } from '../server/media/r2.mjs';

const require = createRequire(import.meta.url);
const { store } = require('../../../packages/core/server/store');
const { cors, rateOkScoped } = require('../../../packages/core/server/util');
const { authenticate } = require('../lib/feture/identity');

const env = process.env;
const configured = !!(env.FETURE_DATABASE_URL && env.FETURE_ID_PEPPER && env.FETURE_MEDIA_TOKEN_SECRET);

// One small pool per warm instance; Supavisor transaction mode needs prepare:false.
const sql = configured
  ? postgres(env.FETURE_DATABASE_URL, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 8 })
  : null;

const storage = env.R2_ENDPOINT && env.R2_BUCKET && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY
  ? createR2Storage({ endpoint: env.R2_ENDPOINT, bucket: env.R2_BUCKET, accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY })
  : null;

const handler = sql && createFeHandler({
  db: fromPostgres(sql),
  pepper: env.FETURE_ID_PEPPER ?? '',
  cfg: { media: { storage, tokenSecret: env.FETURE_MEDIA_TOKEN_SECRET ?? '', mediaOrigin: env.FETURE_MEDIA_ORIGIN ?? '' } },
  commands: { ...platform },
  authenticate: req => authenticate(req, store),
  quota: async (req, coreKey) => {
    // Same budget as /api/domain: per account across devices and IPs, plus a per-IP cap.
    const window = Math.floor(Date.now() / 60000);
    const count = await store.incr(`rl:feture-fe-account:${coreKey}:${window}`, 65);
    return count <= 120 && await rateOkScoped(req, 'feture-fe-ip', 240, '', 60, true);
  },
  cors,
  log: event => console.info('feture_fe_access', JSON.stringify(event)),
});

export default async function fe(req, res) {
  if (handler) return handler(req, res);
  if (cors(req, res)) return;
  res.statusCode = 503;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ ok: false, error: 'unavailable' }));
}
