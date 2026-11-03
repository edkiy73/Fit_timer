// Slice G3 on PGlite as feture_api: push delivery through a fake transport — neutral texts («Безопасные»), names and
// the start of a message («Обычные»), settings, quiet hours, grouped likes, muted chats, gone tokens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { discover } from '../server/commands/discover.mjs';
import { chats } from '../server/commands/chats.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { couples } from '../server/commands/couples.mjs';
import { social } from '../server/commands/social.mjs';
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
    assert.deepEqual([sent[0].message.title, sent[0].message.body], ['KINHAZE', 'Новое уведомление']);
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
    assert.deepEqual([sent.at(-1).message.title, sent.at(-1).message.body], ['KINHAZE', 'Новое уведомление']);
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

// Delivery per device (push_delivery): retries of transient failures, gone tokens, timeouts, re-claims, two workers.
/** A transport scripted per token: each call takes the next step (`ok`, `fail` = 503, `net` = no status, `gone`, `hang`). */
function scripted(/** @type {Record<string, string[]>} */ plan) {
  /** @type {{token: string, message: any}[]} */
  const delivered = [];
  /** @type {Record<string, number>} */
  const calls = {};
  return { delivered, calls, send: async (/** @type {string} */ _p, /** @type {string} */ token, /** @type {any} */ message) => {
    calls[token] = (calls[token] ?? 0) + 1;
    const step = plan[token]?.[calls[token] - 1] ?? 'ok';
    if (step === 'fail') throw Object.assign(new Error('fcm_failed'), { status: 503, detail: 'UNAVAILABLE' });
    if (step === 'net') throw new Error('socket hang up');
    if (step === 'gone') throw Object.assign(new Error('fcm_failed'), { invalidToken: true, status: 404, detail: '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}' });
    if (step === 'hang') return new Promise(() => {});
    delivered.push({ token, message });
  } };
}

/** Drains until nothing is left, letting retries come due at once (the outbox backoff is seconds). */
async function drainAll(/** @type {any} */ db, /** @type {any} */ handlers) {
  for (let round = 0; round < 30; round++) {
    if ((await drain(db, handlers, { limit: 100 })) > 0) continue;
    const due = await db.query(`update feture.outbox set available_at = now() where done_at is null and available_at > now() and available_at <> 'infinity' returning id`);
    await db.query(`update feture.push_delivery set next_at = now() where state = 'queued'`);
    if (!due.length) return;
  }
  throw new Error('drainAll: still busy');
}

const deliveries = (/** @type {any} */ db) => db.query(
  `select d.token, x.state, x.attempts, x.last_error from feture.push_delivery x left join feture.push_device d on d.token_hash = x.token_hash order by d.token nulls last`);

test('push retries: a transient failure is retried for that device only (likes gate kept); gone tokens go and never block the others', async () => {
  const { pg, db, call, member } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira');
    await call('ub', null, { action: 'push.register', opId: op(), platform: 'ios', token: 'tok-okay-1', tz: 'UTC' });
    await call('ub', null, { action: 'push.register', opId: op(), platform: 'android', token: 'tok-flaky-1', tz: 'UTC' });
    await call('ub', null, { action: 'push.register', opId: op(), platform: 'android', token: 'tok-gone-1', tz: 'UTC' });
    const tr = scripted({ 'tok-flaky-1': ['fail', 'net'], 'tok-gone-1': ['gone'] });
    const handlers = { ...notifyHandlers(db), ...pushHandlers(db, tr) };
    await call('ua', a, { action: 'like.send', opId: op(), profileId: b, source: 'profile' });
    // First pass: the good device gets it, the flaky one waits for a retry, the gone one is dropped.
    while ((await drain(db, handlers, { limit: 100 })) > 0) { /* until nothing is due */ }
    assert.deepEqual(tr.delivered.map(x => x.token), ['tok-okay-1']);
    assert.deepEqual(await deliveries(db), [
      { token: 'tok-flaky-1', state: 'queued', attempts: 1, last_error: 'http_503' },
      { token: 'tok-okay-1', state: 'sent', attempts: 1, last_error: null },
      { token: null, state: 'failed', attempts: 1, last_error: 'gone' },
    ]);
    assert.equal((await db.query(`select count(*)::int n from feture.push_device where token = 'tok-gone-1'`))[0].n, 0);
    const [item] = await db.query(`select done_at, last_error from feture.outbox where topic = 'push.deliver'`);
    assert.deepEqual([item.done_at, item.last_error], [null, 'push_retry']);
    // The retries: the hourly likes gate (already counted by this push) does not stop them; the good device gets nothing more.
    await drainAll(db, handlers);
    assert.deepEqual(tr.delivered.map(x => x.token), ['tok-okay-1', 'tok-flaky-1']);
    assert.deepEqual(tr.calls, { 'tok-okay-1': 1, 'tok-flaky-1': 3, 'tok-gone-1': 1 });
    assert.equal((await deliveries(db))[0].state, 'sent');
    assert.ok((await db.query(`select done_at from feture.outbox where topic = 'push.deliver'`))[0].done_at);
    assert.equal((await db.query(`select count(*)::int n from feture.rate_event where kind = 'push.like'`))[0].n, 1);
    // The tokens and the text are never stored with the delivery.
    assert.ok(!JSON.stringify(await db.query('select * from feture.push_delivery')).match(/tok-|Новое/));
  } finally { await pg.close(); }
});

