// @ts-check
import { randomUUID } from 'node:crypto';
import { resolveAccount } from './accounts.mjs';
import { FeError, fail } from './errors.mjs';
import { once } from './ops.mjs';
import { actingProfile } from './profiles.mjs';

/**
 * `POST /api/fe` — the new command endpoint (docs/server/S2-API.md). Domains register commands;
 * this file owns everything they share: auth, quota, body limit, schema check, acting profile,
 * transaction, idempotency, error mapping and the access log.
 * @typedef {import('./db.mjs').Db} Db @typedef {import('./db.mjs').Q} Q
 * @typedef {import('./accounts.mjs').AccountRow} AccountRow @typedef {import('./profiles.mjs').Acting} Acting
 * @typedef {{media: import('./media/assets.mjs').MediaConfig, pepper?: string}} Cfg   pepper is filled in by the handler
 * @typedef {{
 *   input: import('zod').ZodType, profile: boolean, write: boolean, ledger?: boolean,
 *   run: (q: Q, ctx: {account: AccountRow, acting: Acting | null, input: any, cfg: Cfg, coreAccountHash: string}) => Promise<Record<string, unknown>>
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
 *   log: (event: {requestId: string, action: string, outcome: string}) => void}} deps
 */
export function createFeHandler({ db, pepper, cfg, commands, authenticate, quota, cors, log }) {
  /** @param {Req} req @param {Res} res */
  return async function handler(req, res) {
    const requestId = randomUUID();
    let action = 'unknown';
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Request-ID', requestId);
    if (cors(req, res)) return;
    /** @param {number} status @param {Record<string, unknown>} body @param {string} outcome */
    const send = (status, body, outcome) => {
      try { log({ requestId, action, outcome }); } catch { /* logging never breaks the response */ }
      res.statusCode = status;
      res.end(JSON.stringify({ ...body, requestId }));
    };
    try {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        return send(405, { ok: false, error: 'method_not_allowed' }, 'method_not_allowed');
      }
      let core;
      try { core = await authenticate(req); } catch (error) {
        // Only the identity check may answer 401; a 401 from storage or another backend is an outage.
        const status = /** @type {{status?: unknown}} */ (error)?.status;
        fail(status === 401 ? 401 : 503, status === 401 ? 'auth_required' : 'unavailable');
      }
      if (!(await quota(req, core.accountHash))) {
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
      const account = await resolveAccount(db, pepper, core);
      const profileId = header(req, 'x-fe-profile');
      // Membership is checked before a stored result can be replayed: a former member gets 403, not old results.
      if (cmd.profile) await actingProfile(db, account.id, profileId, { write: cmd.write });
      /** @param {Q} q */
      const exec = async q => {
        const acting = cmd.profile ? await actingProfile(q, account.id, profileId, { write: cmd.write }) : null;
        // coreAccountHash is stable across Core re-registrations; only for markers that must survive them (under-18).
        return cmd.run(q, { account, acting, input, cfg: { ...cfg, pepper }, coreAccountHash: core.accountHash });
      };
      const result = !cmd.write ? await exec(db)
        // The acting profile is part of the request: the same opId under another profile is a conflict, not a replay.
        : typeof input.opId === 'string' && cmd.ledger !== false ? await once(db, account.id, { opId: input.opId, action, input: { profileId, input } }, exec)
        : await db.tx(exec);
      if ('requestId' in result) throw new Error('reserved_result_field'); // the HTTP request id owns this name
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
async function readJson(req) {
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
