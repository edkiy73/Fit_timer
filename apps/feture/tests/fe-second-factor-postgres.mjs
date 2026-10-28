// Staff second factor and «Мои устройства» on PGlite as feture_api (owner 29.10.2026, docs/infra/security.md):
// enrolment, wrong / replayed codes, lockout, the 12 h staff window, the 10 min re-check, role revoke, reset by a lead,
// single-use recovery codes, and the device annotations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { staff } from '../server/commands/staff.mjs';
import { accounts } from '../server/commands/account.mjs';
import { premium } from '../server/commands/premium.mjs';
import { verification } from '../server/commands/verification.mjs';
import { moderation } from '../server/commands/moderation.mjs';
import { totpCode, TOTP } from '../server/second-factor.mjs';
import { setup as baseSetup, op, testSessionKey } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...staff, ...accounts, ...premium, ...verification, ...moderation }, staffFactor: true });
const STEP = TOTP.period * 1000;
const role = (db, profileId, r) => db.query(`insert into feture.staff_role (account_id, role) select id, $2 from feture.account where person_profile_id = $1`, [profileId, r]);
const accountOf = async (db, profileId) => (await db.query('select id from feture.account where person_profile_id = $1', [profileId]))[0].id;
/** Pretend the last code was used `steps` steps ago, so the next code of «now» is new (one code per 30 s otherwise). */
const forgetStep = (db, accountId) => db.query('update feture.account_totp set last_step = 0 where account_id = $1', [accountId]);

/** Enrols a staff member through the commands and returns the secret and recovery codes. */
async function enrol(call, user) {
  const s = await call(user, null, { action: 'staff.totpStart' });
  assert.equal(s.status, 200, JSON.stringify(s));
  const c = await call(user, null, { action: 'staff.totpConfirm', code: totpCode(s.secret) });
  assert.equal(c.verified, true, JSON.stringify(c));
  return { secret: s.secret, codes: c.codes };
}

