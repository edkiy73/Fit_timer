// Wave 5 «Галерея и альбомы» on PGlite as feture_api: albums (create, rename, delete with undo data, settings, order),
// putting posts into albums, the gallery as followers / strangers / blocked people see it, the gallery selection
// (album, audience, delete, profile), profile photos taken from own posts, couples.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { couples } from '../server/commands/couples.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { photos } from '../server/commands/photos.mjs';
import { gallery } from '../server/commands/gallery.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...couples, ...social, ...posts, ...photos, ...gallery } });
const draft = (body, extra = {}) => ({ type: 'post', body, audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [], ...extra });

/** An approved, safe post photo of a profile. */
async function asset(db, profileId) {
  const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [profileId]);
  const [a] = await db.query(
    `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
     values ($1, $2, 'image', 'post', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [profileId, account_id]);
  return a.id;
}
/** Publishes a post with one photo (or none); returns {id, media}. */
async function photoPost(db, call, user, profile, body, extra = {}, withPhoto = true) {
  const media = withPhoto ? await asset(db, profile) : null;
  const d = await call(user, profile, { action: 'post.saveDraft', opId: op(), post: draft(body, { mediaIds: media ? [media] : [], ...extra }) });
  assert.equal(d.status, 200, JSON.stringify(d));
  const p = await call(user, profile, { action: 'post.publish', opId: op(), postId: d.id });
  assert.equal(p.state, 'published', JSON.stringify(p));
  // Distinct publication times keep the gallery order stable.
  await db.query(`update feture.post set published_at = now() + (select count(*) from feture.post) * interval '1 second' where id = $1`, [d.id]);
  return { id: d.id, media };
}
const tiles = async (call, user, profile, profileId, extra = {}) => {
  const r = await call(user, profile, { action: 'gallery.list', profileId, ...extra });
  return r.status === 200 ? r.items.map((/** @type {any} */ t) => t.postId) : r.status;
};

test('albums: create, rules, posts into albums, who sees which album and tile, order, cover, rename, delete with undo data', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa'), d = await person('ud', 'Mia');
    await call('ub', b, { action: 'follow.set', opId: op(), profileId: a, on: true });
    await call('ud', d, { action: 'block.set', opId: op(), profileId: a, on: true });
    const p1 = await photoPost(db, call, 'ua', a, 'Первое фото');
    const p2 = await photoPost(db, call, 'ua', a, 'Второе фото');
    const text = await photoPost(db, call, 'ua', a, 'Просто текст', {}, false);
    const pf = await photoPost(db, call, 'ua', a, 'Для своих', { audience: 'followers' });

    const al1 = (await call('ua', a, { action: 'album.create', opId: op(), title: ' Мастерские ' })).album;
    assert.deepEqual([al1.title, al1.visibility, al1.sort, al1.count, al1.cover, al1.position], ['Мастерские', 'all', 'new', 0, null, 0]);
    assert.equal((await call('ua', a, { action: 'album.create', opId: op(), title: 'мастерские' })).rule, 'duplicate');
    assert.equal((await call('ua', a, { action: 'album.create', opId: op(), title: '   ' })).status, 400);
    assert.equal((await call('ua', a, { action: 'album.create', opId: op(), title: 'x'.repeat(41) })).status, 400);
    const al2 = (await call('ua', a, { action: 'album.create', opId: op(), title: 'Закрытый' })).album;
    assert.equal(al2.position, 1);
    // Another profile may use the same title.
    assert.equal((await call('uc', c, { action: 'album.create', opId: op(), title: 'Мастерские' })).status, 200);
    const foreign = (await call('uc', c, { action: 'album.list', profileId: c })).items[0].id;

    // Only own published posts with photos go into own albums.
    assert.equal((await call('ua', a, { action: 'post.setAlbum', opId: op(), postId: p1.id, albumId: al1.id })).albumId, al1.id);
    assert.equal((await call('ua', a, { action: 'post.setAlbum', opId: op(), postId: text.id, albumId: al1.id })).rule, 'not_in_gallery');
    assert.equal((await call('uc', c, { action: 'post.setAlbum', opId: op(), postId: p1.id, albumId: foreign })).status, 404);
    assert.equal((await call('ua', a, { action: 'post.setAlbum', opId: op(), postId: p2.id, albumId: foreign })).status, 404);

    // A followers-only album narrows a post put there, after confirmation.
    await call('ua', a, { action: 'album.update', opId: op(), albumId: al2.id, visibility: 'followers' });
    const ask = await call('ua', a, { action: 'post.setAlbum', opId: op(), postId: p2.id, albumId: al2.id });
    assert.deepEqual([ask.status, ask.rule, ask.affected], [409, 'confirm_audience', 1]);
    assert.equal((await call('ua', a, { action: 'post.setAlbum', opId: op(), postId: p2.id, albumId: al2.id, confirm: true })).audience, 'followers');

    // Who sees which albums: owner and follower both, a stranger only the open one, a blocked person nothing.
    const list = async (user, profile) => (await call(user, profile, { action: 'album.list', profileId: a }));
    assert.deepEqual((await list('ua', a)).items.map((/** @type {any} */ x) => [x.title, x.count]), [['Мастерские', 1], ['Закрытый', 1]]);
    assert.deepEqual((await list('ub', b)).items.map((/** @type {any} */ x) => [x.title, x.count]), [['Мастерские', 1], ['Закрытый', 1]]);
    const seen = (await list('uc', c)).items;
    assert.deepEqual(seen.map((/** @type {any} */ x) => [x.title, x.count]), [['Мастерские', 1]]);
    assert.equal(seen[0].cover.id, p1.media);
    assert.equal('coverPostId' in seen[0], false);
    assert.equal((await list('ud', d)).status, 404);

    // The gallery: tiles of visible posts with photos, newest first; albums filter; hidden album = not found.
    assert.deepEqual(await tiles(call, 'uc', c, a), [p1.id]);
    assert.deepEqual(await tiles(call, 'ub', b, a), [pf.id, p2.id, p1.id]);
    assert.equal(await tiles(call, 'ud', d, a), 404);
    assert.equal(await tiles(call, 'uc', c, a, { albumId: al2.id }), 404);
    assert.deepEqual(await tiles(call, 'ub', b, a, { albumId: al2.id }), [p2.id]);
    const own = (await call('ua', a, { action: 'gallery.list', profileId: a })).items;
    assert.deepEqual(own.map((/** @type {any} */ t) => [t.audience, t.albumId, t.count]), [['followers', null, 1], ['followers', al2.id, 1], ['all', al1.id, 1]]);
    const strangerTile = (await call('uc', c, { action: 'gallery.list', profileId: a })).items[0];
    assert.equal('albumId' in strangerTile, false);

    // The post editor puts a new post into an album (own albums, posts with photos only).
    const p4 = await photoPost(db, call, 'ua', a, 'Ещё мастерская', { albumId: al1.id });
    assert.equal((await call('ua', a, { action: 'post.saveDraft', opId: op(), post: draft('Без фото', { albumId: al1.id }) })).status, 400);
    assert.equal((await call('ua', a, { action: 'post.saveDraft', opId: op(), post: draft('Чужой', { albumId: foreign, mediaIds: [await asset(db, a)] }) })).status, 400);
    // Into a followers album from the editor: the post becomes followers-only.
    const p5 = await photoPost(db, call, 'ua', a, 'Тоже для своих', { albumId: al2.id });
    assert.equal((await db.query('select audience from feture.post where id = $1', [p5.id]))[0].audience, 'followers');

    // Order and cover: the newest by default, a chosen one when set; oldest first when asked.
    assert.equal((await list('ua', a)).items[0].cover.id, p4.media);
    assert.equal((await call('ua', a, { action: 'album.update', opId: op(), albumId: al1.id, coverPostId: p2.id })).status, 400);
    const upd = (await call('ua', a, { action: 'album.update', opId: op(), albumId: al1.id, coverPostId: p1.id, sort: 'old' })).album;
    assert.deepEqual([upd.cover.id, upd.coverPostId, upd.sort], [p1.media, p1.id, 'old']);
    assert.deepEqual(await tiles(call, 'uc', c, a, { albumId: al1.id }), [p1.id, p4.id]);
    assert.equal((await call('uc', c, { action: 'album.update', opId: op(), albumId: al1.id, sort: 'new' })).status, 404);

    // Pagination follows the album order.
    for (let i = 0; i < 31; i++) await photoPost(db, call, 'ua', a, 'Серия ' + i, { albumId: al1.id });
    const page1 = await call('uc', c, { action: 'gallery.list', profileId: a, albumId: al1.id });
    const page2 = await call('uc', c, { action: 'gallery.list', profileId: a, albumId: al1.id, cursor: page1.next });
    assert.deepEqual([page1.items.length, page2.items.length, page2.next], [30, 3, null]);
    assert.deepEqual(page1.items.slice(0, 2).map((/** @type {any} */ t) => t.postId), [p1.id, p4.id]);

    // Order of albums: one step, or the full order; the order must name exactly the own albums.
    assert.deepEqual((await call('ua', a, { action: 'album.move', opId: op(), albumId: al2.id, direction: 'left' })).order, [al2.id, al1.id]);
    assert.deepEqual((await call('ua', a, { action: 'album.move', opId: op(), albumId: al2.id, direction: 'left' })).order, [al2.id, al1.id]);
    assert.deepEqual((await call('ua', a, { action: 'album.move', opId: op(), order: [al1.id, al2.id] })).order, [al1.id, al2.id]);
    assert.equal((await call('ua', a, { action: 'album.move', opId: op(), order: [al1.id, foreign] })).status, 400);
    assert.equal((await call('ua', a, { action: 'album.move', opId: op(), albumId: foreign, direction: 'right' })).status, 404);

    // Rename keeps titles unique; delete leaves the posts in the gallery and returns what «Отменить» needs.
    assert.equal((await call('ua', a, { action: 'album.rename', opId: op(), albumId: al1.id, title: 'закрытый' })).rule, 'duplicate');
    assert.equal((await call('ua', a, { action: 'album.rename', opId: op(), albumId: al1.id, title: 'Студия' })).title, 'Студия');
    assert.equal((await call('uc', c, { action: 'album.rename', opId: op(), albumId: al1.id, title: 'Моё' })).status, 404);
    assert.equal((await call('uc', c, { action: 'album.delete', opId: op(), albumId: al1.id })).status, 404);
    const del = await call('ua', a, { action: 'album.delete', opId: op(), albumId: al1.id });
    assert.equal(del.postIds.length, 33);
    assert.ok(del.postIds.includes(p1.id) && del.postIds.includes(p4.id));
    assert.deepEqual(del.album, { title: 'Студия', visibility: 'all', sort: 'old', position: 0, coverPostId: p1.id });
    assert.equal((await db.query('select count(*)::int n from feture.post where album_id is null and id = any($1)', [del.postIds]))[0].n, 33);
    assert.equal((await list('ua', a)).items[0].position, 0); // the rest closes the gap
    assert.equal((await call('uc', c, { action: 'post.get', postId: p1.id })).status, 200);
  } finally { await pg.close(); }
});

test('gallery selection and profile photos from posts: album, audience, delete, «В профиль»; all or nothing, own only', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    await call('ub', b, { action: 'follow.set', opId: op(), profileId: a, on: true });
    const q1 = await photoPost(db, call, 'ua', a, 'Один'), q2 = await photoPost(db, call, 'ua', a, 'Два');
    const q3 = await photoPost(db, call, 'ua', a, 'Три'), q4 = await photoPost(db, call, 'ua', a, 'Четыре');
    const theirs = await photoPost(db, call, 'uc', c, 'Чужое');
    const al = (await call('ua', a, { action: 'album.create', opId: op(), title: 'Лето' })).album;

    // All or nothing: one foreign post refuses the whole selection.
    const bad = await call('ua', a, { action: 'gallery.bulk', opId: op(), postIds: [q1.id, theirs.id], change: 'album', albumId: al.id });
    assert.deepEqual([bad.status, bad.fields], [400, ['postIds']]);
    assert.equal((await db.query('select album_id from feture.post where id = $1', [q1.id]))[0].album_id, null);
    assert.equal((await call('ua', a, { action: 'gallery.bulk', opId: op(), postIds: [q1.id], change: 'album' })).status, 400);
    assert.equal((await call('ua', a, { action: 'gallery.bulk', opId: op(), postIds: [q1.id, q2.id], change: 'album', albumId: al.id })).moved, 2);

    // Closing the album narrows its posts — only after the person saw how many.
    const ask = await call('ua', a, { action: 'album.update', opId: op(), albumId: al.id, visibility: 'followers' });
    assert.deepEqual([ask.status, ask.rule, ask.affected], [409, 'confirm_audience', 2]);
    assert.equal((await call('ua', a, { action: 'album.update', opId: op(), albumId: al.id, visibility: 'followers', confirm: true })).narrowed, 2);
    assert.deepEqual(await tiles(call, 'uc', c, a), [q4.id, q3.id]);
    assert.deepEqual(await tiles(call, 'ub', b, a), [q4.id, q3.id, q2.id, q1.id]);
    // Opening the album again opens only the album.
    await call('ua', a, { action: 'album.update', opId: op(), albumId: al.id, visibility: 'all' });
    assert.deepEqual((await call('uc', c, { action: 'album.list', profileId: a })).items.map((/** @type {any} */ x) => x.count), [0]);
    await call('ua', a, { action: 'album.update', opId: op(), albumId: al.id, visibility: 'followers' });

    // Profile photos may be photos of own posts everyone sees; they carry the post for «Открыть публикацию».
    assert.equal((await call('ua', a, { action: 'profile.photosSet', opId: op(), assetIds: [q1.media] })).status, 400); // followers-only post
    assert.equal((await call('ua', a, { action: 'profile.photosSet', opId: op(), assetIds: [theirs.media] })).status, 400);
    assert.deepEqual((await call('ua', a, { action: 'profile.photosSet', opId: op(), assetIds: [q3.media] })).assetIds, [q3.media]);
    let seen = (await call('uc', c, { action: 'profile.get', profileId: a })).profile;
    assert.deepEqual([seen.photos[0].id, seen.photos[0].postId, seen.avatar.id], [q3.media, q3.id, q3.media]);

    // Narrowing a post takes its photo off the profile.
    assert.equal((await call('ua', a, { action: 'gallery.bulk', opId: op(), postIds: [q3.id], change: 'audience', audience: 'followers' })).narrowed, 1);
    seen = (await call('uc', c, { action: 'profile.get', profileId: a })).profile;
    assert.deepEqual([seen.photos.length, seen.avatar], [0, null]);
    assert.equal((await call('ua', a, { action: 'profile.get', profileId: a })).profile.photos.length, 0);
    // Widening goes through the usual edit: staff check it while the post stays for followers.
    const wide = await call('ua', a, { action: 'gallery.bulk', opId: op(), postIds: [q3.id], change: 'audience', audience: 'all' });
    assert.deepEqual([wide.audience, wide.review], ['all', 1]);
    assert.equal((await db.query('select audience from feture.post where id = $1', [q3.id]))[0].audience, 'followers');
    assert.equal((await db.query(`select count(*)::int n from feture.post_revision where post_id = $1 and state = 'review'`, [q3.id]))[0].n, 1);
    // A post in a followers-only album cannot be opened to everyone.
    const closed = await call('ua', a, { action: 'gallery.bulk', opId: op(), postIds: [q1.id, q3.id], change: 'audience', audience: 'all' });
    assert.deepEqual([closed.rule, closed.postIds], ['album_followers_only', [q1.id]]);

    // «В профиль»: photos of posts everyone sees join, followers-only ones are skipped and counted; up to six.
    const prof = await call('ua', a, { action: 'gallery.bulk', opId: op(), postIds: [q4.id, q1.id], change: 'profile' });
    assert.deepEqual([prof.added, prof.skipped, prof.full], [1, 1, false]);
    seen = (await call('ub', b, { action: 'profile.get', profileId: a })).profile;
    assert.deepEqual(seen.photos.map((/** @type {any} */ p) => p.postId), [q4.id]);
    const many = [];
    for (let i = 0; i < 6; i++) many.push((await photoPost(db, call, 'ua', a, 'Фото ' + i)).id);
    const fill = await call('ua', a, { action: 'gallery.bulk', opId: op(), postIds: many, change: 'profile' });
    assert.deepEqual([fill.added, fill.full], [5, true]);

    // Delete: own posts only, their photos leave the profile with them.
    assert.equal((await call('uc', c, { action: 'gallery.bulk', opId: op(), postIds: [q4.id], change: 'delete' })).status, 400);
    assert.deepEqual(await call('ua', a, { action: 'gallery.bulk', opId: op(), postIds: [q4.id, q2.id], change: 'delete' }).then(r => [r.deleted, r.archived]), [2, 0]);
    seen = (await call('ub', b, { action: 'profile.get', profileId: a })).profile;
    assert.equal(seen.photos.length, 5);
    assert.ok(!seen.photos.some((/** @type {any} */ p) => p.postId === q4.id));
    // A single post.delete does the same.
    await call('ua', a, { action: 'post.delete', opId: op(), postId: many[0] });
    assert.equal((await call('ub', b, { action: 'profile.get', profileId: a })).profile.photos.length, 4);

    // Blocked: nothing of the gallery.
    await call('uc', c, { action: 'block.set', opId: op(), profileId: a, on: true });
    assert.equal(await tiles(call, 'ua', a, c), 404);
    assert.equal((await call('ua', a, { action: 'album.list', profileId: c })).status, 404);
  } finally { await pg.close(); }
});

test('couple albums: either partner manages them; widening waits for the partner who asked; delete archives', async () => {
  const { pg, db, call, person, coupleOf } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    const pair = await coupleOf([a, b]);
    const al = (await call('ua', pair, { action: 'album.create', opId: op(), title: 'Мы' })).album;
    assert.equal((await call('ub', pair, { action: 'album.rename', opId: op(), albumId: al.id, title: 'Вдвоём' })).title, 'Вдвоём');
    const p = await photoPost(db, call, 'ua', pair, 'Наше фото', { audience: 'followers' });
    assert.equal((await call('ub', pair, { action: 'post.setAlbum', opId: op(), postId: p.id, albumId: al.id })).albumId, al.id);
    assert.deepEqual((await call('uc', c, { action: 'album.list', profileId: pair })).items.map((/** @type {any} */ x) => x.count), [0]);
    // The partner asked to approve changes: opening the post to everyone waits for them.
    await db.query(`update feture.profile_member set approves_partner = true where profile_id = $1`, [pair]);
    const wide = await call('ua', pair, { action: 'gallery.bulk', opId: op(), postIds: [p.id], change: 'audience', audience: 'all' });
    assert.equal(wide.pending.length, 1);
    // Narrowing and sorting never wait.
    assert.equal((await call('ua', pair, { action: 'post.setAlbum', opId: op(), postId: p.id, albumId: null })).albumId, null);
    const del = await call('ub', pair, { action: 'gallery.bulk', opId: op(), postIds: [p.id], change: 'delete' });
    assert.deepEqual([del.deleted, del.archived], [0, 1]);
    assert.deepEqual(await tiles(call, 'ua', pair, pair), []);
  } finally { await pg.close(); }
});
