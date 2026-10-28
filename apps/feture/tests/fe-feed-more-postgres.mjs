// Backlog wave 3 on PGlite as feture_api: who liked / who voted, removing one's mention, saved edits of a published
// post, feed filters, the «Подписки» activity stream, «Популярное» by my interests, search filters for events and
// communities — and what a blocked, hidden or restricted person never shows up in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { communities } from '../server/commands/communities.mjs';
import { events } from '../server/commands/events.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';
import { PLATE_KEYS, articlePlate } from '../contracts/_plates.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...posts, ...communities, ...events } });
const draft = (body, extra = {}) => ({ type: 'post', body, audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [], ...extra });
const day = 864e5;
const at = (/** @type {number} */ days, hours = 0) => new Date(Date.now() + days * day + hours * 36e5).toISOString();

async function publish(call, user, profile, post) {
  const d = await call(user, profile, { action: 'post.saveDraft', opId: op(), post });
  assert.equal(d.status, 200, JSON.stringify(d));
  const p = await call(user, profile, { action: 'post.publish', opId: op(), postId: d.id });
  assert.equal(p.state, 'published', JSON.stringify(p));
  return d.id;
}
const like = (call, user, profile, targetId, targetType = 'post') => call(user, profile, { action: 'reaction.set', opId: op(), targetType, targetId, on: true });
const setting = (db, profile, col, value) => db.query(`update feture.profile_settings set ${col} = $2 where profile_id = $1`, [profile, value]);
const account = async (db, profile) => (await db.query('select id from feture.account where person_profile_id = $1', [profile]))[0].id;

/** A published online event and an open community organized by `owner` (staff review is covered elsewhere). */
async function eventOf(db, owner, { title = 'Онлайн-разговор о границах', startsAt = at(3) } = {}) {
  const [{ id }] = await db.query(
    `insert into feture.event (organizer_profile_id, created_by, title, kind, description, format, join_url, tz, starts_at, ends_at, state, published_at)
     values ($1, $2, $3, 'talk', 'Спокойный разговор о границах и согласии, для всех.', 'online', 'https://meet.test/x', 'UTC', $4, $4::timestamptz + interval '2 hours', 'published', now())
     returning id`, [owner, await account(db, owner), title, startsAt]);
  return id;
}
async function communityOf(db, owner, { name = 'Узлы и разговоры', privacy = 'open' } = {}) {
  const [{ id }] = await db.query(
    `insert into feture.community (owner_profile_id, created_by, name, description, topics, privacy, rules, state, published_at)
     values ($1, $2, $3, 'Сообщество для спокойных разговоров о практике.', '{bondage}', $4, '{"Уважай других"}', 'published', now()) returning id`,
    [owner, await account(db, owner), name, privacy]);
  await db.query(`insert into feture.community_member (community_id, profile_id, role) values ($1, $2, 'owner')`, [id, owner]);
  return id;
}

