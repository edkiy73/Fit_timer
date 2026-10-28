// Backlog wave 7 on PGlite as feture_api: popular discussions and a host's «не в Популярное», removing a follower,
// member pages, read times and disappearing-photo states for the sender, chat starters from public interests, the
// dating switch with «Сообщить о запуске», and «Рядом» from coarse shared locations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { staff } from '../server/commands/staff.mjs';
import { communities } from '../server/commands/communities.mjs';
import { discover } from '../server/commands/discover.mjs';
import { chats, openConversation } from '../server/commands/chats.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...posts, ...staff, ...communities, ...discover, ...chats } });
const base = { description: 'Встречи и разговоры о верёвке для новичков', topics: ['shibari'], rules: ['Уважать границы'], plate: 'rose' };
const draft = (/** @type {string} */ body, extra = {}) => ({ type: 'post', body, audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [], ...extra });

async function world() {
  const env = await setup();
  const { db, call, person } = env;
  const boss = await person('uo', 'Boss');
  await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
  /** An approved, safe asset of a profile. */
  const asset = async (/** @type {string} */ profileId, purpose = 'avatar', viewRule = 'normal') => {
    const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [profileId]);
    const [a] = await db.query(
      `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at, view_rule)
       values ($1, $2, 'image', $3, 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now(), $4) returning id`, [profileId, account_id, purpose, viewRule]);
    return a.id;
  };
  /** A person Discover may show (approved photo). */
  const member = async (/** @type {string} */ user, /** @type {string} */ handle) => {
    const id = await person(user, handle);
    const av = await asset(id);
    await db.query(`insert into feture.media_attachment (asset_id, target_type, target_id, position) values ($1, 'avatar', $2, 0)`, [av, id]);
    await db.query(`update feture.profile set avatar_asset_id = $1 where id = $2`, [av, id]);
    return id;
  };
  /** A match and its conversation between two profiles. */
  const converse = async (/** @type {string} */ a, /** @type {string} */ b) => {
    const [m] = await db.query(`insert into feture.profile_match (profile_a, profile_b) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid)) returning id`, [a, b]);
    return openConversation(db, m.id, a, b);
  };
  /** A published community owned by `profile`. */
  const community = async (/** @type {string} */ user, /** @type {string} */ profile, /** @type {any} */ extra) => {
    const r = await call(user, profile, { action: 'community.create', opId: op(), ...base, ...extra });
    assert.equal(r.status, 200, JSON.stringify(r));
    const item = (await call('uo', null, { action: 'staff.communityQueue' })).items.find((/** @type {any} */ x) => x.id === r.id);
    await call('uo', null, { action: 'staff.communityDecide', opId: op(), communityId: r.id, rev: item.rev, decision: 'approve' });
    return r.id;
  };
  return { ...env, asset, member, converse, community };
}

