// @ts-check
import { photosCommands } from '../../contracts/photos.mjs';
import { fail } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { needsPartner, registerApprovalKind, requestApproval } from '../approvals.mjs';
import { mediaDto } from '../media/assets.mjs';

/** Profile photos: media of purpose `avatar` attached to the profile in order (S3 §8). Others see only approved, safe
 * photos; the avatar is the first approved safe image, so a profile never shows a photo before its checks (AUTH-019:
 * without one it stays out of Discover). Removing or reordering applies at once; adding to a couple's photos is a
 * widening the partner decides on when they asked to.
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q
 * @typedef {import('../profiles.mjs').Acting} Acting
 */

/** @param {Acting | null} acting @returns {Acting} */
const need = acting => { if (!acting) throw new Error('acting profile missing'); return acting; };

/** Recomputes the avatar: the first approved, safe image among the profile's photos. @param {Q} q @param {string} profileId */
export async function settleAvatar(q, profileId) {
  await q.query(
    `update feture.profile p set avatar_asset_id = (
       select a.asset_id from feture.media_attachment a join feture.media_asset m on m.id = a.asset_id
       where a.target_type = 'avatar' and a.target_id = p.id and m.state = 'approved' and m.explicitness = 'safe' and m.kind = 'image'
         and (m.purpose = 'avatar' or feture.photo_post(m.id, p.id) is not null)
       order by a.position limit 1)
     where p.id = $1`, [profileId]);
}

/** Profiles whose photos include the asset (after it was approved, hidden or removed). @param {Q} q @param {string} assetId */
export async function settleAvatarsOf(q, assetId) {
  const rows = await q.query(`select target_id from feture.media_attachment where target_type = 'avatar' and asset_id = $1`, [assetId]);
  for (const r of rows) await settleAvatar(q, r.target_id);
}

/** The profile's photos as the viewer may see them, in order. A photo taken from one of the profile's posts carries
 * `postId` («Открыть публикацию») and is shown only while that post is public (feture.post_public): a post narrowed,
 * removed, disputed or deleted takes its photo off the profile. @param {Q} q @param {string} profileId
 * @param {string} viewerProfileId @param {import('../media/assets.mjs').MediaConfig} media */
export async function photosFor(q, profileId, viewerProfileId, media) {
  const assets = await q.query(
    `select m.*, case when m.purpose = 'avatar' then null else feture.photo_post(m.id, $1) end post_id
     from feture.media_attachment a join feture.media_asset m on m.id = a.asset_id
     where a.target_type = 'avatar' and a.target_id = $1 order by a.position`, [profileId]);
  const out = [];
  for (const { post_id: postId, ...asset } of assets) {
    if (asset.purpose !== 'avatar' && !postId) continue;
    const dto = await mediaDto(media, asset, { viewerProfileId, place: 'public', showExplicit: false, staff: false }).catch(() => null);
    if (dto) out.push(postId ? { ...dto, postId } : dto);
  }
  return out;
}

/** After the owner narrowed, moved or deleted posts: photos of posts that are no longer public leave the profile
 * photos for good (V21 syncMediaProjection19), and the avatar is recomputed. Photos hidden by staff or a dispute are
 * only filtered on read (photosFor, settleAvatar), so a restored post brings them back. @param {Q} q @param {string} profileId */
export async function dropHiddenPostPhotos(q, profileId) {
  await q.query(
    `delete from feture.media_attachment a using feture.media_asset m
     where a.target_type = 'avatar' and a.target_id = $1 and m.id = a.asset_id and m.purpose <> 'avatar'
       and feture.photo_post(m.id, $1) is null`, [profileId]);
  await settleAvatar(q, profileId);
}

/** The profile's photo list in order (asset ids). @param {Q} q @param {string} profileId */
export async function currentPhotos(q, profileId) {
  return (await q.query(`select asset_id from feture.media_attachment where target_type = 'avatar' and target_id = $1 order by position`, [profileId])).map(r => r.asset_id);
}

/** @param {Q} q @param {string} profileId @param {string[]} ids */
async function doPhotosSet(q, profileId, ids) {
  await q.query('select 1 from feture.profile where id = $1 for update', [profileId]); // one list change at a time
  const assets = ids.length ? await q.query(
    `select id, kind from feture.media_asset m where id = any($1) and owner_profile_id = $2
       and state in ('uploaded', 'scanning', 'needs_review', 'approved')
       -- an uploaded profile photo, or a photo of the profile's own post that everyone sees (V21 phToggle / galSelProf)
       and (purpose = 'avatar' or purpose in ('post', 'gallery') and feture.photo_post(m.id, $2) is not null)`, [ids, profileId]) : [];
  if (assets.length !== ids.length) fail(400, 'invalid_input', { fields: ['assetIds'] });
  const kind = Object.fromEntries(assets.map(a => [a.id, a.kind]));
  // At most one video, and never the first photo (the avatar is a picture).
  if (ids.filter(i => kind[i] === 'video').length > 1 || (ids.length && kind[ids[0]] === 'video')) fail(422, 'rule_violation', { rule: 'video_rules' });
  await q.query(`delete from feture.media_attachment where target_type = 'avatar' and target_id = $1`, [profileId]);
  for (const [position, assetId] of ids.entries()) {
    await q.query(`insert into feture.media_attachment (asset_id, target_type, target_id, position) values ($1, 'avatar', $2, $3)`, [assetId, profileId, position]);
  }
  await settleAvatar(q, profileId);
  return { assetIds: ids };
}

registerApprovalKind('profile.photos', {
  apply: async (q, row) => {
    // The partner approved the additions; anything removed from the list since stays removed.
    const c = /** @type {any} */ (row.change);
    await q.query('select 1 from feture.profile where id = $1 for update', [row.profile_id]);
    const now = await currentPhotos(q, row.profile_id);
    await doPhotosSet(q, row.profile_id, c.assetIds.filter((/** @type {string} */ i) => now.includes(i) || c.adds.includes(i)));
  },
});

/** The profile photo list as the owner sets it (profile.photosSet, and «В профиль» of the gallery selection).
 * @param {Q} q @param {Acting} acting @param {string[]} assetIds */
export async function setProfilePhotos(q, acting, assetIds) {
  const current = await currentPhotos(q, acting.profileId);
  const adds = assetIds.filter(i => !current.includes(i));
  if (adds.length && needsPartner(acting, 'profile.photos')) {
    // Removals and reordering of photos already there apply now; the new ones wait for the partner.
    const keep = assetIds.filter(i => current.includes(i));
    if (JSON.stringify(keep) !== JSON.stringify(current)) await doPhotosSet(q, acting.profileId, keep);
    return { pending: await requestApproval(q, acting, { kind: 'profile.photos', targetType: 'profile', targetId: acting.profileId, change: { assetIds, adds }, summary: ['photos'] }) };
  }
  const out = await doPhotosSet(q, acting.profileId, assetIds);
  if (acting.kind === 'couple') await enqueue(q, 'couple.changed', acting.profileId, { for: acting.partnerAccountId, what: 'photos' });
  return out;
}

/** @type {Record<keyof typeof photosCommands, Command['run']>} */
const run = {
  async 'profile.photosSet'(q, { acting: a, input }) {
    return setProfilePhotos(q, need(a), input.assetIds);
  },
};

/** @type {Record<string, Command>} */
export const photos = Object.fromEntries(
  Object.entries(photosCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