test('likers and poll voters: hidden, blocked and restricted people are counted, not listed; strangers and non-voters are refused', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    const d = await person('ud', 'Dana'), e = await person('ue', 'Evan'), f = await person('uf', 'Finn'), s = await person('us', 'Sami');
    const postId = await publish(call, 'ua', a, draft('Пост Алекса'));
    for (const [u, p] of [['ub', b], ['uc', c], ['ud', d], ['ue', e], ['uf', f]]) assert.equal((await like(call, u, p, postId)).liked, true);
    await setting(db, d, 'show_likes', false);                                 // Dana hides her marks
    await call('ue', e, { action: 'block.set', opId: op(), profileId: b, on: true }); // Evan blocks Kira
    await db.query(`update feture.profile set restricted_at = now() where id = $1`, [f]); // Finn is restricted

    const r = await call('ub', b, { action: 'post.likers', targetId: postId });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.deepEqual([r.total, r.hidden, r.next], [5, 3, null]);
    assert.deepEqual(r.items.map(i => [i.handle, i.mine]).sort(), [['Kira', true], ['Noa', false]]);
    assert.ok('avatar' in r.items[0] && 'photoVerified' in r.items[0], 'rows carry faces');
    // Dana's own view lists herself; Evan blocked only Kira, so Dana sees him.
    assert.deepEqual((await call('ud', d, { action: 'post.likers', targetId: postId })).items.map(i => i.handle).sort(), ['Dana', 'Evan', 'Kira', 'Noa']);
    // A post the viewer may not see: followers-only, or the author blocked them.
    const closed = await publish(call, 'ua', a, draft('Для подписчиков', { audience: 'followers' }));
    assert.equal((await call('us', s, { action: 'post.likers', targetId: closed })).status, 404);
    await call('ua', a, { action: 'block.set', opId: op(), profileId: s, on: true });
    assert.equal((await call('us', s, { action: 'post.likers', targetId: postId })).status, 404);

    // A reply's likers; a reply by someone blocked is not found.
    const reply = await call('uc', c, { action: 'reply.create', opId: op(), postId, body: 'Ответ Ноа' });
    await like(call, 'ub', b, reply.id, 'reply');
    assert.deepEqual((await call('ua', a, { action: 'post.likers', targetType: 'reply', targetId: reply.id })).items.map(i => i.handle), ['Kira']);
    const eReply = await call('ue', e, { action: 'reply.create', opId: op(), postId, body: 'Ответ Эвана' });
    assert.equal((await call('ub', b, { action: 'post.likers', targetType: 'reply', targetId: eReply.id })).status, 404);

    // Paging: 30 a page.
    const many = await publish(call, 'ua', a, draft('Популярный пост'));
    for (let i = 0; i < 32; i++) {
      const p = await person('um' + i, 'Many' + i);
      await like(call, 'um' + i, p, many);
    }
    const p1 = await call('ua', a, { action: 'post.likers', targetId: many });
    const p2 = await call('ua', a, { action: 'post.likers', targetId: many, cursor: p1.next });
    assert.deepEqual([p1.items.length, p2.items.length, p2.next, p1.total], [30, 2, null, 32]);
    assert.equal(new Set([...p1.items, ...p2.items].map(i => i.id)).size, 32);

    // Poll voters: after one's own vote (or for the author), same hiding rules.
    const poll = await publish(call, 'ua', a, draft('', { poll: { question: 'Когда?', options: ['Утром', 'Вечером'] } }));
    await call('uc', c, { action: 'poll.vote', opId: op(), postId: poll, option: 0 });
    await call('ud', d, { action: 'poll.vote', opId: op(), postId: poll, option: 0 });
    const before = await call('ub', b, { action: 'poll.voters', postId: poll, option: 0 });
    assert.deepEqual([before.status, before.rule], [403, 'vote_first']);
    const author = await call('ua', a, { action: 'poll.voters', postId: poll, option: 0 });
    assert.deepEqual([author.total, author.hidden, author.items.map(i => i.handle)], [2, 1, ['Noa']]);
    await call('ub', b, { action: 'poll.vote', opId: op(), postId: poll, option: 1 });
    assert.deepEqual((await call('ub', b, { action: 'poll.voters', postId: poll, option: 0 })).items.map(i => i.handle), ['Noa']);
    assert.deepEqual((await call('ub', b, { action: 'poll.voters', postId: poll, option: 1 })).items.map(i => [i.handle, i.mine]), [['Kira', true]]);
    assert.equal((await call('ub', b, { action: 'poll.voters', postId: poll, option: 5 })).status, 400);
    assert.equal((await call('ub', b, { action: 'poll.voters', postId: postId, option: 0 })).status, 404); // no poll
    assert.equal((await call('us', s, { action: 'poll.voters', postId: poll, option: 0 })).status, 404);  // blocked by the author
  } finally { await pg.close(); }
});

