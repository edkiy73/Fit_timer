// @ts-check
import { accessCommands } from '../../contracts/access.mjs';
import { requireUnrestricted } from '../profiles.mjs';
import { fail } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { needsPartner, narrowCouple, registerApprovalKind, requestApproval } from '../approvals.mjs';
import { mediaDto } from '../media/assets.mjs';
import { availableScopes, grantedScopes, LIMITS, lockOwner, memberAccounts, related } from '../access.mjs';

/** Slice C2: private part and access (S1 §6). Narrowing (decline, narrow, revoke, switch off) applies at once;
 * opening the private part of a couple to someone always needs both partners (V21 «только вдвоём»).
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q
 * @typedef {import('../profiles.mjs').Acting} Acting @typedef {import('../access.mjs').Scope} Scope
 */

const TERM = { none: null, '1d': '1 day', '7d': '7 days', '30d': '30 days' };

/** @param {Acting | null} acting @returns {Acting} */
const need = acting => { if (!acting) throw new Error('acting profile missing'); return acting; };
/** @param {Acting} acting */
const personOnly = acting => { if (acting.kind !== 'person') fail(422, 'rule_violation', { rule: 'couple_changes_not_available' }); };

/** Why the viewer cannot ask for the owner's private part right now, or null. @param {Q} q @param {Acting} viewer @param {string} ownerId */
async function requestBlocker(q, viewer, ownerId) {
  const [o] = await q.query(
    `select p.state, s.private_on, s.requests_from from feture.profile p join feture.profile_settings s on s.profile_id = p.id where p.id = $1`, [ownerId]);
  if (!o || o.state !== 'active') return 'unavailable';
  if ((await q.query('select feture.blocked($1, $2) b', [viewer.profileId, ownerId]))[0].b) return 'unavailable';
  if (!o.private_on) return 'private_off';
  if (await related(q, viewer.profileId, ownerId)) return 'related';
  // «Только взаимные» opens with matches (slice F); until then nobody qualifies.
  if (o.requests_from !== 'all') return 'not_accepting';
  const [r] = await q.query(
    `select
       exists (select 1 from feture.access_request where requester_profile_id = $1 and owner_profile_id = $2 and state = 'pending') pending,
       (select decided_at + make_interval(days => $3) from feture.access_request
         where requester_profile_id = $1 and owner_profile_id = $2 and state = 'declined' order by decided_at desc limit 1) reask_at`,
    [viewer.profileId, ownerId, LIMITS.reaskDays]);
  if (r.pending) return 'pending';
  if (r.reask_at && new Date(r.reask_at) > new Date()) return 'cooldown';
  return null;
}

/** Requests sent from any of the account's profiles in the last 24 h count against one daily limit. @param {Q} q @param {Acting} acting */
async function quotaLeft(q, acting) {
  const [{ n }] = await q.query(
    `select count(*)::int n from feture.access_request r
     where r.created_at > now() - interval '1 day'
       and r.requester_profile_id in (select profile_id from feture.profile_member where account_id = $1)`,
    [acting.accountId]);
  return Math.max(0, LIMITS.requestsPerDay - n);
}

/** Issues (or replaces) the grant for a pending request; shared by the direct path and the couple approval.
 * @param {Q} q @param {{requestId: string, ownerId: string, scopes: Scope[], term: keyof typeof TERM, by: string}} g */
