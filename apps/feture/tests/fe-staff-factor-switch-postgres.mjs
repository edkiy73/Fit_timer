// The test-only switch «2FA для сотрудников» on PGlite as feture_api (owner 29.10.2026): default ON enforces, OFF waives
// for staff roles only, fail closed on a read error, a regular user's optional factor is still enforced, ON again enforces.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { staff } from '../server/commands/staff.mjs';
import { accounts } from '../server/commands/account.mjs';
import { totpCode } from '../server/second-factor.mjs';
import { setStaffFactor, staffFactorState, staffFactorRequired } from '../server/staff-factor-switch.mjs';
import { setup as baseSetup } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...staff, ...accounts }, staffFactor: true });
const role = (db, profileId, r) => db.query(`insert into feture.staff_role (account_id, role) select id, $2 from feture.account where person_profile_id = $1`, [profileId, r]);
const queue = (call, user) => call(user, null, { action: 'staff.mediaQueue' });

test('staff factor switch: ON by default, OFF waives staff only, ON again enforces, fail closed', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const mod = await person('um', 'Mira'); const user = await person('uu', 'Alex');
    await role(db, mod, 'moderator');
    assert.deepEqual(await staffFactorState(db), { required: true, changedBy: null, changedAt: null });
    let r = await queue(call, 'um');
    assert.deepEqual([r.status, r.error, r.rule], [403, 'second_factor', 'enrol']); // default ON, no app yet

    await setStaffFactor(db, false, 'test');
    assert.equal((await staffFactorState(db)).required, false);
    assert.equal((await queue(call, 'um')).status, 200); // waived: no enrolment, no code
    const meRes = await call('um', null, { action: 'staff.me' });
    assert.deepEqual([meRes.factor.verified, meRes.factor.fresh, meRes.factor.waived], [true, true, true]);
    assert.equal((await db.query('select count(*)::int n from feture.account_totp'))[0].n, 0); // nothing created or deleted
    // A non-staff person has no staff rights from the waiver.
    assert.equal((await queue(call, 'uu')).status, 403);
    assert.equal((await queue(call, 'uu')).error, 'forbidden');

    await setStaffFactor(db, true, 'test');
    r = await queue(call, 'um');
    assert.deepEqual([r.status, r.error, r.rule], [403, 'second_factor', 'enrol']); // ON again enforces

    // Fail closed: the table cannot be read -> behave as ON.
    await setStaffFactor(db, false, 'test');
    assert.equal((await queue(call, 'um')).status, 200);
    await pg.exec('reset role; alter table feture.staff_factor_change rename to staff_factor_gone; set role feture_api;');
    assert.equal(await staffFactorRequired(db), true);
    r = await queue(call, 'um');
    assert.deepEqual([r.status, r.error, r.rule], [403, 'second_factor', 'enrol']);
  } finally { await pg.close(); }
});

test('staff factor switch: an optional factor of a regular user is still enforced, a staff account is let through while OFF', async () => {
  const { pg, db, call, person } = await baseSetup({ commands: { ...platform, ...me, ...staff, ...accounts }, staffFactor: true });
  try {
    const mod = await person('um', 'Mira'); const user = await person('uu', 'Alex');
    await role(db, mod, 'moderator');
    // Alex switches the optional factor on in session s1; a second sign-in s2 must pass the second step.
    const s = await call('uu', null, { action: 'account.factorStart' }, { 'x-test-session': 's1' });
    assert.equal(s.status, 200, JSON.stringify(s));
    const c = await call('uu', null, { action: 'account.factorConfirm', code: totpCode(s.secret) }, { 'x-test-session': 's1' });
    assert.equal(c.status, 200, JSON.stringify(c));
    // The moderator has a factor on as well (enrolled earlier).
    const ms = await call('um', null, { action: 'staff.totpStart' }, { 'x-test-session': 'm1' });
    await call('um', null, { action: 'staff.totpConfirm', code: totpCode(ms.secret) }, { 'x-test-session': 'm1' });

    const blocked = who => call(who, null, { action: 'staff.me' }, { 'x-test-session': 'other' });
    for (const on of [true, false]) {
      await setStaffFactor(db, on, 'test');
      const u = await call('uu', null, { action: 'staff.me' }, { 'x-test-session': 'other' });
      assert.deepEqual([u.status, u.error, u.rule], [403, 'second_factor', 'signin'], 'regular user stays gated, switch ' + on);
      const m = await blocked('um');
      if (on) assert.deepEqual([m.status, m.error, m.rule], [403, 'second_factor', 'signin']);
      else assert.equal(m.status, 200, JSON.stringify(m));
    }
    // The secrets were kept.
    assert.equal((await db.query('select count(*)::int n from feture.account_totp where enabled_at is not null'))[0].n, 2);
  } finally { await pg.close(); }
});