test('unmentionMe: the name stops being a link, the author is told once, edits do not bring it back', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    const postId = await publish(call, 'ua', a, draft('Спасибо @Kira и @Noa за вечер'));
    const mentions = async (u, p) => (await call(u, p, { action: 'post.get', postId })).post.mentions.map(m => m.handle).sort();
    assert.deepEqual(await mentions('ub', b), ['Kira', 'Noa']);
    const told = async () => (await db.query(`select count(*)::int n from feture.outbox where topic = 'mention.removed' and profile_id = $1`, [a]))[0].n;

    assert.deepEqual((await call('ub', b, { action: 'post.unmentionMe', opId: op(), postId })).removed, true);
    assert.deepEqual(await mentions('uc', c), ['Noa']);
    assert.equal((await call('ub', b, { action: 'post.get', postId })).post.body, 'Спасибо @Kira и @Noa за вечер'); // text keeps the name
    assert.equal(await told(), 1);
    assert.equal((await call('ub', b, { action: 'post.unmentionMe', opId: op(), postId })).removed, true);    // idempotent
    assert.equal(await told(), 1);

    // An edit that keeps the name does not make it a link again.
    const rev = (await call('ua', a, { action: 'post.get', postId })).post.rev;
    assert.equal((await call('ua', a, { action: 'post.edit', opId: op(), postId, rev, post: draft('Спасибо @Kira и @Noa за чудесный вечер') })).status, 200);
    assert.deepEqual(await mentions('ua', a), ['Noa']);

    // Refusals: one's own post, not mentioned, a post one cannot see.
    assert.equal((await call('ua', a, { action: 'post.unmentionMe', opId: op(), postId })).rule, 'own_post');
    const plain = await publish(call, 'ua', a, draft('Без упоминаний'));
    assert.equal((await call('ub', b, { action: 'post.unmentionMe', opId: op(), postId: plain })).status, 404);
    await call('ua', a, { action: 'block.set', opId: op(), profileId: c, on: true });
    assert.equal((await call('uc', c, { action: 'post.unmentionMe', opId: op(), postId })).status, 404);

    // In a reply.
    const r = await call('ua', a, { action: 'reply.create', opId: op(), postId: plain, body: 'И ещё раз @Kira' });
    const replyMentions = async () => (await call('ub', b, { action: 'post.replies', postId: plain })).items[0].mentions.map(m => m.handle);
    assert.deepEqual(await replyMentions(), ['Kira']);
    assert.equal((await call('ub', b, { action: 'post.unmentionMe', opId: op(), postId: plain, replyId: r.id })).removed, true);
    assert.deepEqual(await replyMentions(), []);
    assert.equal(await told(), 2);
  } finally { await pg.close(); }
});

test('saved edits of a published post: only the author sees them, publishing goes through the edit rules, discard keeps the post', async () => {
  const { pg, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
    const postId = await publish(call, 'ua', a, draft('Исходный текст'));
    const rev = (await call('ua', a, { action: 'post.get', postId })).post.rev;
    const saved = await call('ua', a, { action: 'post.saveEdits', opId: op(), postId, rev, post: draft('Новый текст') });
    assert.deepEqual([saved.status, saved.baseRev], [200, rev]);
    assert.equal((await call('ub', b, { action: 'post.get', postId })).post.body, 'Исходный текст'); // others see the live post
    const mine = await call('ua', a, { action: 'me.posts' });
    assert.deepEqual(mine.pendingEdits.map(e => [e.postId, e.post.body, e.baseRev]), [[postId, 'Новый текст', rev]]);
    assert.deepEqual((await call('ub', b, { action: 'me.posts' })).pendingEdits, []);

    // Others cannot save, publish or discard edits of my post; drafts use saveDraft.
    assert.equal((await call('ub', b, { action: 'post.saveEdits', opId: op(), postId, rev, post: draft('Чужое') })).status, 404);
    assert.equal((await call('ub', b, { action: 'post.publishEdits', opId: op(), postId })).status, 404);
    assert.equal((await call('ub', b, { action: 'post.discardEdits', opId: op(), postId })).status, 404);
    const d = await call('ua', a, { action: 'post.saveDraft', opId: op(), post: draft('Черновик') });
    assert.equal((await call('ua', a, { action: 'post.saveEdits', opId: op(), postId: d.id, rev: 1, post: draft('x') })).status, 409);
    assert.equal((await call('ua', a, { action: 'post.saveEdits', opId: op(), postId, rev: rev + 5, post: draft('x') })).status, 409);

    const out = await call('ua', a, { action: 'post.publishEdits', opId: op(), postId });
    assert.equal(out.status, 200, JSON.stringify(out));
    assert.equal((await call('ub', b, { action: 'post.get', postId })).post.body, 'Новый текст');
    assert.deepEqual((await call('ua', a, { action: 'me.posts' })).pendingEdits, []);
    assert.equal((await call('ua', a, { action: 'post.publishEdits', opId: op(), postId })).status, 404);

    // Edits saved over an older version are refused when the post changed since; they stay until discarded.
    const rev2 = (await call('ua', a, { action: 'post.get', postId })).post.rev;
    await call('ua', a, { action: 'post.saveEdits', opId: op(), postId, rev: rev2, post: draft('Отложенное') });
    await call('ua', a, { action: 'post.edit', opId: op(), postId, rev: rev2, post: draft('Сразу') });
    const stale = await call('ua', a, { action: 'post.publishEdits', opId: op(), postId });
    assert.equal(stale.status, 409);
    assert.equal((await call('ua', a, { action: 'me.posts' })).pendingEdits.length, 1);
    assert.equal((await call('ua', a, { action: 'post.discardEdits', opId: op(), postId })).discarded, true);
    assert.equal((await call('ua', a, { action: 'post.discardEdits', opId: op(), postId })).discarded, false);
    assert.equal((await call('ub', b, { action: 'post.get', postId })).post.body, 'Сразу');
  } finally { await pg.close(); }
});

