// FetUre e2e — shared API access for scenarios and personas (talks to production: the app has no staging yet).
// Sign-in uses the admin test code (FE_ADMIN_KEY). Each persona has its own e-mail and its own device id, so
// runners never log each other out.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';

export const PROD = process.env.FE_API || 'https://feture-mvp.vercel.app';
const DIR = new URL('.', import.meta.url).pathname;
// One session cache for every worktree and runner on this machine (E2E_SESSIONS overrides): sign-ins are limited per
// address (120 / 15 min) and per account (20 / 15 min), and a cache per worktree signed every persona in again in each.
const SESS = process.env.E2E_SESSIONS || os.homedir() + '/.cache/feture-e2e/sessions.json';
fs.mkdirSync(SESS.replace(/\/[^/]*$/, ''), { recursive: true });
const sessions = fs.existsSync(SESS) ? JSON.parse(fs.readFileSync(SESS, 'utf8')) : {};
/** Writes the cache merged with what other runner processes wrote meanwhile (a lost entry would mean a fresh sign-in,
 * which signs out the other process's open page). */
function saveSessions() {
  let disk = {}; try { disk = JSON.parse(fs.readFileSync(SESS, 'utf8')); } catch {}
  for (const [k, v] of Object.entries(disk)) { if (!sessions[k]) sessions[k] = v; else if (v._at > sessions[k]._at) Object.assign(sessions[k], v); }
  fs.writeFileSync(SESS, JSON.stringify(sessions), { mode: 0o600 });
}
export const sleep = ms => new Promise(z => setTimeout(z, ms));

export async function post(path, body, headers = {}) {
  let r;
  for (let i = 0; i < 8; i++) {
    r = await fetch(PROD + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: PROD, ...headers }, body: JSON.stringify(body) });
    if (r.status !== 429 || path !== '/api/fe') break;
    await sleep(3000 + i * 2000);
  }
  let j = {}; try { j = await r.json(); } catch {}
  return { status: r.status, ...j };
}
const admin = body => post('/api/admin', body, { 'x-admin-key': process.env.FE_ADMIN_KEY ?? '' });

/** One more signed-in device of an existing account (sessions scenarios); never replaces the cached session. */
export async function signInDevice(email, deviceId) {
  const c = await admin({ action: 'user_test_code', email });
  if (!c.code) throw new Error('test code for ' + email + ': ' + c.status);
  const v = await post('/api/auth', { action: 'verify', email, code: c.code, deviceId });
  if (!v.syncToken) throw new Error('verify ' + email + ': ' + v.status);
  return { email, deviceId, syncToken: v.syncToken };
}

