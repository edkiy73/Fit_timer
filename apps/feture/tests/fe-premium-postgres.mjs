// Slice H1 on PGlite as feture_api: Premium entitlements (staff grants for dogfooding), Premium in a couple, the age check by
// selfie and by identity document (A07: who can reach the document, its deletion, the expiry sweep, the rate limit).
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { staff } from '../server/commands/staff.mjs';
import { discover } from '../server/commands/discover.mjs';
import { premium, sweepSelfies, verificationHandlers } from '../server/commands/premium.mjs';
import { photos } from '../server/commands/photos.mjs';
import { mediaDto } from '../server/media/assets.mjs';
import { tokenDelivery } from '../server/media/delivery.mjs';
import { drain } from '../server/outbox.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...staff, ...discover, ...premium, ...photos } });

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