test('popular discussions: discussed beats loud, a host keeps one out and back, closed ones only for readers', async () => {
  const { pg, call, person, community } = await world();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa'), d = await person('ud', 'Mia');
    const open = await community('ua', a, { name: 'Открытый клуб', privacy: 'open' });
    const closed = await community('ua', a, { name: 'Закрытый клуб', privacy: 'closed', joinQuestion: 'Кто вы?' });
    for (const [u, p] of [['ub', b], ['uc', c]]) await call(u, p, { action: 'community.join', opId: op(), communityId: open, rulesAccepted: true });
    const post = async (/** @type {string} */ u, /** @type {string} */ p, /** @type {string} */ cid, /** @type {string} */ body) => {
      const dr = await call(u, p, { action: 'post.saveDraft', opId: op(), post: draft(body, { communityId: cid }) });
      await call(u, p, { action: 'post.publish', opId: op(), postId: dr.id });
      return dr.id;
    };
    const quiet = await post('ub', b, open, 'Тихая тема');
    const talked = await post('ub', b, open, 'Обсуждаемая тема');
    await call('uc', c, { action: 'reply.create', opId: op(), postId: talked, body: 'Согласна' });
    await call('ua', a, { action: 'reply.create', opId: op(), postId: talked, body: 'И я' });
    const inside = await post('ua', a, closed, 'Только для своих');

    const ids = async (/** @type {string} */ u, /** @type {string} */ p, extra = {}) =>
      (await call(u, p, { action: 'discussions.popular', limit: 10, ...extra })).items.map((/** @type {any} */ x) => x.id);
    assert.deepEqual(await ids('ud', d, { communityId: open }), [talked, quiet]);
    assert.deepEqual(await ids('ud', d), [talked, quiet]); // a stranger never gets the closed community's discussion
    assert.ok((await ids('ua', a)).includes(inside));
    assert.deepEqual(await ids('ud', d, { communityId: closed }), []);
    assert.deepEqual(await ids('ud', d, { topic: 'bondage' }), []);

    // Only hosts keep a discussion out of «Популярное»; only they see the mark.
    assert.equal((await call('uc', c, { action: 'discussion.host', opId: op(), postId: talked, change: 'excludePopular' })).status, 403);
    await call('ua', a, { action: 'discussion.host', opId: op(), postId: talked, change: 'excludePopular' });
    assert.deepEqual(await ids('ud', d, { communityId: open }), [quiet]);
    const hostView = (await call('ua', a, { action: 'community.discussions', communityId: open })).items.find((/** @type {any} */ x) => x.id === talked);
    assert.equal(hostView.popularExcluded, true);
    const memberView = (await call('uc', c, { action: 'community.discussions', communityId: open })).items.find((/** @type {any} */ x) => x.id === talked);
    assert.equal(memberView.popularExcluded, undefined);
    await call('ua', a, { action: 'discussion.host', opId: op(), postId: talked, change: 'includePopular' });
    assert.deepEqual(await ids('ud', d, { communityId: open }), [talked, quiet]);
    // Someone blocked by the author does not get it.
    await call('ub', b, { action: 'block.set', opId: op(), profileId: d, on: true });
    assert.deepEqual(await ids('ud', d, { communityId: open }), []);
  } finally { await pg.close(); }
});

test('community members come 20 a page, in order, without repeats; a bad cursor is refused', async () => {
  const { pg, call, person, community } = await world();
  try {
    const a = await person('ua', 'Alex');
    const open = await community('ua', a, { name: 'Большой клуб', privacy: 'open' });
    for (let i = 0; i < 22; i++) {
      const p = await person('m' + i, 'Member' + i);
      await call('m' + i, p, { action: 'community.join', opId: op(), communityId: open, rulesAccepted: true });
    }
    const first = await call('ua', a, { action: 'community.members', communityId: open });
    assert.equal(first.count, 23);
    assert.equal(first.items.length, 20);
    assert.equal(first.items[0].role, 'owner');
    const second = await call('ua', a, { action: 'community.members', communityId: open, cursor: first.next });
    assert.deepEqual([second.items.length, second.next], [3, null]);
    assert.equal(new Set([...first.items, ...second.items].map((/** @type {any} */ x) => x.id)).size, 23);
    assert.equal((await call('ua', a, { action: 'community.members', communityId: open, cursor: 'bm9wZQ' })).status, 400);
  } finally { await pg.close(); }
});

test('removing a follower: not told, undo only within the window and only for a real removal', async () => {
  const { pg, db, call, person } = await world();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    await call('ub', b, { action: 'follow.set', opId: op(), profileId: a, on: true });
    const followers = async () => (await call('ua', a, { action: 'profile.followers', profileId: a })).items.map((/** @type {any} */ x) => x.handle);
    assert.deepEqual(await followers(), ['Kira']);
    const [{ n: before }] = await db.query(`select count(*)::int n from feture.outbox where profile_id = $1`, [b]);
    const r = await call('ua', a, { action: 'follower.remove', opId: op(), profileId: b });
    assert.ok(r.removed && r.undoUntil);
    assert.deepEqual(await followers(), []);
    assert.equal((await db.query(`select count(*)::int n from feture.outbox where profile_id = $1`, [b]))[0].n, before); // nothing for Kira
    assert.equal((await call('ua', a, { action: 'follower.remove', opId: op(), profileId: c })).status, 404); // not a follower
    assert.equal((await call('ua', a, { action: 'follower.restore', opId: op(), profileId: c })).status, 404); // never removed
    assert.equal((await call('uc', c, { action: 'follower.restore', opId: op(), profileId: b })).status, 404); // not Noa's
    assert.equal((await call('ua', a, { action: 'follower.restore', opId: op(), profileId: b })).restored, true);
    assert.deepEqual(await followers(), ['Kira']);
    assert.equal((await call('ua', a, { action: 'follower.restore', opId: op(), profileId: b })).status, 404); // once

    // After the window, or after a block meanwhile, nothing comes back.
    await call('ua', a, { action: 'follower.remove', opId: op(), profileId: b });
    await db.query(`update feture.follow_removed set removed_at = now() - interval '11 minutes'`);
    assert.equal((await call('ua', a, { action: 'follower.restore', opId: op(), profileId: b })).status, 404);
    await call('ub', b, { action: 'follow.set', opId: op(), profileId: a, on: true });
    await call('ua', a, { action: 'follower.remove', opId: op(), profileId: b });
    await call('ub', b, { action: 'block.set', opId: op(), profileId: a, on: true });
    assert.equal((await call('ua', a, { action: 'follower.restore', opId: op(), profileId: b })).restored, false);
    assert.deepEqual(await followers(), []);
  } finally { await pg.close(); }
});

