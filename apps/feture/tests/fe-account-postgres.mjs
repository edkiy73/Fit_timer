// Account deletion and data export on PGlite as feture_api.
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
import { people } from '../server/commands/people.mjs';
import { accounts } from '../server/commands/account.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...posts, ...couples, ...discover, ...chats, ...inbox, ...people, ...accounts } });
const draft = (body) => ({ type: 'post', body, audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [] });

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
  return { ...env, member };
}

test('export: the person’s own data, other people only as nicknames', async () => {
  const { pg, call, member } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira');
    await call('ua', a, { action: 'interests.set', opId: op(), topicId: 'shibari', value: 7, vis: 'only' });
    const d = await call('ua', a, { action: 'post.saveDraft', opId: op(), post: draft('Мой пост') });
    await call('ua', a, { action: 'post.publish', opId: op(), postId: d.id });
    await call('ua', a, { action: 'like.send', opId: op(), profileId: b, source: 'profile' });
    const x = (await call('ua', null, { action: 'account.export' })).export;
    assert.equal(x.account.birth_date !== undefined, true);
    assert.deepEqual([x.profiles[0].handle, x.profiles[0].interests[0].topic, x.posts[0].body, x.likesSent[0].handle], ['Alex', 'shibari', 'Мой пост', 'Kira']);
    assert.equal(x.consents.length > 0, true);
  } finally { await pg.close(); }
});

test('deletion: confirmed by nickname; the couple goes (partner stays), ties end, content out of sight, nickname held, login starts afresh', async () => {
  const { pg, db, call, coupleOf, member } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira'), c = await member('uc', 'Noa');
    const pair = await coupleOf([a, b]);
    await call('ua', a, { action: 'discover.decide', opId: op(), profileId: c, decision: 'like' });
    const conv = (await call('uc', c, { action: 'like.send', opId: op(), profileId: a, source: 'likes' })).conversationId;
    await call('ua', a, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Привет от Алекса' });
    await call('uc', c, { action: 'follow.set', opId: op(), profileId: a, on: true });
    const d = await call('ua', a, { action: 'post.saveDraft', opId: op(), post: draft('Исчезну') });
    const post = d.id;
    await call('ua', a, { action: 'post.publish', opId: op(), postId: post });

    assert.deepEqual((await call('ua', null, { action: 'account.delete', opId: op(), confirmHandle: 'Kira' })).fields, ['confirmHandle']);
    assert.equal((await call('ua', null, { action: 'account.delete', opId: op(), confirmHandle: 'alex' })).deleted, true);

    // Out of sight for others; the partner keeps their own profile; the other side keeps the conversation history.
    assert.equal((await call('uc', c, { action: 'profile.get', profileId: a })).status, 404);
    assert.equal((await call('uc', c, { action: 'post.get', postId: post })).status, 404);
    assert.equal((await call('ub', b, { action: 'profile.get', profileId: b })).profile.handle, 'Kira');
    const [{ state: pairState }] = await db.query('select state from feture.profile where id = $1', [pair]);
    assert.equal(pairState, 'deleted');
    const hist = await call('uc', c, { action: 'chat.messages', conversationId: conv });
    assert.deepEqual([hist.state, hist.endedReason, hist.items[0].body], ['ended', 'account_deleted', 'Привет от Алекса']);
    assert.deepEqual((await call('uc', c, { action: 'matches.list' })).items, []);
    // The nickname is held for 30 days; the same login gets a brand-new account.
    assert.equal((await call('uc', c, { action: 'people.byNick', handle: 'Alex' })).status, 404);
    const [{ n }] = await db.query(`select count(*)::int n from feture.handle_hold where handle = 'alex' and until > now() + interval '29 days'`);
    assert.equal(n, 1);
    const fresh = await call('ua', null, { action: 'account.create', opId: op(), handle: 'Alex2', birthDate: '1990-01-01', locale: 'ru', documents: (await import('./fe-helpers.mjs')).ACCEPT, newsOptIn: false });
    assert.equal(fresh.status, 200);
    assert.notEqual(fresh.profileId, a);
  } finally { await pg.close(); }
});