test('second factor: enrolment, secret sealed, codes once, replay refused, wrong codes lock, recovery codes single use', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const mod = await person('um', 'Mira'); const user = await person('uu', 'Alex');
    await role(db, mod, 'moderator');
    const modId = await accountOf(db, mod);
    // A staff role without an app: every staff command asks for enrolment; staff.me says so.
    const q0 = await call('um', null, { action: 'staff.mediaQueue' });
    assert.deepEqual([q0.status, q0.error, q0.rule], [403, 'second_factor', 'enrol']);
    assert.deepEqual((await call('um', null, { action: 'staff.me' })).factor.enrolled, false);
    // Not staff: no enrolment at all (optional factor for everyone comes later).
    assert.equal((await call('uu', null, { action: 'staff.totpStart' })).status, 403);

    const s = await call('um', null, { action: 'staff.totpStart' });
    assert.match(s.secret, /^[A-Z2-7]{32}$/);
    assert.match(s.uri, /^otpauth:\/\/totp\/FetUre%3A%40Mira\?secret=[A-Z2-7]{32}&issuer=FetUre&algorithm=SHA1&digits=6&period=30$/);
    const [row] = await db.query('select secret_sealed, enabled_at from feture.account_totp where account_id = $1', [modId]);
    assert.ok(!row.secret_sealed.includes(s.secret) && row.secret_sealed.startsWith('v1.'), 'secret is sealed at rest');
    assert.equal(row.enabled_at, null);
    // Before the first right code it is not on: verify refuses, staff commands still ask to enrol.
    assert.equal((await call('um', null, { action: 'staff.totpVerify', code: totpCode(s.secret) })).status, 409);
    const wrong = await call('um', null, { action: 'staff.totpConfirm', code: '000000' === totpCode(s.secret) ? '111111' : '000000' });
    assert.deepEqual([wrong.status, wrong.verified, wrong.reason, wrong.left], [200, false, 'wrong', 4]);
    const ok = await call('um', null, { action: 'staff.totpConfirm', code: totpCode(s.secret) });
    assert.equal(ok.verified, true);
    assert.equal(ok.codes.length, 10);
    assert.ok(ok.codes.every(c => /^[a-z2-9]{5}-[a-z2-9]{5}$/.test(c)));
    const stored = await db.query('select code_hash from feture.account_recovery_code where account_id = $1', [modId]);
    assert.equal(stored.length, 10);
    assert.ok(stored.every(r => !ok.codes.some(c => r.code_hash.includes(c.replace('-', '')))), 'only hashes are kept');
    // The results never reach the replay ledger.
    assert.equal((await db.query(`select 1 from feture.op_ledger where action like 'staff.totp%'`)).length, 0);
    // A second start after enrolment is refused (a reset comes first).
    assert.equal((await call('um', null, { action: 'staff.totpStart' })).rule, 'factor_enrolled');
    // Enrolment opened the staff window in this sign-in: commands work.
    assert.equal((await call('um', null, { action: 'staff.mediaQueue' })).status, 200);
    const meNow = (await call('um', null, { action: 'staff.me' })).factor;
    assert.deepEqual([meNow.enrolled, meNow.verified, meNow.fresh, meNow.recoveryLeft], [true, true, true, 10]);

    // Another sign-in (another device or a new token) has no window yet.
    const other = { 'x-test-session': 'phone-2' };
    assert.equal((await call('um', null, { action: 'staff.mediaQueue' }, other)).rule, 'verify');
    // The same code again (same 30 s step) is refused as used, and that is not counted as a wrong guess.
    const replay = await call('um', null, { action: 'staff.totpVerify', code: totpCode(s.secret) }, other);
    assert.deepEqual([replay.verified, replay.reason], [false, 'used']);
    // The next step's code is accepted (±1 step for clock drift) — and then that one is used too.
    const next = totpCode(s.secret, Date.now() + STEP);
    assert.equal((await call('um', null, { action: 'staff.totpVerify', code: next }, other)).verified, true);
    assert.equal((await call('um', null, { action: 'staff.totpVerify', code: next }, other)).reason, 'used');
    assert.equal((await call('um', null, { action: 'staff.mediaQueue' }, other)).status, 200);
    // Codes two steps away are wrong.
    const far = totpCode(s.secret, Date.now() + 3 * STEP);

    // Lockout: 5 wrong codes in 15 minutes lock checks, even for the right code, and it is journalled.
    const third = { 'x-test-session': 'laptop-3' };
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await call('um', null, { action: 'staff.totpVerify', code: i === 0 ? far : '12345' + (i % 10) }, third));
    assert.deepEqual(results.map(r => r.reason), ['wrong', 'wrong', 'wrong', 'wrong', 'locked']);
    assert.deepEqual(results.slice(0, 4).map(r => r.left), [4, 3, 2, 1]);
    assert.ok(Date.parse(results[4].lockedUntil) > Date.now() + 14 * 60000);
    await forgetStep(db, modId);
    const lockedRight = await call('um', null, { action: 'staff.totpVerify', code: totpCode(s.secret) }, third);
    assert.deepEqual([lockedRight.verified, lockedRight.reason], [false, 'locked']);
    assert.ok((await call('um', null, { action: 'staff.me' }, third)).factor.lockedUntil);
    assert.equal((await db.query(`select 1 from feture.staff_action where action = 'staff.factorLocked'`)).length, 1);
    // The lock runs out after 15 minutes; wrong codes older than the window do not add up.
    await db.query(`update feture.account_totp set locked_until = now() - interval '1 second' where account_id = $1`, [modId]);
    assert.equal((await call('um', null, { action: 'staff.totpVerify', code: totpCode(s.secret) }, third)).verified, true);
    await call('um', null, { action: 'staff.totpVerify', code: '999999' === totpCode(s.secret) ? '888888' : '999999' }, third);
    await db.query(`update feture.account_totp set fail_since = now() - interval '16 minutes' where account_id = $1`, [modId]);
    assert.equal((await call('um', null, { action: 'staff.totpVerify', code: '999999' === totpCode(s.secret) ? '888888' : '999999' }, third)).left, 4);

    // Recovery codes: each works once, in place of an app code; the use is journalled and counted.
    const fourth = { 'x-test-session': 'tablet-4' };
    const rc = await call('um', null, { action: 'staff.totpVerify', code: ok.codes[0].toUpperCase() }, fourth);
    assert.deepEqual([rc.verified, rc.recovery, rc.recoveryLeft], [true, true, 9]);
    const again = await call('um', null, { action: 'staff.totpVerify', code: ok.codes[0] }, { 'x-test-session': 'tablet-5' });
    assert.deepEqual([again.verified, again.reason], [false, 'wrong']);
    assert.equal((await db.query(`select 1 from feture.staff_action where action = 'staff.recoveryUsed'`)).length, 1);
  } finally { await pg.close(); }
});