test('feed filters: excluded topics, kinds of posts, «Популярное» by my interests without my hard limits', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
    const [t1, t2, t3] = (await db.query(`select id from feture.topic where not hidden and category_id <> 'limits' order by id limit 3`)).map(r => r.id);
    await publish(call, 'ua', a, draft('Про первое', { topics: [t1] }));
    await publish(call, 'ua', a, draft('Про второе', { topics: [t2] }));
    await publish(call, 'ua', a, draft('Про третье', { topics: [t3] }));
    await publish(call, 'ua', a, draft('', { poll: { question: 'Да?', options: ['Да', 'Нет'] } }));
    await publish(call, 'ua', a, { ...draft('Длинная статья о практике и согласии, с примерами.'), type: 'note', title: 'Статья' });
    const feed = async (extra) => {
      const r = await call('ub', b, { action: 'feed.list', tab: 'forYou', ...extra });
      assert.equal(r.status, 200, JSON.stringify(r));
      return r.items.map(i => i.title ?? i.body ?? '').map(x => x || 'poll');
    };
    assert.deepEqual(await feed({ excludeTopics: [t1, t2] }), ['Статья', 'poll', 'Про третье']);
    assert.deepEqual(await feed({ types: ['poll'] }), ['poll']);
    assert.deepEqual(await feed({ types: ['note', 'poll'] }), ['Статья', 'poll']);
    assert.deepEqual(await feed({ types: ['text'], excludeTopics: [t3] }), ['Про второе', 'Про первое']);
    assert.deepEqual(await feed({ q: 'третье', types: ['text'] }), ['Про третье']);
    assert.equal((await call('ub', b, { action: 'feed.list', tab: 'forYou', types: ['video'] })).status, 400);

    // «Популярное» by my interests: rated topics only; a post also carrying a hard limit of mine never shows.
    await db.query(`insert into feture.interest (profile_id, topic_id, value) values ($1, $2, 7), ($1, $3, 5)`, [b, t1, t2]);
    await db.query(`insert into feture.interest (profile_id, topic_id, mark) values ($1, $2, 'hard')`, [b, t3]);
    await publish(call, 'ua', a, draft('Первое и табу', { topics: [t1, t3] }));
    const pop = await call('ub', b, { action: 'feed.list', tab: 'popular', myInterests: true });
    assert.deepEqual(pop.items.map(i => i.body).sort(), ['Про второе', 'Про первое']);
    assert.equal((await call('ua', a, { action: 'feed.list', tab: 'popular', myInterests: true })).items.length, 0); // no interests yet
    assert.equal((await call('ub', b, { action: 'feed.list', tab: 'forYou', myInterests: true })).status, 400);
    assert.equal((await call('ub', b, { action: 'feed.list', tab: 'forYou', activity: [] })).status, 400);
  } finally { await pg.close(); }
});

