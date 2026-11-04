// Slice G2 on PGlite as feture_api: notifications from outbox events, fan-out to couples, «Нужно решить», counters, push.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { couples } from '../server/commands/couples.mjs';
import { discover } from '../server/commands/discover.mjs';
import { chats } from '../server/commands/chats.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { staff } from '../server/commands/staff.mjs';
import { moderation } from '../server/commands/moderation.mjs';
import { communities } from '../server/commands/communities.mjs';
import { notifyHandlers } from '../server/notify.mjs';
import { sweepMarkers } from '../server/jobs.mjs';
import { drain } from '../server/outbox.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...posts, ...couples, ...discover, ...chats, ...inbox, ...staff, ...moderation, ...communities } });
const draft = (body, extra = {}) => ({ type: 'post', body, audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [], ...extra });

async function world() {
  const env = await setup();
  const { db, person } = env;
  const member = async (/** @type {string} */ user, /** @type {string} */ handle) => {
    const id = await person(user, handle);
    const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [id]);
    const [a] = await db.query(
      `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
       values ($1, $2, 'image', 'avatar', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [id, account_id]);
    await db.query('update feture.profile set avatar_asset_id = $1 where id = $2', [a.id, id]);
    return id;
  };
  /** Runs the notification handlers over everything queued so far. */
  const deliver = async () => { while ((await drain(db, notifyHandlers(db), { limit: 50 })) > 0) { /* until empty */ } };
  return { ...env, member, deliver };
}

test('likes notify the target (both partners of a couple), a withdrawn like takes it back, blocks hide the actor', async () => {
  const { pg, db, call, coupleOf, member, deliver } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira'), c = await member('uc', 'Noa');
    await call('ua', a, { action: 'like.send', opId: op(), profileId: b, source: 'profile' });
    await deliver();
    let list = (await call('ub', null, { action: 'notifications.list' })).items;
    assert.deepEqual([list.length, list[0].type, list[0].actor.handle, list[0].label], [1, 'like', 'Alex', 'me']);
    assert.equal((await call('ub', null, { action: 'inbox.counts' })).likes, 1);
    await call('ua', a, { action: 'like.withdraw', opId: op(), profileId: b });
    await deliver();
    assert.deepEqual((await call('ub', null, { action: 'notifications.list' })).items, []);

    // To a couple: both partners, labelled «Паре». A partner's own action for the couple goes only to the other one.
    const pair = await coupleOf([b, c]);
    await db.query(`update feture.profile set avatar_asset_id = (select avatar_asset_id from feture.profile where id = $2) where id = $1`, [pair, b]);
    await call('ua', a, { action: 'follow.set', opId: op(), profileId: pair, on: true });
    await call('ub', pair, { action: 'follow.set', opId: op(), profileId: a, on: true });
    await deliver();
    for (const u of ['ub', 'uc']) {
      const items = (await call(u, null, { action: 'notifications.list' })).items;
      assert.ok(items.some((/** @type {any} */ n) => n.type === 'follow' && n.label === 'couple'), u);
    }
    assert.ok((await call('uc', null, { action: 'notifications.list' })).items.some((/** @type {any} */ n) => n.type === 'pair.acted'));
    assert.ok(!(await call('ub', null, { action: 'notifications.list' })).items.some((/** @type {any} */ n) => n.type === 'pair.acted'));

    // Someone blocked disappears from the inbox.
    await call('ub', pair, { action: 'block.set', opId: op(), profileId: a, on: true });
    assert.ok(!(await call('uc', null, { action: 'notifications.list' })).items.some((/** @type {any} */ n) => n.actor?.handle === 'Alex'));
  } finally { await pg.close(); }
});

test('«Нужно решить»: couple invitation, partner approval for the partner only, one number in the counters; read and push', async () => {
  const { pg, db, call, coupleOf, member, deliver } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira'), c = await member('uc', 'Noa');
    await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Noa' });
    let d = (await call('uc', null, { action: 'decide.list' })).items;
    assert.deepEqual(d.map((/** @type {any} */ x) => [x.kind, x.actor.handle]), [['pinv', 'Alex']]);

    const pair = await coupleOf([b, c]);
    await db.query('update feture.profile_member set approves_partner = true where profile_id = $1', [pair]);
    const dr = await call('ub', pair, { action: 'post.saveDraft', opId: op(), post: draft('От пары') });
    await call('ub', pair, { action: 'post.publish', opId: op(), postId: dr.id });
    d = (await call('uc', null, { action: 'decide.list' })).items;
    assert.ok(d.some((/** @type {any} */ x) => x.kind === 'joint' && x.label === 'couple'));
    assert.ok(!(await call('ub', null, { action: 'decide.list' })).items.some((/** @type {any} */ x) => x.kind === 'joint')); // not to the one who asked

    await call('ua', a, { action: 'like.send', opId: op(), profileId: c, source: 'profile' });
    await deliver();
    const counts = await call('uc', null, { action: 'inbox.counts' });
    assert.deepEqual([counts.decide, counts.notifications, counts.bell], [2, 1, 3]);
    await call('uc', null, { action: 'notifications.readAll' });
    assert.equal((await call('uc', null, { action: 'inbox.counts' })).bell, 2);

    assert.equal((await call('uc', null, { action: 'push.register', opId: op(), platform: 'ios', token: 'device-token-123' })).registered, true);
    await call('ua', null, { action: 'push.register', opId: op(), platform: 'ios', token: 'device-token-123' });
    const [{ n }] = await db.query(`select count(*)::int n from feture.push_device d join feture.account x on x.id = d.account_id where x.person_profile_id = $1`, [a]);
    assert.equal(n, 1); // the device moved to whoever signed in on it last
  } finally { await pg.close(); }
});

test('notifications.read marks one own item; push.unregister removes only one’s own device', async () => {
  const { pg, db, call, member, deliver } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira');
    await member('uc', 'Noa');
    await call('ua', a, { action: 'like.send', opId: op(), profileId: b, source: 'profile' });
    await call('ua', a, { action: 'follow.set', opId: op(), profileId: b, on: true });
    await deliver();
    const items = (await call('ub', null, { action: 'notifications.list' })).items;
    assert.equal(items.length, 2);
    assert.equal((await call('ub', null, { action: 'inbox.counts' })).notifications, 2);
    // Someone else's notification: «not found», and it stays unread for its owner.
    assert.equal((await call('uc', null, { action: 'notifications.read', id: items[0].id })).status, 404);
    assert.equal((await call('ua', null, { action: 'notifications.read', id: items[0].id })).status, 404);
    assert.equal((await call('ub', null, { action: 'notifications.read', id: '018f0000-0000-7000-8000-00000000dead' })).status, 404);
    assert.equal((await call('ub', null, { action: 'inbox.counts' })).notifications, 2);
    assert.equal((await call('ub', null, { action: 'notifications.read', id: items[0].id })).read, true);
    assert.equal((await call('ub', null, { action: 'notifications.read', id: items[0].id })).read, true); // again: still read, no error
    const after = (await call('ub', null, { action: 'notifications.list' })).items;
    assert.deepEqual(after.map((/** @type {any} */ x) => [x.id, x.read]), [[items[0].id, true], [items[1].id, false]]);
    assert.equal((await call('ub', null, { action: 'inbox.counts' })).notifications, 1);

    const devices = async (/** @type {string} */ p) => (await db.query(`select count(*)::int n from feture.push_device d join feture.account x on x.id = d.account_id where x.person_profile_id = $1`, [p]))[0].n;
    await call('ub', null, { action: 'push.register', opId: op(), platform: 'android', token: 'kira-device-token' });
    // A browser subscription (a made-up web token is refused: the server only posts to known push services).
    const sub = JSON.stringify({ endpoint: 'https://fcm.googleapis.com/fcm/send/kira', keys: { p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url') } });
    assert.equal((await call('ub', null, { action: 'push.register', opId: op(), platform: 'web', token: 'kira-browser-token' })).status, 400);
    await call('ub', null, { action: 'push.register', opId: op(), platform: 'web', token: sub });
    // Another account cannot switch off Kira's device by knowing its token.
    assert.equal((await call('ua', null, { action: 'push.unregister', opId: op(), token: 'kira-device-token' })).registered, false);
    assert.equal(await devices(b), 2);
    assert.equal((await call('ub', null, { action: 'push.unregister', opId: op(), token: 'kira-device-token' })).registered, false);
    assert.equal(await devices(b), 1);
    assert.equal((await call('ub', null, { action: 'push.unregister', opId: op(), token: 'kira-device-token' })).registered, false); // already gone
    assert.equal((await call('ub', null, { action: 'push.unregister', opId: op(), token: 'short' })).status, 400);
    assert.equal(await devices(b), 1);
  } finally { await pg.close(); }
});

/** The account of a person profile. @param {any} db @param {string} profileId */
const accountOf = async (db, profileId) => (await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [profileId]))[0].account_id;
const CLUB = { description: 'Встречи и разговоры о верёвке для новичков', topics: ['shibari'], rules: ['Уважать границы'], plate: 'rose', privacy: 'closed', joinQuestion: 'Почему вам интересно?' };

/** A published closed club owned by `profile`, approved by an owner `uo`. @param {any} env @param {string} user @param {string} profile */
async function closedClub(env, user, profile) {
  const { db, call, member } = env;
  const boss = await member('uo', 'Boss');
  await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
  const club = await call(user, profile, { action: 'community.create', opId: op(), name: 'Закрытый клуб', ...CLUB });
  assert.equal(club.status, 200, JSON.stringify(club));
  const q = (await call('uo', null, { action: 'staff.communityQueue' })).items.find((/** @type {any} */ x) => x.id === club.id);
  await call('uo', null, { action: 'staff.communityDecide', opId: op(), communityId: club.id, rev: q.rev, decision: 'approve' });
  return club.id;
}

test('stage 5 history: every row once over cursor pages in a stable order, filters by the catalog, counts from the whole history, several read at once', async () => {
  const { pg, db, call, member } = await world();
  try {
    const b = await member('ub', 'Kira');
    await member('uc', 'Noa');
    const kira = await accountOf(db, b);
    // 130 rows, ten in each instant (ties are broken by id), every third unread; one type this app does not know.
    await db.query(
      `insert into feture.notification (recipient_account_id, addressee_profile_id, type, source, kind, created_at, read_at)
       select $1, $2, case when i % 5 = 0 then 'premiumRevoked' when i = 7 then 'someFutureType' else 'datingLaunched' end, 'bulk' || i, 'notice',
              timestamptz '2026-11-01 12:00:00+00' - (i / 10) * interval '1 minute', case when i % 3 = 0 then null else now() end
       from generate_series(1, 130) i`, [kira, b]);
    /** @param {Record<string, unknown>} extra */
    const everything = async (extra = {}) => {
      /** @type {any[]} */
      const out = [];
      /** @type {string | undefined} */
      let cursor;
      for (let pages = 0; pages < 10; pages++) {
        const r = await call('ub', null, { action: 'notifications.list', ...extra, ...(cursor ? { cursor } : {}) });
        assert.ok(r.items.length <= 50);
        out.push(...r.items);
        if (!r.next) break;
        cursor = r.next;
      }
      return out;
    };
    const seen = (await everything()).map(x => x.id);
    const order = (await db.query(`select id from feture.notification where recipient_account_id = $1 order by created_at desc, id desc`, [kira])).map(x => x.id);
    assert.deepEqual(seen, order, 'every row once, newest first, ties by id');
    // The «Все» count is the whole history's unread, not the first page's.
    assert.equal((await call('ub', null, { action: 'inbox.counts' })).notifications, 43);
    // A filter is the catalog's: «Другое» also takes a type the catalog does not know; another filter has none of these.
    const other = await everything({ filter: 'other' });
    assert.equal(other.length, 130);
    assert.ok(other.some(x => x.type === 'someFutureType'));
    assert.equal((await call('ub', null, { action: 'notifications.list', filter: 'likes' })).items.length, 0);
    // Several rows read in one call (a summary card); someone else's ids change nothing.
    const ids = other.filter(x => !x.read).slice(0, 5).map(x => x.id);
    assert.equal((await call('uc', null, { action: 'notifications.read', ids })).status, 404);
    assert.equal((await call('ub', null, { action: 'notifications.read', ids })).count, 5);
    assert.equal((await call('ub', null, { action: 'inbox.counts' })).notifications, 38);
    assert.equal((await call('ub', null, { action: 'notifications.read', id: ids[0], ids })).status, 400);
    assert.equal((await call('ub', null, { action: 'notifications.list', cursor: 'nope' })).status, 400);
  } finally { await pg.close(); }
});

test('stage 5 auto-read: opening a chat reads its match row; a decided task reads its own row', async () => {
  const env = await world();
  const { pg, db, call, member, deliver } = env;
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira');
    await call('ua', a, { action: 'discover.decide', opId: op(), profileId: b, decision: 'like' });
    const m = await call('ub', b, { action: 'like.send', opId: op(), profileId: a, source: 'likes' });
    assert.equal(m.state, 'matched', JSON.stringify(m));
    await deliver();
    const unreadMatch = async (/** @type {string} */ u) => (await call(u, null, { action: 'notifications.list' })).items.filter((/** @type {any} */ x) => x.type === 'match' && !x.read).length;
    assert.equal(await unreadMatch('ua'), 1);
    const before = (await call('ua', null, { action: 'inbox.counts' })).notifications;
    // A later page of the chat reads nothing; its first page does — only for whoever opened it.
    await call('ua', a, { action: 'chat.messages', conversationId: m.conversationId, beforeSeq: 1 });
    assert.equal(await unreadMatch('ua'), 1);
    await call('ua', a, { action: 'chat.messages', conversationId: m.conversationId });
    assert.equal(await unreadMatch('ua'), 0);
    assert.equal((await call('ua', null, { action: 'inbox.counts' })).notifications, before - 1);
    // Someone else's rows are untouched: a like of Kira from Alex stays unread after Alex opened the chat.
    await db.query(`insert into feture.notification (recipient_account_id, addressee_profile_id, type, source, kind, object_type, object_id)
      select account_id, $1, 'match', 'other1', 'notice', 'conversation', $2 from feture.profile_member where profile_id = $1`, [b, m.conversationId]);
    await call('ua', a, { action: 'chat.messages', conversationId: m.conversationId });
    assert.equal(await unreadMatch('ub'), 1);

    // A task row about a join request is read when the host decides it (the host's account; nobody else's rows).
    const club = await closedClub(env, 'ua', a);
    await call('ub', b, { action: 'community.join', opId: op(), communityId: club, rulesAccepted: true, answer: 'Хочу научиться безопасно' });
    const d = (await call('ua', null, { action: 'decide.list' })).items.find((/** @type {any} */ x) => x.kind === 'capp');
    const alex = await accountOf(db, a), kira = await accountOf(db, b);
    await db.query(`insert into feture.notification (recipient_account_id, addressee_profile_id, type, source, kind, object_type, object_id) values
      ($1, $2, 'decide.capp', 'task1', 'task', 'request', $3), ($4, $5, 'decide.capp', 'task2', 'task', 'request', $3)`, [alex, a, d.id, kira, b]);
    await call('ua', a, { action: 'community.requestDecide', opId: op(), requestId: d.id, rev: d.rev, approve: true });
    const rows = await db.query(`select source, read_at is not null r from feture.notification where source in ('task1', 'task2') order by source`);
    assert.deepEqual(rows.map(x => [x.source, x.r]), [['task1', true], ['task2', false]]);
  } finally { await pg.close(); }
});

test('stage 5 «Нужно решить» with context: a join request names its club and its answer, is read by ID with its revision; strangers get 404', async () => {
  const env = await world();
  const { pg, call, member } = env;
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira');
    await member('uc', 'Noa');
    const club = await closedClub(env, 'ua', a);
    await call('ub', b, { action: 'community.join', opId: op(), communityId: club, rulesAccepted: true, answer: 'Хочу научиться безопасно' });
    const [item] = (await call('ua', null, { action: 'decide.list' })).items.filter((/** @type {any} */ x) => x.kind === 'capp');
    assert.deepEqual([item.object, item.answers, item.actor.handle, typeof item.rev], [{ type: 'community', id: club, title: 'Закрытый клуб' },
      [{ q: 'Почему вам интересно?', a: 'Хочу научиться безопасно' }], 'Kira', 'number']);
    const one = await call('ua', null, { action: 'decide.get', kind: 'capp', id: item.id });
    // The same item read by ID; avatar links are signed when read, so a second between the two reads changes them.
    const unsigned = (/** @type {any} */ x) => JSON.parse(JSON.stringify(x).replace(/\?t=[^"]*/g, ''));
    assert.deepEqual(unsigned(one.item), unsigned(item));
    assert.equal((await call('uc', null, { action: 'decide.get', kind: 'capp', id: item.id })).status, 404);
    assert.equal((await call('ua', null, { action: 'decide.get', kind: 'eapp', id: item.id })).status, 404);
    // The decision carries the revision read by ID; a stale one is refused; once decided, the item is gone.
    assert.equal((await call('ua', a, { action: 'community.requestDecide', opId: op(), requestId: item.id, rev: one.item.rev + 1, approve: true })).status, 409);
    assert.equal((await call('ua', a, { action: 'community.requestDecide', opId: op(), requestId: item.id, rev: one.item.rev, approve: true })).state, 'approved');
    assert.equal((await call('ua', null, { action: 'decide.get', kind: 'capp', id: item.id })).status, 404);
    // The count has no limit: it is the list's length.
    await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Noa' });
    const d = (await call('uc', null, { action: 'decide.list' })).items;
    assert.equal(d.length, 1);
    assert.equal((await call('uc', null, { action: 'inbox.counts' })).decide, d.length);
  } finally { await pg.close(); }
});

test('stage 5 moderation card: one row by ID with the appeal state; a resolved report keeps only its outcome', async () => {
  const { pg, db, call, member, deliver } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira');
    const boss = await member('uo', 'Boss');
    await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
    const r = await call('uo', null, { action: 'staff.restrict', opId: op(), profileId: a, on: true, rule: 'spam', days: 7, note: '' });
    assert.equal(r.restricted, true, JSON.stringify(r));
    await deliver();
    const row = (await call('ua', null, { action: 'notifications.list' })).items.find((/** @type {any} */ x) => x.type === 'profileRestricted');
    assert.ok(row, 'the restriction is in the inbox');
    let card = await call('ua', null, { action: 'notifications.get', id: row.id });
    assert.deepEqual([card.item.id, card.item.data.rule, typeof card.item.data.until, card.appeal], [row.id, 'spam', 'string', 'available']);
    assert.equal((await call('ub', null, { action: 'notifications.get', id: row.id })).status, 404);
    const ap = await call('ua', a, { action: 'appeal.create', opId: op(), targetType: 'profile', targetId: a, body: 'Это ошибка, я не рассылал спам.' });
    assert.equal(ap.state, 'open', JSON.stringify(ap));
    card = await call('ua', null, { action: 'notifications.get', id: row.id });
    assert.equal(card.appeal, 'open');
    // A reporter's row: the outcome only, nothing of the material.
    const kira = await accountOf(db, b);
    const [rep] = await db.query(`insert into feture.notification (recipient_account_id, addressee_profile_id, type, source, kind, data) values
      ($1, $2, 'reportResolved', 'rep1', 'result', $3) returning id`, [kira, b, JSON.stringify({ targetType: 'post', targetId: a, resolution: 'removed' })]);
    const rc = await call('ub', null, { action: 'notifications.get', id: rep.id });
    assert.deepEqual([rc.item.data, rc.appeal], [{ resolution: 'removed' }, null]);
  } finally { await pg.close(); }
});

test('stage 4 retention: read notices go after 180 days; unread ones and decision results after a year', async () => {
  const { pg, db, person } = await world();
  try {
    const a = await person('ua', 'Alex');
    const [{ id: acc }] = await db.query('select id from feture.account where person_profile_id = $1', [a]);
    /** @type {[string, string, number, boolean][]} label, kind, age in days, read */
    const rows = [['readOld', 'notice', 181, true], ['readFresh', 'notice', 179, true], ['unreadOld', 'notice', 300, false], ['unreadAncient', 'notice', 366, false],
      ['resultOld', 'result', 300, true], ['resultAncient', 'result', 366, true]];
    for (const [label, kind, days, read] of rows) {
      await db.query(
        `insert into feture.notification (recipient_account_id, addressee_profile_id, type, data, source, kind, created_at, read_at)
         values ($1, $2, 'supportReply', jsonb_build_object('label', $3::text), $3, $4, now() - make_interval(days => $5), case when $6 then now() end)`,
        [acc, a, label, kind, days, read]);
    }
    await sweepMarkers(db);
    const left = (await db.query(`select data->>'label' l from feture.notification order by 1`)).map(r => r.l);
    assert.deepEqual(left, ['readFresh', 'resultOld', 'unreadOld']);
  } finally { await pg.close(); }
});