test('push retries: a timeout is retried; a device that keeps failing is given up after 5 sends and the item ends', async () => {
  const { pg, db, call, member } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira');
    await call('ub', null, { action: 'push.register', opId: op(), platform: 'ios', token: 'tok-slow-1', tz: 'UTC' });
    await call('ub', null, { action: 'push.register', opId: op(), platform: 'android', token: 'tok-down-1', tz: 'UTC' });
    const tr = scripted({ 'tok-slow-1': ['hang'], 'tok-down-1': ['fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail'] });
    const handlers = { ...notifyHandlers(db), ...pushHandlers(db, tr, { timeoutMs: 30 }) };
    await call('ua', a, { action: 'like.send', opId: op(), profileId: b, source: 'profile' });
    while ((await drain(db, handlers, { limit: 100 })) > 0) { /* until nothing is due */ }
    assert.deepEqual((await deliveries(db)).map(x => [x.token, x.state, x.last_error]), [['tok-down-1', 'queued', 'http_503'], ['tok-slow-1', 'queued', 'timeout']]);
    await drainAll(db, handlers);
    assert.deepEqual(tr.delivered.map(x => x.token), ['tok-slow-1']);
    assert.deepEqual(tr.calls, { 'tok-slow-1': 2, 'tok-down-1': 5 });
    assert.deepEqual((await deliveries(db)).map(x => [x.token, x.state, x.attempts]), [['tok-down-1', 'failed', 5], ['tok-slow-1', 'sent', 2]]);
    assert.ok((await db.query(`select done_at from feture.outbox where topic = 'push.deliver'`))[0].done_at);
    assert.equal((await db.query(`select count(*)::int n from feture.push_device`))[0].n, 2); // a failing device is not a gone one
  } finally { await pg.close(); }
});

test('push retries: a re-claim after «sent» never re-sends; a second worker never sends while the first one is still sending', async () => {
  const { pg, db, call, member } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira');
    await call('ub', null, { action: 'push.register', opId: op(), platform: 'ios', token: 'tok-one-1', tz: 'UTC' });
    /** @type {() => void} */
    let release = () => {};
    let first = true;
    /** @type {string[]} */
    const delivered = [];
    const transport = { send: async (/** @type {string} */ _p, /** @type {string} */ token) => {
      if (first) { first = false; await new Promise(r => { release = () => r(undefined); }); }
      delivered.push(token);
    } };
    await call('ua', a, { action: 'like.send', opId: op(), profileId: b, source: 'profile' });
    await drain(db, notifyHandlers(db), { limit: 100 });
    const [item] = await db.query(`select id::text, topic, profile_id, payload, attempts, lock_token::text, created_at from feture.outbox where topic = 'push.deliver'`);
    const worker = pushHandlers(db, transport)['push.deliver'];
    // Worker A is stuck in the provider; worker B gets the same item (an expired claim): it waits, it does not send.
    const slow = worker(item);
    for (let i = 0; first && i < 1000; i++) await new Promise(r => setTimeout(r, 5));
    assert.equal(first, false);
    await assert.rejects(worker(item), /push_retry/);
    assert.deepEqual(delivered, []);
    release();
    await slow;
    assert.deepEqual(delivered, ['tok-one-1']);
    // Re-claims after it went out: nothing more, and no error.
    await worker(item);
    await db.query(`update feture.outbox set done_at = null, available_at = now(), locked_until = null where id = $1`, [item.id]);
    await drainAll(db, pushHandlers(db, transport));
    assert.deepEqual(delivered, ['tok-one-1']);
    assert.deepEqual((await deliveries(db)).map(x => [x.state, x.attempts]), [['sent', 1]]);
  } finally { await pg.close(); }
});

