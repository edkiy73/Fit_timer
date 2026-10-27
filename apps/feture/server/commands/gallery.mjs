// @ts-check
import { galleryCommands, MAX_ALBUMS } from '../../contracts/gallery.mjs';
import { fail, isUniqueViolation } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { needsPartner, requestApproval } from '../approvals.mjs';
import { mediaDto } from '../media/assets.mjs';
import { otherProfile } from './access.mjs';
import { deletePost, doEdit, postFieldsOf, readCursor } from './posts.mjs';
import { currentPhotos, dropHiddenPostPhotos, setProfilePhotos } from './photos.mjs';

/** Wave 5 «Галерея и альбомы» (V21 galAlbum*, galSel*, postAlbum*, setAlbum, phToggle).
 * The gallery of a profile is the photos of its own published posts for everyone or followers (not discussions, not
 * private «по доступу» / «только я» posts); a tile is a post. Albums group posts; an album «Подписчикам» is seen only by
 * followers and the profile itself, and putting a post there narrows the post to followers too (with `confirm`).
 * Who sees what is SQL only: feture.post_visible for every post, feture.album_visible for albums.
 * Couples: either partner manages the couple's albums directly — sorting into albums and narrowing never need the
 * partner; widening posts to everyone goes through the usual post edit (staff review, partner approval if asked).
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q
 * @typedef {import('../profiles.mjs').Acting} Acting
 */

/** @param {Acting | null} acting @returns {Acting} */
const need = acting => { if (!acting) throw new Error('acting profile missing'); return acting; };

/** A gallery post as the viewer may see it ($1 viewer profile, $2 viewer account; `p` is the post). */
const TILE = `p.state = 'published' and p.community_id is null and p.audience in ('all', 'followers')
  and exists (select 1 from feture.media_attachment a where a.target_type = 'post' and a.target_id = p.id)
  and feture.post_visible(p, $1, $2)`;

/** Whether the gallery is the viewer's own (a member of the profile); someone else's must exist for them (no block).
 * @param {Q} q @param {Acting} viewer @param {string} profileId */
async function galleryOwn(q, viewer, profileId) {
  const [m] = await q.query(`select 1 from feture.profile_member where profile_id = $1 and account_id = $2 and state = 'active'`, [profileId, viewer.accountId]);
  if (m) return true;
  await otherProfile(q, viewer, profileId);
  return false;
}

/** @param {Q} q @param {string} accountId */
async function showExplicit(q, accountId) {
  const [acc] = await q.query('select show_explicit from feture.account where id = $1', [accountId]);
  return !!acc?.show_explicit;
}

/** The first visible photo and the number of visible photos of each post, signed together.
 * @param {Q} q @param {import('../media/assets.mjs').MediaConfig} media @param {Acting} viewer @param {string[]} postIds
 * @param {boolean} own @param {boolean} explicit @returns {Promise<Map<string, {media: any, count: number}>>} */
async function tileMedia(q, media, viewer, postIds, own, explicit) {
  if (!postIds.length) return new Map();
  const rows = await q.query(
    `select a.target_id post_id, m.* from feture.media_attachment a join feture.media_asset m on m.id = a.asset_id
     where a.target_type = 'post' and a.target_id = any($1::uuid[]) order by a.target_id, a.position`, [postIds]);
  const dtos = await Promise.all(rows.map(({ post_id: _, ...m }) =>
    mediaDto(media, m, { viewerProfileId: viewer.profileId, place: own ? 'own' : 'public', showExplicit: explicit }).catch(() => null)));
  /** @type {Map<string, {media: any, count: number}>} */
  const out = new Map();
  rows.forEach((r, i) => {
    const d = dtos[i];
    if (!d) return;
    const t = out.get(r.post_id);
    if (t) t.count++; else out.set(r.post_id, { media: d, count: 1 });
  });
  return out;
}

/** Albums of a profile the viewer may see, with cover and count of posts the viewer may see.
 * @param {Q} q @param {Acting} viewer @param {string} profileId @param {boolean} own @param {any} cfg @param {string} accountId
 * @param {string | null} [onlyId] */
