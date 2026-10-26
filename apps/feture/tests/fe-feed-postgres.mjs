// Slice B on PGlite as feture_api: posts, feed, audiences, blocks both ways, photo marks, polls, replies,
// reactions, edits and reviews, reports, couple posts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { access } from '../server/commands/access.mjs';
import { couples } from '../server/commands/couples.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { mediaHandlers } from '../server/jobs.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...access, ...couples, ...social, ...posts } });
const draft = (body, extra = {}) => ({ type: 'post', body, audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [], ...extra });

/** A media asset of a profile in a given state (as the scan pipeline would leave it). */
async function asset(db, profileId, { state = 'approved', explicitness = 'safe' } = {}) {
  const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [profileId]);
  const [a] = await db.query(
    `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
     values ($1, $2, 'image', 'post', 'u/' || gen_random_uuid(), 'image/jpeg', 10, $3, $4, now()) returning id`,
    [profileId, account_id, state, state === 'approved' ? explicitness : 'unknown']);
  return a.id;
}
async function publish(call, user, profile, post) {
  const d = await call(user, profile, { action: 'post.saveDraft', opId: op(), post });
  assert.equal(d.status, 200, JSON.stringify(d));
  const p = await call(user, profile, { action: 'post.publish', opId: op(), postId: d.id });
  return { id: d.id, ...p };
}
const feed = async (call, user, profile, tab = 'forYou', extra = {}) => (await call(user, profile, { action: 'feed.list', tab, ...extra })).items.map(i => i.body);

test('text publishes at once; feed tabs, topics, hides, pagination; blocks hide both ways and cut ties', async () => {
  const { pg, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    assert.equal((await publish(call, 'ua', a, draft('Привет от Алекса', { topics: ['bondage'] }))).state, 'published');
    await publish(call, 'uc', c, draft('Пост Ноа'));
    assert.deepEqual(await feed(call, 'ub', b), ['Пост Ноа', 'Привет от Алекса']);
    assert.deepEqual(await feed(call, 'ub', b, 'forYou', { topics: ['bondage'] }), ['Привет от Алекса']);
    assert.deepEqual(await feed(call, 'ub', b, 'following'), []);
    await call('ub', b, { action: 'follow.set', opId: op(), profileId: a, on: true });
    assert.deepEqual(await feed(call, 'ub', b, 'following'), ['Привет от Алекса']);
    await call('ub', b, { action: 'feedHide.set', opId: op(), kind: 'author', targetId: c, on: true });
    assert.deepEqual(await feed(call, 'ub', b), ['Привет от Алекса']);
    assert.equal((await call('ub', b, { action: 'feedHide.list' })).count, 1);

    for (let i = 0; i < 4; i++) await publish(call, 'ua', a, draft('Ещё ' + i));
    const page1 = await call('uc', c, { action: 'feed.list', tab: 'forYou', limit: 3 });
    const page2 = await call('uc', c, { action: 'feed.list', tab: 'forYou', limit: 3, cursor: page1.next });
    assert.deepEqual([...page1.items, ...page2.items].map(i => i.body).filter(x => x.startsWith('Ещё')), ['Ещё 3', 'Ещё 2', 'Ещё 1', 'Ещё 0']);

    // Kira blocks Alex: neither sees the other, Kira's follow ends, unblocking restores nothing.
    await call('ub', b, { action: 'block.set', opId: op(), profileId: a, on: true });
    assert.ok(!(await feed(call, 'ub', b)).includes('Привет от Алекса'));
    await publish(call, 'ub', b, draft('Пост Киры'));
    assert.ok(!(await feed(call, 'ua', a)).includes('Пост Киры'));
    const anyAlexPost = (await call('uc', c, { action: 'profile.posts', profileId: a })).items[0].id;
    assert.equal((await call('ub', b, { action: 'post.get', postId: anyAlexPost })).status, 404);
    assert.equal((await call('ua', a, { action: 'follow.set', opId: op(), profileId: b, on: true })).status, 404);
    await call('ub', b, { action: 'block.set', opId: op(), profileId: a, on: false });
    assert.deepEqual(await feed(call, 'ub', b, 'following'), ['Пост Киры']); // own posts only: the follow did not come back
    assert.equal((await call('ub', b, { action: 'block.set', opId: op(), profileId: b, on: true })).rule, 'self');
  } finally { await pg.close(); }
});

