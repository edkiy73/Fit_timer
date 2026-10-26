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
import { notifyHandlers } from '../server/notify.mjs';
import { drain } from '../server/outbox.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...posts, ...couples, ...discover, ...chats, ...inbox } });
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
