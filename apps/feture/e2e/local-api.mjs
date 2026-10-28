// A local FetUre API for scenarios that need server code not deployed yet (message requests, 29.10.2026): the real
// /api/fe handler and every command on PGlite with all migrations, run as the restricted feture_api role, plus the
// few outside pieces the runner and the personas use — sign-in with a test code (/api/admin, /api/auth), the legal
// documents (/api/catalog), media in memory with the real scan and variants (sharp), the job queue every second, and
// the shared staff persona holding the moderator role. Nothing here talks to production.
//   node e2e/local-api.mjs [port=4290]
//   FE_API=http://localhost:4290 E2E_SESSIONS=/tmp/…/sessions.json E2E_LANE=mr APP=http://localhost:<preview> node e2e/run.mjs …
// The database lives as long as the process: personas are built again after a restart (use a fresh E2E_SESSIONS).
import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { fromPglite } from '../server/db.mjs';
import { createFeHandler } from '../server/handler.mjs';
import { signedStorageDelivery } from '../server/media/delivery.mjs';
import { createSharpRenderer } from '../server/media/render.mjs';
import { runJobs } from '../server/jobs.mjs';
import { MIGRATIONS, DOCS } from '../tests/fe-helpers.mjs';
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
import { gallery } from '../server/commands/gallery.mjs';
import { discover } from '../server/commands/discover.mjs';
import { chats } from '../server/commands/chats.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { people } from '../server/commands/people.mjs';
import { premium } from '../server/commands/premium.mjs';
import { verification } from '../server/commands/verification.mjs';
import { accounts } from '../server/commands/account.mjs';
import { dsa } from '../server/commands/dsa.mjs';
import { support } from '../server/commands/support.mjs';

const PORT = Number(process.argv[2] ?? process.env.PORT ?? 4290);
const BASE = `http://localhost:${PORT}`;
const STAFF = 'qa-staff@feture.test', STAFF2 = 'qa-staff2@feture.test';
const { sessionId } = createRequire(import.meta.url)('../../../packages/core/server/util');
/** Signed-in devices per e-mail, as Core keeps them: deviceId → {token, at, label, platform}. «Мои устройства» lists
 * them; signing a device out forgets its token (its next request is a 401). */
const devices = new Map();
const label = ua => { const u = String(ua ?? ''); const b = /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : '';
  const o = /Mac OS X|Macintosh/.test(u) ? 'Mac' : /Android/.test(u) ? 'Android' : /Linux/.test(u) ? 'Linux' : ''; return [b, o].filter(Boolean).join(' · '); };
const deviceOf = (email, deviceId, token) => { const d = devices.get(email)?.get(deviceId); return d && d.token === token ? d : null; };
const mig = name => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');

const pg = new PGlite();
await pg.exec('create role anon; create role authenticated;');
await pg.exec(`
  create table public.feture_document_versions (id uuid primary key, document_key text, locale text, content_hash text,
    requires_accept boolean, version int default 1, effective_at timestamptz default now() - interval '1 day');
  alter table public.feture_document_versions enable row level security;
  create policy feture_reviewed_document_read on public.feture_document_versions for select to anon, authenticated using (true);
  create view public.feture_document_current with (security_invoker = true) as
    select distinct on (document_key, locale) id, document_key, locale, content_hash, requires_accept
    from public.feture_document_versions where effective_at <= now() order by document_key, locale, version desc;
  insert into public.feture_document_versions (id, document_key, locale, content_hash, requires_accept) values
    ${DOCS.map(d => `('${d.id}', '${d.key}', 'ru', '${d.hash}', ${d.required})`).join(', ')};`);
for (const f of MIGRATIONS) await pg.exec(mig(f));
await pg.exec('set role feture_api');
const db = fromPglite(pg);

