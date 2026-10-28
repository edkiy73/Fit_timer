// Message requests (owner 29.10.2026) on PGlite as feture_api: «Написать» without a mutual like. Who may write
// («Кто может мне писать»), where the two know each other from, one first message and «Подожди ответа», the recipient's
// «Запросы» (answer / hide / report and block), the 30-day hide, the daily limit, blocks, restrictions, adults,
// persona hiding, couples (partner approval, both partners receive), notifications and realtime signals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { discover } from '../server/commands/discover.mjs';
import { chats } from '../server/commands/chats.mjs';
import { couples } from '../server/commands/couples.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { notifyHandlers } from '../server/notify.mjs';
import { drain } from '../server/outbox.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

/** @type {{profile: string | null | undefined, kind: string}[]} */
let signals = [];
const setup = () => baseSetup({
  commands: { ...platform, ...me, ...social, ...posts, ...discover, ...chats, ...couples, ...inbox },
  signals: () => ({ channels: async () => ({}), send: async (/** @type {any} */ s) => { signals.push(...[s].flat()); } }),
});

async function world() {
  const env = await setup();
  const { db, call, person } = env;
  signals = [];
  /** A registered person outside Discover (the default for new accounts). */
  const member = (/** @type {string} */ user, /** @type {string} */ handle, opts = {}) => person(user, handle, { discover: null, ...opts });
  const follow = (/** @type {string} */ u, /** @type {string} */ from, /** @type {string} */ to) => call(u, from, { action: 'follow.set', opId: op(), profileId: to, on: true });
  const request = (/** @type {string} */ u, /** @type {string} */ from, /** @type {string} */ to, body = 'Привет! Видел тебя в сообществе', extra = {}) =>
    call(u, from, { action: 'chat.request', opId: op(), profileId: to, body, ...extra });
  const lists = async (/** @type {string} */ u) => call(u, null, { action: 'chats.list' });
  const setting = (/** @type {string} */ u, /** @type {string} */ p, /** @type {string} */ value) => call(u, p, { action: 'profile.setVisibility', opId: op(), setting: 'messagesFrom', value });
  const deliver = async () => { while ((await drain(db, notifyHandlers(db), { limit: 50 })) > 0) { /* until empty */ } };
  /** A published community both profiles are active members of. */
  const community = async (/** @type {string[]} */ ids, name = 'Книжный клуб') => {
    const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [ids[0]]);
    const [{ id }] = await db.query(
      `insert into feture.community (owner_profile_id, created_by, name, description, topics, privacy, rules, state)
       values ($1, $2, $3, 'Обсуждаем книги и встречаемся раз в месяц', '{books}', 'open', '{Будь добрым}', 'published') returning id`, [ids[0], account_id, name]);
    for (const p of ids) await db.query(`insert into feture.community_member (community_id, profile_id, role) values ($1, $2, $3)`, [id, p, p === ids[0] ? 'owner' : 'member']);
    return id;
  };
  /** A published online event; `going` profiles answered «Иду». */
  const event = async (/** @type {string} */ organizer, /** @type {string[]} */ going, title = 'Вечер настолок') => {
    const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [organizer]);
    const [{ id }] = await db.query(
      `insert into feture.event (organizer_profile_id, created_by, title, kind, description, format, join_url, tz, starts_at, ends_at, state)
       values ($1, $2, $3, 'meetup', 'Играем в настолки онлайн, приходи с хорошим настроением', 'online', 'https://meet.test/x', 'Europe/Berlin',
         now() + interval '20 days', now() + interval '20 days 2 hours', 'published') returning id`, [organizer, account_id, title]);
    for (const p of going) {
      const [{ account_id: acc }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [p]);
      await db.query(`insert into feture.event_rsvp (event_id, profile_id, status, acted_by) values ($1, $2, 'going', $3)`, [id, p, acc]);
    }
    return id;
  };
  const photo = async (/** @type {string} */ profileId) => {
    const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [profileId]);
    const [a] = await db.query(
      `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
       values ($1, $2, 'image', 'chat', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [profileId, account_id]);
    return a.id;
  };
  return { ...env, member, follow, request, lists, setting, deliver, community, event, photo };
}

test('who may write: «known» by default (follower, community, event), «all», «none»; context names where they met', async () => {
  const { pg, call, member, follow, request, setting, community, event } = await world();
  try {
    const kira = await member('uk', 'Kira'), alex = await member('ua', 'Alex'), noa = await member('un', 'Noa'), eva = await member('ue', 'Eva'), max = await member('um', 'Max');
    // A stranger: the default «Подписчики и люди из моих сообществ и событий» refuses, and «Написать» says so first.
    assert.deepEqual((await call('ua', alex, { action: 'profile.settings' })).settings.messagesFrom, 'known');
    const w = await call('um', max, { action: 'chat.with', profileId: kira });
    assert.deepEqual([w.conversationId, w.canRequest, w.rule], [null, false, 'messages_known']);
    assert.equal((await request('um', max, kira)).rule, 'messages_known');

    // A follower, a member of the same community, someone going to the same event.
    await follow('ua', alex, kira);
    await community([kira, noa]);
    await event(kira, [eva]);
    const wa = await call('ua', alex, { action: 'chat.with', profileId: kira });
    assert.deepEqual([wa.canRequest, wa.context, wa.left, wa.max], [true, [{ kind: 'follows' }], 10, 10]);
    assert.equal((await request('ua', alex, kira)).state, 'request');
    const rn = await request('un', noa, kira);
    assert.equal(rn.state, 'request');
    const re = await request('ue', eva, kira);
    const reqs = (await call('uk', null, { action: 'chats.list' })).requests;
    assert.equal(reqs.length, 3);
    const ctx = Object.fromEntries(reqs.map((/** @type {any} */ r) => [r.other.handle, r.request.context]));
    assert.deepEqual(ctx.Alex, [{ kind: 'follows' }]);
    assert.deepEqual(ctx.Noa.map((/** @type {any} */ c) => [c.kind, c.name]), [['community', 'Книжный клуб']]);
    assert.deepEqual(ctx.Eva.map((/** @type {any} */ c) => [c.kind, c.title]), [['event', 'Вечер настолок']]);
    assert.ok(ctx.Eva[0].startsAt);
    assert.ok(re.conversationId);

    // «Все»: a stranger may write (no shared context); «Никто»: not even a follower.
    await setting('uk', kira, 'all');
    assert.equal((await request('um', max, kira)).state, 'request');
    const zed = await member('uz', 'Zed');
    await setting('uz', zed, 'none');
    await follow('ua', alex, zed);
    assert.equal((await request('ua', alex, zed)).rule, 'messages_closed');
    assert.equal((await call('ua', alex, { action: 'chat.with', profileId: zed })).rule, 'messages_closed');
  } finally { await pg.close(); }
});

test('one first message, «Подожди ответа», reading does not tell the sender, answering makes a normal chat both write in', async () => {
  const { pg, db, call, member, follow, request, lists, deliver } = await world();
  try {
    const kira = await member('uk', 'Kira'), alex = await member('ua', 'Alex');
    await follow('ua', alex, kira);
    signals = [];
    const r = await request('ua', alex, kira);
    const conv = r.conversationId;
    // The recipient's side hears «chat» (the requests folder updates live).
    assert.ok(signals.some(s => s.profile === kira && s.kind === 'chat'));

    // Sender: the conversation is in their chats as a waiting request; no second message.
    const mine = (await lists('ua')).items;
    assert.deepEqual([mine.length, mine[0].id, mine[0].request.role], [1, conv, 'sender']);
    assert.ok(Date.parse(mine[0].request.renewAt) > Date.now() + 29 * 864e5);
    assert.equal((await call('ua', alex, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Ну что?' })).rule, 'request_pending');
    const again = await request('ua', alex, kira, 'Ещё раз');
    assert.deepEqual([again.status, again.rule, again.conversationId], [409, 'request_pending', conv]);
    assert.equal((await call('ua', alex, { action: 'chat.with', profileId: kira })).conversationId, conv);

    // Recipient: not a chat (no unread, no badge), a request with a count.
    let theirs = await lists('uk');
    assert.deepEqual([theirs.items.length, theirs.requests.length, theirs.requests[0].request.role], [0, 1, 'recipient']);
    let counts = await call('uk', null, { action: 'inbox.counts' });
    assert.deepEqual([counts.chats, counts.requests, counts.newMatches], [0, 1, 0]);
    const msgs = await call('uk', kira, { action: 'chat.messages', conversationId: conv });
    assert.deepEqual([msgs.items.length, msgs.items[0].body, msgs.request.role], [1, 'Привет! Видел тебя в сообществе', 'recipient']);
    await call('uk', kira, { action: 'chat.read', conversationId: conv, upToSeq: 1 });
    assert.equal((await call('ua', alex, { action: 'chat.messages', conversationId: conv })).otherRead, 0);

    // A notification «запрос» for the recipient (not a «new message» push), none for the sender.
    await deliver();
    const notes = await db.query(`select n.type, n.object_id, a.person_profile_id to_profile from feture.notification n join feture.account a on a.id = n.recipient_account_id where n.type <> 'follow'`);
    assert.deepEqual(notes.map(n => [n.type, n.object_id, n.to_profile]), [['chatRequest', conv, kira]]);
    assert.equal((await db.query(`select count(*)::int n from feture.outbox where topic = 'message.created'`))[0].n, 0);

    // «Ответить»: a normal chat for both; both write; read receipts work again.
    assert.equal((await call('uk', kira, { action: 'chat.requestAnswer', opId: op(), conversationId: conv, answer: 'accept' })).state, 'accepted');
    theirs = await lists('uk');
    assert.deepEqual([theirs.items.length, theirs.requests.length, theirs.items[0].request], [1, 0, null]);
    assert.equal((await call('ua', alex, { action: 'chat.messages', conversationId: conv })).otherRead, 1);
    assert.equal((await call('uk', kira, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Привет!' })).seq, 2);
    assert.equal((await call('ua', alex, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Рад!' })).seq, 3);
    assert.equal((await lists('ua')).items[0].request, null);
    counts = await call('uk', null, { action: 'inbox.counts' });
    assert.deepEqual([counts.chats, counts.requests], [1, 0]);
    // A second «Ответить» is refused; «Написать» now opens the chat.
    assert.equal((await call('uk', kira, { action: 'chat.requestAnswer', opId: op(), conversationId: conv, answer: 'accept' })).rule, 'not_request');
    assert.equal((await call('uk', kira, { action: 'chat.with', profileId: alex })).conversationId, conv);

    // «Прекратить общение» ends a chat that began as a request; asking again waits 30 days.
    assert.equal((await call('uk', kira, { action: 'match.end', opId: op(), profileId: alex })).ended, true);
    assert.equal((await call('ua', alex, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Эй' })).rule, 'ended');
    assert.equal((await request('ua', alex, kira)).rule, 'request_wait');
  } finally { await pg.close(); }
});

test('writing back answers the request; a photo request goes with its photo; the recipient writing first to a sender joins their request', async () => {
  const { pg, db, call, member, follow, request, lists, setting, photo } = await world();
  try {
    const kira = await member('uk', 'Kira'), alex = await member('ua', 'Alex'), noa = await member('un', 'Noa');
    await follow('ua', alex, kira);
    const asset = await photo(alex);
    const r = await request('ua', alex, kira, '', { assetId: asset });
    const msg = (await call('uk', kira, { action: 'chat.messages', conversationId: r.conversationId })).items[0];
    assert.ok(msg.media);
    // The same photo cannot go out twice.
    await setting('un', noa, 'all');
    assert.equal((await request('ua', alex, noa, 'тоже', { assetId: asset })).rule, 'already_sent');
    // Only text or a photo: an empty request is refused by the contract.
    assert.equal((await request('ua', alex, noa, '   ')).status, 400);

    // Kira answers by writing back.
    await call('uk', kira, { action: 'chat.send', opId: op(), conversationId: r.conversationId, body: 'Красивое фото' });
    assert.equal((await lists('uk')).requests.length, 0);
    assert.equal((await lists('ua')).items[0].request, null);

    // Noa received Alex's request; Noa pressing «Написать» on Alex sends into it (it answers it), not a second request.
    const r2 = await request('ua', alex, noa, 'Привет, Ноа');
    const back = await request('un', noa, alex, 'Привет!');
    assert.deepEqual([back.state, back.conversationId], ['chat', r2.conversationId]);
    const [{ n }] = await db.query(`select count(*)::int n from feture.conversation where profile_a = least($1::uuid, $2::uuid) and profile_b = greatest($1::uuid, $2::uuid)`, [alex, noa]);
    assert.equal(n, 1);
  } finally { await pg.close(); }
});

test('«Скрыть»: gone for the recipient, the sender sees it waiting as before and may ask again only after 30 days', async () => {
  const { pg, db, call, member, follow, request, lists, deliver } = await world();
  try {
    const kira = await member('uk', 'Kira'), alex = await member('ua', 'Alex');
    await follow('ua', alex, kira);
    const { conversationId: conv } = await request('ua', alex, kira);
    await deliver();
    const before = (await lists('ua')).items[0];
    signals = [];
    assert.equal((await call('uk', kira, { action: 'chat.requestAnswer', opId: op(), conversationId: conv, answer: 'hide' })).state, 'hidden');
    // Nothing reaches the sender: no signal, no notification; their view is exactly the waiting one.
    assert.ok(!signals.some(s => s.profile === alex));
    await deliver();
    assert.equal((await db.query(`select count(*)::int n from feture.notification n join feture.account a on a.id = n.recipient_account_id where a.person_profile_id = $1`, [alex]))[0].n, 0);
    const after = (await lists('ua')).items[0];
    assert.deepEqual(after.request, before.request);
    assert.equal((await call('ua', alex, { action: 'chat.messages', conversationId: conv })).request.role, 'sender');
    // The recipient: no request, no chat, the conversation is not found; its notification is taken back.
    const theirs = await lists('uk');
    assert.deepEqual([theirs.items.length, theirs.requests.length], [0, 0]);
    assert.equal((await call('uk', kira, { action: 'chat.messages', conversationId: conv })).status, 404);
    assert.equal((await call('uk', null, { action: 'inbox.counts' })).requests, 0);
    assert.ok((await db.query(`select retracted_at from feture.notification where object_id = $1`, [conv]))[0].retracted_at);

    // Within 30 days the sender is told to wait (the same as for an unanswered request).
    assert.equal((await request('ua', alex, kira, 'Ты тут?')).rule, 'request_pending');
    // After 30 days it may go again, into the same conversation, and reaches the recipient again.
    await db.query(`update feture.conversation set request_at = now() - interval '31 days' where id = $1`, [conv]);
    const again = await request('ua', alex, kira, 'Прошёл месяц — привет ещё раз');
    assert.deepEqual([again.state, again.conversationId], ['request', conv]);
    const reqs = (await lists('uk')).requests;
    assert.deepEqual([reqs.length, reqs[0].last.body], [1, 'Прошёл месяц — привет ещё раз']);
  } finally { await pg.close(); }
});

test('«Пожаловаться и заблокировать»: a report to moderators, a block, the request gone; reported requests lower the daily limit', async () => {
  const { pg, db, call, member, request, lists, setting } = await world();
  try {
    const kira = await member('uk', 'Kira'), alex = await member('ua', 'Alex');
    await setting('uk', kira, 'all');
    const { conversationId: conv } = await request('ua', alex, kira, 'Купи подписку на мой канал!!!');
    const msg = (await call('uk', kira, { action: 'chat.messages', conversationId: conv })).items[0];
    const rep = await call('uk', kira, { action: 'report.create', opId: op(), targetType: 'conversation', targetId: conv, messageIds: [msg.id], reason: 'spam', details: 'Рассылает рекламу всем подряд', alsoBlock: true });
    assert.equal(rep.reported, true);
    const [c] = await db.query('select request_state, state, ended_reason from feture.conversation where id = $1', [conv]);
    assert.deepEqual([c.request_state, c.state, c.ended_reason], ['reported', 'ended', 'block']);
    assert.equal((await db.query(`select count(*)::int n from feture.report where target_type = 'conversation' and target_id = $1`, [conv]))[0].n, 1);
    assert.equal((await lists('uk')).requests.length, 0);
    // Blocked both ways: the sender cannot write again, nor see the conversation.
    assert.equal((await request('ua', alex, kira, 'Почему?')).status, 404);
    assert.equal((await call('ua', alex, { action: 'chat.with', profileId: kira })).status, 404);
    assert.equal((await call('ua', alex, { action: 'chat.messages', conversationId: conv })).status, 404);
  } finally { await pg.close(); }
});

test('daily limit: 10 new requests a day, 3 after several were hidden or reported lately; the limit is a rate refusal', async () => {
  const { pg, db, call, member, request, setting } = await world();
  try {
    const alex = await member('ua', 'Alex');
    const targets = [];
    for (let i = 0; i < 12; i++) { const p = await member('t' + i, 'Target' + i); await setting('t' + i, p, 'all'); targets.push(p); }
    for (let i = 0; i < 10; i++) assert.equal((await request('ua', alex, targets[i])).state, 'request', 'request ' + i);
    const no = await request('ua', alex, targets[10]);
    assert.deepEqual([no.status, no.error ?? no.code, no.rule, no.max], [429, 'rate_limited', 'requests_day', 10]);
    const w = await call('ua', alex, { action: 'chat.with', profileId: targets[10] });
    assert.deepEqual([w.canRequest, w.rule, w.left], [false, 'requests_day', 0]);

    // A day later, with three of them hidden in the last two weeks: three a day.
    await db.query(`update feture.conversation set request_at = request_at - interval '2 days' where request_from = $1`, [alex]);
    for (let i = 0; i < 3; i++) {
      const [{ id }] = await db.query(`select id from feture.conversation where request_from = $1 and (profile_a = $2 or profile_b = $2)`, [alex, targets[i]]);
      assert.equal((await call('t' + i, targets[i], { action: 'chat.requestAnswer', opId: op(), conversationId: id, answer: 'hide' })).state, 'hidden');
    }
    assert.equal((await call('ua', alex, { action: 'chat.with', profileId: targets[10] })).max, 3);
    const more = [];
    for (let i = 0; i < 4; i++) { const p = await member('m' + i, 'More' + i); await setting('m' + i, p, 'all'); more.push(p); }
    for (let i = 0; i < 3; i++) assert.equal((await request('ua', alex, more[i])).state, 'request');
    assert.equal((await request('ua', alex, more[3])).rule, 'requests_day');
  } finally { await pg.close(); }
});

test('blocks, restrictions, deleted accounts, minors, persona hiding and related profiles are refused on the server', async () => {
  const { pg, db, call, member, request, setting, coupleOf } = await world();
  try {
    const kira = await member('uk', 'Kira'), alex = await member('ua', 'Alex'), bob = await member('ub', 'Bob'), dan = await member('ud', 'Dan');
    await setting('uk', kira, 'all');
    // A block either way hides the person: not found.
    await call('uk', kira, { action: 'block.set', opId: op(), profileId: bob, on: true });
    assert.equal((await request('ub', bob, kira)).status, 404);
    assert.equal((await call('ub', bob, { action: 'chat.with', profileId: kira })).status, 404);
    await call('ua', alex, { action: 'block.set', opId: op(), profileId: kira, on: true });
    assert.equal((await request('ua', alex, kira)).status, 404);
    await call('ua', alex, { action: 'block.set', opId: op(), profileId: kira, on: false });

    // A restricted sender may not start anything; a restricted recipient takes nothing new.
    await db.query('update feture.profile set restricted_at = now() where id = $1', [alex]);
    assert.deepEqual([(await request('ua', alex, kira)).status, (await request('ua', alex, kira)).rule], [403, 'restricted']);
    await db.query('update feture.profile set restricted_at = null where id = $1', [alex]);
    await db.query('update feture.profile set restricted_at = now() where id = $1', [kira]);
    assert.equal((await request('ua', alex, kira)).status, 404);
    await db.query('update feture.profile set restricted_at = null where id = $1', [kira]);

    // An account without a confirmed adult birth date on either side: not found.
    await db.query(`update feture.account set birth_date = current_date - interval '17 years' where person_profile_id = $1`, [dan]);
    assert.equal((await request('ud', dan, kira)).status, 404);
    // A deleted profile is gone.
    const gone = await member('ug', 'Gone');
    await db.query(`update feture.profile set state = 'deleted' where id = $1`, [gone]);
    assert.equal((await request('ua', alex, gone)).status, 404);

    // Persona accounts (qa-…) are hidden from real people both ways.
    const qa = await member('qa-x', 'QaX');
    await setting('qa-x', qa, 'all');
    assert.equal((await request('ua', alex, qa)).status, 404);
    assert.equal((await request('qa-x', qa, kira)).status, 404);

    // One's own couple is not a stranger to write a request to.
    const pair = await coupleOf([alex, dan]);
    await setting('ua', pair, 'all');
    assert.equal((await request('ua', alex, pair)).rule, 'related');
    assert.equal((await request('ua', alex, kira)).state, 'request');
  } finally { await pg.close(); }
});

test('a mutual like still opens a chat at once, and turns a waiting request into it', async () => {
  const { pg, call, member, request, setting } = await world();
  try {
    const kira = await member('uk', 'Kira', { discover: 'visible' }), alex = await member('ua', 'Alex', { discover: 'visible' });
    // «Никто» does not stop a match.
    await setting('uk', kira, 'none');
    await call('ua', alex, { action: 'like.send', opId: op(), profileId: kira, source: 'profile' });
    const m = await call('uk', kira, { action: 'like.send', opId: op(), profileId: alex, source: 'profile' });
    assert.equal(m.state, 'matched');
    assert.equal((await call('ua', alex, { action: 'chat.send', opId: op(), conversationId: m.conversationId, body: 'Привет' })).seq, 1);
    assert.equal((await call('ua', alex, { action: 'chat.with', profileId: kira })).conversationId, m.conversationId);

    // A waiting request, then a mutual like: the same conversation, now a chat both write in.
    const noa = await member('un', 'Noa', { discover: 'visible' }), eva = await member('ue', 'Eva', { discover: 'visible' });
    await setting('ue', eva, 'all');
    const r = await request('un', noa, eva);
    await call('un', noa, { action: 'like.send', opId: op(), profileId: eva, source: 'profile' });
    const m2 = await call('ue', eva, { action: 'like.send', opId: op(), profileId: noa, source: 'profile' });
    assert.deepEqual([m2.state, m2.conversationId], ['matched', r.conversationId]);
    assert.equal((await call('un', noa, { action: 'chat.send', opId: op(), conversationId: r.conversationId, body: 'Ура' })).seq, 2);
    assert.equal((await call('ue', eva, { action: 'chats.list' })).requests.length, 0);
  } finally { await pg.close(); }
});

test('couples: send as the couple (with and without partner approval), both partners receive, couple to couple', async () => {
  const { pg, db, call, member, request, lists, setting, coupleOf, deliver } = await world();
  try {
    const ann = await member('ua', 'Ann'), ben = await member('ub', 'Ben'), kira = await member('uk', 'Kira');
    const cat = await member('uc', 'Cat'), dan = await member('ud', 'Dan');
    const us = await coupleOf([ann, ben]), them = await coupleOf([cat, dan]);
    await setting('uk', kira, 'all');
    await setting('uc', them, 'all');

    // Without approval: Ann writes as the couple at once; Kira sees the couple; Ben sees the waiting request too.
    const r = await request('ua', us, kira, 'Привет от нас');
    assert.equal(r.state, 'request');
    const k = (await lists('uk')).requests[0];
    assert.deepEqual([k.other.id, k.other.kind], [us, 'couple']);
    const benSees = (await lists('ub')).items.find((/** @type {any} */ i) => i.id === r.conversationId);
    assert.deepEqual([benSees.side.kind, benSees.request.role], ['couple', 'sender']);
    await deliver();
    assert.equal((await db.query(`select actor_profile_id from feture.notification where type = 'chatRequest'`))[0].actor_profile_id, us);

    // With approval: Ben asked to approve Ann's widening changes — the request waits for him.
    await db.query(`update feture.profile_member set approves_partner = true where profile_id = $1 and account_id = (select id from feture.account where person_profile_id = $2)`, [us, ben]);
    const p = await request('ua', us, them, 'Привет, пара!');
    assert.ok(p.pending?.approvalId, JSON.stringify(p));
    assert.equal((await lists('uc')).requests.length, 0);
    const list = await call('ub', us, { action: 'decide.approvals' });
    const ap = list.items.find((/** @type {any} */ a) => a.kind === 'chat.request');
    assert.deepEqual([ap.preview.profile.id, ap.preview.message.body], [them, 'Привет, пара!']);
    assert.equal((await call('ub', us, { action: 'decide.approval', opId: op(), approvalId: p.pending.approvalId, choice: 'approve' })).state, 'approved');
    // Couple → couple arrives, and both partners of the receiving couple have it.
    const catReq = (await lists('uc')).requests, danReq = (await lists('ud')).requests;
    assert.deepEqual([catReq.length, danReq.length, catReq[0].other.id, catReq[0].side.id], [1, 1, us, them]);
    // Either partner answers for the couple; then both sides write.
    assert.equal((await call('ud', them, { action: 'chat.requestAnswer', opId: op(), conversationId: catReq[0].id, answer: 'accept' })).state, 'accepted');
    assert.equal((await lists('uc')).requests.length, 0);
    assert.ok((await call('uc', them, { action: 'chat.send', opId: op(), conversationId: catReq[0].id, body: 'Рады!' })).seq);
    assert.ok((await call('ub', us, { action: 'chat.send', opId: op(), conversationId: catReq[0].id, body: 'Взаимно' })).seq);

    // A person → a couple: one partner hides it, it is gone for both.
    const eve = await member('ue', 'Eve');
    const toCat = await request('ue', eve, them, 'Привет вам');
    assert.equal((await call('uc', them, { action: 'chat.requestAnswer', opId: op(), conversationId: toCat.conversationId, answer: 'hide' })).state, 'hidden');
    assert.equal((await lists('ud')).requests.length, 0);
    assert.equal((await call('ud', them, { action: 'chat.messages', conversationId: toCat.conversationId })).status, 404);
  } finally { await pg.close(); }
});
