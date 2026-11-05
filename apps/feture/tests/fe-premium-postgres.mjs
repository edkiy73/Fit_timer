// Slice H1 on PGlite as feture_api: Premium entitlements (staff grants for dogfooding), Premium in a couple, the age check by
// selfie and by identity document (A07: who can reach the document, its deletion, the expiry sweep, the rate limit).
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { staff } from '../server/commands/staff.mjs';
import { discover } from '../server/commands/discover.mjs';
import { premium, sweepPremium, sweepSelfies, verificationHandlers } from '../server/commands/premium.mjs';
import { referral } from '../server/commands/referral.mjs';
import { photos } from '../server/commands/photos.mjs';
import { verification } from '../server/commands/verification.mjs';
import { mediaDto } from '../server/media/assets.mjs';
import { tokenDelivery } from '../server/media/delivery.mjs';
import { drain } from '../server/outbox.mjs';
import { notifyHandlers } from '../server/notify.mjs';
import { takePayEvents } from '../server/pay-events.mjs';
import { robokassa } from '../server/billing/robokassa.mjs';
import { createHash } from 'node:crypto';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...staff, ...discover, ...premium, ...photos, ...verification } });

/** An asset of `profileId` in a given state. */
async function asset(db, profileId, purpose, state = 'approved') {
  const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [profileId]);
  const [a] = await db.query(
    `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
     values ($1, $2, 'image', $3, 'u/' || gen_random_uuid(), 'image/jpeg', 10, $4, $5, now()) returning id`, [profileId, account_id, purpose, state, state === 'approved' ? 'safe' : 'unknown']);
  // In use (a profile photo): a file nobody uses any more is not reviewed (staff.mjs IN_USE).
  if (state === 'needs_review') await db.query(`insert into feture.media_attachment (asset_id, target_type, target_id) values ($1, 'avatar', $2)`, [a.id, profileId]);
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
    const open = await call('um', null, { action: 'staff.ageCheckOpen', checkId: queue[0].id });
    assert.deepEqual([queue.length, queue[0].gesture, !!open.selfie, !!open.photo], [1, s.gesture, true, true]);
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

test('the owner may give Premium to themselves (journaled), a lead never; nobody reviews their own checks or media, the owner is freed from them instead', async () => {
  const { pg, db, call, person } = await world();
  try {
    const [{ id: bossAcc, person_profile_id: boss }] = await db.query(`select a.id, a.person_profile_id from feture.account a join feture.profile p on p.id = a.person_profile_id where p.handle = 'Boss'`);
    // Premium to oneself: the owner yes, a lead no (rule «self», not «only owner and lead»).
    const g = await call('uo', null, { action: 'staff.premiumGrant', opId: op(), handle: 'Boss', days: 30, reason: 'сам себе' });
    assert.ok(g.id, JSON.stringify(g));
    assert.equal((await call('uo', boss, { action: 'premium.status' })).premium, true);
    const [j] = await db.query(`select staff_account_id, target_id from feture.staff_action where action = 'premium.grant'`);
    assert.deepEqual([j.staff_account_id, j.target_id], [bossAcc, bossAcc]);
    assert.equal((await call('uo', null, { action: 'staff.premiumRevoke', opId: op(), entitlementId: g.id, reason: 'хватит' })).revoked, true);
    assert.equal((await call('uo', boss, { action: 'premium.status' })).premium, false);
    await person('ul', 'Lena');
    await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Lena', role: 'lead', grant: true });
    const self = await call('ul', null, { action: 'staff.premiumGrant', opId: op(), handle: 'Lena', days: 30, reason: 'сам себе' });
    assert.deepEqual([self.status, self.rule], [403, 'self']);
    assert.equal((await call('ul', null, { action: 'staff.premiumGrant', opId: op(), handle: 'Mira', days: 30, reason: 'для теста' })).status, 200);

    // The owner is freed from the age check: an adult without a check or a date. Nobody decides their own check, not even
    // the owner: it is not in their queue, cannot be opened or decided by them.
    assert.equal((await call('uo', null, { action: 'verification.ageStatus' })).verified, true);
    await db.query('update feture.account set age_verified_until = null where id = $1', [bossAcc]);
    assert.equal((await call('uo', null, { action: 'verification.ageStatus' })).verified, true);
    await db.query('update feture.profile set avatar_asset_id = $1 where id = $2', [await asset(db, boss, 'avatar'), boss]);
    const s = await call('uo', null, { action: 'verification.ageStart', opId: op() });
    await call('uo', null, { action: 'verification.ageSubmit', opId: op(), checkId: s.id, assetId: await asset(db, boss, 'verification', 'needs_review') });
    assert.deepEqual((await call('uo', null, { action: 'staff.ageCheckQueue' })).items, []);
    assert.equal((await call('uo', null, { action: 'staff.ageCheckOpen', checkId: s.id })).status, 403);
    assert.equal((await call('uo', null, { action: 'staff.ageCheckDecide', opId: op(), checkId: s.id, approve: true })).status, 403);
    // A moderator's own check is refused the same way (a check of another, a moderator may decide).
    const [{ person_profile_id: mira }] = await db.query(`select a.person_profile_id from feture.account a join feture.profile p on p.id = a.person_profile_id where p.handle = 'Mira'`);
    await db.query(`update feture.account set age_verified_until = null where person_profile_id = $1`, [mira]);
    await db.query('update feture.profile set avatar_asset_id = $1 where id = $2', [await asset(db, mira, 'avatar'), mira]);
    const m = await call('um', null, { action: 'verification.ageStart', opId: op() });
    await call('um', null, { action: 'verification.ageSubmit', opId: op(), checkId: m.id, assetId: await asset(db, mira, 'verification', 'needs_review') });
    // Mira sees the owner's check (another reviewer decides it) but never her own.
    assert.deepEqual((await call('um', null, { action: 'staff.ageCheckQueue' })).items.map(i => i.id), [s.id]);
    assert.equal((await call('um', null, { action: 'staff.ageCheckDecide', opId: op(), checkId: m.id, approve: true })).status, 403);

    // Own media on review: nobody sees or decides their own (the owner's goes to another reviewer).
    const mine = await asset(db, boss, 'post', 'needs_review');
    assert.ok(!(await call('uo', null, { action: 'staff.mediaQueue' })).items.some(i => i.id === mine));
    assert.equal((await call('uo', null, { action: 'staff.mediaDecide', opId: op(), assetId: mine, decision: 'approve', explicit: false })).status, 403);
    assert.ok((await call('um', null, { action: 'staff.mediaQueue' })).items.some(i => i.id === mine)); // another reviewer sees it
    const hers = await asset(db, mira, 'post', 'needs_review');
    assert.ok(!(await call('um', null, { action: 'staff.mediaQueue' })).items.some(i => i.id === hers));
    assert.equal((await call('um', null, { action: 'staff.mediaDecide', opId: op(), assetId: hers, decision: 'approve', explicit: false })).status, 403);
  } finally { await pg.close(); }
});