test('second factor: 12 h staff window, 10 min re-check for dangerous actions, role revoke, reset by a lead', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const boss = await person('uo', 'Boss'), lead = await person('ul', 'Lena'), mod = await person('um', 'Mira'), user = await person('uu', 'Alex');
    await role(db, boss, 'owner'); await role(db, lead, 'lead'); await role(db, mod, 'moderator'); await role(db, mod, 'verifier');
    const [bossF, , modF] = [await enrol(call, 'uo'), await enrol(call, 'ul'), await enrol(call, 'um')];
    const modId = await accountOf(db, mod), bossId = await accountOf(db, boss);
    const key = testSessionKey();

    // The 10-minute re-check: after 10 minutes, granting a role asks for a code again; ordinary work does not.
    await db.query(`update feture.staff_session set checked_at = now() - interval '11 minutes' where account_id = $1`, [bossId]);
    const grant = { action: 'staff.grant', opId: op(), handle: 'Alex', role: 'support', grant: true };
    const stale = await call('uo', null, grant);
    assert.deepEqual([stale.status, stale.error, stale.rule], [403, 'second_factor', 'fresh']);
    assert.equal((await db.query(`select 1 from feture.staff_role where role = 'support'`)).length, 0, 'nothing happened');
    assert.equal((await call('uo', null, { action: 'staff.mediaQueue' })).status, 200);
    await forgetStep(db, bossId);
    assert.equal((await call('uo', null, { action: 'staff.totpVerify', code: totpCode(bossF.secret) })).verified, true);
    // The same request (same opId) goes through after the code.
    assert.equal((await call('uo', null, grant)).changed, true);

    // Documents and selfies: without a fresh code the age queue lists who waits but opens nothing and journals nothing.
    await db.query(`update feture.staff_session set checked_at = now() - interval '11 minutes' where account_id = $1`, [modId]);
    const lockedQ = await call('um', null, { action: 'staff.ageCheckQueue' });
    assert.deepEqual([lockedQ.status, lockedQ.locked], [200, true]);
    assert.equal((await call('um', null, { action: 'staff.photoCheckQueue' })).locked, true);
    await forgetStep(db, modId);
    await call('um', null, { action: 'staff.totpVerify', code: totpCode(modF.secret) });
    assert.equal((await call('um', null, { action: 'staff.ageCheckQueue' })).locked, false);

    // A suspension wants a fresh code too.
    await db.query(`update feture.staff_session set checked_at = now() - interval '11 minutes' where account_id = $1`, [bossId]);
    const ban = await call('uo', null, { action: 'staff.sanction', opId: op(), profileId: user, decision: 'suspend', rule: 'spam' });
    assert.equal(ban.rule, 'fresh');

    // The 12-hour window: started 12 h ago → every staff command asks to verify again; a code opens a new window.
    await db.query(`update feture.staff_session set started_at = now() - interval '12 hours 1 minute' where account_id = $1 and session_key = $2`, [modId, key]);
    assert.equal((await call('um', null, { action: 'staff.mediaQueue' })).rule, 'verify');
    assert.equal((await call('um', null, { action: 'staff.me' })).factor.verified, false);
    await forgetStep(db, modId);
    const v = await call('um', null, { action: 'staff.totpVerify', code: totpCode(modF.secret) });
    assert.ok(Date.parse(v.until) > Date.now() + 11.9 * 3600e3);
    assert.equal((await call('um', null, { action: 'staff.mediaQueue' })).status, 200);

    // Revoking one role ends the staff windows at once; with a role left the person verifies again.
    await forgetStep(db, bossId);
    await call('uo', null, { action: 'staff.totpVerify', code: totpCode(bossF.secret) });
    assert.equal((await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Mira', role: 'verifier', grant: false })).changed, true);
    assert.equal((await db.query('select 1 from feture.staff_session where account_id = $1', [modId])).length, 0);
    assert.equal((await call('um', null, { action: 'staff.mediaQueue' })).rule, 'verify');

    // Reset by a lead (fresh code needed): Mira enrols again; the lead cannot reset the owner or themselves.
    const reset = await call('ul', null, { action: 'staff.totpReset', opId: op(), handle: '@Mira' });
    assert.equal(reset.reset, true);
    assert.equal((await call('um', null, { action: 'staff.mediaQueue' })).rule, 'enrol');
    assert.equal((await db.query('select 1 from feture.account_recovery_code where account_id = $1', [modId])).length, 0);
    assert.equal((await call('ul', null, { action: 'staff.totpReset', opId: op(), handle: 'Boss' })).status, 403);
    assert.equal((await call('ul', null, { action: 'staff.totpReset', opId: op(), handle: 'Lena' })).rule, 'self');
    assert.equal((await call('um', null, { action: 'staff.totpReset', opId: op(), handle: 'Lena' })).status, 403);
    const [j] = await db.query(`select detail from feture.staff_action where action = 'staff.factorReset'`);
    assert.deepEqual(j.detail, { removed: true });
    await enrol(call, 'um');
    assert.equal((await call('um', null, { action: 'staff.mediaQueue' })).status, 200);

    // Deleting the account removes the factor and the windows.
    const gone = await call('um', null, { action: 'account.delete', opId: op(), confirmHandle: 'Mira' });
    assert.equal(gone.status, 200, JSON.stringify(gone));
    for (const t of ['account_totp', 'account_recovery_code', 'staff_session']) {
      assert.equal((await db.query(`select 1 from feture.${t} where account_id = $1`, [modId])).length, 0, t);
    }
  } finally { await pg.close(); }
});

test('my devices: last use and rough place per Core session id, only one\'s own', async () => {
  const { pg, call, person } = await setup();
  try {
    await person('ua', 'Anna'); await person('ub', 'Boris');
    const sid = 'a1b2c3d4e5f60718';
    await call('ua', null, { action: 'staff.me' }, { 'x-test-sid': sid, 'x-vercel-ip-city': 'S%C3%A3o%20Paulo', 'x-vercel-ip-country': 'BR' });
    const mine = await call('ua', null, { action: 'account.devices' });
    assert.equal(mine.items.length, 1);
    assert.deepEqual([mine.items[0].id, mine.items[0].city, mine.items[0].country], [sid, 'São Paulo', 'BR']);
    assert.ok(Date.parse(mine.items[0].seenAt) > Date.now() - 60000);
    assert.deepEqual((await call('ub', null, { action: 'account.devices' })).items, []);
  } finally { await pg.close(); }
});
