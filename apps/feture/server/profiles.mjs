// @ts-check
import { fail } from './errors.mjs';

/** @typedef {import('./db.mjs').Q} Q */
/**
 * The acting profile of a request: who owns what this request writes or reads as «своё».
 * @typedef {Readonly<{accountId: string, profileId: string, kind: 'person' | 'couple',
 *   state: string, partnerAccountId: string | null, partnerApproves: boolean, writable: boolean}>} Acting
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Resolves the `X-Fe-Profile` header. Never falls back to the person profile (V21 guide §5.1).
 * A paused couple stays readable (30-day restore window) but refuses writes.
 * @param {Q} q @param {string} accountId @param {unknown} profileId @param {{write: boolean}} mode
 * @returns {Promise<Acting>} */
export async function actingProfile(q, accountId, profileId, { write }) {
  if (typeof profileId !== 'string' || !UUID.test(profileId)) fail(400, 'profile_required');
  const [row] = await q.query(
    `select p.id, p.kind, p.state, o.account_id partner, coalesce(o.approves_partner, false) partner_approves
     from feture.profile p
     join feture.profile_member m on m.profile_id = p.id and m.account_id = $2 and m.state = 'active'
     left join feture.profile_member o on o.profile_id = p.id and o.account_id <> m.account_id and o.state = 'active'
     where p.id = $1`,
    [profileId, accountId]);
  if (!row || !['active', 'paused'].includes(row.state)) fail(403, 'profile_forbidden');
  const writable = row.state === 'active';
  if (write && !writable) fail(403, 'profile_read_only');
  return Object.freeze({
    accountId,
    profileId: row.id,
    kind: row.kind,
    state: row.state,
    partnerAccountId: row.partner ?? null,
    partnerApproves: row.kind === 'couple' && row.partner_approves === true,
    writable,
  });
}

/** Profiles the account may act as, for «Действовать как». @param {Q} q @param {string} accountId */
export async function myProfiles(q, accountId) {
  return q.query(
    `select p.id, p.kind, p.handle, p.name, p.state, p.avatar_asset_id
     from feture.profile_member m join feture.profile p on p.id = m.profile_id
     where m.account_id = $1 and m.state = 'active' and p.state in ('active', 'paused')
     order by (p.kind = 'person') desc, p.created_at`,
    [accountId]);
}
