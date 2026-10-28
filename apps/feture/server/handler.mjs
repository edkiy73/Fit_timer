// @ts-check
import { randomUUID } from 'node:crypto';
import { resolveAccount } from './accounts.mjs';
import { FeError, fail } from './errors.mjs';
import { once } from './ops.mjs';
import { actingProfile } from './profiles.mjs';
import { limit } from './limits.mjs';

/**
 * `POST /api/fe` — the new command endpoint (docs/server/S2-API.md). Domains register commands;
 * this file owns everything they share: auth, quota, body limit, schema check, acting profile,
 * transaction, idempotency, error mapping and the access log.
 * @typedef {import('./db.mjs').Db} Db @typedef {import('./db.mjs').Q} Q
 * @typedef {import('./accounts.mjs').AccountRow} AccountRow @typedef {import('./profiles.mjs').Acting} Acting
 * @typedef {{media: import('./media/assets.mjs').MediaConfig, pepper?: string, realtime?: {url: string, key: string} | null,
 *   push?: {webKey: string} | null}} Cfg
 *   pepper is filled in by the handler; realtime: the public Supabase URL and publishable key for the client socket;
 *   push.webKey: the public VAPID key browsers subscribe with (the private one never leaves the job worker)
 * @typedef {{
 *   input: import('zod').ZodType, profile: boolean, write: boolean, ledger?: boolean, allowPaused?: boolean,
 *   rate?: {kind: string, max: number, window: string},
 *   run: (q: Q, ctx: {account: AccountRow, acting: Acting | null, input: any, cfg: Cfg, coreAccountHash: string,
 *     signal: (profileId: string | null | undefined, kind: import('./realtime.mjs').Kind, tag?: string) => void,
 *     channels: (q: Q, profileIds: string[]) => Promise<Record<string, string>>}) => Promise<Record<string, unknown>>
 * }} Command
 * @typedef {{headers: Record<string, string | string[] | undefined>, method?: string, body?: unknown,
 *   [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array>}} Req
 * @typedef {{statusCode: number, setHeader: (k: string, v: string) => void, end: (s?: string) => void}} Res
 */

export const MAX_BODY = 16 * 1024;

/**
 * @param {{db: Db, pepper: string, cfg: Cfg, commands: Record<string, Command>,
 *   authenticate: (req: Req) => Promise<{accountHash: string, accountGeneration?: string}>,
 *   quota: (req: Req, coreKey: string) => Promise<boolean>,
 *   cors: (req: Req, res: Res) => boolean,
 *   log: (event: {requestId: string, action: string, outcome: string, ms: number, stages: Record<string, number>}) => void,
 *   signals?: import('./realtime.mjs').Signals | null}} deps
 */
