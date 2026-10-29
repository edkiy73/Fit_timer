// Leftovers and owner decisions (28.10.2026) on PGlite as feture_api: «Популярное» ranks discussed over liked,
// a change of audience never lets an unreviewed version out (every path that changes it), event drafts can be
// continued, people lists say who takes a mention, profile.get says whether the viewer follows someone's articles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { posts, settlePublication } from '../server/commands/posts.mjs';
import { staff } from '../server/commands/staff.mjs';
import { moderation } from '../server/commands/moderation.mjs';
import { communities } from '../server/commands/communities.mjs';
import { events } from '../server/commands/events.mjs';
import { people } from '../server/commands/people.mjs';
import { discover } from '../server/commands/discover.mjs';
import { photos } from '../server/commands/photos.mjs';
import { gallery } from '../server/commands/gallery.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...posts, ...staff, ...moderation, ...communities, ...events, ...people, ...discover, ...photos, ...gallery } });
const draft = (/** @type {string} */ body, extra = {}) => ({ type: 'post', body, audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [], ...extra });

/** A post photo of a profile (approved and safe unless told otherwise). @param {any} db @param {string} profileId */
async function asset(db, profileId, state = 'approved') {
  const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [profileId]);
  const [a] = await db.query(
    `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
     values ($1, $2, 'image', 'post', 'u/' || gen_random_uuid(), 'image/jpeg', 10, $3, 'safe', now()) returning id`, [profileId, account_id, state]);
  return a.id;
}

async function world() {
  const env = await setup();
  const { db, call, person } = env;
  const boss = await person('uo', 'Boss');
  await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
  /** @param {string} u @param {string} p @param {any} post */
  const publish = async (u, p, post) => {
    const d = await call(u, p, { action: 'post.saveDraft', opId: op(), post });
    assert.equal(d.status, 200, JSON.stringify(d));
    const r = await call(u, p, { action: 'post.publish', opId: op(), postId: d.id });
    assert.equal(r.status, 200, JSON.stringify(r));
    return { id: d.id, state: r.state };
  };
  const queue = async () => (await call('uo', null, { action: 'staff.revisionQueue' })).items;
  /** Staff approve the open revision of a post. @param {string} postId */
  const approve = async postId => {
    const r = (await queue()).find((/** @type {any} */ x) => x.postId === postId);
    assert.ok(r, 'revision in the queue');
    return call('uo', null, { action: 'staff.revisionDecide', opId: op(), revisionId: r.id, decision: 'approve' });
  };
  /** @param {string} u @param {string} p @param {string} postId */
  const sees = async (u, p, postId) => (await call(u, p, { action: 'post.get', postId })).status === 200;
  const rev = async (/** @type {string} */ postId) => (await db.query('select rev from feture.post where id = $1', [postId]))[0].rev;
  const audience = async (/** @type {string} */ postId) => (await db.query('select audience from feture.post where id = $1', [postId]))[0].audience;
  return { ...env, publish, queue, approve, sees, rev, audience };
}

test('«Популярное»: people who replied weigh more than likes, own activity does not count, 7 days, decay', async () => {
  const { pg, db, call, person, publish } = await world();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa'), d = await person('ud', 'Mia'), e = await person('ue', 'Lea');
    const liked = (await publish('ua', a, draft('Залайканный'))).id;
    const discussed = (await publish('ua', a, draft('Обсуждаемый'))).id;
    const selfTalk = (await publish('ub', b, draft('Сам с собой'))).id;
    const old = (await publish('ub', b, draft('Старый, но живой'))).id;
    // Three likes (1.5) against two people replying (3 × 2 + 2 = 8).
    for (const [u, p] of [['ub', b], ['uc', c], ['ud', d]]) await call(u, p, { action: 'reaction.set', opId: op(), targetType: 'post', targetId: liked, on: true });
    await call('uc', c, { action: 'reply.create', opId: op(), postId: discussed, body: 'Интересно' });
    await call('ud', d, { action: 'reply.create', opId: op(), postId: discussed, body: 'И мне' });
    // The author replying and liking own post adds nothing.
    for (let i = 0; i < 5; i++) await call('ub', b, { action: 'reply.create', opId: op(), postId: selfTalk, body: 'Ещё ' + i });
    await call('ub', b, { action: 'reaction.set', opId: op(), targetType: 'post', targetId: selfTalk, on: true });
    // Eight days old: out of the window however lively.
    for (const [u, p] of [['uc', c], ['ud', d], ['ue', e]]) await call(u, p, { action: 'reply.create', opId: op(), postId: old, body: 'Да' });
    await db.query(`update feture.post set published_at = now() - interval '8 days' where id = $1`, [old]);

    const pop = async () => (await call('ue', e, { action: 'feed.list', tab: 'popular' })).items.map((/** @type {any} */ x) => x.body);
    assert.deepEqual(await pop(), ['Обсуждаемый', 'Залайканный', 'Сам с собой']);
    // Gentle decay: the discussed post four days old (score 8 → 4) still beats today's three likes (1.5) ...
    await db.query(`update feture.post set published_at = now() - interval '4 days' where id = $1`, [discussed]);
    assert.deepEqual((await pop()).slice(0, 2), ['Обсуждаемый', 'Залайканный']);
    // ... and a fresh post with one person replying (4) passes it once it is older (6 days: 8 → ~2.8).
    const fresh = (await publish('uc', c, draft('Свежий разговор'))).id;
    await call('ud', d, { action: 'reply.create', opId: op(), postId: fresh, body: 'Ого' });
    await db.query(`update feture.post set published_at = now() - interval '6 days' where id = $1`, [discussed]);
    assert.deepEqual((await pop()).slice(0, 2), ['Свежий разговор', 'Обсуждаемый']);
    // Blocked people's replies do not lift a post for the viewer; hiding the post removes it.
    await call('ue', e, { action: 'block.set', opId: op(), profileId: d, on: true });
    assert.equal((await pop())[0], 'Обсуждаемый'); // Noa's reply remains (4 → ~1.4); Mia's reply and like count for nothing
    await call('ue', e, { action: 'feedHide.set', opId: op(), kind: 'post', targetId: discussed, on: true });
    assert.ok(!(await pop()).includes('Обсуждаемый'));
  } finally { await pg.close(); }
});