async function applyGrant(q, { requestId, ownerId, scopes, term, by }) {
  await lockOwner(q, ownerId);
  const [r] = await q.query(
    `select r.*, s.private_on, p.state owner_state from feture.access_request r
     join feture.profile_settings s on s.profile_id = r.owner_profile_id join feture.profile p on p.id = r.owner_profile_id
     where r.id = $1 and r.owner_profile_id = $2 for update of r`, [requestId, ownerId]);
  if (!r || r.state !== 'pending') fail(409, 'conflict', { state: r?.state ?? 'missing' });
  if (!r.private_on || r.owner_state !== 'active') fail(422, 'rule_violation', { rule: 'private_off' });
  const available = await availableScopes(q, ownerId);
  if (!scopes.every(s => available.includes(s))) fail(422, 'rule_violation', { rule: 'scope_not_available' });
  await q.query(`update feture.access_grant set revoked_at = now() where owner_profile_id = $1 and viewer_profile_id = $2 and revoked_at is null`,
    [ownerId, r.requester_profile_id]);
  const interval = TERM[term];
  await q.query(
    `insert into feture.access_grant (owner_profile_id, viewer_profile_id, viewer_account_ids, scopes, until, request_id, granted_by)
     values ($1, $2, $3, $4, case when $5::text is null then null else now() + $5::interval end, $6, $7)`,
    [ownerId, r.requester_profile_id, r.viewer_account_ids, scopes, interval, requestId, by]);
  const partial = r.scopes.some((/** @type {string} */ s) => !scopes.includes(/** @type {Scope} */ (s)));
  await q.query(`update feture.access_request set state = $2, decided_at = now(), decided_by = $3 where id = $1`,
    [requestId, partial ? 'partial' : 'granted', by]);
  await enqueue(q, 'access.granted', r.requester_profile_id, { requestId, owner: ownerId });
  return { state: partial ? 'partial' : 'granted' };
}

// Opening a couple's private part to someone is always decided by both partners.
registerApprovalKind('access.grant', {
  always: true,
  apply: async (q, row) => {
    const c = /** @type {{requestId: string, scopes: Scope[], term: keyof typeof TERM}} */ (row.change);
    await applyGrant(q, { requestId: c.requestId, ownerId: row.profile_id, scopes: c.scopes, term: c.term, by: row.requested_by });
  },
});
registerApprovalKind('private.on', {
  apply: async (q, row) => {
    await q.query(`update feture.profile_settings set private_on = true, updated_at = now() where profile_id = $1`, [row.profile_id]);
  },
});

/** Revokes every grant and closes every pending request of the owner. @param {Q} q @param {string} ownerId @param {string} reason */
export async function closeAll(q, ownerId, reason) {
  await lockOwner(q, ownerId);
  const grants = await q.query(
    `update feture.access_grant set revoked_at = now() where owner_profile_id = $1 and revoked_at is null returning viewer_profile_id`, [ownerId]);
  const requests = await q.query(
    `update feture.access_request set state = 'closed', closed_reason = $2, decided_at = now() where owner_profile_id = $1 and state = 'pending' returning id`,
    [ownerId, reason]);
  for (const g of grants) await enqueue(q, 'access.revoked', g.viewer_profile_id, { owner: ownerId });
  return { grants: grants.length, requests: requests.length };
}

/** @param {Q} q @param {string} ownerId */
async function openCounts(q, ownerId) {
  const [r] = await q.query(
    `select (select count(*)::int from feture.access_grant where owner_profile_id = $1 and revoked_at is null and (until is null or until > now())) grants,
            (select count(*)::int from feture.access_request where owner_profile_id = $1 and state = 'pending') requests`, [ownerId]);
  return { grants: r.grants, requests: r.requests };
}

