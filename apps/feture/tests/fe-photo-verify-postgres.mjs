// V01 photo verification on PGlite as feture_api: needs an approved profile photo, server-chosen gesture that runs out,
// staff approve → «Фото подтверждено» (a yes/no) on the profile for others, reject with a reason, the selfie never
// reaches anyone but staff, and goes 30 days after the decision.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { staff } from '../server/commands/staff.mjs';
import { discover } from '../server/commands/discover.mjs';
import { people } from '../server/commands/people.mjs';
import { photos } from '../server/commands/photos.mjs';
import { premium, sweepSelfies } from '../server/commands/premium.mjs';
import { verification } from '../server/commands/verification.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...staff, ...discover, ...people, ...photos, ...premium, ...verification } });

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

/** Person with an approved main photo, a started check and a submitted selfie. */
async function submitted(env, user, handle) {
  const { db, call, person } = env;
  const a = await person(user, handle);
  const avatar = await asset(db, a, 'avatar');
  await db.query('update feture.profile set avatar_asset_id = $1 where id = $2', [avatar, a]);
  const s = await call(user, null, { action: 'verification.photoStart', opId: op() });
  const selfie = await asset(db, a, 'verification', 'needs_review');
  const r = await call(user, null, { action: 'verification.photoSubmit', opId: op(), checkId: s.id, assetId: selfie });
  assert.equal(r.status, 200, JSON.stringify(r));
  return { a, avatar, s, selfie };
}

test('photo check: needs an approved main photo; one open check; the gesture runs out after 30 minutes', async () => {
  const { pg, db, call, person } = await world();
  try {
    const a = await person('ua', 'Alex');
    assert.equal((await call('ua', null, { action: 'verification.photoStart', opId: op() })).rule, 'photo_required');
    const pending = await asset(db, a, 'avatar', 'needs_review');
    await db.query('update feture.profile set avatar_asset_id = $1 where id = $2', [pending, a]);
    assert.equal((await call('ua', null, { action: 'verification.photoStart', opId: op() })).rule, 'photo_required'); // not yet approved
    await db.query('update feture.profile set avatar_asset_id = $1 where id = $2', [await asset(db, a, 'avatar'), a]);
    const s = await call('ua', null, { action: 'verification.photoStart', opId: op() });
    assert.ok(s.gesture);
    assert.equal((await call('ua', null, { action: 'verification.photoStart', opId: op() })).id, s.id);
    const st = await call('ua', null, { action: 'verification.photoStatus' });
    assert.deepEqual([st.state, st.verified, st.check.gesture], ['none', false, s.gesture]);
    // Not any picture: only a fresh verification selfie.
    assert.deepEqual((await call('ua', null, { action: 'verification.photoSubmit', opId: op(), checkId: s.id, assetId: await asset(db, a, 'post') })).fields, ['assetId']);
    // 31 minutes later the gesture is gone; the next start gives a new check.
    await db.query(`update feture.photo_check set created_at = now() - interval '31 minutes' where id = $1`, [s.id]);
    const selfie = await asset(db, a, 'verification', 'needs_review');
    const late = await call('ua', null, { action: 'verification.photoSubmit', opId: op(), checkId: s.id, assetId: selfie });
    assert.deepEqual([late.status, late.state], [409, 'expired']);
    const s2 = await call('ua', null, { action: 'verification.photoStart', opId: op() });
    assert.notEqual(s2.id, s.id);
    const [{ state }] = await db.query('select state from feture.photo_check where id = $1', [s.id]);
    assert.equal(state, 'expired');
    // Another person cannot send into someone else's check.
    await person('ub', 'Kira');
    assert.equal((await call('ub', null, { action: 'verification.photoSubmit', opId: op(), checkId: s2.id, assetId: selfie })).status, 404);
  } finally { await pg.close(); }
});

