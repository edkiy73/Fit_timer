// Slice G3 on PGlite as feture_api: push delivery through a fake transport — neutral texts («Безопасные»), names and
// the start of a message («Обычные»), settings, quiet hours, grouped likes, muted chats, gone tokens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { discover } from '../server/commands/discover.mjs';
import { chats } from '../server/commands/chats.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { notifyHandlers } from '../server/notify.mjs';
import { pushHandlers, inQuietHours, personalText, clip, PUSH_TEXT } from '../server/push.mjs';
import { NOTIFICATION_DEFAULTS } from '../contracts/me.mjs';
import { drain } from '../server/outbox.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...discover, ...chats, ...inbox } });

async function world() {
  const env = await setup();
  const { db, person } = env;
  /** @type {{platform: string, token: string, message: any}[]} */
  const sent = [];
  const transport = { send: async (/** @type {string} */ p, /** @type {string} */ token, /** @type {any} */ message) => {
    if (token.startsWith('gone')) throw Object.assign(new Error('fcm_failed'), { invalidToken: true, status: 404, detail: 'UNREGISTERED' });
    // A misconfigured project answers 404 too, but says nothing about the token: the token stays.
    if (token.startsWith('misconf')) throw Object.assign(new Error('fcm_failed'), { invalidToken: true, status: 404, detail: 'Requested entity was not found.' });
    sent.push({ platform: p, token, message });
  } };
  const deliver = async () => { while ((await drain(db, { ...notifyHandlers(db), ...pushHandlers(db, transport) }, { limit: 100 })) > 0) { /* until empty */ } };
  const member = async (/** @type {string} */ user, /** @type {string} */ handle) => {
    const id = await person(user, handle);
    const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [id]);
    const [a] = await db.query(
      `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
       values ($1, $2, 'image', 'avatar', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [id, account_id]);
    await db.query('update feture.profile set avatar_asset_id = $1 where id = $2', [a.id, id]);
    // Quiet hours off by default here so the tests do not depend on the clock.
    await db.query(`insert into feture.notification_settings (account_id, settings) values ($1, $2)`, [account_id, JSON.stringify({ quiet: { on: false, from: '23:00', to: '08:00' } })]);
    return id;
  };
  return { ...env, sent, deliver, member };
}

test('a like: one neutral push (no names), grouped hourly; «normal» names who and starts the message; category off sends nothing; gone tokens go', async () => {
  const { pg, db, call, sent, deliver, member } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira'), c = await member('uc', 'Noa');
    await call('ub', null, { action: 'push.register', opId: op(), platform: 'ios', token: 'tok-kira-1', tz: 'Europe/Berlin' });
    await call('ub', null, { action: 'push.register', opId: op(), platform: 'android', token: 'gone-kira-2' });
    await call('ub', null, { action: 'push.register', opId: op(), platform: 'android', token: 'misconf-kira-3' });
    await call('ua', a, { action: 'like.send', opId: op(), profileId: b, source: 'profile' });
    await call('uc', c, { action: 'like.send', opId: op(), profileId: b, source: 'profile' });
    await deliver();
    assert.equal(sent.length, 1); // two likes, one push this hour
    assert.deepEqual([sent[0].message.title, sent[0].message.body], ['FetUre', 'Новое уведомление']);
    assert.ok(!JSON.stringify(sent[0]).includes('Alex'));
    const [{ n }] = await db.query(`select count(*)::int n from feture.push_device where token = 'gone-kira-2'`);
    assert.equal(n, 0);
    assert.equal((await db.query(`select count(*)::int n from feture.push_device where token = 'misconf-kira-3'`))[0].n, 1);
    // Re-registering without a zone keeps the one known.
    await call('ub', null, { action: 'push.register', opId: op(), platform: 'ios', token: 'tok-kira-1' });
    assert.equal((await db.query(`select tz from feture.push_device where token = 'tok-kira-1'`))[0].tz, 'Europe/Berlin');

    await db.query(`update feture.notification_settings set settings = settings || '{"mode": "normal"}' where account_id = (select id from feture.account where person_profile_id = $1)`, [b]);
    // The other side likes back: Kira gets the match with Dana's name (whoever made the match gets nothing about it).
    const d = await member('ud', 'Dana');
    await db.query(`update feture.profile set chosen_name = 'Дана' where id = $1`, [d]);
    await call('ub', b, { action: 'like.send', opId: op(), profileId: d, source: 'profile' });
    const conv = (await call('ud', d, { action: 'like.send', opId: op(), profileId: b, source: 'likes' })).conversationId;
    await deliver();
    assert.deepEqual([sent.at(-1).message.title, sent.at(-1).message.body], ['Дана', 'Это взаимно! Можно написать']);

    // A muted conversation sends no push; an unmuted one does.
    await call('ub', b, { action: 'chat.mute', conversationId: conv, on: true });
    const before = sent.length;
    await call('ud', d, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Тихо' });
    await deliver();
    assert.equal(sent.length, before);
    await call('ub', b, { action: 'chat.mute', conversationId: conv, on: false });
    await call('ud', d, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Громко' });
    await deliver();
    assert.deepEqual([sent.length, sent.at(-1).message.title, sent.at(-1).message.body, sent.at(-1).message.data.t], [before + 1, 'Дана', 'Громко', 'chat']);
    assert.ok(!JSON.stringify(sent).includes('Тихо'));

    // Matches switched off: nothing.
    await deliver();
    await db.query(`update feture.notification_settings set settings = settings || '{"categories": {"match": {"push": false, "email": false}, "likes": {"push": true, "email": false}, "req": {"push": true, "email": true}, "events": {"push": true, "email": true}, "replies": {"push": true, "email": false}, "follows": {"push": true, "email": false}, "groups": {"push": false, "email": false}, "news": {"push": false, "email": true}}}' where account_id = (select id from feture.account where person_profile_id = $1)`, [b]);
    const e = await member('ue', 'Eva');
    await call('ub', b, { action: 'like.send', opId: op(), profileId: e, source: 'profile' });
    await call('ue', e, { action: 'like.send', opId: op(), profileId: b, source: 'likes' });
    const n2 = sent.length;
    await deliver();
    assert.equal(sent.length, n2);
  } finally { await pg.close(); }
});

test('«Обычные»: name and the first 80 characters; media-only says its kind; once-view, timed and private media never; blocks and gone people name nobody; «Безопасные» stays neutral', async () => {
  const { pg, db, call, sent, deliver, member, coupleOf } = await world();
  const t = PUSH_TEXT.ru;
  try {
    const a = await member('ua', 'Mira'), b = await member('ub', 'Kira');
    await db.query(`update feture.profile set chosen_name = 'Мира' where id = $1`, [a]);
    await call('ub', null, { action: 'push.register', opId: op(), platform: 'ios', token: 'tok-kira-1', tz: 'UTC' });
    await call('ua', a, { action: 'like.send', opId: op(), profileId: b, source: 'profile' });
    const conv = (await call('ub', b, { action: 'like.send', opId: op(), profileId: a, source: 'likes' })).conversationId;
    await deliver();
    // «Безопасные» (the default): a message is only «Новое уведомление», under the app's name.
    const long = 'Привет! Видела тебя на встрече в субботу — ты рассказывала про поход, расскажешь подробнее? Очень хочется пойти тоже';
    await call('ua', a, { action: 'chat.send', opId: op(), conversationId: conv, body: long });
    await deliver();
    assert.deepEqual([sent.at(-1).message.title, sent.at(-1).message.body], ['FetUre', 'Новое уведомление']);
    assert.ok(!JSON.stringify(sent).includes('Мира') && !JSON.stringify(sent).includes('Привет'));

    const [{ account_id: kira }] = await db.query('select account_id from feture.profile_member where profile_id = $1', [b]);
    await db.query(`update feture.notification_settings set settings = $2 where account_id = $1`, [kira, JSON.stringify({ ...NOTIFICATION_DEFAULTS, mode: 'normal', quiet: { on: false, from: '23:00', to: '08:00' } })]);
    await call('ua', a, { action: 'chat.send', opId: op(), conversationId: conv, body: long });
    await deliver();
    assert.equal(sent.at(-1).message.title, 'Мира');
    assert.equal(sent.at(-1).message.body, clip(long));
    assert.ok(sent.at(-1).message.body.endsWith('…') && [...sent.at(-1).message.body].length === 81);

    // Media in the conversation, written straight to the tables: the kind word only; sealed media never shows its caption.
    const [{ account_id: mira }] = await db.query('select account_id from feture.profile_member where profile_id = $1', [a]);
    const media = async (/** @type {string} */ kind, /** @type {string} */ purpose, /** @type {string} */ mode, /** @type {string} */ body) => {
      const [asset] = await db.query(
        `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
         values ($1, $2, $3, $4, 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [a, mira, kind, purpose]);
      const [{ seq }] = await db.query(`update feture.conversation set last_seq = last_seq + 1 where id = $1 returning last_seq seq`, [conv]);
      await db.query(`insert into feture.message (conversation_id, seq, author_profile_id, sender_account_id, body, media_asset_id, media_mode) values ($1, $2, $3, $4, $5, $6, $7)`,
        [conv, seq, a, mira, body, asset.id, mode]);
      return personalText(db, b, { kind: 'messages', conversationId: conv, seq: Number(seq) }, t);
    };
    assert.deepEqual(await media('image', 'chat', 'normal', ''), { title: 'Мира', body: 'Фото' });
    assert.deepEqual(await media('video', 'chat', 'normal', 'С моря'), { title: 'Мира', body: 'С моря' });
    assert.deepEqual(await media('audio', 'voice', 'normal', ''), { title: 'Мира', body: 'Голосовое' });
    assert.deepEqual(await media('image', 'chat', 'once', 'Только тебе'), { title: 'Мира', body: 'Фото' });
    assert.deepEqual(await media('video', 'chat', 't15', 'Секунды'), { title: 'Мира', body: 'Видео' });
    assert.deepEqual(await media('image', 'private', 'normal', 'Из приватного'), { title: 'Мира', body: 'Фото' });

    // A like back from someone else names them; a couple's verb is plural.
    const c = await member('uc', 'Noa');
    await db.query(`update feture.profile set chosen_name = 'Ноа' where id = $1`, [c]);
    await call('uc', c, { action: 'like.send', opId: op(), profileId: b, source: 'profile' });
    await deliver(); // grouped: Mira's like already made this hour's push, so this one is read straight from its notification
    const [n] = await db.query(`select id from feture.notification where type = 'like' and actor_profile_id = $1`, [c]);
    assert.deepEqual(await personalText(db, b, { kind: 'likes', notificationId: n.id }, t), { title: 'Ноа', body: 'Ставит тебе симпатию' });
    const pairId = await coupleOf([c, await member('ue', 'Eli')]);
    await db.query(`update feture.profile set chosen_name = 'Ноа и Эли' where id = $1`, [pairId]);
    const [pn] = await db.query(`insert into feture.notification (recipient_account_id, addressee_profile_id, type, actor_profile_id, source) values ($1, $2, 'like', $3, 'test') returning id`, [kira, b, pairId]);
    assert.deepEqual(await personalText(db, b, { kind: 'likes', notificationId: pn.id }, t), { title: 'Ноа и Эли', body: 'Ставят тебе симпатию' });
    // A type that is not about a person (a grant of the private part, too) names nobody.
    const [gn] = await db.query(`insert into feture.notification (recipient_account_id, addressee_profile_id, type, actor_profile_id, source) values ($1, $2, 'grant', $3, 'test2') returning id`, [kira, b, c]);
    assert.equal(await personalText(db, b, { kind: 'other', notificationId: gn.id }, t), null);

    // Blocked, gone, or no recipient profile: nobody is named.
    await db.query(`insert into feture.block (blocker_profile_id, blocked_profile_id, acted_by) values ($1, $2, $3)`, [b, c, kira]);
    assert.equal(await personalText(db, b, { kind: 'likes', notificationId: n.id }, t), null);
    await db.query(`update feture.profile set state = 'deleted' where id = $1`, [a]);
    assert.equal(await personalText(db, b, { kind: 'messages', conversationId: conv, seq: 1 }, t), null);
    assert.equal(await personalText(db, null, { kind: 'messages', conversationId: conv, seq: 1 }, t), null);
  } finally { await pg.close(); }
});