// Stage 6 (docs/notifications.md «Push», owner 03.11.2026): actuality at send time, quiet hours, tags, noisy summaries.
/** A world with couples and blocks too; every device records what it got. */
async function world6() {
  const env = await baseSetup({ commands: { ...platform, ...me, ...discover, ...chats, ...inbox, ...couples, ...social } });
  const { db, person } = env;
  /** @type {{token: string, message: any}[]} */
  const sent = [];
  const transport = { send: async (/** @type {string} */ _p, /** @type {string} */ token, /** @type {any} */ message) => { sent.push({ token, message }); } };
  const handlers = { ...notifyHandlers(db), ...pushHandlers(db, transport) };
  const notify = async () => { while ((await drain(db, notifyHandlers(db), { limit: 100 })) > 0) { /* inbox rows and queued pushes only */ } };
  const deliver = async () => { while ((await drain(db, handlers, { limit: 100 })) > 0) { /* until empty */ } };
  const member = async (/** @type {string} */ user, /** @type {string} */ handle, /** @type {any} */ quiet = { on: false, from: '23:00', to: '08:00' }) => {
    const id = await person(user, handle);
    const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [id]);
    await db.query(`insert into feture.notification_settings (account_id, settings) values ($1, $2)`, [account_id, JSON.stringify({ quiet })]);
    await env.call(user, null, { action: 'push.register', opId: op(), platform: 'ios', token: `tok-${handle}`, tz: 'UTC' });
    return { id, account: account_id };
  };
  return { ...env, sent, notify, deliver, member, handlers };
}

test('actuality at send time: nothing for a read or withdrawn notification, a decided task, a read, muted or blocked chat; a skipped push names nobody', async () => {
  const { pg, db, call, sent, notify, deliver, member } = await world6();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira');
    await db.query(`update feture.profile set chosen_name = 'Алекс' where id = $1`, [a.id]);
    // A like read in the app before its push went: no push.
    await call('ua', a.id, { action: 'like.send', opId: op(), profileId: b.id, source: 'profile' });
    await notify();
    await db.query(`update feture.notification set read_at = now() where recipient_account_id = $1`, [b.account]);
    await deliver();
    assert.equal(sent.length, 0);
    // A couple invitation withdrawn before its push went: no push. One still open does push, with its own tag.
    const inv = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
    await notify();
    assert.equal((await call('ua', null, { action: 'couple.inviteWithdraw', opId: op(), inviteId: inv.id })).status, 200);
    await deliver();
    assert.equal(sent.length, 0);
    const inv2 = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
    await deliver();
    assert.deepEqual([sent.length, sent[0].message.tag], [1, `d:pinv:${inv2.id}`]);
    await call('ua', null, { action: 'couple.inviteWithdraw', opId: op(), inviteId: inv2.id });

    // Chats: a match, then messages.
    await call('ub', b.id, { action: 'like.send', opId: op(), profileId: a.id, source: 'likes' });
    await deliver();
    const conv = (await db.query(`select id from feture.conversation limit 1`))[0].id;
    const msg = async (/** @type {string} */ body) => { await call('ua', a.id, { action: 'chat.send', opId: op(), conversationId: conv, body }); await notify(); };
    sent.length = 0;
    // Read before the push went.
    await msg('Прочитано');
    const [{ last_seq: s1 }] = await db.query(`select last_seq from feture.conversation where id = $1`, [conv]);
    await call('ub', b.id, { action: 'chat.read', conversationId: conv, upToSeq: Number(s1) });
    await deliver();
    assert.equal(sent.length, 0);
    // Muted after it was queued (the queue-time check missed it): no push.
    await msg('Заглушено');
    await call('ub', b.id, { action: 'chat.mute', conversationId: conv, on: true });
    await deliver();
    assert.equal(sent.length, 0);
    await call('ub', b.id, { action: 'chat.mute', conversationId: conv, on: false });
    // The sender blocked after it was queued: no push, no name anywhere.
    await msg('Заблокировано');
    await call('ub', b.id, { action: 'block.set', opId: op(), profileId: a.id, on: true });
    await deliver();
    assert.equal(sent.length, 0);
    assert.ok(!JSON.stringify(sent).match(/Алекс|Alex|Прочитано|Заглушено|Заблокировано/));
  } finally { await pg.close(); }
});