test('checks waiver: only the owner switches it (journaled); it frees that account only, never its partner in a couple', async () => {
  const { pg, db, call, person, coupleOf } = await world();
  try {
    const [{ id: mira }] = await db.query(`select a.person_profile_id id from feture.account a join feture.profile p on p.id = a.person_profile_id where p.handle = 'Mira'`);
    const z = await person('uz', 'Zed', { verified: false });
    const age = u => call(u, null, { action: 'verification.ageStatus' });
    const photo = u => call(u, null, { action: 'verification.photoStatus' });
    // Mira (a moderator) is checked like anyone: not an adult yet, no photo badge.
    await db.query(`update feture.account set age_verified_until = null where person_profile_id = $1`, [mira]);
    assert.deepEqual([(await age('um')).verified, (await photo('um')).verified], [false, false], JSON.stringify([await age('um'), await photo('um')]));

    // Only the owner switches it; a moderator is refused; an unknown nick is not found; the owner has nothing to switch.
    assert.equal((await call('um', null, { action: 'staff.checksWaiver', opId: op(), handle: 'Mira', on: true })).status, 403);
    assert.equal((await call('uo', null, { action: 'staff.checksWaiver', opId: op(), handle: 'Nobody', on: true })).status, 404);
    assert.equal((await call('uo', null, { action: 'staff.checksWaiver', opId: op(), handle: 'Boss', on: true })).rule, 'owner_always_freed');
    const on = await call('uo', null, { action: 'staff.checksWaiver', opId: op(), handle: 'Mira', on: true });
    assert.deepEqual([on.changed, on.waived], [true, true]);
    assert.equal((await call('uo', null, { action: 'staff.checksWaiver', opId: op(), handle: 'Mira', on: true })).changed, false); // already on: no new journal line
    assert.deepEqual([(await age('um')).verified, (await photo('um')).verified, (await photo('um')).state], [true, true, 'approved']);
    assert.deepEqual((await call('uo', null, { action: 'staff.team' })).waived.map(w => w.handle), ['Mira']);
    const [{ n }] = await db.query(`select count(*)::int n from feture.staff_action where action = 'staff.checksWaiver'`);
    assert.equal(n, 1);

    // A couple counts each partner by their own account: Mira's waiver does not cover Zed.
    const pair = await coupleOf([mira, z]);
    const visible = u => call(u, pair, { action: 'profile.setVisibility', opId: op(), setting: 'discoverMode', value: 'visible' });
    assert.equal((await visible('uz')).rule, 'age_not_verified');
    await call('uo', null, { action: 'staff.checksWaiver', opId: op(), handle: 'Zed', on: true });
    assert.notEqual((await visible('uz')).rule, 'age_not_verified'); // both partners count as adults now
    // Switched off: the checks are back at once.
    await call('uo', null, { action: 'staff.checksWaiver', opId: op(), handle: 'Mira', on: false });
    await call('uo', null, { action: 'staff.checksWaiver', opId: op(), handle: 'Zed', on: false });
    assert.deepEqual([(await age('um')).verified, (await photo('um')).verified], [false, false]);
    assert.deepEqual((await call('uo', null, { action: 'staff.team' })).waived, []);
  } finally { await pg.close(); }
});