async function albumsOf(q, viewer, profileId, own, cfg, accountId, onlyId = null) {
  const rows = await q.query(
    `select al.id, al.name, al.vis, al.sort, al.position, al.cover_post_id,
       (select count(*)::int from feture.post p where p.album_id = al.id and ${TILE}) n,
       (select p.id from feture.post p where p.album_id = al.id and ${TILE}
         order by (p.id = al.cover_post_id) desc, p.published_at desc, p.id desc limit 1) cover
     from feture.album al
     where al.owner_profile_id = $3 and feture.album_visible(al, $1, $2) and ($4::uuid is null or al.id = $4)
     order by al.position, al.created_at, al.id`, [viewer.profileId, viewer.accountId, profileId, onlyId]);
  const covers = await tileMedia(q, cfg.media, viewer, rows.map(r => r.cover).filter(Boolean), own, await showExplicit(q, accountId));
  return rows.map(r => ({
    id: r.id, title: r.name, visibility: r.vis, sort: r.sort, position: r.position, count: r.n,
    cover: r.cover ? covers.get(r.cover)?.media ?? null : null,
    ...(own ? { coverPostId: r.cover_post_id && r.cover === r.cover_post_id ? r.cover_post_id : null } : {}),
  }));
}

/** An own album, locked. @param {Q} q @param {Acting} acting @param {string} albumId */
async function ownAlbum(q, acting, albumId) {
  const [al] = await q.query('select * from feture.album where id = $1 and owner_profile_id = $2 for update', [albumId, acting.profileId]);
  if (!al) fail(404, 'not_found');
  return al;
}

/** Album names are unique per profile, case-insensitively (V21 albErr21). @param {Q} q @param {Acting} acting
 * @param {string} title @param {string | null} except */
async function requireFreeTitle(q, acting, title, except) {
  const [dup] = await q.query('select 1 from feture.album where owner_profile_id = $1 and lower(name) = lower($2) and id is distinct from $3', [acting.profileId, title, except]);
  if (dup) fail(409, 'conflict', { rule: 'duplicate' });
}

/** Positions 0..n-1 in the given order. @param {Q} q @param {string[]} ids */
async function writeOrder(q, ids) {
  for (const [i, albumId] of ids.entries()) await q.query('update feture.album set position = $2 where id = $1 and position <> $2', [albumId, i]);
}

/** @param {Q} q @param {string} profileId */
async function albumOrder(q, profileId) {
  return (await q.query('select id from feture.album where owner_profile_id = $1 order by position, created_at, id for update', [profileId])).map(r => r.id);
}

/** Own gallery posts (published, everyone/followers, with photos, not discussions), locked; all or none.
 * @param {Q} q @param {Acting} acting @param {string[]} postIds @returns {Promise<any[]>} */
async function ownGalleryPosts(q, acting, postIds) {
  const rows = await q.query(
    `select p.id, p.audience, p.album_id, p.rev, al.vis album_vis from feture.post p left join feture.album al on al.id = p.album_id
     where p.id = any($1::uuid[]) and p.owner_profile_id = $2 and p.state = 'published' and p.community_id is null and p.audience in ('all', 'followers')
       and exists (select 1 from feture.media_attachment a where a.target_type = 'post' and a.target_id = p.id)
     for update of p`, [postIds, acting.profileId]);
  if (rows.length !== postIds.length) fail(400, 'invalid_input', { fields: ['postIds'] });
  return postIds.map(i => rows.find(r => r.id === i));
}

/** Narrows posts for everyone to followers (album «Подписчикам», «Кто видит»): applies at once, never needs the
 * partner; a pending revision of those posts is narrowed too, and their photos leave the profile photos.
 * @param {Q} q @param {Acting} acting @param {string[]} postIds */
async function narrowPosts(q, acting, postIds) {
  if (!postIds.length) return 0;
  const rows = await q.query(
    `update feture.post set audience = 'followers', rev = rev + 1, updated_at = now()
     where id = any($1::uuid[]) and owner_profile_id = $2 and audience = 'all' returning id`, [postIds, acting.profileId]);
  await q.query(
    `update feture.post_revision set payload = jsonb_set(payload, '{audience}', '"followers"')
     where post_id = any($1::uuid[]) and state = 'review' and payload->>'audience' = 'all'`, [postIds]);
  await dropHiddenPostPhotos(q, acting.profileId);
  return rows.length;
}

