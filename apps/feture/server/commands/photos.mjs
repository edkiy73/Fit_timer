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
       order by a.position limit 1)
     where p.id = $1`, [profileId]);
}

/** Profiles whose photos include the asset (after it was approved, hidden or removed). @param {Q} q @param {string} assetId */
export async function settleAvatarsOf(q, assetId) {
  const rows = await q.query(`select target_id from feture.media_attachment where target_type = 'avatar' and asset_id = $1`, [assetId]);
  for (const r of rows) await settleAvatar(q, r.target_id);
}

/** The profile's photos as the viewer may see them, in order. @param {Q} q @param {string} profileId
 * @param {string} viewerProfileId @param {import('../media/assets.mjs').MediaConfig} media */
export async function photosFor(q, profileId, viewerProfileId, media) {
  const assets = await q.query(
    `select m.* from feture.media_attachment a join feture.media_asset m on m.id = a.asset_id
     where a.target_type = 'avatar' and a.target_id = $1 order by a.position`, [profileId]);
  const out = [];
  for (const asset of assets) {
    const dto = await mediaDto(media, asset, { viewerProfileId, place: 'public', showExplicit: false, staff: false }).catch(() => null);
    if (dto) out.push(dto);
  }
  return out;
}

/** @param {Q} q @param {string} profileId @param {string[]} ids */
async function doPhotosSet(q, profileId, ids) {
  const assets = ids.length ? await q.query(
    `select id, kind from feture.media_asset where id = any($1) and owner_profile_id = $2 and purpose = 'avatar'
       and state in ('uploaded', 'scanning', 'needs_review', 'approved')`, [ids, profileId]) : [];
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
  apply: async (q, row) => { await doPhotosSet(q, row.profile_id, /** @type {any} */ (row.change).assetIds); },
});

/** @type {Record<keyof typeof photosCommands, Command['run']>} */
const run = {
  async 'profile.photosSet'(q, { acting: a, input }) {
    const acting = need(a);
    const current = (await q.query(`select asset_id from feture.media_attachment where target_type = 'avatar' and target_id = $1`, [acting.profileId])).map(r => r.asset_id);
    const adds = input.assetIds.some((/** @type {string} */ i) => !current.includes(i));
    if (adds && needsPartner(acting, 'profile.photos')) {
      return { pending: await requestApproval(q, acting, { kind: 'profile.photos', targetType: 'profile', targetId: acting.profileId, change: { assetIds: input.assetIds }, summary: ['photos'] }) };
    }
    const out = await doPhotosSet(q, acting.profileId, input.assetIds);
    if (acting.kind === 'couple') await enqueue(q, 'couple.changed', acting.profileId, { for: acting.partnerAccountId, what: 'photos' });
    return out;
  },
};

/** @type {Record<string, Command>} */
export const photos = Object.fromEntries(
  Object.entries(photosCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
