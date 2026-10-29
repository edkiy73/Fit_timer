// Optional second factor for everyone and the new-device notice on PGlite as feture_api (owner 29.10.2026,
// docs/infra/security.md, server/signin.mjs): enrolment, the sign-in second step enforced before every command (bypass
// attempts), turning off and new recovery codes need a code, staff keep theirs, a lead's reset; new-device detection,
// one notice per sign-in, the email text, the push text; the guard for Core's own endpoints.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { staff } from '../server/commands/staff.mjs';
import { accounts } from '../server/commands/account.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { social } from '../server/commands/social.mjs';
import { totpCode, TOTP } from '../server/second-factor.mjs';
import { notifyHandlers } from '../server/notify.mjs';
import { pushHandlers } from '../server/push.mjs';
import { drain } from '../server/outbox.mjs';
import { signinMail } from '../server/signin.mjs';
import { coreSessionBlocked, guardCoreBody, GUARDED_AUTH } from '../server/core-guard.mjs';
import { setup as baseSetup, op, PEPPER } from './fe-helpers.mjs';

const STEP = TOTP.period * 1000;
const setup = (/** @type {any} */ extra = {}) => baseSetup({ commands: { ...platform, ...me, ...staff, ...accounts, ...inbox, ...social }, ...extra });
const accountOf = async (db, profileId) => (await db.query('select id from feture.account where person_profile_id = $1', [profileId]))[0].id;
/** The next code of «now» is new (a code works once). */
const forgetStep = (db, accountId) => db.query('update feture.account_totp set last_step = 0 where account_id = $1', [accountId]);
const wrongOf = secret => totpCode(secret) === '000000' ? '111111' : '000000';

async function enrol(call, user, headers = {}) {
  const s = await call(user, null, { action: 'account.factorStart' }, headers);
  assert.equal(s.status, 200, JSON.stringify(s));
  const c = await call(user, null, { action: 'account.factorConfirm', code: totpCode(s.secret) }, headers);
  assert.equal(c.verified, true, JSON.stringify(c));
  return { secret: s.secret, codes: c.codes };
}

test('optional factor: enrolment, every other sign-in refused everywhere until a code, recovery code once', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const alex = await person('uu', 'Alex');
    const id = await accountOf(db, alex);
    const phone = { 'x-test-session': 'phone' };
    // Off by default; a sign-in works as before.
    assert.deepEqual((await call('uu', null, { action: 'account.factor' })).enabled, false);
    assert.equal((await call('uu', null, { action: 'session.bootstrap' }, phone)).status, 200);

    const s = await call('uu', null, { action: 'account.factorStart' });
    assert.match(s.uri, /^otpauth:\/\/totp\/FetUre%3A%40Alex\?secret=/);
    // Not on before the first right code: other sign-ins are not asked yet.
    assert.equal((await call('uu', null, { action: 'session.bootstrap' }, phone)).status, 200);
    const bad = await call('uu', null, { action: 'account.factorConfirm', code: wrongOf(s.secret) });
    assert.deepEqual([bad.verified, bad.reason], [false, 'wrong']);
    const ok = await call('uu', null, { action: 'account.factorConfirm', code: totpCode(s.secret) });
    assert.equal(ok.codes.length, 10);
    assert.equal((await db.query(`select 1 from feture.op_ledger where action like 'account.factor%'`)).length, 0, 'never in the ledger');
    const f = await call('uu', null, { action: 'account.factor' });
    assert.deepEqual([f.enabled, f.recoveryLeft, f.required], [true, 10, false]);
    // The sign-in that turned it on keeps working.
    assert.equal((await call('uu', null, { action: 'session.bootstrap' })).status, 200);

    // Another sign-in (an existing one too) reaches nothing — reads, writes, the factor's own commands, staff ones.
    for (const body of [{ action: 'session.bootstrap' }, { action: 'account.devices' }, { action: 'account.factor' }, { action: 'notifications.list' },
      { action: 'account.factorOff', code: totpCode(s.secret) }, { action: 'account.factorCodes', code: totpCode(s.secret) }, { action: 'account.factorStart' },
      { action: 'account.delete', opId: op(), confirmHandle: 'Alex' }, { action: 'staff.me' }, { action: 'staff.totpStart' }]) {
      const r = await call('uu', null, body, phone);
      assert.deepEqual([r.status, r.error, r.rule], [403, 'second_factor', 'signin'], body.action);
    }
    // An acting profile header changes nothing; the refusal holds for a never-seen sign-in too.
    assert.equal((await call('uu', alex, { action: 'notifications.readAll' }, phone)).rule, 'signin');
    assert.equal((await call('uu', null, { action: 'session.bootstrap' }, { 'x-test-session': 'laptop' })).rule, 'signin');
    assert.equal((await db.query(`select state from feture.account where id = $1`, [id]))[0].state, 'active');
    assert.equal((await call('uu', null, { action: 'account.factor' })).enabled, true, 'nothing was turned off');

    // The code check is open: a wrong code is counted, a right one makes the sign-in usable.
    const wrong = await call('uu', null, { action: 'account.factorSignIn', code: wrongOf(s.secret) }, phone);
    assert.deepEqual([wrong.status, wrong.verified, wrong.reason, wrong.left], [200, false, 'wrong', 4]);
    await forgetStep(db, id);
    const right = await call('uu', null, { action: 'account.factorSignIn', code: totpCode(s.secret) }, phone);
    assert.deepEqual([right.verified, right.recovery], [true, false]);
    assert.equal((await call('uu', null, { action: 'session.bootstrap' }, phone)).status, 200);
    // A recovery code instead of the phone: once.
    const rc = await call('uu', null, { action: 'account.factorSignIn', code: ok.codes[0] }, { 'x-test-session': 'laptop' });
    assert.deepEqual([rc.verified, rc.recovery, rc.recoveryLeft], [true, true, 9]);
    assert.equal((await call('uu', null, { action: 'account.factorSignIn', code: ok.codes[0] }, { 'x-test-session': 'tablet' })).reason, 'wrong');
    assert.equal((await call('uu', null, { action: 'notifications.list' }, { 'x-test-session': 'tablet' })).rule, 'signin');
    // A second enrolment is refused while on.
    assert.equal((await call('uu', null, { action: 'account.factorStart' })).rule, 'factor_enrolled');
  } finally { await pg.close(); }
});

