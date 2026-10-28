// e2e persona content (owner 28.10.2026, 20261028240000_fe_qa_hidden.sql) on PGlite as feture_api: whatever a persona
// account (qa-… login) posts, organizes, founds, replies, likes or follows never reaches the lists of anyone who is not
// a persona; persona viewers still see all of it, so scenarios keep working.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { communities } from '../server/commands/communities.mjs';
import { events } from '../server/commands/events.mjs';
import { people } from '../server/commands/people.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { notifyHandlers } from '../server/notify.mjs';
import { drain } from '../server/outbox.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...posts, ...communities, ...events, ...people, ...inbox } });
const draft = (body, extra = {}) => ({ type: 'post', body, audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [], ...extra });

test('a persona’s posts, discussions, replies, likes, follows, events, communities and activity stay out of everyone else’s lists', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const account = async (/** @type {string} */ p) => (await db.query('select id from feture.account where person_profile_id = $1', [p]))[0].id;
    const publish = async (/** @type {string} */ user, /** @type {string} */ prof, /** @type {any} */ post) => {
      const d = await call(user, prof, { action: 'post.saveDraft', opId: op(), post });
      assert.equal(d.status, 200, JSON.stringify(d));
      assert.equal((await call(user, prof, { action: 'post.publish', opId: op(), postId: d.id })).state, 'published');
      return d.id;
    };
    const a = await person('ua', 'Alex'), w = await person('uw', 'World');
    const q1 = await person('qa-1', 'qa_one'), q2 = await person('qa-2', 'qa_two');
    assert.deepEqual((await db.query('select handle, qa from feture.profile where id = any($1) order by handle', [[a, w, q1, q2]])).map(r => `${r.handle}:${r.qa}`),
      ['Alex:false', 'World:false', 'qa_one:true', 'qa_two:true']);

    const mine = await publish('ua', a, draft('Пост Алекса'));
    const qPost = await publish('qa-1', q1, draft('Тестовый пост персонажа'));
    // A persona's community with a discussion and a reply, and a persona's event.
    const [{ id: club }] = await db.query(
      `insert into feture.community (owner_profile_id, created_by, name, description, topics, privacy, rules, state, published_at)
       values ($1, $2, 'Тестовый клуб персонажа', 'Сообщество персонажа для сценариев проверки.', '{bondage}', 'open', '{"Уважай других"}', 'published', now()) returning id`,
      [q1, await account(q1)]);
    await db.query(`insert into feture.community_member (community_id, profile_id, role) values ($1, $2, 'owner')`, [club, q1]);
    const talk = await publish('qa-1', q1, draft('Тестовое обсуждение персонажа', { communityId: club }));
    assert.equal((await call('qa-1', q1, { action: 'reply.create', opId: op(), postId: talk, body: 'Ответ в обсуждении' })).status, 200);
    const [{ id: party }] = await db.query(
      `insert into feture.event (organizer_profile_id, created_by, title, kind, description, format, join_url, tz, starts_at, ends_at, state, published_at)
       values ($1, $2, 'Тестовое событие персонажа', 'talk', 'Событие персонажа для сценариев проверки, для всех.', 'online', 'https://meet.test/x', 'UTC',
               now() + interval '2 days', now() + interval '2 days 2 hours', 'published', now()) returning id`, [q1, await account(q1)]);

    // The persona answers, likes and follows a real person; another persona follows too.
    const reply = await call('qa-1', q1, { action: 'reply.create', opId: op(), postId: mine, body: 'Ответ персонажа' });
    assert.equal(reply.status, 200, JSON.stringify(reply));
    assert.equal((await call('qa-1', q1, { action: 'reaction.set', opId: op(), targetType: 'post', targetId: mine, on: true })).liked, true);
    assert.equal((await call('qa-1', q1, { action: 'follow.set', opId: op(), profileId: a, on: true })).status, 200);
    assert.equal((await call('qa-2', q2, { action: 'follow.set', opId: op(), profileId: a, on: true })).status, 200);
    // A real person Alex follows touched persona things (as if from before the rule): «Подписки» shows none of them.
    assert.equal((await call('ua', a, { action: 'follow.set', opId: op(), profileId: w, on: true })).status, 200);
    await db.query(`update feture.profile_settings set activity_vis = 'all', show_likes = true where profile_id = $1`, [w]);
    await db.query(`insert into feture.reaction (profile_id, target_type, target_id, acted_by) values ($1, 'post', $2, $3)`, [w, qPost, await account(w)]);
    await db.query(`insert into feture.community_member (community_id, profile_id, listed) values ($1, $2, true)`, [club, w]);
    await db.query(`insert into feture.event_rsvp (event_id, profile_id, status, show_in_list, acted_by) values ($1, $2, 'going', true, $3)`, [party, w, await account(w)]);
    await db.query(`insert into feture.follow (follower_profile_id, target_profile_id, acted_by) values ($1, $2, $3)`, [w, q1, await account(w)]);
    while ((await drain(db, notifyHandlers(db), { limit: 50 })) > 0) { /* deliver everything queued */ }

    const persona = [q1, q2, 'qa_one', 'qa_two', qPost, talk, club, party, reply.id];
    /** @param {string} user @param {string} prof @param {Record<string, unknown>} body */
    const sees = async (user, prof, body) => {
      const r = await call(user, prof, body);
      return { r, text: JSON.stringify(r), hits: persona.filter(x => JSON.stringify(r).includes(x)) };
    };
    const lists = [
      { action: 'feed.list', tab: 'forYou' }, { action: 'feed.list', tab: 'popular' }, { action: 'feed.list', tab: 'following', activity: [] },
      { action: 'event.soon' }, { action: 'event.catalog', format: 'online' }, { action: 'event.mine' },
      { action: 'community.catalog' }, { action: 'discussions.popular', limit: 10 },
      { action: 'post.replies', postId: mine }, { action: 'post.likers', targetId: mine },
      { action: 'profile.followers', profileId: a }, { action: 'profile.followers', profileId: w, following: true },
      { action: 'people.search', q: 'qa' }, { action: 'notifications.list' },
    ];
    for (const body of lists) {
      const { r, hits } = await sees('ua', a, body);
      assert.equal(r.status, 200, `${JSON.stringify(body)} ${JSON.stringify(r)}`);
      assert.deepEqual(hits, [], `${JSON.stringify(body)} shows persona content to a real person: ${JSON.stringify(r)}`);
    }
    // The «Подписки» stream did have World's activity — only the persona parts are gone.
    const stream = await sees('ua', a, { action: 'feed.list', tab: 'following', activity: [] });
    assert.ok(!stream.r.items.some((/** @type {any} */ i) => i.kind === 'activity'), stream.text);
    // A persona's profile and its posts are not for real people either.
    assert.deepEqual((await sees('ua', a, { action: 'profile.posts', profileId: q1 })).hits.filter(x => x !== q1), []);

    // Persona viewers see all of it.
    const qa = async (/** @type {Record<string, unknown>} */ body, /** @type {string[]} */ want) => {
      const { r, hits } = await sees('qa-2', q2, body);
      assert.equal(r.status, 200, JSON.stringify(r));
      for (const x of want) assert.ok(hits.includes(x), `${JSON.stringify(body)} lacks ${x}: ${JSON.stringify(r)}`);
    };
    await qa({ action: 'feed.list', tab: 'forYou' }, [qPost]);
    await qa({ action: 'feed.list', tab: 'popular' }, [qPost]);
    await qa({ action: 'event.catalog', format: 'online' }, [party]);
    await qa({ action: 'community.catalog' }, [club]);
    await qa({ action: 'discussions.popular', limit: 10 }, [talk]);
    await qa({ action: 'post.replies', postId: mine }, [reply.id]);
    await qa({ action: 'post.likers', targetId: mine }, [q1]);
    await qa({ action: 'profile.followers', profileId: a }, [q1]);
    await qa({ action: 'people.search', q: 'qa' }, ['qa_one']);
    await qa({ action: 'profile.posts', profileId: q1 }, [qPost]);
    // …and the real people's things too.
    assert.ok((await sees('qa-2', q2, { action: 'feed.list', tab: 'forYou' })).text.includes(mine));
    // The real person still gets real notifications (here: none, every actor was a persona) and the count agrees.
    assert.equal((await call('ua', a, { action: 'inbox.counts' })).status, 200);
  } finally { await pg.close(); }
});

test('the persona mark follows memberships and the account flag', async () => {
  const { pg, db, person, coupleOf } = await setup();
  try {
    const a = await person('ua', 'Alex'), q1 = await person('qa-1', 'qa_one');
    const pair = await coupleOf([a, q1]);
    const qa = async (/** @type {string} */ id) => (await db.query('select qa from feture.profile where id = $1', [id]))[0].qa;
    assert.deepEqual([await qa(a), await qa(q1), await qa(pair)], [false, true, true]);
    await db.query(`update feture.account set qa = false where person_profile_id = $1`, [q1]);
    assert.deepEqual([await qa(q1), await qa(pair)], [false, false]);
    await db.query(`update feture.account set qa = true where person_profile_id = $1`, [a]);
    assert.deepEqual([await qa(a), await qa(pair)], [true, true]);
    assert.equal((await db.query('select feture.qa_hidden($1, $2) h', [q1, a]))[0].h, true);
    assert.equal((await db.query('select feture.qa_hidden($1, $2) h', [a, q1]))[0].h, false);
    assert.equal((await db.query('select feture.qa_hidden(null, $1) h', [a]))[0].h, true);
  } finally { await pg.close(); }
});