test('staff approve → photoVerified true for others (profile and cards), only a boolean; a new main photo drops it', async () => {
  const env = await world();
  const { pg, db, call, person } = env;
  try {
    const { a, s, selfie } = await submitted(env, 'ua', 'Alex');
    const viewer = await person('ub', 'Kira');
    assert.equal((await call('ua', null, { action: 'verification.photoStatus' })).state, 'pending');
    assert.equal((await call('ub', viewer, { action: 'profile.get', profileId: a })).profile.photoVerified, false);
    const queue = (await call('um', null, { action: 'staff.photoCheckQueue' })).items;
    assert.deepEqual([queue.length, queue[0].gesture, !!queue[0].selfie, !!queue[0].photo], [1, s.gesture, true, true]);
    // Not staff → no queue; staff never see their own check.
    assert.equal((await call('ub', viewer, { action: 'staff.photoCheckQueue' })).status, 403);
    assert.equal((await call('ua', null, { action: 'staff.photoCheckDecide', opId: op(), checkId: s.id, approve: true })).status, 403);
    const dec = await call('um', null, { action: 'staff.photoCheckDecide', opId: op(), checkId: s.id, approve: true });
    assert.equal(dec.state, 'approved', JSON.stringify(dec));
    const seen = (await call('ub', viewer, { action: 'profile.get', profileId: a })).profile;
    assert.equal(seen.photoVerified, true);
    const card = (await call('ub', viewer, { action: 'people.search', q: 'Alex' })).items.find(c => c.id === a);
    assert.equal(card.photoVerified, true);
    // Only the yes/no: nothing about the check or the selfie reaches the viewer.
    for (const dto of [seen, card]) {
      const json = JSON.stringify(dto);
      assert.ok(!json.includes(selfie) && !json.includes(s.id) && !/gesture|photoCheck/.test(json), json);
    }
    const st = await call('ua', null, { action: 'verification.photoStatus' });
    assert.deepEqual([st.state, st.verified], ['approved', true]);
    // Journaled: one look at the selfie, one decision.
    const acts = (await db.query(`select action from feture.staff_action where action like 'photo.%' order by created_at`)).map(r => r.action);
    assert.deepEqual(acts, ['photo.view', 'photo.approve']);
    // The selfie goes 30 days after the decision; the sweep leaves it alone till then.
    const [{ n }] = await db.query(`select count(*)::int n from feture.outbox where topic = 'verification.expire' and available_at > now() + interval '29 days'`);
    assert.equal(n, 1);
    await db.query(`update feture.media_asset set created_at = now() - interval '7 hours' where id = $1`, [selfie]);
    await sweepSelfies(db);
    assert.equal((await db.query('select state from feture.media_asset where id = $1', [selfie]))[0].state, 'needs_review');
    // A new main photo needs a new check.
    await db.query('update feture.profile set avatar_asset_id = $1 where id = $2', [await asset(db, a, 'avatar'), a]);
    assert.equal((await call('ub', viewer, { action: 'profile.get', profileId: a })).profile.photoVerified, false);
    assert.equal((await call('ua', null, { action: 'verification.photoStatus' })).lapsed, true);
  } finally { await pg.close(); }
});

test('reject needs a reason, the person sees it; the selfie is never visible to non-staff', async () => {
  const env = await world();
  const { pg, call, person } = env;
  try {
    const { a, s, selfie } = await submitted(env, 'ua', 'Alex');
    const viewer = await person('ub', 'Kira');
    assert.deepEqual((await call('um', null, { action: 'staff.photoCheckDecide', opId: op(), checkId: s.id, approve: false })).fields, ['reason']);
    await call('um', null, { action: 'staff.photoCheckDecide', opId: op(), checkId: s.id, approve: false, reason: 'face_hidden' });
    const st = await call('ua', null, { action: 'verification.photoStatus' });
    assert.deepEqual([st.state, st.reason, st.verified], ['rejected', 'face_hidden', false]);
    assert.equal((await call('ub', viewer, { action: 'profile.get', profileId: a })).profile.photoVerified, false);
    // Decided once.
    assert.equal((await call('um', null, { action: 'staff.photoCheckDecide', opId: op(), checkId: s.id, approve: true })).status, 409);
    // The selfie is not among the profile's photos, and the staff media viewer is the only way to it.
    const prof = JSON.stringify((await call('ub', viewer, { action: 'profile.get', profileId: a })).profile);
    assert.ok(!prof.includes(selfie));
    assert.equal((await call('ub', viewer, { action: 'staff.mediaView', assetId: selfie })).status, 403);
    // A rejected person may try again.
    assert.equal((await call('ua', null, { action: 'verification.photoStart', opId: op() })).state, 'started');
  } finally { await pg.close(); }
});

test('a selfie serves one check only, and approval needs it in front of staff', async () => {
  const env = await world();
  const { pg, db, call } = env;
  try {
    const { a, s, selfie } = await submitted(env, 'ua', 'Alex');
    // The same selfie cannot be reused for the age check.
    await db.query(`update feture.account set age_verified_until = null where person_profile_id = $1`, [a]);
    const age = await call('ua', null, { action: 'verification.ageStart', opId: op() });
    await db.query(`update feture.age_check set created_at = now() - interval '5 minutes' where id = $1`, [age.id]); // fresh enough
    assert.deepEqual((await call('ua', null, { action: 'verification.ageSubmit', opId: op(), checkId: age.id, assetId: selfie })).fields, ['assetId']);
    await db.query(`update feture.media_asset set state = 'removed' where id = $1`, [selfie]);
    assert.equal((await call('um', null, { action: 'staff.photoCheckDecide', opId: op(), checkId: s.id, approve: true })).rule, 'selfie_missing');
  } finally { await pg.close(); }
});