test('optional factor: off and new recovery codes need a code; on again asks every other sign-in anew; staff keep it; a lead resets', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const alex = await person('uu', 'Alex'); const lead = await person('ul', 'Lena');
    await db.query(`insert into feture.staff_role (account_id, role) select id, 'lead' from feture.account where person_profile_id = $1`, [lead]);
    const id = await accountOf(db, alex);
    const { secret, codes } = await enrol(call, 'uu');
    const phone = { 'x-test-session': 'phone' };
    await forgetStep(db, id);
    assert.equal((await call('uu', null, { action: 'account.factorSignIn', code: totpCode(secret) }, phone)).verified, true);

    // New recovery codes: a wrong code changes nothing, a right one replaces all ten (the old ones stop working).
    assert.equal((await call('uu', null, { action: 'account.factorCodes', code: wrongOf(secret) })).verified, false);
    await forgetStep(db, id);
    const fresh = await call('uu', null, { action: 'account.factorCodes', code: totpCode(secret) });
    assert.equal(fresh.codes.length, 10);
    assert.ok(!fresh.codes.includes(codes[1]));
    assert.equal((await call('uu', null, { action: 'account.factorSignIn', code: codes[1] }, { 'x-test-session': 'x' })).reason, 'wrong');

    // Off: a wrong code keeps it on; a right one (or a recovery code) turns it off and frees every sign-in.
    const no = await call('uu', null, { action: 'account.factorOff', code: wrongOf(secret) });
    assert.deepEqual([no.verified, no.reason], [false, 'wrong']);
    assert.equal((await call('uu', null, { action: 'account.factor' })).enabled, true);
    assert.equal((await call('uu', null, { action: 'account.factorOff', code: fresh.codes[0] })).off, true);
    assert.equal((await call('uu', null, { action: 'account.factor' })).enabled, false);
    assert.equal((await call('uu', null, { action: 'session.bootstrap' }, { 'x-test-session': 'new' })).status, 200);
    assert.equal((await db.query('select 1 from feture.session_factor where account_id = $1', [id])).length, 0);
    // Without a factor there is nothing to check.
    assert.equal((await call('uu', null, { action: 'account.factorSignIn', code: '123456' })).status, 409);

    // On again from the phone: the phone keeps working, the sign-in that passed the old factor asks again.
    await enrol(call, 'uu', phone);
    assert.equal((await call('uu', null, { action: 'session.bootstrap' }, phone)).status, 200);
    assert.equal((await call('uu', null, { action: 'session.bootstrap' })).rule, 'signin');

    // A lead resets a person who lost the phone (staff reset, fresh code as for staff); then nothing is asked.
    assert.equal((await call('ul', null, { action: 'staff.totpReset', opId: op(), handle: 'Alex' })).reset, true);
    assert.equal((await call('uu', null, { action: 'session.bootstrap' })).status, 200);

    // Staff: required for them — no «off», and their sign-in code also opens the staff window.
    assert.equal((await call('ul', null, { action: 'account.factor' })).required, true);
    assert.equal((await call('ul', null, { action: 'account.factorOff', code: '123456' })).rule, 'factor_required');
    assert.equal((await call('ul', null, { action: 'staff.mediaQueue' }, phone)).rule, 'signin');
  } finally { await pg.close(); }
});

