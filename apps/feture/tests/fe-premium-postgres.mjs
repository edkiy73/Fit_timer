// Slice H1 on PGlite as feture_api: Premium entitlements (staff grants for dogfooding), Premium in a couple, the age check by selfie.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { staff } from '../server/commands/staff.mjs';
import { discover } from '../server/commands/discover.mjs';
import { premium } from '../server/commands/premium.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...staff, ...discover, ...premium } });

/** An asset of `profileId` in a given state. */
async function asset(db, profileId, purpose, state = 'approved') {
  const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [profileId]);
  const [a] = await db.query(
    `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
     values ($1, $2, 'image', $3, 'u/' || gen_random_uuid(), 'image/jpeg', 10, $4, $5, now()) returning id`, [profileId, account_id, purpose, state, state === 'approved' ? 'safe' : 'unknown']);
  return a.id;
}

async function world() {
  const env = await setup();
  const { db, call, person } = env;
  const boss = await person('uo', 'Boss');
  await person('um', 'Mira');
  await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
  await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Mira', role: 'moderator', grant: true });
  return env;
}

test('Premium: only owner/lead grant it (journaled), revoke ends it, a couple has it through either partner', async () => {
  const { pg, db, call, person, coupleOf } = await world();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
    assert.equal((await call('ua', a, { action: 'premium.status' })).premium, false);
    assert.equal((await call('um', null, { action: 'staff.premiumGrant', opId: op(), handle: 'Alex', days: 30, reason: 'тест на себе' })).status, 403);
    const g = await call('uo', null, { action: 'staff.premiumGrant', opId: op(), handle: 'Alex', days: 30, reason: 'тест на себе' });
    assert.equal((await call('ua', a, { action: 'premium.status' })).premium, true);
    const pair = await coupleOf([a, b]);
    const st = await call('ub', pair, { action: 'premium.status' });
    assert.deepEqual([st.premium, st.viaPartner], [true, true]);
    assert.equal((await call('ub', b, { action: 'premium.status' })).premium, false); // only acting as the couple
    const [{ n }] = await db.query(`select count(*)::int n from feture.staff_action where action = 'premium.grant'`);
    assert.equal(n, 1);
    await call('uo', null, { action: 'staff.premiumRevoke', opId: op(), entitlementId: g.id, reason: 'конец теста' });
    assert.equal((await call('ua', a, { action: 'premium.status' })).premium, false);
  } finally { await pg.close(); }
});

test('age check: needs an approved profile photo, server-chosen gesture, staff only, not one’s own; approval verifies for a year', async () => {
  const { pg, db, call, person } = await world();
  try {
    const a = await person('ua', 'Alex', { verified: false });
    assert.equal((await call('ua', null, { action: 'verification.ageStart', opId: op() })).rule, 'photo_required');
    await db.query('update feture.profile set avatar_asset_id = $1 where id = $2', [await asset(db, a, 'avatar'), a]);
    const s = await call('ua', null, { action: 'verification.ageStart', opId: op() });
    assert.ok(s.gesture);
    assert.equal((await call('ua', null, { action: 'verification.ageStart', opId: op() })).id, s.id); // one open check
    assert.deepEqual((await call('ua', null, { action: 'verification.ageSubmit', opId: op(), checkId: s.id, assetId: await asset(db, a, 'post') })).fields, ['assetId']);
    await call('ua', null, { action: 'verification.ageSubmit', opId: op(), checkId: s.id, assetId: await asset(db, a, 'verification', 'needs_review') });
    const queue = (await call('um', null, { action: 'staff.ageCheckQueue' })).items;
    assert.deepEqual([queue.length, queue[0].gesture, !!queue[0].selfie, !!queue[0].photo], [1, s.gesture, true, true]);
    assert.equal((await call('ua', null, { action: 'staff.ageCheckQueue' })).status, 403);
    assert.deepEqual((await call('um', null, { action: 'staff.ageCheckDecide', opId: op(), checkId: s.id, approve: false })).fields, ['reason']);
    await call('um', null, { action: 'staff.ageCheckDecide', opId: op(), checkId: s.id, approve: true });
    const st = await call('ua', null, { action: 'verification.ageStatus' });
    assert.deepEqual([st.verified, st.check.state], [true, 'approved']);
    // The selfie goes 30 days after the decision.
    const [{ n }] = await db.query(`select count(*)::int n from feture.outbox where topic = 'verification.expire' and available_at > now() + interval '29 days'`);
    assert.equal(n, 1);
  } finally { await pg.close(); }
});

test('review fixes: a selfie is used once and must be fresh; never approved without it; no Premium for oneself', async () => {
  const { pg, db, call, person } = await world();
  try {
    assert.equal((await call('uo', null, { action: 'staff.premiumGrant', opId: op(), handle: 'Boss', days: 30, reason: 'сам себе' })).status, 403);
    const a = await person('ua', 'Alex', { verified: false });
    await db.query('update feture.profile set avatar_asset_id = $1 where id = $2', [await asset(db, a, 'avatar'), a]);
    const old = await asset(db, a, 'verification', 'needs_review');
    await db.query(`update feture.media_asset set created_at = now() - interval '1 hour' where id = $1`, [old]);
    const s = await call('ua', null, { action: 'verification.ageStart', opId: op() });
    assert.deepEqual((await call('ua', null, { action: 'verification.ageSubmit', opId: op(), checkId: s.id, assetId: old })).fields, ['assetId']);
    const selfie = await asset(db, a, 'verification', 'needs_review');
    await call('ua', null, { action: 'verification.ageSubmit', opId: op(), checkId: s.id, assetId: selfie });
    await db.query(`update feture.media_asset set state = 'removed' where id = $1`, [selfie]);
    assert.equal((await call('um', null, { action: 'staff.ageCheckDecide', opId: op(), checkId: s.id, approve: true })).rule, 'selfie_missing');
  } finally { await pg.close(); }
});