test('quiet hours (owner decision 4): an important push waits for the morning and is checked again; a social one is dropped', async () => {
  const { pg, db, call, sent, notify, deliver, member } = await world6();
  try {
    // Quiet hours around «now» in the device's zone (UTC).
    const h = new Date().getUTCHours();
    const hh = (/** @type {number} */ x) => `${String((x + 24) % 24).padStart(2, '0')}:00`;
    const quiet = { on: true, from: hh(h - 1), to: hh(h + 2) };
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira', quiet);
    assert.ok(inQuietHours(quiet, 'UTC'));
    // A like at night: dropped (nothing now, nothing later).
    await call('ua', a.id, { action: 'like.send', opId: op(), profileId: b.id, source: 'profile' });
    // A task at night (a couple invitation): waits for the end of quiet hours on that device.
    const inv = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
    await deliver();
    assert.equal(sent.length, 0);
    const later = await db.query(`select payload, available_at > now() + interval '30 minutes' waits from feture.outbox where topic = 'push.deliver' and done_at is null`);
    assert.equal(later.length, 1);
    assert.deepEqual([later[0].payload.decide, later[0].payload.deferrals, later[0].waits], [{ kind: 'pinv', id: inv.id }, 1, true]);
    assert.deepEqual((await db.query(`select state from feture.push_delivery`)).map((/** @type {any} */ r) => r.state), ['deferred']);
    // Morning: the invitation is still open — one push.
    await db.query(`update feture.notification_settings set settings = settings || '{"quiet": {"on": false, "from": "23:00", "to": "08:00"}}' where account_id = $1`, [b.account]);
    await db.query(`update feture.outbox set available_at = now() where topic = 'push.deliver' and done_at is null`);
    await deliver();
    assert.deepEqual(sent.map(s => s.message.tag), [`d:pinv:${inv.id}`]);

    // A task decided before the morning: nothing then.
    await call('ua', null, { action: 'couple.inviteWithdraw', opId: op(), inviteId: inv.id });
    await db.query(`update feture.notification_settings set settings = settings || $2::jsonb where account_id = $1`, [b.account, JSON.stringify({ quiet })]);
    const inv2 = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
    await notify();
    await deliver();
    await call('ua', null, { action: 'couple.inviteWithdraw', opId: op(), inviteId: inv2.id });
    await db.query(`update feture.outbox set available_at = now() where topic = 'push.deliver' and done_at is null`);
    await db.query(`update feture.notification_settings set settings = settings || '{"quiet": {"on": false, "from": "23:00", "to": "08:00"}}' where account_id = $1`, [b.account]);
    await deliver();
    assert.equal(sent.length, 1);
  } finally { await pg.close(); }
});

test('noisy types: the first like pushes, the rest of the hour is one summary push with its count, under the same tag', async () => {
  const { pg, db, call, sent, deliver, member } = await world6();
  try {
    const b = await member('ub', 'Kira');
    await db.query(`update feture.notification_settings set settings = settings || '{"mode": "normal"}' where account_id = $1`, [b.account]);
    const fans = [await member('u1', 'Ann'), await member('u2', 'Bea'), await member('u3', 'Cid')];
    for (const f of fans) await call(f.id === fans[0].id ? 'u1' : f.id === fans[1].id ? 'u2' : 'u3', f.id, { action: 'like.send', opId: op(), profileId: b.id, source: 'profile' });
    await deliver();
    assert.equal(sent.filter(s => s.token === 'tok-Kira').length, 1);
    // The summary waits for the end of the hour; let it come due now.
    const [summary] = await db.query(`select payload from feture.outbox where topic = 'push.deliver' and done_at is null`);
    assert.equal(summary.payload.key, 'like');
    await db.query(`update feture.rate_event set created_at = now() - interval '61 minutes' where kind = 'push.like'`);
    await db.query(`update feture.outbox set available_at = now() where topic = 'push.deliver' and done_at is null`);
    await deliver();
    const mine = sent.filter(s => s.token === 'tok-Kira');
    assert.deepEqual(mine.map(s => [s.message.title, s.message.body, s.message.tag]), [['Ann', 'Ставит тебе симпатию', 's:like'], ['KINHAZE', 'Новые симпатии: 2', 's:like']]);
  } finally { await pg.close(); }
});
