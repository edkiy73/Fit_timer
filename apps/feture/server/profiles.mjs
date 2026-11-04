// @ts-check
import { fail } from './errors.mjs';
import { OLD_MODE } from '../contracts/_approve.mjs';

/** @typedef {import('./db.mjs').Q} Q */
/**
 * The acting profile of a request: who owns what this request writes or reads as «своё».
 * @typedef {Readonly<{accountId: string, profileId: string, kind: 'person' | 'couple',
 *   state: string, partnerAccountId: string | null, partnerApproves: boolean, partnerScope?: readonly string[], writable: boolean}>} Acting
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Resolves the `X-Fe-Profile` header. Never falls back to the person profile (V21 guide §5.1).
 * A paused couple stays readable (30-day restore window) but refuses writes, except commands made for that
 * window (`allowPaused`: restore).
 * @param {Q} q @param {string} accountId @param {unknown} profileId @param {{write: boolean, allowPaused?: boolean}} mode
 * @returns {Promise<Acting>} */
export async function actingProfile(q, accountId, profileId, { write, allowPaused = false }) {
  if (typeof profileId !== 'string' || !UUID.test(profileId)) fail(400, 'profile_required');
  const [row] = await q.query(
    `select p.id, p.kind, p.state, o.account_id partner, coalesce(o.approves_partner, false) partner_approves, coalesce(o.approves_scope, '{}') partner_scope
     from feture.profile p
     join feture.profile_member m on m.profile_id = p.id and m.account_id = $2 and m.state = 'active'
     left join feture.profile_member o on o.profile_id = p.id and o.account_id <> m.account_id and o.state = 'active'
     where p.id = $1`,
    [profileId, accountId]);
  if (!row || !['active', 'paused'].includes(row.state)) fail(403, 'profile_forbidden');
  const writable = row.state === 'active';
  if (write && !writable && !(allowPaused && row.state === 'paused')) fail(403, 'profile_read_only');
  return Object.freeze({
    accountId,
    profileId: row.id,
    kind: row.kind,
    state: row.state,
    partnerAccountId: row.partner ?? null,
    partnerApproves: row.kind === 'couple' && row.partner_approves === true,
    // What the partner asks to approve (audit item 20): the points of contracts/_approve.mjs.
    // An on/off mode set without points (an older path) counts as the points the old mode covered.
    partnerScope: Object.freeze(row.kind !== 'couple' ? [] : row.partner_scope?.length ? [...row.partner_scope] : row.partner_approves ? [...OLD_MODE] : []),
    writable,
  });
}

/** The restriction in force on a person profile — what it limits and until when — or null.
 * @param {Q} q @param {string | null} personId @returns {Promise<{scope: string[] | null, until: string | null} | null>} */
export async function restrictionOf(q, personId) {
  if (!personId) return null;
  const [r] = await q.query(
    `select restriction_scope scope, restricted_until until from feture.profile
     where id = $1 and restricted_at is not null and (restricted_until is null or restricted_until > now())`, [personId]);
  return r ? { scope: r.scope ?? null, until: r.until ? new Date(r.until).toISOString() : null } : null;
}

/** A restricted profile (S4 §4, audit item 6) may not do what its restriction names (`point`, one of RESTRICT_SCOPES in
 * contracts/moderation.mjs). A person's restriction covers the couples they act as. The refusal says until when.
 * @param {Q} q @param {Acting} acting @param {import('../contracts/_restrict.mjs').RestrictScope} point */
export async function requireUnrestricted(q, acting, point) {
  const [{ r }] = await q.query('select feture.restricted_in($1, $2) r', [acting.profileId, point]);
  if (!r) return;
  const [{ until }] = await q.query(
    `select max(x.restricted_until) until from feture.profile x where x.id = $1 or x.id in (select a.person_profile_id from feture.profile_member m
       join feture.account a on a.id = m.account_id where m.profile_id = $1 and m.state = 'active')`, [acting.profileId]);
  fail(403, 'forbidden', { rule: 'restricted', ...(until ? { until: new Date(until).toISOString() } : {}) });
}

/** Profiles the account may act as, for «Действовать как». @param {Q} q @param {string} accountId */
export async function myProfiles(q, accountId) {
  return q.query(
    `select p.id, p.kind, p.handle, p.name, p.state, p.avatar_asset_id, p.ended_at is not null ended
     from feture.profile_member m join feture.profile p on p.id = m.profile_id
     where m.account_id = $1 and m.state = 'active' and p.state in ('active', 'paused')
     order by (p.kind = 'person') desc, p.ended_at is not null, p.created_at`,
    [accountId]);
}

/** SQL: profile `expr` belongs to an e2e persona account (feture.account.qa, set at account.create from a
 * qa-…@feture.test login). Discover keeps them away from everyone else; qa viewers still meet each other.
 * @param {string} expr */
export const qaProfile = expr => `exists (select 1 from feture.profile_member qm join feture.account qa on qa.id = qm.account_id where qm.profile_id = ${expr} and qa.qa)`;