test('«Подписки» activity: grouped cards from people I follow, their visibility settings, mute and blocks', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa'), d = await person('ud', 'Dana');
    await call('ub', b, { action: 'follow.set', opId: op(), profileId: a, on: true });
    const p1 = await publish(call, 'uc', c, draft('Первый пост Ноа'));
    const p2 = await publish(call, 'uc', c, draft('Второй пост Ноа'));
    const closed = await publish(call, 'uc', c, draft('Только подписчикам Ноа', { audience: 'followers' }));
    await call('ua', a, { action: 'follow.set', opId: op(), profileId: c, on: true }); // Alex follows Noa (a follow card)
    for (const p of [p1, p2, closed]) await like(call, 'ua', a, p);                  // Kira can't see the third one
    const ev = await eventOf(db, c);
    await call('ua', a, { action: 'event.rsvp', opId: op(), eventId: ev, status: 'going', showInList: true });
    const hiddenEv = await eventOf(db, c, { title: 'Второй разговор, тихо' });
    await call('ua', a, { action: 'event.rsvp', opId: op(), eventId: hiddenEv, status: 'going' });             // not shown in the list
    const group = await communityOf(db, c);
    await db.query(`insert into feture.community_member (community_id, profile_id, listed) values ($1, $2, true)`, [group, a]);
    const secret = await communityOf(db, c, { name: 'Тайный клуб', privacy: 'hidden' });
    await db.query(`insert into feture.community_member (community_id, profile_id, listed) values ($1, $2, true)`, [secret, a]);
    await publish(call, 'ua', a, draft('Пост Алекса'));

    const stream = async (activity = [], extra = {}) => {
      const r = await call('ub', b, { action: 'feed.list', tab: 'following', activity, ...extra });
      assert.equal(r.status, 200, JSON.stringify(r));
      return r;
    };
    const all = await stream();
    const cards = all.items.filter(i => i.kind === 'activity');
    assert.deepEqual(all.items.filter(i => i.kind === 'post').map(i => i.body), ['Пост Алекса']);
    const byKind = Object.fromEntries(cards.map(x => [x.activity, x]));
    assert.deepEqual(Object.keys(byKind).sort(), ['communities', 'events', 'follows', 'likes']);
    assert.deepEqual([byKind.likes.count, byKind.likes.items.map(i => i.excerpt).sort()], [2, ['Второй пост Ноа', 'Первый пост Ноа']]);
    assert.equal(byKind.likes.actor.handle, 'Alex');
    assert.deepEqual(byKind.events.items.map(i => i.id), [ev]);
    assert.deepEqual(byKind.communities.items.map(i => i.id), [group]);
    assert.deepEqual(byKind.follows.items.map(i => i.handle), ['Noa']);
    assert.ok(!JSON.stringify(all).includes(closed) && !JSON.stringify(all).includes(secret) && !JSON.stringify(all).includes(hiddenEv));

    // Kinds, paging, filters (activity has no topics), and existing callers without `activity` see posts only.
    assert.deepEqual((await stream(['likes'])).items.map(i => i.activity), ['likes']);
    const page1 = await stream([], { limit: 2 });
    const page2 = await stream([], { limit: 2, cursor: page1.next });
    const page3 = await stream([], { limit: 2, cursor: page2.next });
    assert.deepEqual([...page1.items, ...page2.items, ...page3.items].map(i => i.id), all.items.map(i => i.id));
    assert.equal(page3.next, null);
    assert.deepEqual((await stream([], { types: ['text'] })).items.map(i => i.kind), ['post']);
    assert.deepEqual((await call('ub', b, { action: 'feed.list', tab: 'following' })).items.map(i => [i.kind, i.body]), [[undefined, 'Пост Алекса']]);

    // «Показывать мои отметки» off hides like cards; «Кто видит мою активность» off hides all of it.
    await setting(db, a, 'show_likes', false);
    assert.ok(!(await stream()).items.some(i => i.activity === 'likes'));
    await setting(db, a, 'activity_vis', 'off');
    assert.deepEqual((await stream()).items.map(i => i.kind), ['post']);
    await setting(db, a, 'activity_vis', 'followers'); // Kira follows Alex, so she still sees it
    assert.ok((await stream()).items.some(i => i.kind === 'activity'));

    // «Не показывать активность»: posts stay, cards go; undo brings them back.
    assert.equal((await call('ub', b, { action: 'activity.mute', opId: op(), profileId: a, on: true })).muted, true);
    assert.deepEqual((await stream()).items.map(i => i.kind), ['post']);
    assert.equal((await call('ub', b, { action: 'feedHide.list' })).items[0].kind, 'activity');
    await call('ub', b, { action: 'activity.mute', opId: op(), profileId: a, on: false });
    assert.ok((await stream()).items.some(i => i.kind === 'activity'));
    assert.equal((await call('ub', b, { action: 'activity.mute', opId: op(), profileId: b, on: true })).rule, 'self');

    // A block either way: Noa blocks Kira — Alex's likes of Noa's posts and his follow of Noa disappear for Kira.
    await call('uc', c, { action: 'block.set', opId: op(), profileId: b, on: true });
    const after = (await stream()).items.filter(i => i.kind === 'activity');
    assert.ok(!after.some(x => ['likes', 'follows', 'events', 'communities'].includes(x.activity)), JSON.stringify(after));
    // Dana does not follow Alex: no activity of his at all.
    assert.deepEqual((await call('ud', d, { action: 'feed.list', tab: 'following', activity: [] })).items, []);
  } finally { await pg.close(); }
});