test('staff: a sign-in code opens the staff window too; a staff code passes the sign-in', async () => {
  const { pg, db, call, person } = await setup({ staffFactor: true });
  try {
    const mod = await person('um', 'Mira');
    await db.query(`insert into feture.staff_role (account_id, role) select id, 'moderator' from feture.account where person_profile_id = $1`, [mod]);
    const s = await call('um', null, { action: 'staff.totpStart' });
    assert.equal((await call('um', null, { action: 'staff.totpConfirm', code: totpCode(s.secret) })).verified, true);
    const id = await accountOf(db, mod);
    const phone = { 'x-test-session': 'phone' };
    assert.equal((await call('um', null, { action: 'staff.mediaQueue' }, phone)).rule, 'signin');
    await forgetStep(db, id);
    assert.equal((await call('um', null, { action: 'account.factorSignIn', code: totpCode(s.secret) }, phone)).verified, true);
    assert.equal((await call('um', null, { action: 'staff.mediaQueue' }, phone)).status, 200, 'one code for both');
    // The staff unlock form's code passes the sign-in as well; after the staff window ends the sign-in stays usable.
    const lap = { 'x-test-session': 'laptop' };
    await forgetStep(db, id);
    assert.equal((await call('um', null, { action: 'staff.totpVerify', code: totpCode(s.secret, Date.now() + STEP) }, lap)).verified, true);
    await db.query('delete from feture.staff_session where account_id = $1', [id]);
    assert.equal((await call('um', null, { action: 'session.bootstrap' }, lap)).status, 200);
    assert.equal((await call('um', null, { action: 'staff.mediaQueue' }, lap)).rule, 'verify');
  } finally { await pg.close(); }
});

