// Profile photos on PGlite as feture_api: order, video rules, avatar = first approved safe image, couples.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { photos, settleAvatarsOf } from '../server/commands/photos.mjs';
import { mediaHandlers } from '../server/jobs.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...photos } });

/** A profile-photo upload of `profileId`. */
async function asset(db, profileId, { state = 'approved', kind = 'image', purpose = 'avatar' } = {}) {
  const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [profileId]);
  const [a] = await db.query(
    `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
     values ($1, $2, $3, $4, 'u/' || gen_random_uuid(), 'image/jpeg', 10, $5, $6, now()) returning id`,
    [profileId, account_id, kind, purpose, state, state === 'approved' ? 'safe' : 'unknown']);
  return a.id;
}

test('photos: up to six, one video never first, own assets only; others see approved ones; the avatar follows approval', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
    const ok1 = await asset(db, a), wait = await asset(db, a, { state: 'scanning' }), vid = await asset(db, a, { kind: 'video' }), vid2 = await asset(db, a, { kind: 'video' });
    assert.equal((await call('ua', a, { action: 'profile.photosSet', opId: op(), assetIds: [vid, ok1] })).rule, 'video_rules');
    assert.equal((await call('ua', a, { action: 'profile.photosSet', opId: op(), assetIds: [ok1, vid, vid2] })).rule, 'video_rules');
    assert.deepEqual((await call('ua', a, { action: 'profile.photosSet', opId: op(), assetIds: [await asset(db, b)] })).fields, ['assetIds']);
    assert.deepEqual((await call('ua', a, { action: 'profile.photosSet', opId: op(), assetIds: [await asset(db, a, { purpose: 'verification' })] })).fields, ['assetIds']);

    await call('ua', a, { action: 'profile.photosSet', opId: op(), assetIds: [wait, ok1, vid] });
    // The photo still being checked is first for the owner, but the avatar is the first approved one.
    const own = (await call('ua', a, { action: 'profile.get', profileId: a })).profile;
    assert.deepEqual([own.photos.map((/** @type {any} */ p) => p.id), own.photos[0].pending, own.avatar.id], [[wait, ok1, vid], true, ok1]);
    const seen = (await call('ub', b, { action: 'profile.get', profileId: a })).profile;
    assert.deepEqual([seen.photos.map((/** @type {any} */ p) => p.id), seen.avatar.id], [[ok1, vid], ok1]);

    // Approved later: it becomes the avatar. Removed: the next approved one takes over.
    await db.query(`update feture.media_asset set state = 'approved', explicitness = 'safe' where id = $1`, [wait]);
    await mediaHandlers(db, { scan: null })['media.approved']({ payload: { assetId: wait } });
    assert.equal((await call('ub', b, { action: 'profile.get', profileId: a })).profile.avatar.id, wait);
    await db.query(`update feture.media_asset set state = 'removed' where id = $1`, [wait]);
    await db.tx(q => settleAvatarsOf(q, wait));
    assert.equal((await call('ub', b, { action: 'profile.get', profileId: a })).profile.avatar.id, ok1);
    await call('ua', a, { action: 'profile.photosSet', opId: op(), assetIds: [] });
    assert.equal((await call('ub', b, { action: 'profile.get', profileId: a })).profile.avatar, null);
  } finally { await pg.close(); }
});

test('couple photos: adding waits for the partner when they asked; removing applies at once', async () => {
  const { pg, db, call, person, coupleOf } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
    const pair = await coupleOf([a, b]);
    const p1 = await asset(db, pair), p2 = await asset(db, pair);
    await call('ua', pair, { action: 'profile.photosSet', opId: op(), assetIds: [p1] });
    await db.query(`update feture.profile_member set approves_partner = true where profile_id = $1`, [pair]);
    const r = await call('ua', pair, { action: 'profile.photosSet', opId: op(), assetIds: [p1, p2] });
    assert.ok(r.pending);
    assert.equal((await call('ua', pair, { action: 'profile.get', profileId: pair })).profile.photos.length, 1);
    await call('ub', pair, { action: 'decide.approval', opId: op(), approvalId: r.pending.approvalId, choice: 'approve' });
    assert.equal((await call('ua', pair, { action: 'profile.get', profileId: pair })).profile.photos.length, 2);
    assert.deepEqual((await call('ua', pair, { action: 'profile.photosSet', opId: op(), assetIds: [p2] })).assetIds, [p2]);
    assert.equal((await call('ua', pair, { action: 'profile.get', profileId: pair })).profile.avatar.id, p2);
  } finally { await pg.close(); }
});