test('a block on a person also hides the couples they are in; the blocker’s other profile is not covered unless asked', async () => {
  const { pg, call, person, coupleOf } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    const pair = await coupleOf([b, c]);
    const post = await publish(call, 'ub', pair, draft('Пост пары'));
    assert.equal(post.state, 'published');
    await call('ua', a, { action: 'block.set', opId: op(), profileId: c, on: true });
    assert.equal((await call('ua', a, { action: 'post.get', postId: post.id })).status, 404); // the couple contains Noa
    // Alex's couple is not covered by Alex's personal block.
    const d = await person('ud', 'Mia');
    const alexPair = await coupleOf([a, d]);
    assert.equal((await call('ua', alexPair, { action: 'post.get', postId: post.id })).status, 200);
    await call('ua', a, { action: 'block.set', opId: op(), profileId: c, on: true, alsoFor: 'partner' });
    assert.equal((await call('ua', alexPair, { action: 'post.get', postId: post.id })).status, 404);
  } finally { await pg.close(); }
});

test('media: review until checked, explicit never public, audiences followers / granted / only', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
    const pending = await asset(db, a, { state: 'scanning' });
    const p = await publish(call, 'ua', a, draft('С фото', { mediaIds: [pending] }));
    assert.equal(p.state, 'review');
    assert.equal((await call('ub', b, { action: 'post.get', postId: p.id })).status, 404);
    await db.query(`update feture.media_asset set state = 'approved', explicitness = 'safe' where id = $1`, [pending]);
    await mediaHandlers(db, { scan: null })['media.approved']({ payload: { assetId: pending } });
    const seen = (await call('ub', b, { action: 'post.get', postId: p.id })).post;
    assert.equal(seen.media.length, 1);

    const explicit = await asset(db, a, { explicitness: 'explicit' });
    const back = await publish(call, 'ua', a, draft('Откровенное', { mediaIds: [explicit] }));
    assert.equal(back.state, 'draft'); // returned: explicit never in public places
    assert.equal((await call('ua', a, { action: 'post.get', postId: back.id })).post.returned, 'explicit_in_public');

    const explicit2 = await asset(db, a, { explicitness: 'explicit' });
    const granted = await publish(call, 'ua', a, draft('Для своих', { mediaIds: [explicit2], audience: 'granted' }));
    assert.equal(granted.state, 'published');
    assert.equal((await call('ub', b, { action: 'post.get', postId: granted.id })).status, 404);
    await call('ua', a, { action: 'private.setText', opId: op(), text: 'x' });
    const r = await call('ub', b, { action: 'access.request', opId: op(), profileId: a, scopes: ['info'] });
    await call('ua', a, { action: 'access.grant', opId: op(), requestId: r.id, scopes: ['info'], term: 'none' });
    const g = (await call('ub', b, { action: 'post.get', postId: granted.id })).post;
    assert.deepEqual([g.media.length, g.media[0].blurred, Object.keys(g.media[0].src)], [1, true, ['blur']]); // explicit starts covered

    const fol = await publish(call, 'ua', a, draft('Подписчикам', { audience: 'followers' }));
    assert.equal((await call('ub', b, { action: 'post.get', postId: fol.id })).status, 404);
    await call('ub', b, { action: 'follow.set', opId: op(), profileId: a, on: true });
    assert.equal((await call('ub', b, { action: 'post.get', postId: fol.id })).status, 200);
    const only = await publish(call, 'ua', a, draft('Только мне', { audience: 'only' }));
    assert.equal((await call('ub', b, { action: 'post.get', postId: only.id })).status, 404);
  } finally { await pg.close(); }
});