test('new device: first sign-in quiet, known device or family quiet, a new one notifies once (inbox, push, email), old sessions and floods capped', async () => {
  const mails = [];
  const { pg, db, call } = await setup({ mail: async m => { mails.push(m); } });
  try {
    // Each sign-in on its own device (Core's session id) unless told otherwise; «last used» rows are written as in prod.
    const H = (session, label, country, extra = {}) => ({ 'x-test-session': session, 'x-test-label': label, 'x-fit-email': 'alex@mail.example',
      'x-test-sid': createHash('sha256').update(session).digest('hex').slice(0, 16),
      ...(country ? { 'x-vercel-ip-country': country, 'x-vercel-ip-city': country === 'DE' ? 'Berlin' : 'Lisboa' } : {}), ...extra });
    // Registration: the very first sign-in makes no notice.
    const r = await call('uu', null, { action: 'account.create', opId: op(), handle: 'Alex', birthDate: '1990-01-01', locale: 'ru', documents: (await import('./fe-helpers.mjs')).ACCEPT, newsOptIn: false }, H('s1', 'Chrome · Mac', 'DE'));
    assert.equal(r.status, 200, JSON.stringify(r));
    const id = await accountOf(db, r.profileId);
    await db.query(`insert into feture.notification_settings (account_id, settings) values ($1, '{"quiet":{"on":false,"from":"23:00","to":"08:00"}}')`, [id]);
    await db.query(`insert into feture.push_device (token_hash, account_id, platform, token) values ($1, $2, 'android', 'tok')`, [createHash('sha256').update('tok').digest(), id]);
    // The same family from the same country (a new token on the laptop), and the same device: quiet.
    await call('uu', null, { action: 'session.bootstrap' }, H('s2', 'Chrome · Mac', 'DE'));
    await call('uu', null, { action: 'session.bootstrap' }, H('s3', 'Firefox · Linux', 'DE', { 'x-test-sid': 'aaaa' }));
    await call('uu', null, { action: 'session.bootstrap' }, H('s4', 'Safari · Mac', 'DE', { 'x-test-sid': 'aaaa' }));
    assert.equal(mails.length, 1, 's3 was a new family: one email');
    // An old session seen for the first time (after a deploy) is not a sign-in.
    await call('uu', null, { action: 'session.bootstrap' }, H('s5', 'iPhone', 'PT', { 'x-test-at': new Date(Date.now() - 3 * 864e5).toISOString() }));
    assert.equal(mails.length, 1);
    // A new device in another country: one notice however many requests it makes.
    for (let i = 0; i < 3; i++) await call('uu', null, { action: 'session.bootstrap' }, H('s6', 'Android', 'PT'));
    assert.equal(mails.length, 2);
    // Same family as a known one but from another country: new.
    await call('uu', null, { action: 'session.bootstrap' }, H('s7', 'Chrome · Mac', 'PT'));
    assert.equal(mails.length, 3);
    assert.equal(mails[1].to, 'alex@mail.example');
    assert.equal(mails[1].subject, 'Вход в FetUre с нового устройства');
    assert.match(mails[1].text, /^Вход в FetUre с нового устройства: Android, Lisboa, Португалия, \d+ \S+ 2\d{3} г?\.?,? ?(в )?\d\d:\d\d UTC\.\n\nЭто не ты\? Открой «Мои устройства» и нажми «Выйти»:\nhttps:\/\/app\.test\/#\/n\/settings\/security\n/);
    assert.ok(!/<|http:\/\/(?!app)/.test(mails[1].text), 'plain text, no tracking');

    // The inbox item (always, no setting) and the push: in «Безопасные» only «FetUre · Вход с нового устройства».
    const sent = [];
    while ((await drain(db, { ...notifyHandlers(db), ...pushHandlers(db, { send: async (p, t, m) => { sent.push(m); } }) }, { limit: 50 })) > 0) { /* all */ }
    const items = (await call('uu', null, { action: 'notifications.list' })).items.filter(n => n.type === 'signinNew');
    assert.equal(items.length, 3);
    assert.deepEqual(items.map(n => n.data.device).sort(), ['Android', 'Chrome · Mac', 'Firefox · Linux']);
    assert.ok(items.some(n => n.data.place === 'Lisboa|PT'));
    assert.equal(sent.length, 3);
    assert.deepEqual([sent[0].title, sent[0].body, sent[0].data.url], ['FetUre', 'Вход с нового устройства', '/#/n/settings/security']);
    // «Обычные»: still no device or place on the lock screen.
    await db.query(`update feture.notification_settings set settings = settings || '{"mode":"normal"}' where account_id = $1`, [id]);
    await call('uu', null, { action: 'session.bootstrap' }, H('s8', 'Edge · Windows', 'PT'));
    while ((await drain(db, { ...notifyHandlers(db), ...pushHandlers(db, { send: async (p, t, m) => { sent.push(m); } }) }, { limit: 50 })) > 0) { /* all */ }
    assert.equal(sent.at(-1).body, 'Вход с нового устройства');

    // A flood of new sign-ins: at most five notices an hour.
    for (let i = 0; i < 6; i++) await call('uu', null, { action: 'session.bootstrap' }, H('f' + i, 'Dev' + i, 'PT'));
    assert.equal((await db.query('select count(*)::int n from feture.account_signin where account_id = $1 and notified_at is not null', [id]))[0].n, 5);
    // e2e personas (.test addresses) never get an email.
    const before = mails.length;
    await db.query(`update feture.account_signin set notified_at = null where account_id = $1`, [id]);
    await call('uu', null, { action: 'session.bootstrap' }, { ...H('t1', 'Opera', 'DE'), 'x-fit-email': 'qa-x@feture.test' });
    assert.equal(mails.length, before);
    // Deleting the account forgets its sign-ins.
    await call('uu', null, { action: 'account.delete', opId: op(), confirmHandle: 'Alex' });
    assert.equal((await db.query('select 1 from feture.account_signin where account_id = $1', [id])).length, 0);
  } finally { await pg.close(); }
});

test('new device: a sign-in waiting for its second step is still reported', async () => {
  const mails = [];
  const { pg, call, person } = await setup({ mail: async m => { mails.push(m); } });
  try {
    await person('uu', 'Alex');
    await enrol(call, 'uu', { 'x-test-label': 'Chrome · Mac' });
    const r = await call('uu', null, { action: 'session.bootstrap' }, { 'x-test-session': 'thief', 'x-test-label': 'Firefox · Windows', 'x-fit-email': 'alex@mail.example' });
    assert.equal(r.rule, 'signin');
    assert.equal(mails.length, 1);
  } finally { await pg.close(); }
});

test('email text in English, and the guard for Core endpoints (sessions, email change, deletion, sync)', async () => {
  const m = signinMail('en', { device: 'iPhone', place: '|DE', at: '2026-10-29T10:05:00Z' }, { appUrl: 'https://x.test/', tz: 'Europe/Berlin' });
  assert.equal(m.subject, 'New device signed in to FetUre');
  assert.equal(m.text.split('\n')[0], 'Someone signed in to FetUre on a new device: iPhone, Germany, 29 October 2026 at 11:05.');

  const { pg, db, call } = await setup();
  try {
    // A Core account as Core keeps it: the FetUre account is keyed by Core's hash and generation (lib/feture/identity.js).
    const sha = v => createHash('sha256').update(v).digest('hex');
    const email = 'alex@mail.example', since = '2026-01-01T00:00:00.000Z', keyHash = sha(email).slice(0, 32);
    const dev = (token, at = new Date().toISOString()) => ({ h: sha(token), at, label: 'Chrome · Mac' });
    const devices = { home: dev('t-home'), thief: dev('t-thief') };
    const store = { configured: () => true, get: async k => k === 'a:' + keyHash ? JSON.stringify({ email, since, syncDevices: devices }) : null };
    const gen = sha(keyHash + ':' + since);
    const sessionOf = (d, token) => sha('fe-session:' + d + ':' + sha(token));
    const as = (d, token) => ({ 'x-test-user': keyHash, 'x-test-gen': gen, 'x-test-session': sessionOf(d, token) });
    const reg = await call(keyHash, null, { action: 'account.create', opId: op(), handle: 'Alex', birthDate: '1990-01-01', locale: 'ru', documents: (await import('./fe-helpers.mjs')).ACCEPT, newsOptIn: false }, as('home', 't-home'));
    assert.equal(reg.status, 200, JSON.stringify(reg));
    const s = await call(keyHash, null, { action: 'account.factorStart' }, as('home', 't-home'));
    await call(keyHash, null, { action: 'account.factorConfirm', code: totpCode(s.secret) }, as('home', 't-home'));

    const opts = { store, db, pepper: PEPPER, mail: null };
    for (const action of ['sessions', 'sessions_revoke_others', 'session_revoke', 'email_change_send', 'forget', 'set_handle']) {
      assert.ok(GUARDED_AUTH.has(action), action);
      assert.deepEqual(await guardCoreBody({ headers: {} }, { action, email, deviceId: 'thief', syncToken: 't-thief' }, opts), { status: 403, error: 'second_factor', rule: 'signin' }, action);
    }
    assert.equal(GUARDED_AUTH.has('logout') || GUARDED_AUTH.has('verify') || GUARDED_AUTH.has('send'), false, 'sign-in and sign-out stay open');
    // Settings sync names its token `token`.
    assert.equal((await guardCoreBody({ headers: {} }, { email, deviceId: 'thief', token: 't-thief' }, opts))?.rule, 'signin');
    // The signed-in home device passes; a wrong token is left to Core (its own 403).
    assert.equal(await guardCoreBody({ headers: {} }, { action: 'sessions', email, deviceId: 'home', syncToken: 't-home' }, opts), null);
    assert.equal(await guardCoreBody({ headers: {} }, { action: 'forget', email, deviceId: 'thief', syncToken: 'nope' }, opts), null);
    // After a right code in that sign-in, Core's actions work there too.
    await db.query('update feture.account_totp set last_step = 0');
    assert.equal((await call(keyHash, null, { action: 'account.factorSignIn', code: totpCode(s.secret) }, as('thief', 't-thief'))).verified, true);
    assert.equal(await guardCoreBody({ headers: {} }, { action: 'forget', email, deviceId: 'thief', syncToken: 't-thief' }, opts), null);
    // A database outage refuses (fail closed); no FetUre account yet = nothing to guard.
    const broken = { query: async () => { throw new Error('down'); } };
    assert.equal((await guardCoreBody({ headers: {} }, { action: 'forget', email, deviceId: 'thief', syncToken: 't-thief' }, { ...opts, db: /** @type {any} */ (broken) }))?.status, 503);
    assert.equal(await coreSessionBlocked({ accountHash: 'nobody', accountGeneration: 'g', sessionKey: 'k' }, { db, pepper: PEPPER, mail: null }), false);
  } finally { await pg.close(); }
});