test('read times and disappearing-photo states go only to the sender; a couple on the other side has two readers', async () => {
  const { pg, db, call, person, coupleOf, asset, converse } = await world();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa'), d = await person('ud', 'Mia');
    const pair = await coupleOf([b, c]);
    const conv = await converse(a, pair);
    const m1 = await call('ua', a, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Привет!' });
    let mine = (await call('ua', a, { action: 'chat.messages', conversationId: conv })).items[0];
    assert.deepEqual(mine.readBy.map((/** @type {any} */ r) => ({ read: r.read, readAt: r.readAt })), [{ read: false, readAt: null }, { read: false, readAt: null }]);
    await call('ub', pair, { action: 'chat.read', conversationId: conv, upToSeq: 1 });
    mine = (await call('ua', a, { action: 'chat.messages', conversationId: conv })).items[0];
    assert.equal(mine.readBy.filter((/** @type {any} */ r) => r.read && r.readAt).length, 1);
    // Answering reads what came before: Noa's reply marks Alex's message read for her too.
    await call('uc', pair, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Привет, Алекс' });
    mine = (await call('ua', a, { action: 'chat.messages', conversationId: conv })).items.find((/** @type {any} */ m) => m.id === m1.id);
    assert.ok(mine.readBy.every((/** @type {any} */ r) => r.read && r.readAt));
    // The readers never see read times of messages that are not theirs, nor who read them.
    const theirs = (await call('ub', pair, { action: 'chat.messages', conversationId: conv })).items;
    assert.equal(theirs.find((/** @type {any} */ m) => m.id === m1.id).readBy, undefined);
    assert.ok(theirs.find((/** @type {any} */ m) => !m.mine === false).readBy); // the couple's own message: Alex is its reader
    assert.equal((await call('ud', d, { action: 'chat.messages', conversationId: conv })).status, 404);

    // A disappearing photo: per recipient «не открыто» → «открыто в …»; an unopened one expires after 7 days.
    await db.query(`update feture.account set age_verified_until = now() + interval '1 year'`);
    const once = await call('ua', a, { action: 'chat.sendMedia', opId: op(), conversationId: conv, assetId: await asset(a, 'chat', 'once'), mode: 'once' });
    const views = async (/** @type {string} */ id) => (await call('ua', a, { action: 'chat.messages', conversationId: conv })).items.find((/** @type {any} */ m) => m.id === id).media.views;
    assert.deepEqual((await views(once.id)).map((/** @type {any} */ v) => v.state), ['unopened', 'unopened']);
    await call('ub', pair, { action: 'chat.openMedia', opId: op(), messageId: once.id });
    const v = await views(once.id);
    assert.deepEqual(v.map((/** @type {any} */ x) => x.state).sort(), ['opened', 'unopened']);
    assert.ok(v.find((/** @type {any} */ x) => x.state === 'opened').openedAt);
    await db.query(`update feture.message set created_at = now() - interval '8 days' where id = $1`, [once.id]);
    assert.deepEqual((await views(once.id)).map((/** @type {any} */ x) => x.state).sort(), ['expired', 'opened']);
    const recipientSide = (await call('uc', pair, { action: 'chat.messages', conversationId: conv })).items.find((/** @type {any} */ m) => m.id === once.id).media;
    assert.equal(recipientSide.views, undefined);
  } finally { await pg.close(); }
});

test('chat starters: only topics both show publicly, never a hidden interest or a hard limit; members only', async () => {
  const { pg, call, person, converse } = await world();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    const conv = await converse(a, b);
    const set = (/** @type {string} */ u, /** @type {string} */ p, /** @type {any} */ x) => call(u, p, { action: 'interests.set', opId: op(), ...x });
    await set('ua', a, { topicId: 'shibari', value: 8, vis: 'public' });
    await set('ub', b, { topicId: 'shibari', value: 6, vis: 'public' });
    await set('ua', a, { topicId: 'bondage', value: 9, vis: 'public' });
    await set('ub', b, { topicId: 'bondage', value: 9, vis: 'only' }); // Kira hid it
    await set('ua', a, { topicId: 'spanking', value: 5, vis: 'public' });
    await set('ub', b, { topicId: 'spanking', mark: 'hard', vis: 'public' }); // a limit is not a conversation starter
    assert.deepEqual((await call('ua', a, { action: 'chat.starters', conversationId: conv })).topics, ['shibari']);
    assert.deepEqual((await call('ub', b, { action: 'chat.starters', conversationId: conv })).topics, ['shibari']);
    assert.equal((await call('uc', c, { action: 'chat.starters', conversationId: conv })).status, 404);
    await call('ub', b, { action: 'block.set', opId: op(), profileId: a, on: true });
    assert.equal((await call('ua', a, { action: 'chat.starters', conversationId: conv })).status, 404);
  } finally { await pg.close(); }
});