/** @type {Record<keyof typeof accessCommands, Command['run']>} */
const run = {
  async 'private.get'(q, { acting: a, input, cfg, account }) {
    const viewer = need(a);
    const own = input.profileId === viewer.profileId;
    const [o] = await q.query(
      `select p.state, s.private_on, pp.text from feture.profile p join feture.profile_settings s on s.profile_id = p.id
       left join feture.private_part pp on pp.profile_id = p.id where p.id = $1`, [input.profileId]);
    if (!o || (!own && o.state !== 'active')) fail(404, 'not_found');
    if (!own && (await q.query('select feture.blocked($1, $2) b', [viewer.profileId, input.profileId]))[0].b) fail(404, 'not_found');
    const available = await availableScopes(q, input.profileId);
    const scopes = own ? available : (o.private_on ? await grantedScopes(q, input.profileId, viewer) : []);
    if (!own && !o.private_on) return { exists: false };
    if (!own && !scopes.length) {
      // Before access nothing real is sent: only whether there is a private part and what can be asked for.
      const blocker = await requestBlocker(q, viewer, input.profileId);
      return { exists: available.length > 0, available, canRequest: blocker === null && available.length > 0, reason: blocker };
    }
    const [acc] = await q.query('select show_explicit from feture.account where id = $1', [account.id]);
    const media = await q.query(
      `select m.* from feture.media_attachment a join feture.media_asset m on m.id = a.asset_id
       where a.target_type = 'private' and a.target_id = $1 order by a.position`, [input.profileId]);
    const shown = [];
    for (const m of media) {
      if (!own && !scopes.includes(m.kind === 'video' ? 'video' : 'photos')) continue;
      const dto = await mediaDto(cfg.media, m, { viewerProfileId: viewer.profileId, place: own ? 'own' : 'private', showExplicit: !!acc.show_explicit });
      if (dto) shown.push(dto);
    }
    const [g] = own ? [] : await q.query(
      `select until from feture.access_grant where owner_profile_id = $1 and viewer_profile_id = $2 and revoked_at is null`, [input.profileId, viewer.profileId]);
    return {
      exists: true, own, on: o.private_on, scopes, until: g?.until ?? null,
      text: own || scopes.includes('info') ? (o.text ?? '') : null,
      media: shown,
      ...(own ? { available, counts: await openCounts(q, input.profileId) } : {}),
    };
  },

  async 'private.setOn'(q, { acting: a, input }) {
    const acting = need(a);
    if (input.on) {
      if (needsPartner(acting, 'private.on')) {
        return { pending: await requestApproval(q, acting, { kind: 'private.on', targetType: 'private', targetId: null, change: { on: true }, summary: ['Включить приватную часть'] }) };
      }
      await q.query(`update feture.profile_settings set private_on = true, updated_at = now() where profile_id = $1`, [acting.profileId]);
      return { on: true };
    }
    // Switching off revokes every access and closes every request (V21 ME-003/022): say how many first.
    const counts = await openCounts(q, acting.profileId);
    if ((counts.grants || counts.requests) && !input.confirm) return { confirmRequired: true, ...counts };
    // Lock order everywhere: profile row (narrowCouple / decideApproval) before the settings row (lockOwner).
    if (acting.kind === 'couple') await narrowCouple(q, acting, 'private_off');
    await lockOwner(q, acting.profileId);
    const closed = await closeAll(q, acting.profileId, 'private_off');
    await q.query(`update feture.profile_settings set private_on = false, updated_at = now() where profile_id = $1`, [acting.profileId]);
    return { on: false, ...closed };
  },

  async 'private.setText'(q, { acting: a, input }) {
    const acting = need(a);
    personOnly(acting);
    await q.query(
      `insert into feture.private_part (profile_id, text) values ($1, $2)
       on conflict (profile_id) do update set text = excluded.text, updated_at = now()`, [acting.profileId, input.text]);
    return { ok: true };
  },

  async 'private.setMedia'(q, { acting: a, input }) {
    const acting = need(a);
    personOnly(acting);
    const ids = /** @type {string[]} */ (input.assetIds);
    if (new Set(ids).size !== ids.length) fail(400, 'invalid_input', { fields: ['assetIds'] });
    const rows = ids.length ? await q.query(
      `select id, kind from feture.media_asset where id = any($1) and owner_profile_id = $2 and purpose = 'private'
         and state in ('uploaded', 'scanning', 'needs_review', 'approved')`, [ids, acting.profileId]) : [];
    if (rows.length !== ids.length) fail(400, 'invalid_input', { fields: ['assetIds'] });
    if (rows.filter(r => r.kind === 'image').length > LIMITS.photos || rows.filter(r => r.kind === 'video').length > LIMITS.videos) {
      fail(422, 'rule_violation', { rule: 'private_media_limit' });
    }
    await q.query(`delete from feture.media_attachment where target_type = 'private' and target_id = $1`, [acting.profileId]);
    for (const [i, assetId] of ids.entries()) {
      await q.query(`insert into feture.media_attachment (asset_id, target_type, target_id, position) values ($1, 'private', $2, $3)`, [assetId, acting.profileId, i]);
    }
    return { count: ids.length };
  },

  async 'access.request'(q, { acting: a, input, account }) {
    const acting = need(a);
    await requireUnrestricted(q, acting);
    // One request budget per account across «Я» and «Мы»; serialised so parallel requests cannot all pass.
    await q.query(`select pg_advisory_xact_lock(hashtext('feture-access-quota:' || $1))`, [acting.accountId]);
    // Every account that would see the private part must be verified adult: both partners for a couple (Q26).
    const viewers = await memberAccounts(q, acting.profileId);
    const [{ unverified }] = await q.query(
      `select count(*)::int unverified from feture.account where id = any($1) and coalesce(age_verified_until > now(), false) = false`, [viewers]);
    if (unverified || !viewers.includes(account.id)) fail(422, 'rule_violation', { rule: 'age_check_required' });
    await lockOwner(q, input.profileId);
    const blocker = await requestBlocker(q, acting, input.profileId);
    if (blocker === 'unavailable') fail(404, 'not_found');
    if (blocker) fail(422, 'rule_violation', { rule: blocker });
    if (await quotaLeft(q, acting) <= 0) fail(429, 'rate_limited', { rule: 'request_quota' });
    const available = await availableScopes(q, input.profileId);
    if (!input.scopes.every((/** @type {Scope} */ s) => available.includes(s))) fail(422, 'rule_violation', { rule: 'scope_not_available' });
    const [r] = await q.query(
      `insert into feture.access_request (requester_profile_id, owner_profile_id, viewer_account_ids, scopes, acted_by)
       values ($1, $2, $3, $4, $5) returning id`, [acting.profileId, input.profileId, viewers, input.scopes, acting.accountId]);
    // A request opens no chat and sends no like; the owner decides in «Нужно решить».
    await enqueue(q, 'access.requested', input.profileId, { requestId: r.id, from: acting.profileId });
    return { id: r.id, quotaLeft: await quotaLeft(q, acting) };
  },

  async 'access.cancel'(q, { acting: a, input }) {
    const acting = need(a);
    const rows = await q.query(
      `update feture.access_request set state = 'cancelled', decided_at = now(), decided_by = $3
       where id = $1 and requester_profile_id = $2 and state = 'pending' returning id`, [input.requestId, acting.profileId, acting.accountId]);
    if (!rows[0]) fail(404, 'not_found');
    return { state: 'cancelled' }; // the daily budget is not refunded
  },

  async 'access.grant'(q, { acting: a, input }) {
    const acting = need(a);
    const [r] = await q.query(`select state from feture.access_request where id = $1 and owner_profile_id = $2`, [input.requestId, acting.profileId]);
    if (!r) fail(404, 'not_found');
    if (r.state !== 'pending') fail(409, 'conflict', { state: r.state });
    if (needsPartner(acting, 'access.grant')) {
      const pending = await requestApproval(q, acting, {
        kind: 'access.grant', targetType: 'access_request', targetId: input.requestId,
        // The partner decides on everything that opens: what, and for how long.
        change: { requestId: input.requestId, scopes: input.scopes, term: input.term }, summary: [...input.scopes, `term:${input.term}`],
      });
      return { pending };
    }
    return applyGrant(q, { requestId: input.requestId, ownerId: acting.profileId, scopes: input.scopes, term: input.term, by: acting.accountId });
  },

  async 'access.decline'(q, { acting: a, input }) {
    const acting = need(a);
    const rows = await q.query(
      `update feture.access_request set state = 'declined', decided_at = now(), decided_by = $3
       where id = $1 and owner_profile_id = $2 and state = 'pending' returning requester_profile_id`, [input.requestId, acting.profileId, acting.accountId]);
    if (!rows[0]) fail(404, 'not_found');
    await enqueue(q, 'access.declined', rows[0].requester_profile_id, { requestId: input.requestId, silent: true });
    return { state: 'declined', reaskDays: LIMITS.reaskDays };
  },

  async 'access.narrow'(q, { acting: a, input }) {
    const acting = need(a);
    const [g] = await q.query(
      `select id, scopes from feture.access_grant where owner_profile_id = $1 and viewer_profile_id = $2 and revoked_at is null for update`,
      [acting.profileId, input.profileId]);
    if (!g) fail(404, 'not_found');
    if (!input.scopes.every((/** @type {string} */ s) => g.scopes.includes(s))) fail(422, 'rule_violation', { rule: 'widen_needs_request' });
    if (!input.scopes.length) {
      await q.query(`update feture.access_grant set revoked_at = now() where id = $1`, [g.id]);
      await enqueue(q, 'access.revoked', input.profileId, { owner: acting.profileId });
      return { scopes: [] };
    }
    await q.query(`update feture.access_grant set scopes = $2 where id = $1`, [g.id, input.scopes]);
    return { scopes: input.scopes };
  },

  async 'access.revoke'(q, { acting: a, input }) {
    const acting = need(a);
    const rows = await q.query(
      `update feture.access_grant set revoked_at = now() where owner_profile_id = $1 and viewer_profile_id = $2 and revoked_at is null returning id`,
      [acting.profileId, input.profileId]);
    if (!rows[0]) fail(404, 'not_found');
    await enqueue(q, 'access.revoked', input.profileId, { owner: acting.profileId });
    return { revoked: true }; // what was seen cannot be recalled; new views stop now
  },

  async 'access.revokeAll'(q, { acting: a, input }) {
    const acting = need(a);
    const counts = await openCounts(q, acting.profileId);
    if ((counts.grants || counts.requests) && !input.confirm) return { confirmRequired: true, ...counts };
    if (acting.kind === 'couple') {
      // A couple's «закрыть всё» is a safety action: it also stops new requests (V21 pairSafety('sharing')).
      await narrowCouple(q, acting, 'access_revoked');
      await q.query(`update feture.profile_settings set requests_from = 'none', updated_at = now() where profile_id = $1`, [acting.profileId]);
    }
    return closeAll(q, acting.profileId, 'revoked');
  },

  async 'access.lists'(q, { acting: a, input }) {
    const acting = need(a);
    // Other profiles that are no longer active (paused, suspended, deleted) are not named.
    const who = `(select json_build_object('id', p.id, 'kind', p.kind, 'handle', p.handle, 'name', p.name) from feture.profile p where p.id = %s and p.state = 'active')`;
    if (input.tab === 'out') {
      const items = await q.query(
        `select r.id, r.scopes, r.state, r.created_at, r.decided_at, ${who.replace('%s', 'r.owner_profile_id')} profile,
           case when r.state = 'declined' then r.decided_at + make_interval(days => $2) end reask_at
         from feture.access_request r where r.requester_profile_id = $1 order by r.created_at desc limit 30`,
        [acting.profileId, LIMITS.reaskDays]);
      return { items, quotaLeft: await quotaLeft(q, acting) };
    }
    if (input.tab === 'incoming') {
      return { items: await q.query(
        `select r.id, r.scopes, r.created_at, ${who.replace('%s', 'r.requester_profile_id')} profile
         from feture.access_request r where r.owner_profile_id = $1 and r.state = 'pending' order by r.created_at desc limit 30`,
        [acting.profileId]) };
    }
    if (input.tab === 'byme') {
      return { items: await q.query(
        `select g.scopes, g.until, g.granted_at, ${who.replace('%s', 'g.viewer_profile_id')} profile
         from feture.access_grant g where g.owner_profile_id = $1 and g.revoked_at is null and (g.until is null or g.until > now())
         order by g.granted_at desc limit 30`, [acting.profileId]) };
    }
    return { items: await q.query(
      `select g.scopes, g.until, g.granted_at, ${who.replace('%s', 'g.owner_profile_id')} profile
       from feture.access_grant g join feture.profile_settings s on s.profile_id = g.owner_profile_id
       where g.viewer_profile_id = $1 and $2 = any(g.viewer_account_ids) and g.revoked_at is null and (g.until is null or g.until > now()) and s.private_on
       order by g.granted_at desc limit 30`, [acting.profileId, acting.accountId]) };
  },
};

/** @type {Record<string, Command>} */
export const access = Object.fromEntries(
  Object.entries(accessCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