test('audience changes never let an unreviewed version out: post.edit, a post still on review, saved edits', async () => {
  const { pg, db, call, person, publish, queue, approve, sees, rev } = await world();
  try {
    const a = await person('ua', 'Alex'), f = await person('uf', 'Fan'), s = await person('us', 'Stranger');
    await call('uf', f, { action: 'follow.set', opId: op(), profileId: a, on: true });

    // post.edit: «Только я» → followers waits for staff; the follower sees nothing until then.
    const m1 = await asset(db, a);
    const p1 = (await publish('ua', a, draft('Личное фото', { audience: 'only', mediaIds: [m1] }))).id;
    const e1 = await call('ua', a, { action: 'post.edit', opId: op(), postId: p1, rev: await rev(p1), post: draft('Личное фото', { audience: 'followers', mediaIds: [m1] }) });
    assert.equal(e1.review, true, JSON.stringify(e1));
    assert.equal(await sees('uf', f, p1), false);
    assert.equal((await approve(p1)).status, 200);
    assert.equal(await sees('uf', f, p1), true);
    assert.equal(await sees('us', s, p1), false);
    // followers → everyone again goes to the queue.
    const e1b = await call('ua', a, { action: 'post.edit', opId: op(), postId: p1, rev: await rev(p1), post: draft('Личное фото', { audience: 'all', mediaIds: [m1] }) });
    assert.equal(e1b.review, true);
    assert.equal(await sees('us', s, p1), false);

    // A post that has not passed review yet (its photo is still checked): widening it goes to the queue and the
    // post comes out with its old, narrow audience once the photo is checked — never wider without staff.
    const m2 = await asset(db, a, 'needs_review');
    const p2 = await publish('ua', a, draft('Ещё проверяется', { audience: 'only', mediaIds: [m2] }));
    assert.equal(p2.state, 'review');
    const e2 = await call('ua', a, { action: 'post.edit', opId: op(), postId: p2.id, rev: await rev(p2.id), post: draft('Ещё проверяется', { audience: 'all', mediaIds: [m2] }) });
    assert.equal(e2.review, true, JSON.stringify(e2));
    await db.query(`update feture.media_asset set state = 'approved' where id = $1`, [m2]);
    await db.query('select 1'); // the media.approved job runs settlePublication:
    assert.equal(await settlePublication(db, p2.id), 'published');
    assert.equal(await sees('us', s, p2.id), false);
    assert.equal(await sees('uf', f, p2.id), false);
    assert.ok((await queue()).some((/** @type {any} */ x) => x.postId === p2.id), 'still in the queue');
    assert.equal((await approve(p2.id)).status, 200);
    assert.equal(await sees('us', s, p2.id), true);
    // Narrowing a post still on review applies at once (nothing is out yet) and keeps it unpublished.
    const m3 = await asset(db, a, 'needs_review');
    const p3 = await publish('ua', a, draft('Сужаю', { mediaIds: [m3] }));
    const e3 = await call('ua', a, { action: 'post.edit', opId: op(), postId: p3.id, rev: await rev(p3.id), post: draft('Сужаю', { audience: 'followers', mediaIds: [m3] }) });
    assert.equal(e3.state, 'review');
    assert.equal(await sees('uf', f, p3.id), false);

    // Saved edits: publishing ones that widen the audience goes through the same review.
    const m4 = await asset(db, a);
    const p4 = (await publish('ua', a, draft('Сохранённые правки', { audience: 'followers', mediaIds: [m4] }))).id;
    await call('ua', a, { action: 'post.saveEdits', opId: op(), postId: p4, rev: await rev(p4), post: draft('Сохранённые правки', { audience: 'all', mediaIds: [m4] }) });
    const e4 = await call('ua', a, { action: 'post.publishEdits', opId: op(), postId: p4 });
    assert.equal(e4.review, true, JSON.stringify(e4));
    assert.equal(await sees('us', s, p4), false);
  } finally { await pg.close(); }
});