test('dating switch: staff only; closed Discover; «Сообщить о запуске» is stored and told once at launch', async () => {
  const { pg, db, call, member } = await world();
  try {
    const a = await member('ua', 'Alex'); await member('ub', 'Kira');
    const s0 = await call('ua', null, { action: 'dating.status' });
    assert.deepEqual([s0.open, s0.notify], [true, false]);
    assert.equal((await call('ua', null, { action: 'dating.notify', opId: op(), on: true })).rule, 'dating_open');
    assert.equal((await call('ua', null, { action: 'staff.datingSwitch', opId: op(), on: false })).status, 403);
    assert.equal((await call('uo', null, { action: 'staff.datingSwitch', opId: op(), on: false })).on, false);

    assert.deepEqual([(await call('ua', a, { action: 'discover.deck' })).closed, (await call('ua', a, { action: 'discover.deck' })).items.length], [true, 0]);
    const [kira] = await db.query(`select id from feture.profile where handle = 'Kira'`);
    assert.equal((await call('ua', a, { action: 'discover.decide', opId: op(), profileId: kira.id, decision: 'like' })).rule, 'dating_closed');
    assert.equal((await call('ua', null, { action: 'dating.notify', opId: op(), on: true })).notify, true);
    const st = await call('ua', null, { action: 'dating.status' });
    assert.deepEqual([st.open, st.notify], [false, true]);
    assert.equal((await call('ub', null, { action: 'dating.status' })).notify, false); // one's own wish only

    assert.equal((await call('uo', null, { action: 'staff.datingSwitch', opId: op(), on: true })).notified, 1);
    const [{ n }] = await db.query(`select count(*)::int n from feture.outbox where topic = 'dating.launched' and payload->>'for' = (select id::text from feture.account where person_profile_id = $1)`, [a]);
    assert.equal(n, 1);
    assert.equal((await call('ua', null, { action: 'dating.status' })).notify, false);
    assert.ok((await call('ua', a, { action: 'discover.deck' })).items.length > 0);
  } finally { await pg.close(); }
});

