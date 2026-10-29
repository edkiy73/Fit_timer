// S4 step 4 on PGlite as feture_api: restriction, reports on chats/communities/events, appeals, the city queue, event reminders.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { staff } from '../server/commands/staff.mjs';
import { moderation } from '../server/commands/moderation.mjs';
import { communities } from '../server/commands/communities.mjs';
import { events } from '../server/commands/events.mjs';
import { discover } from '../server/commands/discover.mjs';
import { chats } from '../server/commands/chats.mjs';
import { people } from '../server/commands/people.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { sweepEventReminders, sweepExpiredSanctions } from '../server/jobs.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...posts, ...staff, ...moderation, ...communities, ...events, ...discover, ...chats, ...people, ...inbox } });
const base = { description: 'Встречи и разговоры о верёвке для новичков', topics: ['shibari'], rules: ['Уважать границы'] };

async function world() {
  const env = await setup();
  const { db, call, person } = env;
  const boss = await person('uo', 'Boss');
  await person('um', 'Mira'); await person('ul', 'Lead');
  await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
  await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Mira', role: 'moderator', grant: true });
  await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Lead', role: 'lead', grant: true });
  const member = async (/** @type {string} */ user, /** @type {string} */ handle) => {
    const id = await person(user, handle);
    const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [id]);
    const [a] = await db.query(
      `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
       values ($1, $2, 'image', 'avatar', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [id, account_id]);
    await db.query('update feture.profile set avatar_asset_id = $1 where id = $2', [a.id, id]);
    return id;
  };
  return { ...env, member };
}

test('restriction: out of Discover and search, no likes, messages, links or requests; moderators apply it, rank rules hold', async () => {
  const { pg, call, member } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira');
    await call('ua', a, { action: 'discover.decide', opId: op(), profileId: b, decision: 'like' });
    const conv = (await call('ub', b, { action: 'like.send', opId: op(), profileId: a, source: 'likes' })).conversationId;
    assert.equal((await call('ua', null, { action: 'staff.restrict', opId: op(), profileId: b, on: true, rule: 'spam' })).status, 403);
    await call('um', null, { action: 'staff.restrict', opId: op(), profileId: b, on: true, rule: 'spam' });
    assert.equal((await call('ub', b, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Купи' })).rule, 'restricted');
    assert.equal((await call('ub', b, { action: 'link.propose', opId: op(), profileId: a, kind: 'friend' })).rule, 'restricted');
    assert.deepEqual((await call('ua', a, { action: 'people.search', q: 'kir' })).items, []);
    assert.equal((await call('ua', a, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Ок' })).seq, 1); // the other side may still answer
    // Appeal: a lead who did not restrict decides it.
    const ap = await call('ub', b, { action: 'appeal.create', opId: op(), targetType: 'profile', targetId: b, body: 'Это была ошибка, я не рассылаю спам' });
    assert.equal((await call('ul', null, { action: 'staff.appealQueue' })).items[0].id, ap.id);
    await call('ul', null, { action: 'staff.appealDecide', opId: op(), appealId: ap.id, grant: true, note: 'Ошибка' });
    assert.equal((await call('ub', b, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Спасибо' })).seq, 2);
  } finally { await pg.close(); }
});

test('reports: a chat with the selected messages, communities and events; removal hides, the appeal restores; reporters stay unnamed', async () => {
  const { pg, call, member } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira');
    await call('ua', a, { action: 'discover.decide', opId: op(), profileId: b, decision: 'like' });
    const conv = (await call('ub', b, { action: 'like.send', opId: op(), profileId: a, source: 'likes' })).conversationId;
    const bad = await call('ub', b, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Угроза' });
    const mine = await call('ua', a, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Моё' });
    assert.deepEqual((await call('ua', a, { action: 'report.create', opId: op(), targetType: 'conversation', targetId: conv, reason: 'threat', details: 'Подробности для модератора' })).fields, ['messageIds']);
    assert.deepEqual((await call('ua', a, { action: 'report.create', opId: op(), targetType: 'conversation', targetId: conv, messageIds: [mine.id], reason: 'threat', details: 'Подробности для модератора' })).fields, ['messageIds']);
    await call('ua', a, { action: 'report.create', opId: op(), targetType: 'conversation', targetId: conv, messageIds: [bad.id], reason: 'threat', details: 'Подробности для модератора' });
    const card = (await call('um', null, { action: 'staff.reportQueue' })).items.find((/** @type {any} */ i) => i.targetType === 'conversation');
    assert.deepEqual([card.author.handle, card.reported.messages[0].body], ['Kira', 'Угроза']);
    assert.equal((await call('um', null, { action: 'staff.reportDecide', opId: op(), targetType: 'conversation', targetId: conv, decision: 'remove', rule: 'threats' })).status, 400);

    const cr = await call('ub', b, { action: 'community.create', opId: op(), name: 'Плохое сообщество', privacy: 'open', ...base });
    const qrev = (await call('um', null, { action: 'staff.communityQueue' })).items.find((/** @type {any} */ x) => x.id === cr.id).rev;
    await call('um', null, { action: 'staff.communityDecide', opId: op(), communityId: cr.id, rev: qrev, decision: 'approve' });
    await call('ua', a, { action: 'report.create', opId: op(), targetType: 'community', targetId: cr.id, reason: 'spam', details: 'Подробности для модератора' });
    await call('um', null, { action: 'staff.reportDecide', opId: op(), targetType: 'community', targetId: cr.id, decision: 'remove', rule: 'spam' });
    assert.equal((await call('ua', a, { action: 'community.get', communityId: cr.id })).status, 404);
    const ap = await call('ub', b, { action: 'appeal.create', opId: op(), targetType: 'community', targetId: cr.id, body: 'Там нет спама, проверьте ещё раз' });
    assert.equal((await call('um', null, { action: 'staff.appealDecide', opId: op(), appealId: ap.id, grant: true })).status, 403); // leads only
    await call('ul', null, { action: 'staff.appealDecide', opId: op(), appealId: ap.id, grant: true });
    assert.equal((await call('ua', a, { action: 'community.get', communityId: cr.id })).community.name, 'Плохое сообщество');
  } finally { await pg.close(); }
});

test('city queue and event reminders the day before, once, to admitted people', async () => {
  const { pg, db, call, member } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira');
    const [{ id: city }] = await db.query(`insert into feture.place (country, name_ru, state) values ('DE', 'Лейпциг', 'pending') returning id`);
    assert.ok((await call('um', null, { action: 'staff.placeQueue' })).items.some((/** @type {any} */ x) => x.id === city));
    await call('um', null, { action: 'staff.placeDecide', opId: op(), placeId: city, decision: 'approve', nameEn: 'Leipzig' });
    const [{ state, name_en }] = await db.query('select state, name_en from feture.place where id = $1', [city]);
    assert.deepEqual([state, name_en], ['approved', 'Leipzig']);

    const ev = { title: 'Вечер знакомств', kind: 'meetup', description: 'Спокойный вечер для знакомства, без спешки и давления.',
      format: 'online', joinUrl: 'https://meet.example/x', tz: 'Europe/Berlin', startsAt: new Date(Date.now() + 20 * 36e5).toISOString(), endsAt: new Date(Date.now() + 23 * 36e5).toISOString() };
    const r = await call('ua', a, { action: 'event.submit', opId: op(), event: ev });
    const erev = (await call('um', null, { action: 'staff.eventQueue' })).items.find((/** @type {any} */ x) => x.id === r.id).rev;
    await call('um', null, { action: 'staff.eventDecide', opId: op(), eventId: r.id, rev: erev, decision: 'approve' });
    await call('ub', b, { action: 'event.rsvp', opId: op(), eventId: r.id, status: 'going' });
    assert.equal(await sweepEventReminders(db), 1);
    assert.equal(await sweepEventReminders(db), 0);
    const { notifyHandlers } = await import('../server/notify.mjs');
    const { drain } = await import('../server/outbox.mjs');
    await drain(db, notifyHandlers(db), { limit: 100 });
    assert.ok((await call('ub', null, { action: 'notifications.list' })).items.some((/** @type {any} */ n) => n.type === 'eventReminder'));
  } finally { await pg.close(); }
});

test('review fixes: no appeal against a host removal, restore returns the previous state, the appealed decider never decides, restriction closes links and likes', async () => {
  const { pg, db, call, member } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira');
    // A discussion removed by the community's host is not a staff decision: nothing to appeal here.
    const cr = await call('ua', a, { action: 'community.create', opId: op(), name: 'Клуб для теста', privacy: 'open', ...base });
    const qrev = (await call('um', null, { action: 'staff.communityQueue' })).items.find((/** @type {any} */ x) => x.id === cr.id).rev;
    await call('um', null, { action: 'staff.communityDecide', opId: op(), communityId: cr.id, rev: qrev, decision: 'approve' });
    await call('ub', b, { action: 'community.join', opId: op(), communityId: cr.id, rulesAccepted: true });
    const d = await call('ub', b, { action: 'post.saveDraft', opId: op(), post: { type: 'post', body: 'Тема', audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [], communityId: cr.id } });
    await call('ub', b, { action: 'post.publish', opId: op(), postId: d.id });
    await call('ua', a, { action: 'discussion.host', opId: op(), postId: d.id, change: 'remove' });
    assert.equal((await call('ub', b, { action: 'appeal.create', opId: op(), targetType: 'post', targetId: d.id, body: 'Верните, пожалуйста, мою тему' })).rule, 'nothing_to_appeal');

    // A cancelled event that staff hid comes back cancelled, never published.
    const ev = { title: 'Вечер знакомств', kind: 'meetup', description: 'Спокойный вечер для знакомства, без спешки и давления.',
      format: 'online', joinUrl: 'https://meet.example/x', tz: 'Europe/Berlin', startsAt: new Date(Date.now() + 5 * 864e5).toISOString(), endsAt: new Date(Date.now() + 5 * 864e5 + 36e5).toISOString() };
    const r = await call('ub', b, { action: 'event.submit', opId: op(), event: ev });
    const erev = async () => (await call('um', null, { action: 'staff.eventQueue' })).items.find((/** @type {any} */ x) => x.id === r.id)?.rev;
    await call('um', null, { action: 'staff.eventDecide', opId: op(), eventId: r.id, rev: await erev(), decision: 'approve' });
    await call('ub', b, { action: 'event.cancel', opId: op(), eventId: r.id });
    const [{ rev }] = await db.query('select rev from feture.event where id = $1', [r.id]);
    await call('um', null, { action: 'staff.eventDecide', opId: op(), eventId: r.id, rev, decision: 'hide' });
    const ap = await call('ub', b, { action: 'appeal.create', opId: op(), targetType: 'event', targetId: r.id, body: 'Событие было отменено, но не нарушало правил' });
    await call('ul', null, { action: 'staff.appealDecide', opId: op(), appealId: ap.id, grant: true });
    const [{ state }] = await db.query('select state from feture.event where id = $1', [r.id]);
    assert.equal(state, 'cancelled');

    // The lead who restricted may not decide the appeal, even after someone else touched the profile.
    await call('ul', null, { action: 'staff.restrict', opId: op(), profileId: a, on: true, rule: 'spam' });
    await call('ub', b, { action: 'report.create', opId: op(), targetType: 'profile', targetId: a, reason: 'spam', details: 'Подробности для модератора' });
    await call('um', null, { action: 'staff.reportDecide', opId: op(), targetType: 'profile', targetId: a, decision: 'keep' });
    const ap2 = await call('ua', a, { action: 'appeal.create', opId: op(), targetType: 'profile', targetId: a, body: 'Я ничего не рассылал, проверьте' });
    assert.equal((await call('ul', null, { action: 'staff.appealDecide', opId: op(), appealId: ap2.id, grant: true })).rule, 'same_staff');

    // A restricted profile neither accepts links nor gets a like back into a match.
    const l = await call('ub', b, { action: 'link.propose', opId: op(), profileId: a, kind: 'friend' });
    assert.equal(l.status, 404);
    assert.equal((await call('ub', b, { action: 'like.send', opId: op(), profileId: a, source: 'profile' })).status, 404);
  } finally { await pg.close(); }
});

test('timed measures: moderators suspend or restrict for a set time, it ends on its own; until lifted is for leads', async () => {
  const { pg, db, call, member } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira');
    const conv = (await call('ua', a, { action: 'like.send', opId: op(), profileId: b, source: 'likes' }), (await call('ub', b, { action: 'like.send', opId: op(), profileId: a, source: 'likes' })).conversationId);
    // Minors / illegal: never timed. A timed lift makes no sense.
    assert.equal((await call('um', null, { action: 'staff.restrict', opId: op(), profileId: b, on: true, rule: 'minors', days: 7 })).status, 400);
    assert.equal((await call('ul', null, { action: 'staff.sanction', opId: op(), profileId: b, decision: 'suspend', rule: 'illegal', days: 7 })).status, 400);
    assert.equal((await call('um', null, { action: 'staff.sanction', opId: op(), profileId: b, decision: 'suspend', rule: 'spam' })).status, 403);

    // A restriction for a day: in force now, gone as soon as its time is up (before the worker runs), then lifted.
    const r = await call('um', null, { action: 'staff.restrict', opId: op(), profileId: b, on: true, rule: 'spam', days: 1 });
    assert.ok(r.until);
    assert.equal((await call('ub', b, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Купи' })).rule, 'restricted');
    await db.query(`update feture.profile set restricted_until = now() - interval '1 minute' where id = $1`, [b]);
    assert.equal((await call('ub', b, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Привет' })).seq, 1);
    assert.equal(await sweepExpiredSanctions(db), 1);
    const [rp] = await db.query('select restricted_at, restricted_until from feture.profile where id = $1', [b]);
    assert.equal(rp.restricted_at, null); assert.equal(rp.restricted_until, null);

    // A moderator suspends for 3 days; the worker restores the profile and the account when it runs out.
    const s = await call('um', null, { action: 'staff.sanction', opId: op(), profileId: b, decision: 'suspend', rule: 'spam', days: 3 });
    assert.equal(s.state, 'suspended');
    assert.equal(await sweepExpiredSanctions(db), 0); // not yet
    await db.query(`update feture.profile set suspended_until = now() - interval '1 minute' where id = $1`, [b]);
    assert.equal(await sweepExpiredSanctions(db), 1);
    const [sp] = await db.query(`select p.state, p.suspended_until, a.state account from feture.profile p join feture.account a on a.person_profile_id = p.id where p.id = $1`, [b]);
    assert.deepEqual({ ...sp }, { state: 'active', suspended_until: null, account: 'active' });
    const lines = await db.query(`select staff_account_id, action from feture.staff_action where target_id = $1 and action like '%.expired' order by created_at`, [b]);
    assert.deepEqual(lines.map(l => [l.staff_account_id, l.action]), [[null, 'restrict.expired'], [null, 'sanction.expired']]);
    const told = await db.query(`select payload from feture.outbox where topic in ('profile.suspended', 'profile.restricted') and payload->>'days' is not null`);
    assert.equal(told.length, 2);
  } finally { await pg.close(); }
});

test('report evidence: staff open the media of picked chat messages while the report is open, nothing else of the chat', async () => {
  const { pg, db, call, member } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira');
    await call('ua', a, { action: 'discover.decide', opId: op(), profileId: b, decision: 'like' });
    const conv = (await call('ub', b, { action: 'like.send', opId: op(), profileId: a, source: 'likes' })).conversationId;
    const picked = await call('ub', b, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Фото' });
    const other = await call('ub', b, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Ещё фото' });
    const [{ account_id: kira }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [b]);
    const media = async (/** @type {string} */ messageId) => {
      const [m] = await db.query(
        `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
         values ($1, $2, 'image', 'chat', 'c/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [b, kira]);
      await db.query('update feture.message set media_asset_id = $1 where id = $2', [m.id, messageId]);
      return m.id;
    };
    const shown = await media(picked.id), hidden = await media(other.id);
    assert.equal((await call('um', null, { action: 'staff.mediaView', assetId: shown })).status, 409); // no report yet
    await call('ua', a, { action: 'report.create', opId: op(), targetType: 'conversation', targetId: conv, messageIds: [picked.id], reason: 'threat', details: 'Подробности для модератора' });
    const card = (await call('um', null, { action: 'staff.reportQueue' })).items.find((/** @type {any} */ i) => i.targetType === 'conversation');
    assert.deepEqual(card.evidence.map((/** @type {any} */ e) => e.assetId), [shown]);
    assert.equal((await call('um', null, { action: 'staff.mediaView', assetId: shown })).ok, true);
    assert.equal((await call('um', null, { action: 'staff.mediaView', assetId: hidden })).status, 409); // not picked
    assert.equal((await db.query(`select count(*)::int n from feture.staff_action where action = 'media.view' and target_id = $1`, [shown]))[0].n, 1);
    await call('um', null, { action: 'staff.reportDecide', opId: op(), targetType: 'conversation', targetId: conv, decision: 'keep', reportedProfileId: b });
    assert.equal((await call('um', null, { action: 'staff.mediaView', assetId: shown })).status, 409); // closed
  } finally { await pg.close(); }
});
