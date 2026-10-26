// Slice G3 on PGlite as feture_api: push delivery through a fake transport — neutral texts, settings, quiet hours,
// grouped likes, muted chats, gone tokens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { discover } from '../server/commands/discover.mjs';
import { chats } from '../server/commands/chats.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { notifyHandlers } from '../server/notify.mjs';
import { pushHandlers, inQuietHours } from '../server/push.mjs';
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

test('a like: one neutral push (no names), grouped hourly; «normal» says what kind; category off sends nothing; gone tokens go', async () => {
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
    // The other side likes back: Kira gets «Новое совпадение» (whoever made the match gets nothing about it).
    const d = await member('ud', 'Dana');
    await call('ub', b, { action: 'like.send', opId: op(), profileId: d, source: 'profile' });
    const conv = (await call('ud', d, { action: 'like.send', opId: op(), profileId: b, source: 'likes' })).conversationId;
    await deliver();
    assert.equal(sent.at(-1).message.body, 'Новое совпадение');

    // A muted conversation sends no push; an unmuted one does.
    await call('ub', b, { action: 'chat.mute', conversationId: conv, on: true });
    const before = sent.length;
    await call('ud', d, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Тихо' });
    await deliver();
    assert.equal(sent.length, before);
    await call('ub', b, { action: 'chat.mute', conversationId: conv, on: false });
    await call('ud', d, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Громко' });
    await deliver();
    assert.deepEqual([sent.length, sent.at(-1).message.body, sent.at(-1).message.data.t], [before + 1, 'Новое сообщение', 'chat']);
    assert.ok(!JSON.stringify(sent).includes('Громко'));

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