export function createFeHandler({ db, pepper, cfg, commands, authenticate, quota, cors, log, signals = null }) {
  /** @param {Req} req @param {Res} res */
  return async function handler(req, res) {
    const requestId = randomUUID();
    let action = 'unknown';
    // Stage timings (ms) for the access log and Server-Timing: where a slow request spends its time.
    const t0 = Date.now(); let tPrev = t0;
    /** @type {[string, number][]} */
    const stages = [];
    const mark = (/** @type {string} */ name) => { const now = Date.now(); stages.push([name, now - tPrev]); tPrev = now; };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Request-ID', requestId);
    if (cors(req, res)) return;
    /** @param {number} status @param {Record<string, unknown>} body @param {string} outcome */
    const send = (status, body, outcome) => {
      mark('cmd');
      const ms = Date.now() - t0;
      try { log({ requestId, action, outcome, ms, stages: Object.fromEntries(stages) }); } catch { /* logging never breaks the response */ }
      try { res.setHeader('Server-Timing', stages.map(([n, d]) => `${n};dur=${d}`).concat(`total;dur=${ms}`).join(', ')); } catch { /* headers already sent */ }
      res.statusCode = status;
      res.end(JSON.stringify({ ...body, requestId }));
    };
    try {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        return send(405, { ok: false, error: 'method_not_allowed' }, 'method_not_allowed');
      }
      let core;
      try { core = await authenticate(req); mark('auth'); } catch (error) {
        // Only the identity check may answer 401; a 401 from storage or another backend is an outage.
        const status = /** @type {{status?: unknown}} */ (error)?.status;
        fail(status === 401 ? 401 : 503, status === 401 ? 'auth_required' : 'unavailable');
      }
      const allowed = await quota(req, core.accountHash); mark('quota');
      if (!allowed) {
        res.setHeader('Retry-After', '60');
        fail(429, 'rate_limited');
      }
      const body = await readJson(req);
      action = typeof body.action === 'string' && Object.hasOwn(commands, body.action) ? body.action : 'unknown';
      const cmd = commands[action];
      if (!cmd) fail(400, 'invalid_input', { fields: ['action'] });
      const { action: _, ...rest } = body;
      const parsed = cmd.input.safeParse(rest);
      if (!parsed.success) fail(400, 'invalid_input', { fields: [...new Set(parsed.error.issues.map(i => i.path.join('.') || '(root)'))] });
      const input = parsed.data;
      const account = await resolveAccount(db, pepper, core); mark('account');
      const profileId = header(req, 'x-fe-profile');
      // Per-account limits are committed on their own, before the command: a failed attempt (not found, rule) still counts.
      const rate = cmd.rate;
      const replay = rate && typeof input.opId === 'string'
        && (await db.query('select 1 from feture.op_ledger where account_id = $1 and op_id = $2', [account.id, input.opId])).length > 0;
      if (rate && !replay) await db.tx(q => limit(q, account.id, rate.kind, rate.max, rate.window));
      mark('rate');
      // Membership is checked before a stored result can be replayed: a former member gets 403, not old results.
      if (cmd.profile) await actingProfile(db, account.id, profileId, { write: cmd.write, allowPaused: cmd.allowPaused });
      mark('acting');
      // Realtime signals a command asks for go out only after its transaction committed (S2 §8).
      /** @type {import('./realtime.mjs').Signal[]} */
      let pending = [];
      /** @param {string | null | undefined} profile @param {import('./realtime.mjs').Kind} kind @param {string} [tag] */
      const signal = (profile, kind, tag) => { if (profile) pending.push(tag ? { profile, kind, tag } : { profile, kind }); };
      const channels = signals ? signals.channels : async () => ({});
      /** @param {Q} q */
      const exec = async q => {
        pending = []; // a retried transaction starts over
        const acting = cmd.profile ? await actingProfile(q, account.id, profileId, { write: cmd.write, allowPaused: cmd.allowPaused }) : null;
        // coreAccountHash is stable across Core re-registrations; only for markers that must survive them (under-18).
        return cmd.run(q, { account, acting, input, cfg: { ...cfg, pepper }, coreAccountHash: core.accountHash, signal, channels });
      };
      const result = !cmd.write ? await exec(db)
        // The acting profile is part of the request: the same opId under another profile is a conflict, not a replay.
        : typeof input.opId === 'string' && cmd.ledger !== false ? await once(db, account.id, { opId: input.opId, action, input: { profileId, input } }, exec)
        : await db.tx(exec);
      if ('requestId' in result) throw new Error('reserved_result_field'); // the HTTP request id owns this name
      // Awaited (with the sender's short timeout) before answering: a serverless instance may freeze right after the
      // response. It never throws, so the committed command always answers ok.
      if (signals && pending.length) await signals.send(pending);
      return send(200, { ok: true, ...result }, 'ok');
    } catch (error) {
      if (error instanceof FeError) return send(error.status, { ok: false, error: error.code, ...error.extra }, error.code);
      return send(503, { ok: false, error: 'unavailable' }, 'error');
    }
  };
}

/** @param {Req} req @param {string} name */
function header(req, name) {
  const v = req.headers[name];
  return typeof v === 'string' ? v.trim() : '';
}

/** Vercel may hand a parsed body, a string/Buffer, or a stream. @param {Req} req @returns {Promise<Record<string, unknown>>} */
export async function readJson(req) {
  let raw;
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) raw = JSON.stringify(req.body);
  else if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) raw = String(req.body);
  else if (req[Symbol.asyncIterator]) {
    const chunks = [];
    let size = 0;
    for await (const chunk of /** @type {AsyncIterable<Uint8Array>} */ (req)) {
      size += chunk.length;
      if (size > MAX_BODY) fail(413, 'too_large');
      chunks.push(Buffer.from(chunk));
    }
    raw = Buffer.concat(chunks).toString('utf8');
  } else raw = '';
  if (Buffer.byteLength(raw) > MAX_BODY) fail(413, 'too_large');
  let value;
  try { value = JSON.parse(raw); } catch { fail(400, 'invalid_input', { fields: ['(body)'] }); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'invalid_input', { fields: ['(body)'] });
  return value;
}
