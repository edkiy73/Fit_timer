// @ts-check
/** Private-part access shared by profile views, interests and access commands (S1 §6).
 * A grant counts only when: not revoked and not expired; it was issued to the profile the viewer acts as now;
 * the viewing account is one of the grant's viewers (a couple grant is for both members, not a new partner);
 * the owner's private part is on and the owner profile is active.
 * @typedef {import('./db.mjs').Q} Q @typedef {import('./profiles.mjs').Acting} Acting
 * @typedef {'info' | 'photos' | 'video' | 'interests'} Scope
 */

// info = the description (and profile details shown «по доступу»), interests = the «По доступу» interests.
export const SCOPES = /** @type {const} */ (['info', 'photos', 'video', 'interests']);
// declineUndoSeconds: a decline can be taken back this long; until then the requester sees the request as waiting.
export const LIMITS = Object.freeze({ photos: 12, videos: 6, requestsPerDay: 10, reaskDays: 30, declineUndoSeconds: 10 });

/** Scopes the viewer may see in the owner's private part (empty when none). @param {Q} q @param {string} ownerProfileId @param {Acting} viewer
 * @returns {Promise<Scope[]>} */
export async function grantedScopes(q, ownerProfileId, viewer) {
  if (ownerProfileId === viewer.profileId) return [...SCOPES];
  const [row] = await q.query(
    `select g.scopes from feture.access_grant g
     join feture.profile_settings s on s.profile_id = g.owner_profile_id
     join feture.profile p on p.id = g.owner_profile_id
     join feture.profile v on v.id = g.viewer_profile_id
     where g.owner_profile_id = $1 and g.viewer_profile_id = $2 and g.revoked_at is null
       and (g.until is null or g.until > now()) and $3 = any(g.viewer_account_ids) and s.private_on
       and p.state = 'active' and v.state = 'active'`,
    [ownerProfileId, viewer.profileId, viewer.accountId]);
  return row?.scopes ?? [];
}

/** Which scopes the owner's private part actually has, so only those can be asked for or given.
 * @param {Q} q @param {string} ownerProfileId @returns {Promise<Scope[]>} */
export async function availableScopes(q, ownerProfileId) {
  const [r] = await q.query(
    `select
       coalesce((select text <> '' from feture.private_part where profile_id = $1), false) info,
       exists (select 1 from feture.interest i join feture.topic t on t.id = i.topic_id where i.profile_id = $1 and i.vis = 'granted' and not t.hidden) interests,
       exists (select 1 from feture.media_attachment a join feture.media_asset m on m.id = a.asset_id
               where a.target_type = 'private' and a.target_id = $1 and m.kind = 'image' and m.state in ('uploaded', 'scanning', 'needs_review', 'approved')) photos,
       exists (select 1 from feture.media_attachment a join feture.media_asset m on m.id = a.asset_id
               where a.target_type = 'private' and a.target_id = $1 and m.kind = 'video' and m.state in ('uploaded', 'scanning', 'needs_review', 'approved')) video`,
    [ownerProfileId]);
  return SCOPES.filter(s => r[s]);
}

/** Serialises everything that opens or closes the owner's private part (grant, request, switch off, close all):
 * a grant can never slip in after a «close everything» read the grants. @param {Q} q @param {string} ownerProfileId */
export async function lockOwner(q, ownerProfileId) {
  await q.query('select 1 from feture.profile_settings where profile_id = $1 for update', [ownerProfileId]);
}

/** Members of a profile, for a couple both: the accounts a grant is for. @param {Q} q @param {string} profileId */
export async function memberAccounts(q, profileId) {
  const rows = await q.query(`select account_id from feture.profile_member where profile_id = $1 and state = 'active' order by account_id`, [profileId]);
  return rows.map(r => /** @type {string} */ (r.account_id));
}

/** Two profiles that share a member (I and my own couple) never request or grant each other.
 * @param {Q} q @param {string} a @param {string} b */
export async function related(q, a, b) {
  const [r] = await q.query(
    `select exists (select 1 from feture.profile_member x join feture.profile_member y on x.account_id = y.account_id
       where x.profile_id = $1 and y.profile_id = $2 and x.state = 'active' and y.state = 'active') related`, [a, b]);
  return !!r.related;
}
