// S4 steps 1–2 on PGlite as feture_api: staff roles, journal, media review queue and decisions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { staff } from '../server/commands/staff.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...staff } });

/** A media asset waiting for staff (as the scan leaves it without a scanner), owned by a profile. */
async function pendingAsset(db, profileId, purpose = 'post', copies = true) {
  const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1', [profileId]);
  const [a] = await db.query(
    `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, copies_at, reject_reason)
     values ($1, $2, 'image', $3, 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'needs_review', $4, 'scanner_not_configured') returning id`,
    [profileId, account_id, purpose, copies ? new Date() : null]);
  return a.id;
}

test('staff: roles are server-side, owner grants, queue excludes own media, decisions and views are journalled', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const boss = await person('uo', 'Boss'), mod = await person('um', 'Mira'), user = await person('uu', 'Alex');
    assert.equal((await call('um', null, { action: 'staff.mediaQueue' })).status, 403);
    // Bootstrap: the first owner is granted in SQL by the project owner.
    await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
    assert.deepEqual((await call('uo', null, { action: 'staff.me' })).roles, ['owner']);
    assert.equal((await call('um', null, { action: 'staff.grant', opId: op(), handle: 'Alex', role: 'moderator', grant: true })).status, 403);
    assert.equal((await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Mira', role: 'moderator', grant: true })).status, 200);

    const theirs = await pendingAsset(db, user);
    const avatar = await pendingAsset(db, user, 'avatar');
    const own = await pendingAsset(db, mod);
    const queue = await call('um', null, { action: 'staff.mediaQueue' });
    assert.deepEqual(queue.items.map(i => i.id).sort(), [theirs, avatar].sort()); // never one's own media
    assert.ok(queue.items.every(i => i.blur && new URL(i.blur).pathname.endsWith('/blur')));
    assert.equal((await call('um', null, { action: 'staff.mediaDecide', opId: op(), assetId: own, decision: 'approve', explicit: false })).status, 403);

    const view = await call('um', null, { action: 'staff.mediaView', assetId: theirs });
    assert.ok(view.src.full);
    assert.equal((await call('um', null, { action: 'staff.mediaDecide', opId: op(), assetId: theirs, decision: 'approve' })).status, 400); // a label is required
    assert.equal((await call('um', null, { action: 'staff.mediaDecide', opId: op(), assetId: avatar, decision: 'approve', explicit: true })).rule, 'explicit_not_allowed');
    assert.equal((await call('um', null, { action: 'staff.mediaDecide', opId: op(), assetId: theirs, decision: 'approve', explicit: true })).state, 'approved');
    assert.equal((await call('um', null, { action: 'staff.mediaDecide', opId: op(), assetId: theirs, decision: 'reject', reason: 'spam' })).status, 409);
    assert.equal((await call('um', null, { action: 'staff.mediaDecide', opId: op(), assetId: avatar, decision: 'reject', reason: 'csam_suspected' })).state, 'blocked');
    const [row] = await db.query('select state, explicitness, explicitness_source from feture.media_asset where id = $1', [theirs]);
    assert.deepEqual([row.state, row.explicitness, row.explicitness_source], ['approved', 'explicit', 'staff']);
    const topics = (await db.query(`select topic from feture.outbox where payload->>'assetId' = $1`, [avatar])).map(r => r.topic).sort();
    assert.deepEqual(topics, ['media.hide', 'safety.csamMatch']);

    // Staff do not open media outside the queue: approved, blocked, private media in general.
    assert.equal((await call('um', null, { action: 'staff.mediaView', assetId: theirs })).status, 409);
    assert.equal((await call('um', null, { action: 'staff.mediaView', assetId: avatar })).status, 409);
    // An approved file can still be escalated as suspected CSAM; a blocked one cannot be decided again.
    const later = await pendingAsset(db, user);
    await call('um', null, { action: 'staff.mediaDecide', opId: op(), assetId: later, decision: 'approve', explicit: false });
    assert.equal((await call('um', null, { action: 'staff.mediaDecide', opId: op(), assetId: later, decision: 'reject', reason: 'spam' })).status, 409);
    assert.equal((await call('um', null, { action: 'staff.mediaDecide', opId: op(), assetId: later, decision: 'reject', reason: 'csam_suspected' })).state, 'blocked');
    assert.equal((await call('um', null, { action: 'staff.mediaDecide', opId: op(), assetId: avatar, decision: 'reject', reason: 'csam_suspected' })).status, 409);
    // The CSAM event suspends the uploader at once; the next request is refused.
    const { mediaHandlers } = await import('../server/jobs.mjs');
    await mediaHandlers(db, { scan: null })['safety.csamMatch']({ payload: { assetId: avatar } });
    assert.equal((await call('uu', user, { action: 'profile.settings' })).status, 403);
    const [acc] = await db.query('select state from feture.account where person_profile_id = $1', [user]);
    assert.equal(acc.state, 'suspended');

    const j = await call('uo', null, { action: 'staff.journal' });
    assert.deepEqual([...new Set(j.items.map(i => i.action))].sort(), ['media.approve', 'media.reject', 'media.view', 'staff.grant']);
    assert.equal((await call('um', null, { action: 'staff.journal' })).status, 403); // moderators do not read the journal
    await pg.exec('reset role; set role feture_api');
    await assert.rejects(db.query('delete from feture.staff_action'), /permission denied|immutable/);
    await assert.rejects(db.query(`update feture.staff_action set action = 'x.y'`), /permission denied|immutable/);

    // A revoked role stops at the next request.
    await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Mira', role: 'moderator', grant: false });
    assert.equal((await call('um', null, { action: 'staff.mediaQueue' })).status, 403);
  } finally { await pg.close(); }
});