/** A signed-in session for this e-mail (the Core account is created on first use). */
export async function session(email, { fresh = false } = {}) {
  let s = sessions[email];
  if (!s || fresh) { // another runner process may have signed in meanwhile: take its token instead of replacing it
    let d; try { d = JSON.parse(fs.readFileSync(SESS, 'utf8'))[email]; } catch {}
    if (d && (!s || d.syncToken !== s.syncToken)) { s = sessions[email] = s ? Object.assign(s, d) : d; fresh = false; }
  }
  if (!fresh && s && Date.now() - s._at < 6 * 3600e3) return s;
  for (let i = 0; i < 18; i++) { // a 429 waits a minute: up to a whole 15-minute limit window
    let c = await admin({ action: 'user_test_code', email });
    if (c.status === 404) { await admin({ action: 'user_create', email }); c = await admin({ action: 'user_test_code', email }); }
    if (!c.code) throw new Error('test code for ' + email + ': ' + c.status + ' ' + c.error);
    // The shared staff account signs in from every lane and worktree: a device per lane, so one lane's sign-in does
    // not replace another's token (each replacement was a 401 and one more sign-in against the 20 per 15 min).
    const lane = email === 'qa-staff@feture.test' && /^[a-z0-9]{1,8}$/.test(process.env.E2E_LANE ?? '') ? '-' + process.env.E2E_LANE : '';
    const deviceId = 'e2e-' + email.split('@')[0] + lane;
    const v = await post('/api/auth', { action: 'verify', email, code: c.code, deviceId });
    if (v.syncToken) {
      // the person profile stays known across a fresh sign-in (calls after a 401 still act as that person)
      sessions[email] = { email, deviceId, syncToken: v.syncToken, handle: v.handle ?? null, locale: 'ru', sub: null, premium: false, owned: [], fresh: false, expiresAt: v.expiresAt ?? null, _at: Date.now(), ...(s?.personId ? { personId: s.personId } : {}) };
      saveSessions();
      return sessions[email];
    }
    if (v.status === 429) { await sleep(60000); continue; }
    // 403 bad_code: another runner (another lane or worktree) asked a code for the same account — the shared staff
    // persona — after us, which replaced ours. Wait a little, take its session if it got one, else ask again.
    if (v.status === 403 && i < 17) {
      await sleep(1500 + Math.random() * 3500);
      let d; try { d = JSON.parse(fs.readFileSync(SESS, 'utf8'))[email]; } catch {}
      if (d?.syncToken && d.syncToken !== s?.syncToken && Date.now() - d._at < 6 * 3600e3) { sessions[email] = s ? Object.assign(s, d) : d; return sessions[email]; }
      continue;
    }
    throw new Error('verify ' + email + ': ' + v.status + ' ' + (v.error ?? ''));
  }
  throw new Error('sign-in for ' + email + ' stays rate limited');
}

export const uuid7 = () => { const u = randomUUID().split(''); const t = Date.now().toString(16).padStart(12, '0'); for (let i = 0; i < 8; i++) u[i] = t[i]; for (let i = 0; i < 4; i++) u[9 + i] = t[8 + i]; u[14] = '7'; return u.join(''); };

/** One /api/fe call as this e-mail; `profile` sets X-Fe-Profile (defaults to the person profile when there is one). */
export async function api(email, action, input = {}, profile) {
  const s = await session(email);
  const h = { 'x-fit-email': s.email, 'x-fit-device': s.deviceId, 'x-fit-token': s.syncToken };
  if (profile) h['x-fe-profile'] = profile;
  else if (s.personId) h['x-fe-profile'] = s.personId;
  let r = await post('/api/fe', { action, ...input }, h);
  if (r.status === 401) { console.error(`   (401 on ${action} for ${email}: signing in again — an open browser page of this account is now signed out)`); await session(email, { fresh: true }); return api(email, action, input, profile); }
  // A session signed in again elsewhere may not know its person profile yet: bootstrap fills it in, then retry once.
  if (r.status === 400 && r.error === 'profile_required' && !profile && !s.personId && action !== 'session.bootstrap') {
    await boot(email);
    if ((await session(email)).personId) return api(email, action, input, profile);
  }
  return r;
}
export async function boot(email) {
  const b = await api(email, 'session.bootstrap');
  const s = await session(email);
  s.personId = b.profiles?.find(p => p.kind === 'person')?.id ?? null;
  s.coupleId = b.profiles?.find(p => p.kind === 'couple' && p.state === 'active')?.id ?? null;
  saveSessions();
  return b;
}

/** Upload a fixture photo for this e-mail and return the asset id (intent → PUT → commit). */
export async function uploadFixture(email, purpose, file = DIR + 'fixtures/photo.jpg') {
  const bytes = fs.readFileSync(file);
  const i = await api(email, 'media.uploadIntent', { opId: uuid7(), purpose, kind: 'image', mime: 'image/jpeg', bytes: bytes.length });
  if (!i.assetId) throw new Error('uploadIntent ' + JSON.stringify(i));
  const put = await fetch(i.upload.url, { method: i.upload.method, headers: i.upload.headers, body: bytes });
  if (!put.ok) throw new Error('upload PUT ' + put.status);
  const c = await api(email, 'media.commit', { assetId: i.assetId });
  if (c.status !== 200) throw new Error('commit ' + JSON.stringify(c));
  return i.assetId;
}