test('a profile\'s «Активность»: by «Кто видит мою активность» and the viewer\'s relation; the person always sees their own', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa'), d = await person('ud', 'Dana');
    const p1 = await publish(call, 'uc', c, draft('Пост Ноа для активности'));
    await like(call, 'ua', a, p1);
    await call('ua', a, { action: 'follow.set', opId: op(), profileId: c, on: true });
    await call('ub', b, { action: 'follow.set', opId: op(), profileId: a, on: true });
    const tab = async (user, profile) => {
      const r = await call(user, profile, { action: 'profile.activity', profileId: a });
      assert.equal(r.status, 200, JSON.stringify(r));
      return r.items.map(i => i.activity).sort();
    };
    assert.deepEqual(await tab('ud', d), ['follows', 'likes']);                // «всем»: anyone
    await setting(db, a, 'activity_vis', 'followers');
    assert.deepEqual(await tab('ud', d), []);                                   // Dana does not follow Alex
    assert.deepEqual(await tab('ub', b), ['follows', 'likes']);                 // Kira does
    // A mute in the feed does not hide a profile opened on purpose.
    await call('ub', b, { action: 'activity.mute', opId: op(), profileId: a, on: true });
    assert.deepEqual(await tab('ub', b), ['follows', 'likes']);
    await setting(db, a, 'activity_vis', 'off');
    assert.deepEqual(await tab('ub', b), []);
    assert.deepEqual(await tab('ua', a), ['follows', 'likes']);                 // own: always
    await call('uc', c, { action: 'block.set', opId: op(), profileId: a, on: true });
    assert.deepEqual(await tab('uc', c), []);
  } finally { await pg.close(); }
});

