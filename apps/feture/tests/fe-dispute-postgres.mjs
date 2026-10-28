// «Это я на фото — против» guard (owner decision 28.10.2026) on PGlite as feture_api: who hides a post at once,
// who only reaches the staff queue, limits, strikes, the mass attack guard, the author's explanation, anonymity.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { staff } from '../server/commands/staff.mjs';
import { moderation } from '../server/commands/moderation.mjs';
import { DISPUTE_LIMITS as L } from '../contracts/posts.mjs';
import { setup as baseSetup, op, photoVerified as verified } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...posts, ...staff, ...moderation } });
const draft = (body, extra = {}) => ({ type: 'post', body, audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [], ...extra });

async function asset(db, profileId, purpose = 'post') {
  const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [profileId]);
  const [a] = await db.query(
    `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
     values ($1, $2, 'image', $3, 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [profileId, account_id, purpose]);
  return a.id;
}
async function photoPost(call, db, user, profile, body = 'Фото', extra = {}) {
  const img = await asset(db, profile);
  const d = await call(user, profile, { action: 'post.saveDraft', opId: op(), post: draft(body, { mediaIds: [img], ...extra }) });
  assert.equal(d.status, 200, JSON.stringify(d));
  await call(user, profile, { action: 'post.publish', opId: op(), postId: d.id });
  return d.id;
}
const object = (call, user, profile, postId) => call(user, profile, { action: 'tag.object', opId: op(), postId });
const queue = async call => (await call('uo', null, { action: 'staff.disputeQueue' }));
const staffSetup = async (db, person) => {
  const boss = await person('uo', 'Boss');
  await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
  return boss;
};

test('tagged instant, untrusted queue only, trusted instant; author explanation; claimant never named', async () => {
  const { pg, db, call, person } = await setup();
  try {
    await staffSetup(db, person);
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa'), v = await person('uv', 'Vera'), n = await person('un', 'Nina'), w = await person('uw', 'Watcher');
    await verified(db, v, 40);   // trusted
    await verified(db, n, 2);    // verified but new

    // 1. Marked on the photo → hidden at once (the declined mark), staff see it as «tagged».
    const tagged = await photoPost(call, db, 'ua', a, 'Мы на фото', { tags: [b] });
    await call('ub', b, { action: 'tag.answer', opId: op(), postId: tagged, answer: 'ok' });
    assert.equal((await call('uw', w, { action: 'post.get', postId: tagged })).status, 200);
    assert.equal((await object(call, 'ub', b, tagged)).hidden, true);
    assert.equal((await call('uw', w, { action: 'post.get', postId: tagged })).status, 404);

    // 2. Not marked, not trusted → the post stays visible, the claim goes to the top of the queue as urgent.
    const p2 = await photoPost(call, db, 'ua', a, 'Пляж');
    const r2 = await object(call, 'uc', c, p2);
    assert.deepEqual([r2.hidden, r2.queued], [false, true]);
    assert.equal((await call('uw', w, { action: 'post.get', postId: p2 })).status, 200);
    assert.equal((await call('ua', a, { action: 'post.get', postId: p2 })).post.dispute, undefined); // the author is not told
    // A repeated claim is the same claim.
    assert.equal((await object(call, 'uc', c, p2)).hidden, false);
    // Verified but new (< 7 days) → also queue only.
    const pn = await photoPost(call, db, 'ua', a, 'Горы');
    assert.equal((await object(call, 'un', n, pn)).hidden, false);

    // 3. Trusted → hidden at once; the author sees why, never who.
    const p3 = await photoPost(call, db, 'ua', a, 'Озеро');
    assert.equal((await object(call, 'uv', v, p3)).hidden, true);
    assert.equal((await call('uw', w, { action: 'post.get', postId: p3 })).status, 404);
    const own = (await call('ua', a, { action: 'post.get', postId: p3 })).post;
    assert.deepEqual(own.dispute, { note: null });

    const q1 = await queue(call);
    assert.deepEqual(q1.items.map(i => i.id), [p2, pn, tagged, p3]); // urgent (still visible) first, then by age
    const byId = Object.fromEntries(q1.items.map(i => [i.id, i]));
    assert.deepEqual([byId[p2].urgent, byId[p2].hidden, byId[p2].tagged, byId[p2].claims[0].trust, byId[p2].claims[0].strikes], [true, false, false, 'unverified', 0]);
    assert.equal(byId[pn].claims[0].trust, 'new');
    assert.deepEqual([byId[tagged].urgent, byId[tagged].tagged], [false, true]);
    assert.deepEqual([byId[p3].urgent, byId[p3].hidden, byId[p3].claims[0].trust], [false, true, 'trusted']);

    // 6. The author's explanation: only on their own post while it is hidden; staff see it.
    const ne = await call('ua', a, { action: 'post.disputeExplain', opId: op(), postId: p2, note: 'Это я сам' }); assert.equal(ne.rule, 'not_disputed', JSON.stringify(ne));
    assert.equal((await call('uw', w, { action: 'post.disputeExplain', opId: op(), postId: p3, note: 'чужое' })).status, 404);
    assert.equal((await call('ua', a, { action: 'post.disputeExplain', opId: op(), postId: p3, note: 'На фото моя сестра, она согласна' })).note, 'На фото моя сестра, она согласна');
    assert.equal((await call('ua', a, { action: 'post.get', postId: p3 })).post.dispute.note, 'На фото моя сестра, она согласна');
    assert.equal((await queue(call)).items.find(i => i.id === p3).note, 'На фото моя сестра, она согласна');

    // Anonymity: nothing the author or staff get names a claimant; the author is told only about the hidden posts.
    const seen = JSON.stringify([await call('ua', a, { action: 'post.get', postId: p3 }), await call('ua', a, { action: 'feed.list', tab: 'forYou' }), await queue(call)]);
    // (Kira is named on her own photo mark by the author's choice; the untagged claimants never are.)
    for (const x of [c, v, n]) assert.ok(!seen.includes(x), 'claimant named');
    const told = await db.query(`select topic, payload::text payload from feture.outbox where profile_id = $1 and topic like 'post.%'`, [a]);
    assert.equal(told.filter(t => t.topic === 'post.disputed').length, 2); // the tagged post and p3; not the ones still visible
    assert.ok(told.every(t => ![b, c, v, n].some(x => t.payload.includes(x))));

    // «Подтвердилось» removes the post and tells the claimant; «не подтвердилось» restores and tells the author.
    assert.equal((await call('uo', null, { action: 'staff.disputeDecide', opId: op(), postId: p3, restore: false })).state, 'removed');
    assert.ok((await db.query(`select 1 from feture.outbox where topic = 'dispute.resolved' and profile_id = $1 and payload->>'outcome' = 'removed'`, [v])).length);
    assert.equal((await db.query(`select dispute_strikes s from feture.account where person_profile_id = $1`, [v]))[0].s, 0);
  } finally { await pg.close(); }
});

test('limits per account (couple partners separately), strikes escalation, restore on «не подтвердилось»', async () => {
  const { pg, db, call, person, coupleOf } = await setup();
  try {
    await staffSetup(db, person);
    const a = await person('ua', 'Alex'), c = await person('uc', 'Noa'), d = await person('ud', 'Dana'), v = await person('uv', 'Vera'), w = await person('uw', 'Watcher');
    const pair = await coupleOf([c, d]);
    await verified(db, v, 40);
    const many = [];
    for (let i = 0; i < 12; i++) many.push(await photoPost(call, db, 'ua', a, 'Фото ' + i));

    // 3 a day…
    for (let i = 0; i < L.untaggedPerDay; i++) assert.equal((await object(call, 'uc', c, many[i])).queued, true);
    const over = await object(call, 'uc', c, many[3]);
    assert.deepEqual([over.status, over.rule], [429, 'claim_limit']);
    // …the partner acting as the couple counts on their own account; Noa acting as the couple is still Noa.
    assert.equal((await object(call, 'ud', pair, many[3])).queued, true);
    assert.equal((await object(call, 'uc', pair, many[4])).status, 429);
    // …and 10 in 30 days.
    const age = () => db.query(`update feture.photo_dispute set created_at = created_at - interval '2 days' where claimant_account = (select id from feture.account where person_profile_id = $1)`, [c]);
    await age();
    for (let i = 4; i < 7; i++) assert.equal((await object(call, 'uc', c, many[i])).queued, true);
    await age();
    for (let i = 7; i < 10; i++) assert.equal((await object(call, 'uc', c, many[i])).queued, true);
    await age();
    assert.equal((await object(call, 'uc', c, many[10])).queued, true); // the 10th in 30 days
    assert.equal((await object(call, 'uc', c, many[11])).status, 429);  // the 11th, though only 2 today

    // Strikes: a trusted claim found false restores the post at once, tells the author, strikes the claimant.
    const b = await person('ub', 'Bob');
    const s = [];
    for (let i = 0; i < 4; i++) s.push(await photoPost(call, db, 'ub', b, 'Пост ' + i));
    const strikes = async () => (await db.query(`select dispute_strikes s from feture.account where person_profile_id = $1`, [v]))[0].s;
    assert.equal((await object(call, 'uv', v, s[0])).hidden, true);
    assert.equal((await call('uw', w, { action: 'post.get', postId: s[0] })).status, 404);
    assert.equal((await call('uo', null, { action: 'staff.disputeDecide', opId: op(), postId: s[0], restore: true })).state, 'published');
    assert.equal((await call('uw', w, { action: 'post.get', postId: s[0] })).status, 200);
    assert.ok((await db.query(`select 1 from feture.outbox where topic = 'post.restored' and profile_id = $1`, [b])).length);
    assert.equal(await strikes(), 1);
    // A strike loses instant hiding: the next claim only queues.
    assert.equal((await object(call, 'uv', v, s[1])).hidden, false);
    assert.equal((await queue(call)).items.find(i => i.id === s[1]).claims[0].trust, 'struck');
    await call('uo', null, { action: 'staff.disputeDecide', opId: op(), postId: s[1], restore: true });
    assert.equal(await strikes(), 2);
    assert.equal((await object(call, 'uv', v, s[2])).hidden, false);
    assert.equal((await queue(call)).flagged.length, 0);
    await call('uo', null, { action: 'staff.disputeDecide', opId: op(), postId: s[2], restore: true });
    assert.equal(await strikes(), 3);
    // 3 strikes: no more untagged claims, staff see the account for review; nobody else sees strikes.
    assert.equal((await object(call, 'uv', v, s[3])).rule, 'claims_restricted');
    const flagged = (await queue(call)).flagged;
    assert.deepEqual(flagged.map(f => [f.profileId, f.handle, f.strikes]), [[v, 'Vera', 3]]);
    const profile = JSON.stringify(await call('uw', w, { action: 'profile.get', profileId: v }));
    assert.ok(!/strike/i.test(profile));
    assert.ok(!/strike/i.test(JSON.stringify(await call('ub', b, { action: 'post.get', postId: s[0] }))));
    assert.equal((await call('uo', null, { action: 'staff.disputeClaimantReviewed', opId: op(), profileId: v })).reviewed, true);
    assert.equal((await queue(call)).flagged.length, 0);
    // A mark on the photo is still the person's own to decline.
    const marked = await photoPost(call, db, 'ub', b, 'Вера на фото', { tags: [v] });
    assert.equal((await object(call, 'uv', v, marked)).hidden, true);
    // Strikes are not given to a marked person.
    await call('uo', null, { action: 'staff.disputeDecide', opId: op(), postId: marked, restore: true });
    assert.equal(await strikes(), 3);
  } finally { await pg.close(); }
});

test('mass attack: 3 suspicious claims on one author in 24 h suspend instant hiding and flag the queue', async () => {
  const { pg, db, call, person } = await setup();
  try {
    await staffSetup(db, person);
    const a = await person('ua', 'Alex'), v = await person('uv', 'Vera'), w = await person('uw', 'Watcher');
    await verified(db, v, 40);
    const young = [];
    for (const [u, h] of [['y1', 'Young1'], ['y2', 'Young2'], ['y3', 'Young3']]) young.push([u, await person(u, h)]);
    const ps = [];
    for (let i = 0; i < 4; i++) ps.push(await photoPost(call, db, 'ua', a, 'Пост ' + i));
    for (let i = 0; i < 3; i++) assert.equal((await object(call, young[i][0], young[i][1], ps[i])).hidden, false);
    // Even a trusted claimant cannot hide this author's post now; the claim queues as urgent.
    assert.equal((await object(call, 'uv', v, ps[3])).hidden, false);
    assert.equal((await call('uw', w, { action: 'post.get', postId: ps[3] })).status, 200);
    const items = (await queue(call)).items;
    assert.equal(items.length, 4);
    assert.ok(items.every(i => i.attack && i.urgent));
    // Another author is not affected.
    const other = await person('uz', 'Zoe');
    const op1 = await photoPost(call, db, 'uz', other, 'Другой');
    assert.equal((await object(call, 'uv', v, op1)).hidden, true);
  } finally { await pg.close(); }
});