test('«Рядом»: only shared locations, rounded to ~5 km, distance in 5 km steps; never someone else’s coordinates', async () => {
  const { pg, db, call, member } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira'), c = await member('uc', 'Noa'); await member('ud', 'Mia');
    const filter = { show: 'all', ageMin: 18, ageMax: 99, cityId: null, placeMode: 'nearby', radiusKm: 25, genders: [], orients: [], formats: [], seeks: [], roles: [], topics: [] };
    assert.equal((await call('ua', a, { action: 'discover.setFilter', opId: op(), filter })).rule, 'location_required');
    assert.equal((await call('ua', a, { action: 'discover.count', filter })).rule, 'location_required');
    assert.equal((await call('ua', a, { action: 'discover.count', filter: { ...filter, radiusKm: 4 } })).status, 400);

    const mine = await call('ua', a, { action: 'location.set', opId: op(), lat: 52.5234, lon: 13.4111 });
    assert.deepEqual(mine.location, { lat: 52.5, lon: 13.4 });
    assert.deepEqual((await db.query('select lat, lon from feture.profile_location where profile_id = $1', [a]))[0], { lat: 52.5, lon: 13.4 }); // the exact one is not kept
    await call('ub', b, { action: 'location.set', opId: op(), lat: 52.61, lon: 13.52 }); // ~13 km away
    await call('uc', c, { action: 'location.set', opId: op(), lat: 55.75, lon: 37.62 }); // Moscow
    // Mia shares nothing: not «рядом».
    assert.equal((await call('ua', a, { action: 'discover.setFilter', opId: op(), filter })).status, 200);
    const deck = (await call('ua', a, { action: 'discover.deck' })).items;
    assert.deepEqual(deck.map((/** @type {any} */ x) => x.handle), ['Kira']);
    assert.equal(deck[0].distanceKm % 5, 0);
    assert.ok(deck[0].distanceKm >= 5 && deck[0].distanceKm <= 25);
    assert.equal(JSON.stringify(deck).includes('52.6'), false); // no coordinates of others
    assert.equal((await call('ua', a, { action: 'discover.count', filter: { ...filter, radiusKm: 200 } })).count, 1);
    assert.equal((await call('ua', a, { action: 'discover.count', filter: { ...filter, placeMode: 'city' } })).count, 3);
    assert.deepEqual((await call('ub', b, { action: 'location.get' })).location, { lat: 52.6, lon: 13.5 }); // one's own only

    // Clearing it: «Рядом» shows nobody until it is shared again; nobody else's location is ever needed.
    await call('ua', a, { action: 'location.clear', opId: op() });
    assert.equal((await call('ua', a, { action: 'discover.deck' })).needsLocation, true);
    assert.equal((await call('ub', b, { action: 'discover.deck' })).items.find((/** @type {any} */ x) => x.handle === 'Alex').distanceKm, null);
  } finally { await pg.close(); }
});

test('R04: with my dating off a like from a profile page still goes out; Discover stays closed to me', async () => {
  const { pg, call, member } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira');
    await call('ua', a, { action: 'profile.setVisibility', opId: op(), setting: 'discoverMode', value: 'off' });
    assert.equal((await call('ua', a, { action: 'like.send', opId: op(), profileId: b, source: 'profile' })).state, 'liked');
    assert.equal((await call('ub', b, { action: 'likes.incoming' })).items.length, 1);
    assert.equal((await call('ua', a, { action: 'discover.decide', opId: op(), profileId: b, decision: 'like' })).rule, 'own_discover_off');
    // They answer from their likes list: a match, as with any like.
    assert.equal((await call('ub', b, { action: 'like.send', opId: op(), profileId: a, source: 'likes' })).state, 'matched');
  } finally { await pg.close(); }
});

test('couple chats: each reader comes with their person profile, only on the sender’s own messages', async () => {
  const { pg, call, person, coupleOf, converse } = await world();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    const pair = await coupleOf([b, c]);
    const conv = await converse(a, pair);
    await call('ua', a, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Привет!' });
    await call('ub', pair, { action: 'chat.read', conversationId: conv, upToSeq: 1 });
    const mine = (await call('ua', a, { action: 'chat.messages', conversationId: conv })).items[0];
    const by = Object.fromEntries(mine.readBy.map((/** @type {any} */ r) => [r.reader?.handle, r.read]));
    assert.deepEqual(by, { Kira: true, Noa: false });
    assert.ok(mine.readBy.every((/** @type {any} */ r) => r.reader.id && 'avatar' in r.reader));
    const theirs = (await call('uc', pair, { action: 'chat.messages', conversationId: conv })).items[0];
    assert.equal(theirs.readBy, undefined);
  } finally { await pg.close(); }
});