test('«Подписки» activity: a burst of likes carries up to 20 things with what each post is made of, the count says the rest', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    await call('ub', b, { action: 'follow.set', opId: op(), profileId: a, on: true });
    const ids = [];
    for (let i = 0; i < 22; i++) ids.push(await publish(call, 'uc', c, draft(`Пост Ноа номер ${i + 1}`)));
    ids.push(await publish(call, 'uc', c, draft('Опрос Ноа', { poll: { question: 'Чай или кофе?', options: ['Чай', 'Кофе'] } })));
    ids.push(await publish(call, 'uc', c, draft('Длинный текст статьи о доверии и границах.', { type: 'note', title: 'Статья без фото' })));
    for (const p of ids) await like(call, 'ua', a, p);
    const group = await communityOf(db, c);
    await db.query(`insert into feture.community_member (community_id, profile_id, listed) values ($1, $2, true)`, [group, a]);
    const r = await call('ub', b, { action: 'feed.list', tab: 'following', activity: ['likes', 'communities'] });
    assert.equal(r.status, 200, JSON.stringify(r));
    const likes = r.items.find(i => i.activity === 'likes');
    assert.equal(likes.count, 24);
    assert.equal(likes.items.length, 20);
    assert.equal(likes.items[0].id, ids[23]); // newest first
    // An article without photos still has a cover: the plate its id picks (owner, 28.10.2026).
    assert.deepEqual([likes.items[0].article, likes.items[0].thumb, likes.items[0].plate], [true, null, articlePlate(ids[23])]);
    assert.ok(PLATE_KEYS.includes(likes.items[0].plate));
    assert.deepEqual([likes.items[1].poll, likes.items[1].photos, likes.items[1].videos, likes.items[1].thumb, likes.items[1].plate], [true, 0, 0, null, undefined]);
    assert.equal(likes.items[2].poll, false);
    assert.ok(!('audience' in likes.items[0]) && !('first_asset' in likes.items[0]) && !('owner_profile_id' in likes.items[0]));
    const comm = r.items.find(i => i.activity === 'communities');
    assert.deepEqual([comm.items[0].id, comm.items[0].members, comm.items[0].cover], [group, 2, null]);

    // «+N» opens all of them (activity.items): the card's person, kind and moments, newest first, in pages.
    assert.ok(likes.from && likes.from <= likes.at, JSON.stringify([likes.from, likes.at]));
    const card = { action: 'activity.items', actorId: a, activity: 'likes', from: likes.from, to: likes.at };
    const all = await call('ub', b, card);
    assert.equal(all.status, 200, JSON.stringify(all));
    assert.deepEqual(all.items.map(i => i.id), [...ids].reverse());
    assert.equal(all.next, null);
    assert.deepEqual(all.items.slice(0, 20).map(i => i.id), likes.items.map(i => i.id)); // the same things the card carries
    assert.ok(!('audience' in all.items[0]) && !('owner_profile_id' in all.items[0]));
    // Not the card's window: nothing; a reversed window is refused.
    const before = new Date(Date.parse(likes.from) - 1000).toISOString();
    assert.deepEqual((await call('ub', b, { ...card, from: new Date(Date.parse(likes.from) - day).toISOString(), to: before })).items, []);
    assert.equal((await call('ub', b, { ...card, from: likes.at, to: before })).status, 400);
    // The same rules as the card: Alex's «Кто видит мою активность» → «никому» shows nothing to Kira; Alex sees his own.
    await setting(db, a, 'activity_vis', 'off');
    assert.deepEqual((await call('ub', b, card)).items, []);
    assert.equal((await call('ua', a, card)).items.length, 24);
    await setting(db, a, 'activity_vis', 'all');
    // A block either way hides it.
    await call('uc', c, { action: 'block.set', opId: op(), profileId: b, on: true });
    assert.deepEqual((await call('ub', b, card)).items, []);
  } finally { await pg.close(); }
});

test('search filters: events by words and dates, communities by words and joining', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    const soon = await eventOf(db, a, { title: 'Разговор о верёвке', startsAt: at(2) });
    const later = await eventOf(db, a, { title: 'Разговор о латексе', startsAt: at(20) });
    const ids = async (extra) => {
      const r = await call('ub', b, { action: 'event.catalog', format: 'online', ...extra });
      assert.equal(r.status, 200, JSON.stringify(r));
      return r.items.map(i => i.id);
    };
    assert.deepEqual(await ids({ q: 'верёвк' }), [soon]);
    assert.deepEqual(await ids({ q: 'Разговор' }), [soon, later]);
    assert.deepEqual(await ids({ from: at(10), to: at(30) }), [later]);
    assert.deepEqual(await ids({ q: '100%' }), []);
    assert.equal((await call('ub', b, { action: 'event.catalog', from: at(10), to: at(5) })).status, 400);
    await call('ua', a, { action: 'block.set', opId: op(), profileId: c, on: true });
    assert.deepEqual((await call('uc', c, { action: 'event.catalog', q: 'Разговор' })).items, []);

    const open = await communityOf(db, a, { name: 'Верёвка по средам' });
    const closed = await communityOf(db, a, { name: 'Верёвка по пятницам', privacy: 'closed' });
    await communityOf(db, a, { name: 'Верёвка тайно', privacy: 'hidden' });
    const groups = async (extra) => (await call('ub', b, { action: 'community.catalog', ...extra })).items.map(i => i.id);
    assert.deepEqual((await groups({ q: 'верёвка' })).sort(), [open, closed].sort());
    assert.deepEqual(await groups({ q: 'верёвка', privacy: 'closed' }), [closed]);
    assert.deepEqual(await groups({ q: 'пятниц' }), [closed]);
    assert.deepEqual((await call('uc', c, { action: 'community.catalog', q: 'верёвка' })).items, []);
  } finally { await pg.close(); }
});