/** Media in memory: the browser and the personas PUT uploads here; variants are served from here. */
const objects = new Map();
const storage = {
  async putUrl(key, file) { return { url: `${BASE}/store/${encodeURIComponent(key)}`, method: 'PUT', headers: { 'content-type': file.mime } }; },
  async head(key) { const o = objects.get(key); return o ? { bytes: o.bytes.byteLength, mime: o.mime } : null; },
  async get(key) { const o = objects.get(key); if (!o) throw new Error('not_found'); return o.bytes; },
  async put(key, bytes, mime) { objects.set(key, { bytes: new Uint8Array(bytes), mime }); },
  async remove(key) { for (const k of [...objects.keys()]) if (k === key || k.startsWith(key + '/')) objects.delete(k); },
  async signUrls(keys) { return keys.map(k => `${BASE}/store/${encodeURIComponent(k)}`); },
};
const scan = { storage, scanner: null, classifier: null, renderer: createSharpRenderer() };

const handler = createFeHandler({
  db, pepper: 'local-e2e-pepper-'.padEnd(40, 'x'),
  cfg: { media: { storage, delivery: signedStorageDelivery(storage) }, realtime: null, push: null, billing: { providers: [] } },
  commands: { ...platform, ...me, ...access, ...couples, ...staff, ...social, ...posts, ...moderation, ...communities, ...events, ...photos, ...gallery, ...discover, ...chats, ...inbox, ...people, ...premium, ...verification, ...accounts, ...dsa, ...support },
  // A session token is issued per device at sign-in: the account is the e-mail; persona logins (qa-…) are qa accounts,
  // as in Core. The session key (staff second factor) and id («Мои устройства») follow Core's identity (lib/feture/identity.js).
  authenticate: async req => {
    const email = String(req.headers['x-fit-email'] ?? '').toLowerCase(), device = String(req.headers['x-fit-device'] ?? ''), token = String(req.headers['x-fit-token'] ?? '');
    if (!email || !deviceOf(email, device, token)) { const e = new Error('auth'); /** @type {any} */ (e).status = 401; throw e; }
    return { accountHash: createHash('sha256').update(email).digest('hex'), accountGeneration: 'g1', qa: email.startsWith('qa-'),
      sessionId: sessionId(device), sessionKey: createHash('sha256').update('fe-session:' + device + ':' + token).digest('hex') };
  },
  quota: async () => true, cors: () => false, log: () => {}, maintenanceTtl: 0,
});

/** The shared staff persona holds the moderator and verifier roles (granted once, as the owner does on production). */
async function staffRoles() {
  await db.query(
    `insert into feture.staff_role (account_id, role) select a.id, x.r from feture.account a join feture.profile p on p.id = a.person_profile_id,
       (values ('qa_mod1', 'moderator'), ('qa_mod1', 'verifier'), ('qa_mod1', 'lead'), ('qa_mod2', 'moderator')) x(h, r)
     where p.handle = x.h and not exists (select 1 from feture.staff_role s where s.account_id = a.id and s.role = x.r and s.revoked_at is null)`).catch(e => console.error('staff role', e.message));
}