test('audience changes in the gallery keep a waiting review: setAlbum, album «Подписчикам», selection audience', async () => {
  const { pg, db, call, person, publish, approve, sees, rev, audience } = await world();
  try {
    const a = await person('ua', 'Alex'), f = await person('uf', 'Fan'), s = await person('us', 'Stranger');
    await call('uf', f, { action: 'follow.set', opId: op(), profileId: a, on: true });
    const open = (await call('ua', a, { action: 'album.create', opId: op(), title: 'Открытый' })).album.id;
    const closed = (await call('ua', a, { action: 'album.create', opId: op(), title: 'Свои' })).album.id;
    await call('ua', a, { action: 'album.update', opId: op(), albumId: closed, visibility: 'followers' });
    /** A followers post with a photo and a waiting «всем» revision. */
    const waiting = async (/** @type {string} */ body) => {
      const m = await asset(db, a);
      const id = (await publish('ua', a, draft(body, { audience: 'followers', mediaIds: [m] }))).id;
      const r = await call('ua', a, { action: 'gallery.bulk', opId: op(), postIds: [id], change: 'audience', audience: 'all' });
      assert.equal(r.review, 1, JSON.stringify(r));
      assert.equal(await sees('us', s, id), false);
      return id;
    };

    // post.setAlbum into an open album: the review stays decidable (no stale rev) and keeps the album.
    const p1 = await waiting('В открытый альбом');
    await call('ua', a, { action: 'post.setAlbum', opId: op(), postId: p1, albumId: open });
    assert.equal(await sees('us', s, p1), false);
    assert.equal((await approve(p1)).status, 200);
    assert.equal(await sees('us', s, p1), true);
    assert.equal((await db.query('select album_id from feture.post where id = $1', [p1]))[0].album_id, open);

    // post.setAlbum into a followers album: the waiting «всем» is narrowed with it; approving opens nothing wider.
    const p2 = await waiting('В закрытый альбом');
    await call('ua', a, { action: 'post.setAlbum', opId: op(), postId: p2, albumId: closed, confirm: true });
    assert.equal((await approve(p2)).status, 200);
    assert.equal(await audience(p2), 'followers');
    assert.equal(await sees('us', s, p2), false);

    // album.update «Подписчикам» narrows an open post with a waiting change of photos; the change stays in review.
    const al = (await call('ua', a, { action: 'album.create', opId: op(), title: 'Станет закрытым' })).album.id;
    const m3 = await asset(db, a), m3b = await asset(db, a);
    const p3 = (await publish('ua', a, draft('Новые фото', { mediaIds: [m3], albumId: al }))).id;
    const e3 = await call('ua', a, { action: 'post.edit', opId: op(), postId: p3, rev: await rev(p3), post: draft('Новые фото', { mediaIds: [m3, m3b], albumId: al }) });
    assert.equal(e3.review, true);
    await call('ua', a, { action: 'album.update', opId: op(), albumId: al, visibility: 'followers', confirm: true });
    assert.equal(await sees('us', s, p3), false);
    assert.equal((await approve(p3)).status, 200);
    assert.deepEqual([await audience(p3), await sees('us', s, p3), await sees('uf', f, p3)], ['followers', false, true]);
    // Opening the album again opens only the album: the post keeps «Подписчикам», no review is skipped.
    await call('ua', a, { action: 'album.update', opId: op(), albumId: al, visibility: 'all' });
    assert.equal(await sees('us', s, p3), false);

    // gallery.bulk «Подписчикам» on a post whose «всем» is waiting: still decidable, still followers only.
    const p4 = await waiting('Сужаю выбор');
    const n = await call('ua', a, { action: 'gallery.bulk', opId: op(), postIds: [p4], change: 'audience', audience: 'followers' });
    assert.equal(n.status, 200);
    assert.equal((await approve(p4)).status, 200);
    // The later «Подписчикам» narrows the waiting wish too: approving keeps the post for followers.
    assert.deepEqual([await audience(p4), await sees('us', s, p4), await sees('uf', f, p4)], ['followers', false, true]);
  } finally { await pg.close(); }
});