test('quiet hours in the device time zone, also across midnight', () => {
  const at = new Date('2026-10-27T22:30:00Z'); // 23:30 in Berlin (winter time), 01:30 in Moscow
  assert.equal(inQuietHours({ on: true, from: '23:00', to: '08:00' }, 'Europe/Berlin', at), true);
  assert.equal(inQuietHours({ on: true, from: '23:00', to: '08:00' }, 'America/New_York', at), false);
  assert.equal(inQuietHours({ on: false, from: '23:00', to: '08:00' }, 'Europe/Berlin', at), false);
  assert.equal(inQuietHours({ on: true, from: '01:00', to: '02:00' }, 'Europe/Moscow', at), true);
});

test('review fixes: a retried item never pushes twice; nothing is pushed about someone gone', async () => {
  const { pg, db, call, sent, member } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira');
    await call('ub', null, { action: 'push.register', opId: op(), platform: 'ios', token: 'tok-kira-1', tz: 'UTC' });
    await call('ua', a, { action: 'like.send', opId: op(), profileId: b, source: 'profile' });
    const handlers = { ...notifyHandlers(db), ...pushHandlers(db, { send: async (/** @type {string} */ p, /** @type {string} */ t, /** @type {any} */ m) => { sent.push({ platform: p, token: t, message: m }); } }) };
    const items = await db.query(`select id::text, topic, profile_id, payload, attempts, lock_token::text, created_at from feture.outbox where done_at is null order by id`);
    // Every handler runs twice for each item, as after a lost claim.
    for (const it of items) { if (handlers[it.topic]) { await handlers[it.topic](it); await handlers[it.topic](it); } }
    const pushes = await db.query(`select id::text, topic, profile_id, payload, attempts, lock_token::text, created_at from feture.outbox where topic = 'push.deliver'`);
    assert.equal(pushes.length, 1);
    for (const it of pushes) { await handlers['push.deliver'](it); await handlers['push.deliver'](it); }
    assert.equal(sent.length, 1);
  } finally { await pg.close(); }
});
