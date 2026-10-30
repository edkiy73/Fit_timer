// Every decision a staff member makes tells the person it concerns (audit 30.10.2026): the photo they uploaded, the
// city they proposed, their Premium, their role, a change to their community — and a static check that no new staff
// decision is added without a notification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { staff } from '../server/commands/staff.mjs';
import { moderation } from '../server/commands/moderation.mjs';
import { communities } from '../server/commands/communities.mjs';
import { premium } from '../server/commands/premium.mjs';
import { support } from '../server/commands/support.mjs';
import { staffCounts } from '../server/commands/staff-counts.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { notifyHandlers } from '../server/notify.mjs';
import { drain } from '../server/outbox.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...posts, ...staff, ...moderation, ...communities, ...premium, ...support, ...staffCounts, ...inbox } });
const base = { description: 'Встречи и разговоры о верёвке для новичков', topics: ['shibari'], rules: ['Уважать границы'], plate: 'rose' };

async function world() {
  const env = await setup();
  const { db, call, person } = env;
  const boss = await person('uo', 'Boss');
  await person('um', 'Mira');
  await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
  await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Mira', role: 'moderator', grant: true });
  const member = async (/** @type {string} */ user, /** @type {string} */ handle) => {
    const id = await person(user, handle);
    const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [id]);
    // Like every real account: an approved profile photo (a community and a post need one).
    const [a] = await db.query(
      `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
       values ($1, $2, 'image', 'avatar', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [id, account_id]);
    await db.query('update feture.profile set avatar_asset_id = $1 where id = $2', [a.id, id]);
    return { id, account: account_id };
  };
  /** A file waiting for review, owned by `m`. */
  const waiting = async (/** @type {{id: string, account: string}} */ m, /** @type {string} */ purpose, kind = 'image') => (await db.query(
    `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
     values ($1, $2, $3, $4, 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'needs_review', 'safe', now()) returning id`, [m.id, m.account, kind, purpose]))[0].id;
  const deliver = async () => { while ((await drain(db, notifyHandlers(db), { limit: 50 })) > 0) { /* until empty */ } };
  const notes = async (/** @type {string} */ user) => (await call(user, null, { action: 'notifications.list' })).items;
  /** The rows of an account, straight from the table. */
  const rowsOf = async (/** @type {string} */ account) => (await db.query(`select type, data from feture.notification where recipient_account_id = $1 and retracted_at is null`, [account]));
  return { ...env, member, waiting, deliver, notes, rowsOf };
}

test('photo decisions: approved and rejected are told; a batch is one row with a count; CSAM is never announced', async () => {
  const { pg, call, member, waiting, deliver, notes } = await world();
  try {
    const b = await member('ub', 'Kira');
    const one = await waiting(b, 'post'), two = await waiting(b, 'post'), bad = await waiting(b, 'post'), avatar = await waiting(b, 'avatar'), csam = await waiting(b, 'post');
    for (const id of [one, two]) await call('um', null, { action: 'staff.mediaDecide', opId: op(), assetId: id, decision: 'approve', explicit: false });
    await call('um', null, { action: 'staff.mediaDecide', opId: op(), assetId: bad, decision: 'reject', reason: 'violence' });
    await call('um', null, { action: 'staff.mediaDecide', opId: op(), assetId: avatar, decision: 'approve', explicit: false });
    await call('um', null, { action: 'staff.mediaDecide', opId: op(), assetId: csam, decision: 'reject', reason: 'csam_suspected' });
    await deliver();
    const rows = (await notes('ub')).filter((/** @type {any} */ n) => n.type === 'mediaDecided');
    const key = (/** @type {any} */ n) => [n.data.purpose, n.data.state, n.data.reason ?? '', n.data.count ?? 1].join('/');
    assert.deepEqual(rows.map(key).sort(), ['avatar/approved//1', 'post/approved//2', 'post/rejected/violence/1']);
    assert.equal(rows.length, 3); // nothing about the suspected CSAM file
    // Another person's decisions are theirs: the moderator got nothing, a stranger got nothing.
    assert.deepEqual((await notes('um')).filter((/** @type {any} */ n) => n.type === 'mediaDecided'), []);
  } finally { await pg.close(); }
});

test('a decided file opens what it belongs to: the post it is attached to', async () => {
  const { pg, db, call, member, waiting, deliver, notes } = await world();
  try {
    const b = await member('ub', 'Kira');
    const dr = await call('ub', b.id, { action: 'post.saveDraft', opId: op(), post: { type: 'post', body: 'С фото', audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [] } });
    const m = await waiting(b, 'post');
    await db.query(`insert into feture.media_attachment (asset_id, target_type, target_id) values ($1, 'post', $2)`, [m, dr.id]);
    await call('um', null, { action: 'staff.mediaDecide', opId: op(), assetId: m, decision: 'approve', explicit: false });
    await deliver();
    const n = (await notes('ub')).find((/** @type {any} */ x) => x.type === 'mediaDecided');
    assert.deepEqual([n?.object?.type, n?.object?.id], ['post', dr.id]);
  } finally { await pg.close(); }
});

test('a city proposal, Premium and a staff role: the person is told what was decided', async () => {
  const { pg, call, member, deliver, rowsOf } = await world();
  try {
    const alex = await member('ua', 'Alex');
    const yes = await call('ua', null, { action: 'place.submit', opId: op(), country: 'DE', name: 'Leipzig' });
    const no = await call('ua', null, { action: 'place.submit', opId: op(), country: 'DE', name: 'Qwerty' });
    await call('um', null, { action: 'staff.placeDecide', opId: op(), placeId: yes.placeId, decision: 'approve' });
    await call('um', null, { action: 'staff.placeDecide', opId: op(), placeId: no.placeId, decision: 'reject' });
    const g = await call('uo', null, { action: 'staff.premiumGrant', opId: op(), handle: 'Alex', days: 30, reason: 'проба' });
    await call('uo', null, { action: 'staff.premiumRevoke', opId: op(), entitlementId: g.id, reason: 'проба закончилась' });
    await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Alex', role: 'support', grant: true });
    await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Alex', role: 'support', grant: false });
    await deliver();
    const items = await rowsOf(alex.account);
    const by = (/** @type {string} */ type) => items.filter((/** @type {any} */ n) => n.type === type);
    assert.deepEqual(by('placeDecided').map((/** @type {any} */ n) => n.data.state).sort(), ['approved', 'rejected']);
    assert.equal(by('premiumGranted').length, 1);
    assert.equal(by('premiumGranted')[0].data.days, 30);
    assert.ok(by('premiumGranted')[0].data.until);
    assert.equal(by('premiumRevoked').length, 1);
    assert.deepEqual(by('staffRole').map((/** @type {any} */ n) => [n.data.role, n.data.grant]).sort(), [['support', false], ['support', true]]);
  } finally { await pg.close(); }
});

test('a change to a published community is told as a change, a new one as a new community', async () => {
  const { pg, call, member, deliver, notes } = await world();
  try {
    const a = await member('ua', 'Alex');
    const cr = await call('ua', a.id, { action: 'community.create', opId: op(), name: 'Клуб для теста', privacy: 'open', ...base });
    let rev = (await call('um', null, { action: 'staff.communityQueue' })).items.find((/** @type {any} */ x) => x.id === cr.id).rev;
    await call('um', null, { action: 'staff.communityDecide', opId: op(), communityId: cr.id, rev, decision: 'approve' });
    const got = await call('ua', a.id, { action: 'community.get', communityId: cr.id });
    await call('ua', a.id, { action: 'community.update', opId: op(), communityId: cr.id, rev: got.community.rev, name: 'Клуб для теста: новое имя' });
    rev = (await call('um', null, { action: 'staff.communityQueue' })).items.find((/** @type {any} */ x) => x.id === cr.id).rev;
    await call('um', null, { action: 'staff.communityDecide', opId: op(), communityId: cr.id, rev, decision: 'reject', reason: 'Не подходит' });
    await deliver();
    const items = (await notes('ua')).filter((/** @type {any} */ n) => n.type === 'communityPublished' || n.type === 'communityRejected');
    assert.deepEqual(items.map((/** @type {any} */ n) => [n.type, n.data.what ?? null]).sort(), [['communityPublished', null], ['communityRejected', 'change']]);
  } finally { await pg.close(); }
});

test('staff learn that something waits: counts per queue, an alert for the serious, none for the ordinary', async () => {
  const { pg, db, call, member, deliver, rowsOf } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira');
    const [{ id: mod }] = await db.query(`select a.id from feture.account a join feture.profile p on p.id = a.person_profile_id where p.handle = 'Mira'`);
    const [{ id: boss }] = await db.query(`select a.id from feture.account a join feture.profile p on p.id = a.person_profile_id where p.handle = 'Boss'`);
    const draft = { type: 'post', audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [] };
    const post = async (/** @type {string} */ body) => {
      const d = await call('ub', b.id, { action: 'post.saveDraft', opId: op(), post: { ...draft, body } });
      await call('ub', b.id, { action: 'post.publish', opId: op(), postId: d.id });
      return d.id;
    };
    const [p1, p2, p3] = [await post('Первая'), await post('Вторая'), await post('Третья')];
    const report = (/** @type {string} */ postId, /** @type {string} */ reason) =>
      call('ua', a.id, { action: 'report.create', opId: op(), targetType: 'post', targetId: postId, reason, details: 'Подробности для модератора' });
    await report(p1, 'spam');                       // ordinary: counted, nobody is woken
    await deliver();
    assert.deepEqual((await rowsOf(mod)).filter((/** @type {any} */ n) => n.type === 'staffAlert'), []);
    await report(p2, 'minor'); await report(p3, 'threat');
    await deliver();
    const alerts = (await rowsOf(mod)).filter((/** @type {any} */ n) => n.type === 'staffAlert');
    assert.equal(alerts.length, 2); // a minor and a threat are different alerts
    assert.deepEqual(alerts.map((/** @type {any} */ n) => [n.data.what, n.data.reason]).sort(), [['report', 'minor'], ['report', 'threat']]);
    assert.ok((await rowsOf(boss)).some((/** @type {any} */ n) => n.type === 'staffAlert'));
    assert.deepEqual((await rowsOf(a.account)).filter((/** @type {any} */ n) => n.type === 'staffAlert'), []); // never the reporter

    // A request to support: counted for support staff, an alert for them, none for the one who wrote.
    await call('ua', null, { action: 'support.create', opId: op(), topic: 'other', body: 'Не могу войти в профиль, помогите' });
    await deliver();
    assert.ok((await rowsOf(mod)).some((/** @type {any} */ n) => n.type === 'staffAlert' && n.data.what === 'support'));

    // The counts: the moderator sees what waits in the queues and in support; an ordinary person sees nothing.
    const c = await call('um', null, { action: 'staff.counts' });
    assert.equal(c.queues.report, 3);
    assert.equal(c.support, 1);
    assert.equal(c.total, Object.values(c.queues).reduce((x, y) => x + y, 0) + 1);
    const none = await call('ua', null, { action: 'staff.counts' });
    assert.deepEqual([none.status, none.total, none.support], [200, 0, 0]);
  } finally { await pg.close(); }
});

// The guard: a decision a staff member can make must tell somebody. A new handler without a notification fails here, so
// it is either given one or named below with the reason it needs none.
test('every staff decision handler enqueues a user notification (or is named as one that needs none)', () => {
  const ROOT = new URL('../server/', import.meta.url);
  const notify = readFileSync(new URL('notify.mjs', ROOT), 'utf8');
  const told = new Set([...notify.matchAll(/'([a-z]+\.[a-zA-Z]+)'/g)].map(m => m[1]));
  /** Decisions that change nothing for the person, or are answered some other way. */
  const NEEDS_NONE = {
    'staff.disputeClaimantReviewed': 'an internal flag on a claimant, nothing for them',
    'staff.noticeDecide': 'a DSA notice from outside the app: answered by mail (notice.decided)',
    'staff.maintenanceSet': 'a banner everyone sees (support.public)',
  };
  const missing = [];
  for (const f of readdirSync(new URL('commands/', ROOT)).filter(x => x.endsWith('.mjs'))) {
    const src = readFileSync(new URL('commands/' + f, ROOT), 'utf8');
    const heads = [...src.matchAll(/^  async '((?:staff|appeal)\.[a-zA-Z]+)'\(/gm)];
    heads.forEach((h, i) => {
      const name = h[1];
      if (!/(Decide|Reply|Grant|Revoke|Set|Switch|sanction|restrict|grant)$/.test(name) || name.startsWith('appeal.') || name in NEEDS_NONE) return;
      const body = src.slice(h.index, i + 1 < heads.length ? heads[i + 1].index : src.length);
      const topics = [...body.matchAll(/enqueue\(q, ([^\n]*?),\s*[a-zA-Z$.[\]?]+/g)].flatMap(m => [...m[1].matchAll(/'([a-z]+\.[a-zA-Z]+)'/g)].map(x => x[1]));
      const prefixed = [...body.matchAll(/enqueue\(q, '([a-z]+\.)' \+/g)].map(m => m[1]);
      const reached = topics.some(t => told.has(t)) || prefixed.some(p => [...told].some(t => t.startsWith(p)));
      if (!reached) missing.push(`${f}: ${name}`);
    });
  }
  assert.deepEqual(missing, [], 'staff decisions with no notification to the person');
});