test('event drafts: draftGet returns the saved form and step to its profile only', async () => {
  const { pg, db, call, person } = await world();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
    const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1', [a]);
    const [cover] = await db.query(
      `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
       values ($1, $2, 'image', 'event', 'u/ev', 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [a, account_id]);
    const form = { title: 'Вечер верёвки', kind: 'workshop', description: 'Почти готово', format: 'online', joinUrl: 'https://meet.example/x', coverAssetId: cover.id };
    const s = await call('ua', a, { action: 'event.draftSave', opId: op(), step: 3, form });
    const r = await call('ua', a, { action: 'event.draftGet', draftId: s.id });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.deepEqual([r.draft.step, r.draft.form.title, r.draft.form.joinUrl, r.draft.cover?.id], [3, 'Вечер верёвки', 'https://meet.example/x', cover.id]);
    assert.equal((await call('ub', b, { action: 'event.draftGet', draftId: s.id })).status, 404);
    // A cover that is not the profile's own event cover is not shown.
    await call('ua', a, { action: 'event.draftSave', opId: op(), draftId: s.id, step: 2, form: { ...form, coverAssetId: '018f0000-0000-7000-8000-00000000beef' } });
    const r2 = await call('ua', a, { action: 'event.draftGet', draftId: s.id });
    assert.deepEqual([r2.draft.step, r2.draft.cover], [2, null]);
  } finally { await pg.close(); }
});

test('mentions: people.search and follower lists say who takes a mention from the acting profile', async () => {
  const { pg, db, call, person, coupleOf } = await world();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'mira_all'), c = await person('uc', 'mira_follow'), d = await person('ud', 'mira_none');
    await db.query(`update feture.profile_settings set mentions_from = 'follow' where profile_id = $1`, [c]);
    await db.query(`update feture.profile_settings set mentions_from = 'none' where profile_id = $1`, [d]);
    const flags = async () => Object.fromEntries((await call('ua', a, { action: 'people.search', q: 'mira' })).items.map((/** @type {any} */ x) => [x.handle, x.mentionable]));
    assert.deepEqual(await flags(), { mira_all: true, mira_follow: false, mira_none: false });
    await call('uc', c, { action: 'follow.set', opId: op(), profileId: a, on: true });
    assert.deepEqual(await flags(), { mira_all: true, mira_follow: true, mira_none: false });
    // The same rule decides the mention itself: only those become links.
    const dr = await call('ua', a, { action: 'post.saveDraft', opId: op(), post: draft('Привет @mira_all @mira_follow @mira_none') });
    await call('ua', a, { action: 'post.publish', opId: op(), postId: dr.id });
    const g = await call('ua', a, { action: 'post.get', postId: dr.id });
    assert.deepEqual((g.post.mentions ?? []).map((/** @type {any} */ m) => m.handle).sort(), ['mira_all', 'mira_follow']);
    // Follower lists carry it too; a block ends it.
    await call('ua', a, { action: 'follow.set', opId: op(), profileId: b, on: true });
    await call('ua', a, { action: 'follow.set', opId: op(), profileId: d, on: true });
    const following = (await call('ua', a, { action: 'profile.followers', profileId: a, following: true })).items;
    assert.deepEqual(Object.fromEntries(following.map((/** @type {any} */ x) => [x.handle, x.mentionable])), { mira_all: true, mira_none: false });
    const followers = (await call('ua', a, { action: 'profile.followers', profileId: a })).items;
    assert.deepEqual(followers.map((/** @type {any} */ x) => [x.handle, x.mentionable]), [['mira_follow', true]]);
    // Owner 29.10.2026: a couple has a nick for tagging, so it takes mentions by the same rule.
    const cp = await coupleOf([b, c]);
    await db.query(`update feture.profile set handle = 'mira_pair', state = 'active' where id = $1`, [cp]);
    const pair = (await call('ua', a, { action: 'people.search', q: 'mira_pair' })).items.find((/** @type {any} */ x) => x.id === cp);
    assert.equal(pair?.mentionable, true);
  } finally { await pg.close(); }
});

test('profile.get: no article-only subscription (owner 28.10.2026), the noteSub command is gone', async () => {
  const { pg, call, person } = await world();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
    assert.equal('noteSub' in (await call('ub', b, { action: 'profile.get', profileId: a })).profile, false);
    assert.notEqual((await call('ub', b, { action: 'noteSub.set', opId: op(), profileId: a, on: true })).ok, true);
  } finally { await pg.close(); }
});