const body = req => new Promise((resolve, reject) => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => resolve(Buffer.concat(c))); req.on('error', reject); });
const json = (res, status, obj) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.setHeader('access-control-allow-origin', '*'); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', BASE);
    if (req.method === 'OPTIONS') { res.setHeader('access-control-allow-origin', '*'); res.setHeader('access-control-allow-headers', '*'); res.setHeader('access-control-allow-methods', 'GET, POST, PUT'); res.statusCode = 204; return res.end(); }
    if (url.pathname.startsWith('/store/')) {
      const key = decodeURIComponent(url.pathname.slice(7));
      if (req.method === 'PUT') { objects.set(key, { bytes: new Uint8Array(await body(req)), mime: String(req.headers['content-type'] ?? 'application/octet-stream') }); res.setHeader('access-control-allow-origin', '*'); res.statusCode = 200; return res.end(); }
      const o = objects.get(key);
      if (!o) { res.statusCode = 404; return res.end(); }
      res.setHeader('content-type', o.mime); res.setHeader('access-control-allow-origin', '*'); res.statusCode = 200; return res.end(Buffer.from(o.bytes));
    }
    // Local only (screenshots of the «fresh code» prompt): the staff check of a handle's sign-ins is 11 minutes old.
    if (url.pathname === '/local/stale-factor' && req.method === 'POST') {
      await pg.query(`update feture.staff_session s set checked_at = now() - interval '11 minutes' from feture.account a join feture.profile p on p.id = a.person_profile_id
                      where s.account_id = a.id and p.handle = $1`, [url.searchParams.get('handle')]);
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/catalog' && url.searchParams.get('resource') === 'documents') {
      return json(res, 200, { ok: true, documents: DOCS.map(d => ({ id: d.id, key: d.key, hash: d.hash, requiresAccept: d.required, locale: 'ru' })) });
    }
    if (url.pathname === '/api/admin') {
      const b = JSON.parse((await body(req)).toString() || '{}');
      if (b.action === 'user_test_code' || b.action === 'user_create') return json(res, 200, { ok: true, code: '000000' });
      return json(res, 404, { ok: false, error: 'not_found' });
    }
    if (url.pathname === '/api/auth') {
      const b = JSON.parse((await body(req)).toString() || '{}');
      const email = String(b.email ?? '').toLowerCase();
      if (b.action === 'verify') {
        const syncToken = 'local:' + randomUUID();
        if (!devices.has(email)) devices.set(email, new Map());
        devices.get(email).set(String(b.deviceId), { token: syncToken, at: new Date().toISOString(), label: label(req.headers['user-agent']), platform: String(b.platform ?? 'web') });
        return json(res, 200, { ok: true, syncToken, expiresAt: null });
      }
      if (['status', 'sessions', 'session_revoke', 'sessions_revoke_others'].includes(b.action)) {
        if (!deviceOf(email, String(b.deviceId), String(b.syncToken))) return json(res, 403, { ok: false, error: 'bad_sync_token' });
        const mine = devices.get(email);
        if (b.action === 'status') return json(res, 200, { ok: true, expiresAt: null });
        if (b.action === 'sessions') return json(res, 200, { ok: true, sessions: [...mine].map(([id, d]) => ({ id: sessionId(id), current: id === b.deviceId, label: d.label, platform: d.platform, at: d.at, expiresAt: new Date(Date.now() + 90 * 864e5).toISOString() }))
          .sort((x, y) => Number(y.current) - Number(x.current)) });
        const targets = [...mine.keys()].filter(id => b.action === 'sessions_revoke_others' ? id !== b.deviceId : sessionId(id) === b.target);
        if (b.action === 'session_revoke' && targets[0] === b.deviceId) return json(res, 400, { ok: false, error: 'current_session' });
        for (const id of targets) mine.delete(id);
        return json(res, 200, { ok: true, revoked: targets.length });
      }
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/fe') {
      const raw = await body(req);
      const fake = { method: 'POST', headers: req.headers, body: raw.length ? JSON.parse(raw.toString()) : {} };
      const out = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { this.text = s; } };
      try { await handler(fake, out); }
      catch (e) { if (e?.status === 401) return json(res, 401, { ok: false, error: 'auth_required' }); throw e; }
      if ([STAFF, STAFF2].includes(String(req.headers['x-fit-email']).toLowerCase())) await staffRoles();
      res.statusCode = out.statusCode || 200; res.setHeader('content-type', 'application/json');
      return res.end(out.text ?? '{}');
    }
    return json(res, 404, { ok: false, error: 'not_found' });
  } catch (e) { console.error(e); json(res, 500, { ok: false, error: 'internal' }); }
}).listen(PORT, () => console.log('local FetUre API on ' + BASE));

// The queue worker (scans, variants, notifications) once a second, as the cron does on production.
let busy = false;
setInterval(async () => { if (busy) return; busy = true; try { await runJobs(db, { scan, push: null, mail: null, signals: null, limit: 20 }); } catch (e) { console.error('jobs', e?.message ?? e); } finally { busy = false; } }, 1000);