test('photo marks and disputes; polls; replies; reactions', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    const img = await asset(db, a);
    const tagged = await publish(call, 'ua', a, draft('Мы на фото', { mediaIds: [img], tags: [b] }));
    assert.equal(tagged.state, 'published');
    assert.equal((await call('uc', c, { action: 'post.get', postId: tagged.id })).status, 404); // until Kira agrees
    assert.equal((await call('ub', b, { action: 'post.get', postId: tagged.id })).status, 200);
    await call('ub', b, { action: 'tag.answer', opId: op(), postId: tagged.id, answer: 'ok' });
    assert.deepEqual((await call('uc', c, { action: 'post.get', postId: tagged.id })).post.tags.map(t => t.handle), ['Kira']);
    // Someone not marked says it is them: hidden for everyone but the author.
    await call('uc', c, { action: 'tag.object', opId: op(), postId: tagged.id });
    assert.equal((await call('ub', b, { action: 'post.get', postId: tagged.id })).status, 404);
    assert.equal((await call('ua', a, { action: 'post.get', postId: tagged.id })).status, 200);

    const poll = await publish(call, 'ua', a, draft('', { poll: { question: 'Когда?', options: ['Утром', 'Вечером'] } }));
    const before = (await call('ub', b, { action: 'post.get', postId: poll.id })).post.poll;
    assert.deepEqual([before.myVote, before.results], [null, null]); // results after one's own vote
    assert.equal((await call('ub', b, { action: 'poll.vote', opId: op(), postId: poll.id, option: 1 })).myVote, 1);
    assert.equal((await call('ub', b, { action: 'poll.vote', opId: op(), postId: poll.id, option: 0 })).rule, 'already_voted');
    assert.deepEqual((await call('ub', b, { action: 'post.get', postId: poll.id })).post.poll.results, [0, 1]);

    const text = await publish(call, 'ua', a, draft('Обсудим?'));
    const r1 = await call('ub', b, { action: 'reply.create', opId: op(), postId: text.id, body: 'Да, @Noa тоже' });
    await call('uc', c, { action: 'reply.create', opId: op(), postId: text.id, parentId: r1.id, body: 'Я тут' });
    await call('ub', b, { action: 'reply.delete', opId: op(), replyId: r1.id });
    const replies = (await call('ua', a, { action: 'post.replies', postId: text.id })).items;
    assert.deepEqual(replies.map(r => r.deleted ? 'deleted' : r.body), ['deleted', 'Я тут']); // a deleted reply with answers stays as a stub
    const topics = (await db.query(`select topic, profile_id from feture.outbox where topic in ('reply.created', 'mention.created') order by id`));
    assert.ok(topics.some(t => t.topic === 'mention.created' && t.profile_id === c));
    await call('ua', a, { action: 'block.set', opId: op(), profileId: c, on: true });
    assert.deepEqual((await call('ua', a, { action: 'post.replies', postId: text.id })).items.map(r => r.hidden ?? false), [false, true]);

    assert.equal((await call('ub', b, { action: 'reaction.set', opId: op(), targetType: 'post', targetId: text.id, on: true })).liked, true);
    assert.equal((await call('ub', b, { action: 'post.get', postId: text.id })).post.likes, 1);
    assert.equal((await call('uc', c, { action: 'reaction.set', opId: op(), targetType: 'post', targetId: text.id, on: true })).status, 404); // blocked
  } finally { await pg.close(); }
});

test('edits: minor applies, major goes to review; reports hide and can block; couple posts wait for the partner', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
    const img = await asset(db, a), img2 = await asset(db, a);
    const p = await publish(call, 'ua', a, draft('Фото с прогулки', { mediaIds: [img] }));
    const live = (await call('ua', a, { action: 'post.get', postId: p.id })).post;
    const minor = await call('ua', a, { action: 'post.edit', opId: op(), postId: p.id, rev: live.rev, post: draft('Фото с прогулки!', { mediaIds: [img] }) });
    assert.equal(minor.rev, live.rev + 1);
    const major = await call('ua', a, { action: 'post.edit', opId: op(), postId: p.id, rev: minor.rev, post: draft('Фото с прогулки!', { mediaIds: [img, img2] }) });
    assert.equal(major.review, true);
    assert.equal((await call('ub', b, { action: 'post.get', postId: p.id })).post.media.length, 1); // the live version stays

    const report = await call('ub', b, { action: 'report.create', opId: op(), targetType: 'post', targetId: p.id, reason: 'spam', alsoBlock: true });
    assert.equal(report.reported, true);
    assert.equal((await call('ub', b, { action: 'post.get', postId: p.id })).status, 404);
    assert.equal((await db.query(`select count(*)::int n from feture.report where target_id = $1`, [p.id]))[0].n, 1);

    // Kira blocked Alex above: the profile, interests, private part and invitations are closed between them.
    assert.equal((await call('ub', b, { action: 'profile.get', profileId: a })).status, 404);
    assert.equal((await call('ua', a, { action: 'profile.get', profileId: b })).status, 404);
    assert.equal((await call('ua', a, { action: 'interests.list', profileId: b })).status, 404);
    assert.equal((await call('ua', a, { action: 'private.get', profileId: b })).status, 404);
    assert.equal((await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' })).status, 404);
    await call('ub', b, { action: 'block.set', opId: op(), profileId: a, on: false });
    // A couple post waits for the partner who asked to approve.
    const inv = await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
    const pair = (await call('ub', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv.id, accept: true })).profileId;
    await call('ub', pair, { action: 'couple.setApproval', opId: op(), approvesPartner: true });
    const cp = await publish(call, 'ua', pair, draft('Мы вместе'));
    assert.ok(cp.pending?.approvalId);
    assert.deepEqual((await call('ub', pair, { action: 'me.posts' })).items.map(i => i.body), []); // Alex's draft is his alone
    const ok = await call('ub', pair, { action: 'decide.approval', opId: op(), approvalId: cp.pending.approvalId, choice: 'approve' });
    assert.equal(ok.applied, true);
    assert.equal((await call('ub', pair, { action: 'post.get', postId: cp.id })).post.state, 'published');
    // Deleting a couple post archives it.
    assert.equal((await call('ub', pair, { action: 'post.delete', opId: op(), postId: cp.id })).state, 'archived');
  } finally { await pg.close(); }
});