/** Puts own gallery posts into an album (or none). A followers-only album narrows the posts for everyone, after the
 * person confirmed it (409 `confirm_audience` with how many would change). @param {Q} q @param {Acting} acting
 * @param {any[]} posts @param {string | null} albumId @param {boolean} confirm */
async function moveToAlbum(q, acting, posts, albumId, confirm) {
  const al = albumId ? await ownAlbum(q, acting, albumId) : null;
  const widerThanAlbum = al?.vis === 'followers' ? posts.filter(p => p.audience === 'all').map(p => p.id) : [];
  if (widerThanAlbum.length && !confirm) fail(409, 'conflict', { rule: 'confirm_audience', affected: widerThanAlbum.length });
  const ids = posts.map(p => p.id);
  await q.query('update feture.post set album_id = $2, rev = rev + 1, updated_at = now() where id = any($1::uuid[])', [ids, albumId]);
  const narrowed = await narrowPosts(q, acting, widerThanAlbum);
  return { albumId, moved: ids.length, narrowed };
}

/** @type {Record<keyof typeof galleryCommands, Command['run']>} */
const run = {
  async 'album.list'(q, { acting: a, input, cfg, account }) {
    const viewer = need(a);
    const own = await galleryOwn(q, viewer, input.profileId);
    return { own, items: await albumsOf(q, viewer, input.profileId, own, cfg, account.id) };
  },

  async 'album.create'(q, { acting: a, input, cfg, account }) {
    const acting = need(a);
    const order = await albumOrder(q, acting.profileId);
    if (order.length >= MAX_ALBUMS) fail(422, 'rule_violation', { rule: 'album_limit', max: MAX_ALBUMS });
    await requireFreeTitle(q, acting, input.title, null);
    let id;
    try {
      [{ id }] = await q.query('insert into feture.album (owner_profile_id, name, position) values ($1, $2, $3) returning id', [acting.profileId, input.title, order.length]);
    } catch (error) {
      if (isUniqueViolation(error)) fail(409, 'conflict', { rule: 'duplicate' });
      throw error;
    }
    if (acting.kind === 'couple') await enqueue(q, 'couple.changed', acting.profileId, { for: acting.partnerAccountId, what: 'album' });
    return { album: (await albumsOf(q, acting, acting.profileId, true, cfg, account.id, id))[0] };
  },

  async 'album.rename'(q, { acting: a, input }) {
    const acting = need(a);
    await ownAlbum(q, acting, input.albumId);
    await requireFreeTitle(q, acting, input.title, input.albumId);
    await q.query('update feture.album set name = $2 where id = $1', [input.albumId, input.title]);
    return { id: input.albumId, title: input.title };
  },

  async 'album.delete'(q, { acting: a, input }) {
    const acting = need(a);
    await albumOrder(q, acting.profileId); // locks the order before one leaves it
    const al = await ownAlbum(q, acting, input.albumId);
    // Posts stay in the gallery, just without an album (V21 galAlbumDelete); what was here is returned for «Отменить»:
    // album.create with the title, album.update with the settings, gallery.bulk {change: 'album'} with the posts.
    const postIds = (await q.query('select id from feture.post where album_id = $1 order by published_at desc nulls last, id desc', [input.albumId])).map(r => r.id);
    await q.query('delete from feture.album where id = $1', [input.albumId]);
    await writeOrder(q, await albumOrder(q, acting.profileId));
    if (acting.kind === 'couple') await enqueue(q, 'couple.changed', acting.profileId, { for: acting.partnerAccountId, what: 'album' });
    return {
      deleted: input.albumId, postIds,
      album: { title: al.name, visibility: al.vis, sort: al.sort, position: al.position, coverPostId: al.cover_post_id },
    };
  },

  async 'album.update'(q, { acting: a, input, cfg, account }) {
    const acting = need(a);
    const al = await ownAlbum(q, acting, input.albumId);
    let narrowed = 0;
    if (input.visibility === 'followers' && al.vis !== 'followers') {
      // «Публикации альбома тоже станут видны только подписчикам — в ленте, профиле и галерее» (V21 galAlbumVis).
      const wide = (await q.query(`select id from feture.post where album_id = $1 and audience = 'all' and state <> 'archived' for update`, [input.albumId])).map(r => r.id);
      if (wide.length && !input.confirm) fail(409, 'conflict', { rule: 'confirm_audience', affected: wide.length });
      narrowed = await narrowPosts(q, acting, wide);
    }
    // Opening an album to everyone opens only the album: its posts keep their audience (V21 «Только альбом»);
    // widening them is gallery.bulk {change: 'audience', audience: 'all'}.
    if (input.coverPostId) {
      const [p] = await q.query(
        `select 1 from feture.post p where p.id = $1 and p.album_id = $2 and p.owner_profile_id = $3 and p.state = 'published'
           and exists (select 1 from feture.media_attachment a where a.target_type = 'post' and a.target_id = p.id)`, [input.coverPostId, input.albumId, acting.profileId]);
      if (!p) fail(400, 'invalid_input', { fields: ['coverPostId'] });
    }
    await q.query(
      `update feture.album set vis = coalesce($2, vis), sort = coalesce($3, sort), cover_post_id = case when $4 then $5::uuid else cover_post_id end where id = $1`,
      [input.albumId, input.visibility ?? null, input.sort ?? null, input.coverPostId !== undefined, input.coverPostId ?? null]);
    return { album: (await albumsOf(q, acting, acting.profileId, true, cfg, account.id, input.albumId))[0], narrowed };
  },

  async 'album.move'(q, { acting: a, input }) {
    const acting = need(a);
    const order = await albumOrder(q, acting.profileId);
    let next;
    if (input.order) {
      if (input.order.length !== order.length || input.order.some((/** @type {string} */ i) => !order.includes(i))) fail(400, 'invalid_input', { fields: ['order'] });
      next = input.order;
    } else {
      const i = order.indexOf(input.albumId);
      if (i < 0) fail(404, 'not_found');
      const j = i + (input.direction === 'left' ? -1 : 1);
      next = [...order];
      if (j >= 0 && j < order.length) [next[i], next[j]] = [next[j], next[i]]; // at the edge it stays where it is
    }
    await writeOrder(q, next);
    return { order: next };
  },

  async 'post.setAlbum'(q, { acting: a, input }) {
    const acting = need(a);
    const [p] = await q.query('select id from feture.post where id = $1 and owner_profile_id = $2', [input.postId, acting.profileId]);
    if (!p) fail(404, 'not_found');
    const [post] = await q.query(
      `select p.id, p.audience from feture.post p where p.id = $1 and p.state = 'published' and p.community_id is null and p.audience in ('all', 'followers')
         and exists (select 1 from feture.media_attachment a where a.target_type = 'post' and a.target_id = p.id) for update`, [input.postId]);
    // Only gallery posts go into albums: published, with photos, for everyone or followers (V21 ME-044).
    if (!post) fail(422, 'rule_violation', { rule: 'not_in_gallery' });
    await moveToAlbum(q, acting, [post], input.albumId, input.confirm);
    const [{ audience, rev }] = await q.query('select audience, rev from feture.post where id = $1', [input.postId]);
    return { postId: input.postId, albumId: input.albumId, audience, rev };
  },

  async 'gallery.list'(q, { acting: a, input, cfg, account }) {
    const viewer = need(a);
    const own = await galleryOwn(q, viewer, input.profileId);
    let sort = 'new';
    if (input.albumId) {
      const [al] = await q.query('select al.sort from feture.album al where al.id = $3 and al.owner_profile_id = $4 and feture.album_visible(al, $1, $2)',
        [viewer.profileId, viewer.accountId, input.albumId, input.profileId]);
      if (!al) fail(404, 'not_found');
      sort = al.sort;
    }
    const cur = readCursor(input.cursor);
    // The two orders are fixed strings: the album's «Сначала новые / старые» (V21 galAlbumSort).
    const [cmp, dir] = sort === 'old' ? ['>', 'asc'] : ['<', 'desc'];
    const rows = await q.query(
      `select p.id, p.published_at, p.audience, p.album_id from feture.post p
       where p.owner_profile_id = $3 and ${TILE} and ($4::uuid is null or p.album_id = $4)
         and ($5::timestamptz is null or (p.published_at, p.id) ${cmp} ($5::timestamptz, $6::uuid))
       order by p.published_at ${dir}, p.id ${dir} limit 31`,
      [viewer.profileId, viewer.accountId, input.profileId, input.albumId ?? null, cur?.at ?? null, cur?.id ?? null]);
    const page = rows.slice(0, 30);
    const media = await tileMedia(q, cfg.media, viewer, page.map(r => r.id), own, await showExplicit(q, account.id));
    const items = page.filter(r => media.has(r.id)).map(r => ({
      postId: r.id, media: media.get(r.id)?.media, count: media.get(r.id)?.count, publishedAt: r.published_at,
      // Owners see audience and album (selection mode); others only the «Подписчикам» mark, never album ids.
      ...(own ? { audience: r.audience, albumId: r.album_id } : r.audience === 'all' ? {} : { audience: r.audience }),
    }));
    const last = page[page.length - 1];
    return { items, next: rows.length > 30 ? Buffer.from(JSON.stringify([new Date(last.published_at).toISOString(), last.id])).toString('base64url') : null };
  },

  async 'gallery.bulk'(q, { acting: a, input }) {
    const acting = need(a);
    const posts = await ownGalleryPosts(q, acting, input.postIds);
    if (input.change === 'album') return moveToAlbum(q, acting, posts, input.albumId ?? null, input.confirm);

    if (input.change === 'audience' && input.audience === 'followers') {
      return { audience: 'followers', narrowed: await narrowPosts(q, acting, posts.map(p => p.id)) };
    }

    if (input.change === 'audience') {
      // Widening to everyone: a post in a followers-only album stays for followers (the album is narrower).
      const inClosed = posts.filter(p => p.album_vis === 'followers').map(p => p.id);
      if (inClosed.length) fail(422, 'rule_violation', { rule: 'album_followers_only', postIds: inClosed });
      // Each post goes through the usual edit: a wider audience of a post with photos is checked by staff while the
      // current version stays live (V21 editNeedsReview); a couple's partner approves first when they asked to.
      const pending = [];
      let review = 0;
      for (const p of posts.filter(x => x.audience !== 'all')) {
        const f = { ...(await postFieldsOf(q, p.id)), audience: 'all' };
        if (needsPartner(acting, 'post.edit')) {
          pending.push((await requestApproval(q, acting, { kind: 'post.edit', targetType: 'post', targetId: p.id, change: { rev: p.rev, post: f }, summary: ['post'] })).approvalId);
        } else {
          const r = await doEdit(q, p.id, acting, p.rev, f);
          if ('review' in r && r.review) review++;
        }
      }
      return { audience: 'all', review, ...(pending.length ? { pending } : {}) };
    }

    if (input.change === 'delete') {
      let deleted = 0, archived = 0;
      for (const p of posts) { if ((await deletePost(q, acting, p.id)) === 'deleted') deleted++; else archived++; }
      await dropHiddenPostPhotos(q, acting.profileId);
      if (acting.kind === 'couple') await enqueue(q, 'couple.changed', acting.profileId, { for: acting.partnerAccountId, what: 'post_archived' });
      return { deleted, archived };
    }

    // «В профиль»: photos of the selected posts everyone sees join the profile photos, up to six (V21 galSelProf);
    // followers-only posts are skipped and named. At most one video, never first.
    const ids = posts.map(p => p.id);
    const candidates = await q.query(
      `select m.id, m.kind, p.id post_id from unnest($1::uuid[]) with ordinality s(pid, n) join feture.post p on p.id = s.pid
       join feture.media_attachment a on a.target_type = 'post' and a.target_id = p.id join feture.media_asset m on m.id = a.asset_id
       where feture.post_public(p) and m.state = 'approved' order by s.n, a.position`, [ids]);
    const current = await currentPhotos(q, acting.profileId);
    const kinds = new Map((await q.query('select id, kind from feture.media_asset where id = any($1::uuid[])', [current])).map(r => [r.id, r.kind]));
    const list = [...current];
    let full = false;
    for (const c of candidates) {
      if (list.includes(c.id)) continue;
      if (list.length >= 6) { full = true; break; }
      if (c.kind === 'video' && (!list.length || list.some(i => kinds.get(i) === 'video'))) continue;
      list.push(c.id); kinds.set(c.id, c.kind);
    }
    const skipped = ids.filter(i => !candidates.some(c => c.post_id === i)).length;
    const out = list.length === current.length ? {} : await setProfilePhotos(q, acting, list);
    return { added: list.length - current.length, skipped, full, ...('pending' in out ? { pending: out.pending } : {}) };
  },
};

/** @type {Record<string, Command>} */
export const gallery = Object.fromEntries(
  Object.entries(galleryCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