test('roles: the owner gives and takes roles from themselves too, journaled; the owner role is not given by command', async () => {
  const { pg, db, call } = await world();
  try {
    assert.equal((await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Boss', role: 'verifier', grant: true })).changed, true);
    assert.equal((await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Boss', role: 'verifier', grant: false })).changed, true);
    const [{ n }] = await db.query(`select count(*)::int n from feture.staff_action where action in ('staff.grant', 'staff.revoke') and detail->>'role' = 'verifier'`);
    assert.equal(n, 2);
    assert.equal((await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Boss', role: 'owner', grant: false })).status, 400);
    const [{ owner }] = await db.query(`select count(*)::int owner from feture.staff_role r join feture.account a on a.id = r.account_id join feture.profile p on p.id = a.person_profile_id where p.handle = 'Boss' and r.role = 'owner' and r.revoked_at is null`);
    assert.equal(owner, 1);
  } finally { await pg.close(); }
});

// ——— A07: the age check by an identity document ———

/** Storage that only records what was deleted. */
const fakeStorage = () => { const removed = []; return { removed, async remove(key) { removed.push(key); } }; };

test('age check by document: no profile photo needed, staff read it alone; nobody else can reach the image; it is deleted right after the decision', async () => {
  const { pg, db, call, person, coupleOf } = await world();
  try {
    const a = await person('ua', 'Alex', { verified: false }), b = await person('ub', 'Kira'), stranger = await person('us', 'Sam');
    const pair = await coupleOf([a, b]);
    // No avatar: a selfie is refused, a document is not; the gesture is not shown for a document.
    assert.equal((await call('ua', null, { action: 'verification.ageStart', opId: op() })).rule, 'photo_required');
    const s = await call('ua', null, { action: 'verification.ageStart', opId: op(), method: 'document' });
    assert.deepEqual([s.method, s.gesture, s.state], ['document', null, 'started']);
    assert.equal((await call('ua', null, { action: 'verification.ageStart', opId: op(), method: 'document' })).id, s.id); // one open check
    assert.equal((await call('ua', null, { action: 'verification.ageStart', opId: op(), method: 'nope' })).status, 400);
    const doc = await asset(db, a, 'verification', 'needs_review');
    await call('ua', null, { action: 'verification.ageSubmit', opId: op(), checkId: s.id, assetId: doc });
    const st = await call('ua', null, { action: 'verification.ageStatus' });
    assert.deepEqual([st.check.method, st.check.state, st.check.gesture], ['document', 'submitted', null]);

    // Staff see the document, not a profile photo or a gesture; every look is journaled.
    // The queue lists the check without pictures and journals nothing; opening it shows the document once per look.
    const [item] = (await call('um', null, { action: 'staff.ageCheckQueue' })).items;
    assert.deepEqual([item.method, item.gesture, item.selfie, item.photo, item.document], ['document', null, null, null, null]);
    const looked = async () => (await db.query(`select count(*)::int n from feture.staff_action where action = 'age.view' and detail->>'method' = 'document'`))[0].n;
    assert.equal(await looked(), 0);
    const opened = await call('um', null, { action: 'staff.ageCheckOpen', checkId: item.id });
    assert.deepEqual([opened.selfie, opened.photo, !!opened.document?.src], [null, null, true]);
    assert.equal(await looked(), 1);
    for (const u of ['ua', 'ub', 'us']) assert.equal((await call(u, null, { action: 'staff.ageCheckOpen', checkId: item.id })).status, 403);

    // Nobody else: not the partner, the couple or a stranger — not through the queue, the media view or a profile.
    for (const u of ['ua', 'ub', 'us']) assert.equal((await call(u, null, { action: 'staff.ageCheckQueue' })).status, 403);
    assert.equal((await call('um', null, { action: 'staff.mediaView', assetId: doc })).status, 404); // only in its own queue
    const [row] = await db.query('select * from feture.media_asset where id = $1', [doc]);
    const cfg = { storage: null, delivery: tokenDelivery('s'.repeat(40), 'https://media.test') };
    for (const viewer of [b, pair, stranger]) {
      assert.equal(await mediaDto(cfg, row, { viewerProfileId: viewer, place: 'private', showExplicit: true }), null);
      assert.equal(await mediaDto(cfg, row, { viewerProfileId: viewer, place: 'chat', showExplicit: true, opened: true }), null);
    }
    assert.deepEqual((await call('ub', b, { action: 'profile.photosSet', opId: op(), assetIds: [doc] })).fields, ['assetIds']);
    assert.deepEqual((await call('ua', a, { action: 'profile.photosSet', opId: op(), assetIds: [doc] })).fields, ['assetIds']);
    for (const [u, viewer] of [['ub', b], ['ub', pair], ['us', stranger]]) {
      const seen = await call(u, viewer, { action: 'profile.get', profileId: a });
      assert.ok(!JSON.stringify(seen).includes(doc), u + ' sees the document id');
    }
    assert.ok(!JSON.stringify(await call('ua', a, { action: 'profile.mine' })).includes(doc));

    // The decision is «18+ by the birth date or not». Either way the image goes at once.
    await call('um', null, { action: 'staff.ageCheckDecide', opId: op(), checkId: s.id, approve: true });
    assert.equal((await call('ua', null, { action: 'verification.ageStatus' })).verified, true);
    const [{ state }] = await db.query('select state from feture.media_asset where id = $1', [doc]);
    assert.equal(state, 'removed'); // hidden from staff too, before the job runs
    assert.equal(await mediaDto(cfg, { ...row, state: 'removed' }, { viewerProfileId: 'x', place: 'own', showExplicit: true, staff: true }), null);
    const [{ n: selfieExpiry }] = await db.query(`select count(*)::int n from feture.outbox where topic = 'verification.expire'`);
    assert.equal(selfieExpiry, 0); // no 30-day wait for a document
    const storage = fakeStorage();
    await drain(db, verificationHandlers(db, { scan: { storage } }), { limit: 10, lockSeconds: 60 });
    assert.equal((await db.query('select 1 from feture.media_asset where id = $1', [doc])).length, 0);
    assert.ok(storage.removed.includes(row.storage_key) && storage.removed.includes(`o/${doc}`));
    const [c] = await db.query('select state, asset_id, method from feture.age_check where id = $1', [s.id]);
    assert.deepEqual([c.state, c.asset_id, c.method], ['approved', null, 'document']); // only the outcome stays
    const cols = (await db.query(`select column_name from information_schema.columns where table_schema = 'feture' and table_name = 'age_check'`)).map(r => r.column_name);
    assert.ok(!cols.some(col => /birth|number|name|dob/.test(col)), 'nothing from the document is stored: ' + cols);
  } finally { await pg.close(); }
});

test('age check by document: a rejection deletes it too; a document nobody decides, or never sends, goes by the sweep', async () => {
  const { pg, db, call, person } = await world();
  try {
    const a = await person('ua', 'Alex', { verified: false }), c = await person('uc', 'Cleo', { verified: false });
    const s = await call('ua', null, { action: 'verification.ageStart', opId: op(), method: 'document' });
    const doc = await asset(db, a, 'verification', 'needs_review');
    await call('ua', null, { action: 'verification.ageSubmit', opId: op(), checkId: s.id, assetId: doc });
    await call('um', null, { action: 'staff.ageCheckDecide', opId: op(), checkId: s.id, approve: false, reason: 'looks_underage' });
    const storage = fakeStorage();
    const handlers = verificationHandlers(db, { scan: { storage } });
    await drain(db, handlers, { limit: 10, lockSeconds: 60 });
    assert.equal((await db.query('select 1 from feture.media_asset where id = $1', [doc])).length, 0);
    assert.equal((await call('ua', null, { action: 'verification.ageStatus' })).check.reason, 'looks_underage');

    // Submitted, never decided: after 7 days the check expires and the image is deleted.
    const s2 = await call('ua', null, { action: 'verification.ageStart', opId: op(), method: 'document' });
    const doc2 = await asset(db, a, 'verification', 'needs_review');
    await call('ua', null, { action: 'verification.ageSubmit', opId: op(), checkId: s2.id, assetId: doc2 });
    await db.query(`update feture.age_check set submitted_at = now() - interval '8 days' where id = $1`, [s2.id]);
    // Uploaded during a document check but never sent: deleted (not only hidden) after six hours.
    const s3 = await call('uc', null, { action: 'verification.ageStart', opId: op(), method: 'document' });
    const loose = await asset(db, c, 'verification', 'needs_review');
    await db.query(`update feture.age_check set created_at = now() - interval '7 hours' where id = $1`, [s3.id]);
    await db.query(`update feture.media_asset set created_at = now() - interval '6 hours 50 minutes' where id = $1`, [loose]);
    await sweepSelfies(db);
    assert.equal((await call('ua', null, { action: 'verification.ageStatus' })).check.state, 'expired');
    for (const id of [doc2, loose]) assert.equal((await db.query('select state from feture.media_asset where id = $1', [id]))[0].state, 'removed');
    // Without storage the job fails and is retried; it never drops the row while the file may still be there.
    await assert.rejects(verificationHandlers(db)['verification.dropDocument']({ payload: { assetId: doc2 } }), /media_unavailable/);
    assert.equal((await db.query('select 1 from feture.media_asset where id = $1', [doc2])).length, 1);
    await drain(db, handlers, { limit: 10, lockSeconds: 60 });
    assert.equal((await db.query('select 1 from feture.media_asset where id = any($1::uuid[])', [[doc2, loose]])).length, 0);
  } finally { await pg.close(); }
});

test('age check: the method can switch before sending; the selfie flow stays as it was; ten starts a day across methods', async () => {
  const { pg, db, call, person } = await world();
  try {
    const a = await person('ua', 'Alex', { verified: false });
    await db.query('update feture.profile set avatar_asset_id = $1 where id = $2', [await asset(db, a, 'avatar'), a]);
    const d = await call('ua', null, { action: 'verification.ageStart', opId: op(), method: 'document' });
    const s = await call('ua', null, { action: 'verification.ageStart', opId: op() }); // old clients send no method: selfie
    assert.deepEqual([s.id, s.method, !!s.gesture], [d.id, 'selfie', true]);
    const selfie = await asset(db, a, 'verification', 'needs_review');
    await call('ua', null, { action: 'verification.ageSubmit', opId: op(), checkId: s.id, assetId: selfie });
    // Sent: the method no longer changes.
    assert.equal((await call('ua', null, { action: 'verification.ageStart', opId: op(), method: 'document' })).method, 'selfie');
    const [item] = (await call('um', null, { action: 'staff.ageCheckQueue' })).items;
    assert.deepEqual([item.method, item.gesture], ['selfie', s.gesture]);
    const look = await call('um', null, { action: 'staff.ageCheckOpen', checkId: item.id });
    assert.deepEqual([!!look.selfie, !!look.photo, look.document], [true, true, null]);
    await call('um', null, { action: 'staff.ageCheckDecide', opId: op(), checkId: s.id, approve: true });
    assert.equal((await db.query('select state from feture.media_asset where id = $1', [selfie]))[0].state, 'needs_review'); // kept 30 days
    assert.equal((await db.query(`select count(*)::int n from feture.outbox where topic = 'verification.dropDocument'`))[0].n, 0);
    // The daily limit counts every start, whatever the method: 3 above + 7 here, then refused.
    for (let i = 0; i < 6; i++) assert.equal((await call('ua', null, { action: 'verification.ageStart', opId: op(), method: 'document' })).status, 200);
    assert.equal((await call('ua', null, { action: 'verification.ageStart', opId: op(), method: 'document' })).status, 200);
    assert.equal((await call('ua', null, { action: 'verification.ageStart', opId: op(), method: 'document' })).status, 429);
  } finally { await pg.close(); }
});

// Wave 8: the provider-agnostic payment road. Without a provider nothing is written; with one (a fake standing in
// for a real provider) a purchase grants Premium once, restore applies known purchases, renewal goes through the
// provider, and a gift reaches the recipient (after their current period) with or without the giver's name.
test('payments: unavailable without a provider; purchase, restore, renewal and gifts through one', async () => {
  const plain = await baseSetup({ commands: { ...platform, ...me, ...premium } });
  try {
    const a = await plain.person('ua', 'Alex');
    await plain.person('ub', 'Kira');
    const st = await plain.call('ua', a, { action: 'premium.status' });
    assert.equal(st.payments, false);
    assert.deepEqual(st.plans, { month: 30, year: 365 });
    assert.equal((await plain.call('ua', null, { action: 'premium.purchase', opId: op(), plan: 'year' })).error, 'payments_unavailable');
    assert.equal((await plain.call('ua', null, { action: 'premium.gift', opId: op(), handle: 'Kira', plan: 'm1' })).error, 'payments_unavailable');
    assert.equal((await plain.db.query('select count(*)::int n from feture.purchase'))[0].n, 0, 'nothing written without a provider');
    const r = await plain.call('ua', null, { action: 'premium.restore', opId: op() });
    assert.equal(r.restored, 0);
    assert.equal(r.providers, 0);
    assert.equal((await plain.call('ua', null, { action: 'premium.setRenewal', opId: op(), autoRenew: false })).status, 404);
    // The gift form still finds the recipient (exact nick), refuses oneself and unknown nicks.
    const found = await plain.call('ua', null, { action: 'premium.giftCheck', handle: 'kira' });
    assert.equal(found.recipient?.handle, 'Kira', JSON.stringify(found));
    assert.equal(found.queued, false);
    assert.equal((await plain.call('ua', null, { action: 'premium.giftCheck', handle: 'Alex' })).rule, 'gift_self');
    assert.equal((await plain.call('ua', null, { action: 'premium.giftCheck', handle: 'Kir' })).status, 404);
  } finally { await plain.pg.close(); }

  const calls = [];
  let pay = 'instant';
  const known = [];
  const fake = {
    id: 'fakepay', store: 'web',
    async checkout({ purchase }) { calls.push(['checkout', purchase.kind, purchase.plan, purchase.days]); return pay === 'instant' ? { paid: { storeRef: 'tx-' + purchase.id } } : { url: 'https://pay.example/checkout/' + purchase.id }; },
    async restore() { calls.push(['restore']); return known; },
    async setRenewal({ autoRenew }) { calls.push(['renewal', autoRenew]); },
  };
  const env = await baseSetup({ commands: { ...platform, ...me, ...premium }, billing: { providers: [fake] } });
  const { db, call, person } = env;
  try {
    const a = await person('ua', 'Alex');
    const b = await person('ub', 'Kira');
    const c = await person('uc', 'Cleo');
    assert.equal((await call('ua', a, { action: 'premium.status' })).payments, true);
    const bought = await call('ua', null, { action: 'premium.purchase', opId: op(), plan: 'month' });
    assert.equal(bought.state, 'paid', JSON.stringify(bought));
    const st = await call('ua', a, { action: 'premium.status' });
    assert.equal(st.premium, true);
    assert.equal(st.source, 'purchase');
    assert.deepEqual([st.subscription.plan, st.subscription.autoRenew], ['month', true]);

    // Renewal off and back on goes through the provider.
    assert.equal((await call('ua', null, { action: 'premium.setRenewal', opId: op(), autoRenew: false })).autoRenew, false);
    assert.equal((await call('ua', a, { action: 'premium.status' })).subscription.autoRenew, false);
    assert.equal((await call('ua', null, { action: 'premium.setRenewal', opId: op(), autoRenew: true })).autoRenew, true);
    assert.deepEqual(calls.filter(c => c[0] === 'renewal'), [['renewal', false], ['renewal', true]]);

    // A pending checkout (pay on the provider's page) grants nothing until confirmed.
    pay = 'redirect';
    const pending = await call('ub', null, { action: 'premium.purchase', opId: op(), plan: 'year' });
    assert.equal(pending.state, 'pending');
    assert.match(pending.url, /^https:\/\/pay\.example\//);
    assert.equal((await call('ub', b, { action: 'premium.status' })).premium, false);

    // Restore: a purchase the provider knows is applied once, not twice.
    known.push({ storeRef: 'store-xyz', plan: 'year' });
    assert.equal((await call('ub', null, { action: 'premium.restore', opId: op() })).restored, 1);
    assert.equal((await call('ub', null, { action: 'premium.restore', opId: op() })).restored, 0);
    assert.equal((await call('ub', b, { action: 'premium.status' })).premium, true);

    // A gift to Kira (who has Premium) starts after her period; anonymous gifts do not name the giver.
    pay = 'instant';
    const check = await call('uc', null, { action: 'premium.giftCheck', handle: 'Kira' });
    assert.equal(check.queued, true);
    const [{ premium_until: before }] = await db.query('select premium_until from feture.account where person_profile_id = $1', [b]);
    const g = await call('uc', null, { action: 'premium.gift', opId: op(), handle: 'Kira', plan: 'm3', anonymous: true });
    assert.equal(g.state, 'paid');
    const [{ premium_until: after }] = await db.query('select premium_until from feture.account where person_profile_id = $1', [b]);
    assert.ok(Math.abs(new Date(after).getTime() - new Date(before).getTime() - 90 * 86400000) < 5000, 'queued after the current period');
    const [item] = await db.query(`select payload from feture.outbox where topic = 'premium.gifted' order by created_at desc limit 1`);
    assert.equal(item.payload.from, undefined, 'anonymous');
    await call('ua', null, { action: 'premium.gift', opId: op(), handle: 'Cleo', plan: 'm1' });
    const [named] = await db.query(`select payload from feture.outbox where topic = 'premium.gifted' order by created_at desc limit 1`);
    assert.equal(named.payload.from, a);
    const sent = (await call('uc', c, { action: 'premium.status' })).giftsSent;
    assert.equal(sent[0].handle, 'Kira');
    assert.equal(sent[0].days, 90);

    // Someone who blocked the giver cannot be found by them.
    const [{ id: kiraAcc }] = await db.query('select id from feture.account where person_profile_id = $1', [b]);
    await db.query(`insert into feture.block (blocker_profile_id, blocked_profile_id, acted_by) values ($1, $2, $3)`, [b, a, kiraAcc]);
    assert.equal((await call('ua', null, { action: 'premium.giftCheck', handle: 'Kira' })).status, 404);
  } finally { await env.pg.close(); }
});

test('Premium: a revoked grant in a stack pulls the next one forward; the person is told «disabled» only when Premium really ends', async () => {
  const { pg, db, call, person } = await world();
  try {
    const a = await person('ua', 'Alex');
    const first = await call('uo', null, { action: 'staff.premiumGrant', opId: op(), handle: 'Alex', days: 30, reason: 'первая выдача' });
    const second = await call('uo', null, { action: 'staff.premiumGrant', opId: op(), handle: 'Alex', days: 30, reason: 'вторая выдача' });
    const until = async () => new Date((await db.query('select premium_until from feture.account where person_profile_id = $1', [a]))[0].premium_until).getTime();
    const DAY = 86400000;
    assert.ok(Math.abs(await until() - (Date.now() + 60 * DAY)) < 60000, 'two grants stack to 60 days');
    // Revoking the one that runs now: the second moves forward and starts now, so 30 days are left, not 60.
    const r1 = await call('uo', null, { action: 'staff.premiumRevoke', opId: op(), entitlementId: first.id, reason: 'ошибочная выдача' });
    assert.equal(r1.premium, true);
    assert.ok(Math.abs(await until() - (Date.now() + 30 * DAY)) < 60000, 'what is left is the second grant, starting now');
    assert.equal((await call('ua', a, { action: 'premium.status' })).premium, true);
    assert.equal((await db.query(`select count(*)::int n from feture.outbox where topic = 'premium.revoked'`))[0].n, 0, 'Premium goes on, nobody is told it is off');
    const r2 = await call('uo', null, { action: 'staff.premiumRevoke', opId: op(), entitlementId: second.id, reason: 'конец' });
    assert.equal(r2.premium, false);
    assert.equal((await call('ua', a, { action: 'premium.status' })).premium, false);
    assert.equal((await db.query(`select count(*)::int n from feture.outbox where topic = 'premium.revoked'`))[0].n, 1, 'told once, when it really ended');
    // A grant that is already over does not come back.
    assert.equal((await call('uo', null, { action: 'staff.premiumRevoke', opId: op(), entitlementId: second.id, reason: 'ещё раз' })).status, 404);
  } finally { await pg.close(); }
});

test('Premium: staff grant and a gift to a couple’s nickname reach both partners; a partner who already has Premium gets it queued', async () => {
  const calls = [];
  const fake = { id: 'fakepay', store: 'web', async checkout({ purchase }) { calls.push(purchase.kind); return { paid: { storeRef: 'tx-' + purchase.id } }; } };
  const env = await baseSetup({ commands: { ...platform, ...me, ...staff, ...premium }, billing: { providers: [fake] } });
  const { db, call, person, coupleOf } = env;
  try {
    const boss = await person('uo', 'Boss');
    await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), g = await person('ug', 'Giver');
    const pair = await coupleOf([a, b]);
    await db.query(`update feture.profile set handle = 'alexkira' where id = $1`, [pair]);
    const untilOf = async p => (await db.query('select premium_until from feture.account where person_profile_id = $1', [p]))[0].premium_until;
    const DAY = 86400000;
    // Kira already has 30 days from staff.
    await call('uo', null, { action: 'staff.premiumGrant', opId: op(), handle: 'Kira', days: 30, reason: 'Кире' });
    const check = await call('ug', null, { action: 'premium.giftCheck', handle: 'alexkira' });
    assert.equal(check.kind, 'couple', JSON.stringify(check));
    assert.equal(check.queued, true, 'one partner has Premium');
    const gift = await call('ug', null, { action: 'premium.gift', opId: op(), handle: 'alexkira', plan: 'm1' });
    assert.equal(gift.state, 'paid', JSON.stringify(gift));
    assert.ok(Math.abs(new Date(await untilOf(a)).getTime() - (Date.now() + 30 * DAY)) < 60000, 'Alex: 30 days from now');
    assert.ok(Math.abs(new Date(await untilOf(b)).getTime() - (Date.now() + 60 * DAY)) < 60000, 'Kira: queued after her own 30');
    assert.equal((await db.query(`select count(*)::int n from feture.outbox where topic = 'premium.gifted'`))[0].n, 2, 'both partners are told');
    const sent = (await call('ug', g, { action: 'premium.status' })).giftsSent;
    assert.equal(sent[0].handle, 'alexkira');
    // A member of the couple cannot gift their own pair.
    assert.equal((await call('ua', null, { action: 'premium.giftCheck', handle: 'alexkira' })).rule, 'gift_self');
    // Staff grant by the couple's nickname: both get it, one journal line each.
    const granted = await call('uo', null, { action: 'staff.premiumGrant', opId: op(), handle: 'alexkira', days: 7, reason: 'паре' });
    assert.equal(granted.accounts, 2);
    assert.equal((await db.query(`select count(*)::int n from feture.staff_action where action = 'premium.grant'`))[0].n, 3);
    assert.equal((await call('uo', null, { action: 'staff.premiumGrant', opId: op(), handle: 'nobody1', days: 7, reason: 'нет' })).status, 404);
  } finally { await env.pg.close(); }
});

test('Premium notices: a week and a day ahead, over, once each; the partner is told; a couple’s own nickname does not double up', async () => {
  const { pg, db, call, person, coupleOf } = await world();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
    const pair = await coupleOf([a, b]);
    await db.query(`update feture.profile set handle = 'alexkira' where id = $1`, [pair]);
    const topics = async t => (await db.query(`select payload from feture.outbox where topic = $1 order by created_at`, [t])).map(r => r.payload);
    // A grant to one partner tells the other that Premium works for the couple; a grant to the couple's nick does not.
    await call('uo', null, { action: 'staff.premiumGrant', opId: op(), handle: 'Alex', days: 30, reason: 'Алексу' });
    let told = await topics('premium.pair');
    assert.equal(told.length, 1);
    assert.equal(told[0].kind, 'started');
    await call('uo', null, { action: 'staff.premiumGrant', opId: op(), handle: 'alexkira', days: 5, reason: 'паре' });
    assert.equal((await topics('premium.pair')).length, 1, 'nothing extra for a grant to both');

    const sweep = () => sweepPremium(db);
    const setUntil = async (profile, sql) => db.query(`update feture.account set premium_until = ${sql} where person_profile_id = $1`, [profile]);
    await setUntil(b, 'null'); // only Alex is in the clock's sight below
    // Alex: 5 days left → the «week» notice, once; then under a day → «day», once.
    await setUntil(a, `now() + interval '5 days'`);
    assert.equal(await sweep(), 1);
    assert.equal(await sweep(), 0, 'once');
    await setUntil(a, `now() + interval '10 hours'`);
    assert.equal(await sweep(), 1);
    assert.deepEqual((await topics('premium.ending')).map(p => p.kind), ['week', 'day']);
    // Over: «ended» once, and Kira (who has none) is told the couple lost it.
    await setUntil(a, `now() - interval '1 hour'`);
    assert.equal(await sweep(), 1);
    assert.equal(await sweep(), 0);
    assert.equal((await topics('premium.ended')).length, 1);
    const ended = (await topics('premium.pair')).filter(p => p.kind === 'ended');
    assert.equal(ended.length, 1);
    // They become real rows with their own words.
    await drain(db, notifyHandlers(db), { limit: 100, lockSeconds: 60 });
    const rows = await db.query(`select type, data from feture.notification where type in ('premiumEnding', 'premiumEnded', 'premiumPair') order by created_at`);
    assert.deepEqual([...new Set(rows.map(r => r.type))].sort(), ['premiumEnded', 'premiumEnding', 'premiumPair']);
  } finally { await pg.close(); }
});

test('payments: the provider’s webhook grants once, closes a failed one, takes a refund back (a gift to a couple made two), and prices come from the cabinet', async () => {
  let pending = 0;
  const fake = {
    id: 'fakepay', store: 'web', recurring: false,
    async checkout({ purchase }) { calls.push([purchase.amountCents, purchase.currency, purchase.invId > 0]); return { url: 'https://pay.example/' + purchase.id + '?back=' + encodeURIComponent(purchase.id) }; },
    async webhook({ rawBody }) {
      const e = JSON.parse(rawBody);
      if (e.sig !== 'ok') throw new Error('bad_signature');
      return { events: e.events, reply: { status: 200, body: 'OK' + ++pending } };
    },
  };
  const calls = [];
  const env = await baseSetup({ commands: { ...platform, ...me, ...staff, ...premium }, billing: { providers: [fake] } });
  const { db, call, person, coupleOf } = env;
  const cfg = { billing: { providers: [fake] } };
  const hook = (events, sig = 'ok', provider = 'fakepay') => takePayEvents(db, cfg, provider, { headers: {}, rawBody: JSON.stringify({ sig, events }), query: new URLSearchParams() });
  try {
    const boss = await person('uo', 'Boss');
    await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), g = await person('ug', 'Giver');
    const pair = await coupleOf([a, b]);
    await db.query(`update feture.profile set handle = 'alexkira' where id = $1`, [pair]);

    // Prices: the defaults until the cabinet sets one; a purchase keeps the price it was made at.
    assert.equal((await call('ua', a, { action: 'premium.status' })).prices.month, 1199);
    assert.equal((await call('ua', null, { action: 'staff.premiumPrices' })).status, 403);
    await call('uo', null, { action: 'staff.premiumPricesSet', opId: op(), prices: { month: 699, year: 4900 } });
    const st = await call('ua', a, { action: 'premium.status' });
    assert.deepEqual([st.prices.month, st.prices.year, st.prices.m1], [699, 4900, 1199]);
    const buy = await call('ua', null, { action: 'premium.purchase', opId: op(), plan: 'month' });
    assert.equal(buy.state, 'pending');
    assert.deepEqual(calls[0], [699, 'EUR', true]);
    await call('uo', null, { action: 'staff.premiumPricesSet', opId: op(), prices: { month: 799 } });
    assert.equal((await db.query('select amount_cents from feture.purchase where id = $1', [buy.purchaseId]))[0].amount_cents, 699, 'kept');
    assert.equal((await call('ua', null, { action: 'premium.purchaseStatus', purchaseId: buy.purchaseId })).state, 'pending');

    // The webhook: a wrong signature and an unknown provider are refused; a right one grants once.
    assert.equal((await hook([], 'no')).status, 400);
    assert.equal((await hook([], 'ok', 'other')).status, 404);
    const ev = [{ type: 'paid', purchaseId: buy.purchaseId, storeRef: 'pay-1' }];
    assert.equal((await hook(ev)).status, 200);
    assert.equal((await call('ua', a, { action: 'premium.status' })).premium, true);
    const until1 = (await db.query('select premium_until from feture.account where person_profile_id = $1', [a]))[0].premium_until;
    await hook(ev);
    assert.equal(new Date((await db.query('select premium_until from feture.account where person_profile_id = $1', [a]))[0].premium_until).getTime(), new Date(until1).getTime(), 'the same call twice changes nothing');
    assert.equal((await call('ua', null, { action: 'premium.purchaseStatus', purchaseId: buy.purchaseId })).state, 'paid');
    assert.equal((await db.query('select count(*)::int n from feture.subscription'))[0].n, 0, 'one paid term: no subscription');
    assert.equal((await db.query(`select count(*)::int n from feture.outbox where topic = 'premium.receipt'`))[0].n, 1);

    // A failed checkout is closed; an old unfinished one is closed by the sweep.
    const second = await call('ua', null, { action: 'premium.purchase', opId: op(), plan: 'year' });
    await hook([{ type: 'failed', purchaseId: second.purchaseId }]);
    assert.equal((await call('ua', null, { action: 'premium.purchaseStatus', purchaseId: second.purchaseId })).state, 'failed');
    const old = await call('ua', null, { action: 'premium.purchase', opId: op(), plan: 'year' });
    await db.query(`update feture.purchase set created_at = now() - interval '3 days' where id = $1`, [old.purchaseId]);
    await sweepPremium(db);
    assert.equal((await call('ua', null, { action: 'premium.purchaseStatus', purchaseId: old.purchaseId })).state, 'canceled');

    // A gift to a couple costs twice, makes two periods; its refund takes both back and tells the payer.
    const gift = await call('ug', null, { action: 'premium.gift', opId: op(), handle: 'alexkira', plan: 'm1' });
    assert.deepEqual(calls.at(-1).slice(0, 2), [2398, 'EUR'], 'x2 for a couple');
    await hook([{ type: 'paid', purchaseId: gift.purchaseId, storeRef: 'pay-2' }]);
    assert.equal((await db.query('select count(*)::int n from feture.entitlement where purchase_id = $1', [gift.purchaseId]))[0].n, 2);
    assert.equal((await call('ub', b, { action: 'premium.status' })).premium, true);
    await hook([{ type: 'refunded', storeRef: 'pay-2' }]);
    assert.equal((await db.query('select count(*)::int n from feture.entitlement where purchase_id = $1 and revoked_at is null', [gift.purchaseId]))[0].n, 0);
    assert.equal((await call('ub', b, { action: 'premium.status' })).premium, false, 'Kira had nothing else');
    assert.equal((await call('ua', a, { action: 'premium.status' })).premium, true, 'Alex still has his own purchase');
    assert.equal((await db.query(`select count(*)::int n from feture.outbox where topic = 'premium.refunded'`))[0].n, 1);
    assert.equal((await db.query(`select state from feture.purchase where id = $1`, [gift.purchaseId]))[0].state, 'refunded');
  } finally { await env.pg.close(); }
});

test('payments: renewals of a recurring subscription, a failed renewal, an ended one; deletion stops the subscription first', async () => {
  const cancelled = [];
  const rec = { id: 'recur', store: 'web', recurring: true,
    async checkout() { return { paid: { storeRef: 'sub-1' } }; },
    async cancel({ subscription }) { cancelled.push(subscription.storeRef); },
    async webhook({ rawBody }) { return { events: JSON.parse(rawBody) }; } };
  const env = await baseSetup({ commands: { ...platform, ...me, ...premium }, billing: { providers: [rec] } });
  const { db, call, person } = env;
  const cfg = { billing: { providers: [rec] } };
  const hook = events => takePayEvents(db, cfg, 'recur', { headers: {}, rawBody: JSON.stringify(events), query: new URLSearchParams() });
  try {
    const a = await person('ua', 'Alex');
    await call('ua', null, { action: 'premium.purchase', opId: op(), plan: 'month' });
    const until = async () => new Date((await db.query('select premium_until from feture.account where person_profile_id = $1', [a]))[0].premium_until).getTime();
    const u1 = await until();
    await hook([{ type: 'renewed', subscriptionRef: 'sub-1', paymentRef: 'pay-r1' }]);
    await hook([{ type: 'renewed', subscriptionRef: 'sub-1', paymentRef: 'pay-r1' }]);
    assert.ok(Math.abs(await until() - (u1 + 30 * 86400000)) < 60000, 'one more month, once');
    await hook([{ type: 'renewalFailed', subscriptionRef: 'sub-1' }]);
    assert.equal((await db.query(`select count(*)::int n from feture.outbox where topic = 'premium.renewalFailed'`))[0].n, 1);
    await hook([{ type: 'subscriptionEnded', subscriptionRef: 'sub-1', state: 'canceled' }]);
    assert.equal((await db.query('select state from feture.subscription'))[0].state, 'canceled');
    // Deletion ends an active subscription at the provider first (and nothing is left charging).
    await db.query(`update feture.subscription set state = 'active'`);
    const [{ id: accountId }] = await db.query('select id from feture.account where person_profile_id = $1', [a]);
    const { cancelSubscriptions } = await import('../server/commands/premium.mjs');
    await db.tx(q => cancelSubscriptions(q, cfg, accountId));
    assert.deepEqual(cancelled, ['sub-1']);
    assert.equal((await db.query('select state from feture.subscription'))[0].state, 'canceled');
  } finally { await env.pg.close(); }
});

test('Premium by hand: support gives and reads it, lists every period, and a paid one is revoked only on purpose', async () => {
  const fake = { id: 'fakepay', store: 'web', async checkout({ purchase }) { return { paid: { storeRef: 'tx-' + purchase.id } }; } };
  const env = await baseSetup({ commands: { ...platform, ...me, ...staff, ...premium }, billing: { providers: [fake] } });
  const { db, call, person } = env;
  try {
    const boss = await person('uo', 'Boss'), sup = await person('us', 'Sven'), mod = await person('um', 'Mira');
    await person('ua', 'Alex');
    await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
    await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Sven', role: 'support', grant: true });
    await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Mira', role: 'moderator', grant: true });
    assert.equal((await call('um', null, { action: 'staff.premiumList', handle: 'Alex' })).status, 403, 'a moderator does not');
    const g = await call('us', null, { action: 'staff.premiumGrant', opId: op(), handle: 'Alex', days: 10, reason: 'поддержка' });
    assert.ok(g.id);
    await call('uo', null, { action: 'premium.purchase', opId: op(), plan: 'month' }); // the owner buys one for themselves
    const list = await call('us', null, { action: 'staff.premiumList', handle: 'Alex' });
    assert.equal(list.accounts[0].items.length, 1);
    assert.equal(list.accounts[0].items[0].source, 'staff');
    // Support never gives itself Premium.
    assert.equal((await call('us', null, { action: 'staff.premiumGrant', opId: op(), handle: 'Sven', days: 5, reason: 'себе' })).status, 403);
    // A paid or gifted period needs the confirmation.
    await db.query(`insert into feture.entitlement (account_id, source, starts_at, ends_at, store, store_ref) select id, 'purchase', now(), now() + interval '30 days', 'web', 'x-1' from feture.account where person_profile_id = $1`, [await db.query(`select id from feture.profile where lower(handle) = 'alex'`).then(r => r[0].id)]);
    const paid = (await call('us', null, { action: 'staff.premiumList', handle: 'Alex' })).accounts[0].items.find(i => i.source === 'purchase');
    assert.equal((await call('us', null, { action: 'staff.premiumRevoke', opId: op(), entitlementId: paid.id, reason: 'ошибка' })).rule, 'paid_confirm');
    assert.equal((await call('us', null, { action: 'staff.premiumRevoke', opId: op(), entitlementId: paid.id, reason: 'ошибка', confirmPaid: true })).revoked, true);
  } finally { await env.pg.close(); }
});

test('Robokassa: the pay link and the Result URL notification are signed as the shop’s docs say', async () => {
  assert.equal(robokassa({}), null, 'no keys, no provider');
  const p = robokassa({ ROBOKASSA_LOGIN: 'shop', ROBOKASSA_PASSWORD1: 'p1', ROBOKASSA_PASSWORD2: 'p2', ROBOKASSA_RATE_EUR_RUB: '100', ROBOKASSA_TEST: '1' });
  const md5 = s => createHash('md5').update(s).digest('hex');
  const out = await p.checkout({ purchase: { id: 'abc', invId: 7, kind: 'subscription', plan: 'month', days: 30, amountCents: 1199, currency: 'EUR' }, returnUrl: 'https://x' });
  const u = new URL(out.url);
  assert.equal(u.searchParams.get('OutSum'), '1199.00');
  assert.equal(u.searchParams.get('SignatureValue'), md5('shop:1199.00:7:p1:Shp_p=abc'));
  assert.equal(u.searchParams.get('IsTest'), '1');
  const body = `OutSum=1199.00&InvId=7&SignatureValue=${md5('1199.00:7:p2:Shp_p=abc').toUpperCase()}&Shp_p=abc`;
  const ok = await p.webhook({ headers: {}, rawBody: body, query: new URLSearchParams() });
  assert.deepEqual(ok.events, [{ type: 'paid', purchaseId: 'abc', storeRef: '7' }]);
  assert.equal(ok.reply.body, 'OK7');
  await assert.rejects(p.webhook({ headers: {}, rawBody: body.replace('1199.00', '1.00'), query: new URLSearchParams() }), /bad_signature/);
});

test('Premium in bulk: a count first, one period each queued after their own, journaled; a switch gives new accounts days once', async () => {
  const { pg, db, call, person } = await world();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
    await db.query(`update feture.account set created_at = now() - interval '10 days' where person_profile_id = $1`, [a]);
    await call('uo', null, { action: 'staff.premiumGrant', opId: op(), handle: 'Kira', days: 10, reason: 'у Киры уже есть' });
    assert.equal((await call('um', null, { action: 'staff.premiumGrantAllCount', audience: 'all' })).status, 403, 'a moderator does not');
    assert.equal((await call('uo', null, { action: 'staff.premiumGrantAllCount', audience: 'before', before: '2000-01-01' })).count, 0);
    assert.equal((await call('uo', null, { action: 'staff.premiumGrantAllCount', audience: 'all' })).count, 4); // Boss, Mira, Alex, Kira
    const old = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
    assert.equal((await call('uo', null, { action: 'staff.premiumGrantAllCount', audience: 'before', before: old })).count, 1);
    const until = async p => new Date((await db.query('select premium_until from feture.account where person_profile_id = $1', [p]))[0].premium_until).getTime();
    const kiraBefore = await until(b);
    const r = await call('uo', null, { action: 'staff.premiumGrantAll', opId: op(), audience: 'all', days: 7, reason: 'всем на неделю' });
    assert.equal(r.count, 4);
    assert.ok(Math.abs(await until(a) - (Date.now() + 7 * 86400000)) < 60000);
    assert.ok(Math.abs(await until(b) - (kiraBefore + 7 * 86400000)) < 60000, 'queued after her own 10 days');
    assert.equal((await db.query(`select count(*)::int n from feture.entitlement where source = 'promo'`))[0].n, 4);
    assert.equal((await db.query(`select count(*)::int n from feture.staff_action where action = 'premium.grantAll'`))[0].n, 1);
    assert.equal((await call('uo', null, { action: 'staff.premiumGrantAll', opId: op(), audience: 'before', before: '2000-01-01', days: 7, reason: 'никому' })).rule, 'nobody');

    // «Premium новым аккаунтам»: off by default, on gives each new account its days once when it finishes onboarding.
    assert.equal((await call('uo', null, { action: 'staff.premiumPromo' })).welcomeDays, null);
    assert.equal((await call('uo', null, { action: 'staff.premiumPromoSet', opId: op(), welcomeDays: 14 })).welcomeDays, 14);
    const { grantWelcome } = await import('../server/commands/premium.mjs');
    const c = await person('uc', 'Noa');
    const [{ id: accC }] = await db.query('select id from feture.account where person_profile_id = $1', [c]);
    await db.tx(q => grantWelcome(q, accC));
    await db.tx(q => grantWelcome(q, accC));
    assert.equal((await db.query(`select count(*)::int n from feture.entitlement where account_id = $1 and reason = 'welcome'`, [accC]))[0].n, 1, 'once');
    assert.ok(Math.abs(await until(c) - (Date.now() + 14 * 86400000)) < 60000);
    await call('uo', null, { action: 'staff.premiumPromoSet', opId: op(), welcomeDays: null });
    const d = await person('ud', 'Dan');
    const [{ id: accD }] = await db.query('select id from feture.account where person_profile_id = $1', [d]);
    await db.tx(q => grantWelcome(q, accD));
    assert.equal((await db.query(`select count(*)::int n from feture.entitlement where account_id = $1`, [accD]))[0].n, 0, 'off: nothing');
  } finally { await pg.close(); }
});

test('invitations and promo codes: rewarded only after onboarding and the age check, once, with a cap; a promo code has its own days, limit and dates', async () => {
  const env = await baseSetup({ commands: { ...platform, ...me, ...staff, ...premium, ...referral } });
  const { db, call, person } = env;
  try {
    const boss = await person('uo', 'Boss');
    await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
    const inviter = await person('ua', 'Alex');
    const acc = async p => (await db.query('select id from feture.account where person_profile_id = $1', [p]))[0].id;
    const until = async p => (await db.query('select premium_until from feture.account where person_profile_id = $1', [p]))[0].premium_until;
    const DAY = 86400000;
    const mine = await call('ua', inviter, { action: 'referral.mine', opId: op() });
    assert.equal(mine.enabled, false);
    assert.match(mine.code, /^[A-Z2-9]{8}$/);
    assert.equal((await call('ua', inviter, { action: 'referral.mine', opId: op() })).code, mine.code, 'the same code every time');
    // A newcomer cannot use it while the program is off; a staff switch turns it on.
    const n1 = await person('ub', 'Newbie');
    assert.equal((await call('ub', n1, { action: 'referral.apply', opId: op(), code: mine.code })).status, 404);
    assert.equal((await call('um', null, { action: 'staff.referralSettings' })).status ?? 403, 403);
    await call('uo', null, { action: 'staff.referralSettingsSet', opId: op(), enabled: true });
    assert.equal((await call('ua', inviter, { action: 'referral.apply', opId: op(), code: mine.code })).rule, 'own_code');
    const applied = await call('ub', n1, { action: 'referral.apply', opId: op(), code: mine.code.toLowerCase() });
    assert.equal(applied.state, 'pending', 'not onboarded, not age-checked yet');
    assert.equal((await call('ub', n1, { action: 'referral.apply', opId: op(), code: mine.code })).rule, 'already_invited');
    assert.equal(await until(n1), null);
    // Onboarding alone is not enough; the age check as well, and then both are rewarded, the inviter told without a name.
    const { settleReferral } = await import('../server/commands/referral.mjs');
    await db.query(`update feture.account set onboarded_at = now(), age_verified_until = null where person_profile_id = $1`, [n1]);
    const a1 = await acc(n1);
    await db.tx(q => settleReferral(q, a1));
    assert.equal(await until(n1), null, 'age check missing');
    await db.query(`update feture.account set age_verified_until = now() + interval '1 year' where id = $1`, [a1]);
    await db.tx(q => settleReferral(q, a1));
    await db.tx(q => settleReferral(q, a1));
    assert.ok(Math.abs(new Date(await until(n1)).getTime() - (Date.now() + 7 * DAY)) < 60000, 'the newcomer: 7 days');
    assert.ok(Math.abs(new Date(await until(inviter)).getTime() - (Date.now() + 7 * DAY)) < 60000, 'the inviter: 7 days, once');
    assert.equal((await db.query(`select count(*)::int n from feture.outbox where topic = 'premium.referral'`))[0].n, 1);
    const stats = await call('ua', inviter, { action: 'referral.mine', opId: op() });
    assert.deepEqual([stats.invited, stats.rewarded], [1, 1]);

    // The cap: with a cap of one in the window, a second rewarded friend gives the newcomer days but not the inviter.
    await call('uo', null, { action: 'staff.referralSettingsSet', opId: op(), capCount: 1 });
    const n2 = await person('uc', 'Cleo');
    const a2 = await acc(n2);
    await call('uc', n2, { action: 'referral.apply', opId: op(), code: mine.code });
    await db.query(`update feture.account set onboarded_at = now(), age_verified_until = now() + interval '1 year' where id = $1`, [a2]);
    const before = new Date(await until(inviter)).getTime();
    await db.tx(q => settleReferral(q, a2));
    assert.ok(await until(n2), 'the newcomer still gets theirs');
    assert.equal(new Date(await until(inviter)).getTime(), before, 'the inviter is over the cap');

    // A promo code: its own days (0 = only counted), a limit and an end date; staff only; counted in the statistics.
    assert.equal((await call('ua', inviter, { action: 'staff.promoCreate', opId: op(), code: 'BLOG1', label: 'Блогер', days: 30 })).status, 403);
    const made = await call('uo', null, { action: 'staff.promoCreate', opId: op(), code: 'blog1', label: 'Блогер Аня', days: 30, maxUses: 1 });
    assert.equal(made.code, 'BLOG1');
    assert.equal((await call('uo', null, { action: 'staff.promoCreate', opId: op(), code: 'BLOG1', label: 'ещё', days: 1 })).rule, 'code_taken');
    await call('uo', null, { action: 'staff.promoCreate', opId: op(), code: 'COUNT0', label: 'Только учёт', days: 0 });
    const n3 = await person('ud', 'Dan'), n4 = await person('ue', 'Eve');
    assert.equal((await call('ud', n3, { action: 'referral.apply', opId: op(), code: 'Blog1' })).state, 'pending');
    assert.equal((await call('ue', n4, { action: 'referral.apply', opId: op(), code: 'BLOG1' })).status, 404, 'used up');
    const a3 = await acc(n3);
    await db.query(`update feture.account set onboarded_at = now(), age_verified_until = now() + interval '1 year' where id = $1`, [a3]);
    await db.tx(q => settleReferral(q, a3));
    assert.ok(Math.abs(new Date(await until(n3)).getTime() - (Date.now() + 30 * DAY)) < 60000);
    await call('ue', n4, { action: 'referral.apply', opId: op(), code: 'COUNT0' });
    const a4 = await acc(n4);
    await db.query(`update feture.account set onboarded_at = now(), age_verified_until = now() + interval '1 year' where id = $1`, [a4]);
    await db.tx(q => settleReferral(q, a4));
    assert.equal(await until(n4), null, 'days 0: counted, nothing given');
    const list = await call('uo', null, { action: 'staff.promoList' });
    assert.deepEqual(list.items.map(i => [i.code, i.used, i.rewarded]).sort(), [['BLOG1', 1, 1], ['COUNT0', 1, 1]]);
    await call('uo', null, { action: 'staff.promoSet', opId: op(), codeId: made.id, active: false });
    const n5 = await person('uf', 'Finn');
    assert.equal((await call('uf', n5, { action: 'referral.apply', opId: op(), code: 'BLOG1' })).status, 404, 'switched off');
    // An old account cannot collect a code.
    await db.query(`update feture.account set created_at = now() - interval '30 days' where person_profile_id = $1`, [n5]);
    assert.equal((await call('uf', n5, { action: 'referral.apply', opId: op(), code: 'COUNT0' })).rule, 'not_new');
  } finally { await env.pg.close(); }
});
