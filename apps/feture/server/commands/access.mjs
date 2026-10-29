// @ts-check
import { accessCommands } from '../../contracts/access.mjs';
import { requireUnrestricted } from '../profiles.mjs';
import { fail } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { needsPartner, narrowCouple, registerApprovalKind, requestApproval } from '../approvals.mjs';
import { mediaDto } from '../media/assets.mjs';
import { availableScopes, grantedScopes, LIMITS, lockOwner, memberAccounts, related } from '../access.mjs';
import { withFaces } from './faces.mjs';
import { keysetPage, readKeyset } from '../cursor.mjs';

/** Slice C2: private part and access (S1 §6). Narrowing (decline, narrow, revoke, switch off) applies at once;
 * opening the private part of a couple to someone always needs both partners (V21 «только вдвоём»).
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q
 * @typedef {import('../profiles.mjs').Acting} Acting @typedef {import('../access.mjs').Scope} Scope
 */

const TERM = { none: null, '1d': '1 day', '7d': '7 days', '30d': '30 days' };
const PAGE = 30;

/** SQL: a decline still inside its undo window. Until it ends the requester is shown the request as waiting
 * («решили не открывать» must never flash and then disappear), so an undo is never noticed.
 * @param {string} [r] table alias with the dot */
const held = (r = '') => `(${r}state = 'declined' and ${r}decided_at > now() - make_interval(secs => ${Number(LIMITS.declineUndoSeconds)}))`;

/** @param {Acting | null} acting @returns {Acting} */
const need = acting => { if (!acting) throw new Error('acting profile missing'); return acting; };
/** @param {Acting} acting */
const personOnly = acting => { if (acting.kind !== 'person') fail(422, 'rule_violation', { rule: 'couple_changes_not_available' }); };

/** Someone else's profile, if it exists for the viewer: active, not the viewer, no block either way (a block looks the
 * same as missing). `related` says whether it is one of the viewer's own people or couples (server/README.md).
 * @param {Q} q @param {Acting} viewer @param {string} id @returns {Promise<{id: string, kind: string, related: boolean}>} */
export async function otherProfile(q, viewer, id) {
  const [p] = await q.query(
    `select p.id, p.kind, feture.related($1, p.id) related from feture.profile p where p.id = $2 and p.state = 'active' and not feture.blocked($1, p.id)`, [viewer.profileId, id]);
  if (!p || p.id === viewer.profileId) fail(404, 'not_found');
  return p;
}

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
       exists (select 1 from feture.access_request where requester_profile_id = $1 and owner_profile_id = $2 and (state = 'pending' or ${held()})) pending,
       (select decided_at + make_interval(days => $3) from feture.access_request
         where requester_profile_id = $1 and owner_profile_id = $2 and state = 'declined' and not ${held()} order by decided_at desc limit 1) reask_at`,
    [viewer.profileId, ownerId, LIMITS.reaskDays]);
  if (r.pending) return 'pending';
  if (r.reask_at && new Date(r.reask_at) > new Date()) return 'cooldown';
  return null;
}

/** Whether everyone who would see the private part is a verified adult (Q26): `ok`, `me` (the viewing account is not)
 * or `partner` (acting as a couple whose other member is not). Read before access so the screen can send the person to
 * the age check instead of failing the request. @param {Q} q @param {Acting} acting @param {string} accountId
 * @returns {Promise<{viewers: string[], age: 'ok' | 'me' | 'partner'}>} */
async function ageState(q, acting, accountId) {
  const viewers = await memberAccounts(q, acting.profileId);
  const rows = await q.query(
    `select id from feture.account where id = any($1) and coalesce(age_verified_until > now(), false) = false`, [viewers]);
  const bad = rows.map(r => /** @type {string} */ (r.id));
  const age = !viewers.includes(accountId) || bad.includes(accountId) ? 'me' : bad.length ? 'partner' : 'ok';
  return { viewers, age };
}

/** Requests sent from any of the account's profiles in the last 24 h count against one daily limit; cancelled ones
 * too («попытка не возвращается»). `resetsAt`: when the next attempt comes back (null while nothing is used).
 * @param {Q} q @param {Acting} acting @returns {Promise<{left: number, max: number, resetsAt: string | null}>} */
async function quota(q, acting) {
  const rows = await q.query(
    `select r.created_at + interval '1 day' frees_at from feture.access_request r
     where r.created_at > now() - interval '1 day'
       and r.requester_profile_id in (select profile_id from feture.profile_member where account_id = $1)
     order by r.created_at`,
    [acting.accountId]);
  const max = LIMITS.requestsPerDay;
  const next = rows[Math.max(0, rows.length - max)];
  return { left: Math.max(0, max - rows.length), max, resetsAt: next ? new Date(next.frees_at).toISOString() : null };
}

/** The owner's undecided decline notice of a request (delayed by the undo window), locked. @param {Q} q @param {string} requesterId @param {string} requestId */
async function declineNotice(q, requesterId, requestId) {
  const [o] = await q.query(
    `select id, done_at, locked_until from feture.outbox where topic = 'access.declined' and profile_id = $1 and payload->>'requestId' = $2 for update`,
    [requesterId, requestId]);
  return o ?? null;
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
  if ((await q.query('select feture.restricted($1) r', [r.requester_profile_id]))[0].r) fail(409, 'conflict', { rule: 'unavailable' });
  if (!r.private_on || r.owner_state !== 'active') fail(422, 'rule_violation', { rule: 'private_off' });
  const available = await availableScopes(q, ownerId);
  if (!scopes.every(s => available.includes(s))) fail(422, 'rule_violation', { rule: 'scope_not_available' });
  await q.query(`update feture.access_grant set revoked_at = now() where owner_profile_id = $1 and viewer_profile_id = $2 and revoked_at is null`,
    [ownerId, r.requester_profile_id]);
  const interval = TERM[term];
  // The owner may open parts that were not asked for too (V21 grantSheet «не запрошено»); a repeat request replaces
  // what was open before (the sheet shows it as alreadyOpen).
  const [g] = await q.query(
    `insert into feture.access_grant (owner_profile_id, viewer_profile_id, viewer_account_ids, scopes, until, request_id, granted_by)
     values ($1, $2, $3, $4, case when $5::text is null then null else now() + $5::interval end, $6, $7) returning until`,
    [ownerId, r.requester_profile_id, r.viewer_account_ids, scopes, interval, requestId, by]);
  const partial = r.scopes.some((/** @type {string} */ s) => !scopes.includes(/** @type {Scope} */ (s)));
  await q.query(`update feture.access_request set state = $2, decided_at = now(), decided_by = $3 where id = $1`,
    [requestId, partial ? 'partial' : 'granted', by]);
  await enqueue(q, 'access.granted', r.requester_profile_id, { requestId, owner: ownerId });
  return { state: partial ? 'partial' : 'granted', scopes, until: g.until };
}

// Opening a couple's private part to someone is always decided by both partners.
registerApprovalKind('access.grant', {
  always: true,
  apply: async (q, row) => {
    const c = /** @type {{requestId: string, scopes: Scope[], term: keyof typeof TERM}} */ (row.change);
    await applyGrant(q, { requestId: c.requestId, ownerId: row.profile_id, scopes: c.scopes, term: c.term, by: row.requested_by });
  },
  // Who would get access (while still active and not blocked), what and for how long.
  preview: async (q, row) => {
    const c = /** @type {{requestId: string, scopes: Scope[], term: string}} */ (row.change);
    const [p] = await q.query(
      `select p.id, p.kind, p.handle, p.name from feture.access_request r join feture.profile p on p.id = r.requester_profile_id
       where r.id = $1 and r.owner_profile_id = $2 and p.state = 'active' and not feture.blocked($2, p.id)`, [c.requestId, row.profile_id]);
    return { profile: p ?? null, scopes: c.scopes, term: c.term };
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
      return { exists: available.length > 0, available, canRequest: blocker === null && available.length > 0, reason: blocker, quota: await quota(q, viewer),
        age: (await ageState(q, viewer, account.id)).age };
    }
    // Every private photo or video someone else opens carries the viewing person's own handle (V21 privPeek: «с твоим
    // водяным знаком»): the account's personal handle, also when acting as a couple, so a leak points at a person.
    const [wm] = own ? [] : await q.query(
      `select p.handle from feture.account a join feture.profile p on p.id = a.person_profile_id where a.id = $1`, [account.id]);
    const watermark = wm?.handle ? '@' + wm.handle : null;
    const [acc] = await q.query('select show_explicit from feture.account where id = $1', [account.id]);
    const media = await q.query(
      `select m.* from feture.media_attachment a join feture.media_asset m on m.id = a.asset_id
       where a.target_type = 'private' and a.target_id = $1 order by a.position`, [input.profileId]);
    const shown = [];
    for (const m of media) {
      if (!own && !scopes.includes(m.kind === 'video' ? 'video' : 'photos')) continue;
      const dto = await mediaDto(cfg.media, m, { viewerProfileId: viewer.profileId, place: own ? 'own' : 'private', showExplicit: !!acc.show_explicit });
      if (dto) shown.push(own ? dto : { ...dto, watermark });
    }
    // The «По доступу» interests are a part of the private part of their own («Интересы»): the owner sees them all
    // here, a viewer with the interests grant sees them as `interests.list` shows them (a hard limit only as a limit).
    const jars = own || scopes.includes('interests') ? await q.query(
      `select i.topic_id, i.value, i.mark, i.dir from feture.interest i join feture.topic t on t.id = i.topic_id
       where i.profile_id = $1 and i.vis = 'granted' and ($2 or not t.hidden) order by t.position`, [input.profileId, own]) : [];
    const interests = jars.map(r => !own && r.mark === 'hard' ? { topicId: r.topic_id, mark: 'hard' }
      : { topicId: r.topic_id, value: r.value, mark: r.mark, dir: r.dir, ...(own ? { vis: 'granted' } : {}) });
    const [g] = own ? [] : await q.query(
      `select until from feture.access_grant where owner_profile_id = $1 and viewer_profile_id = $2 and revoked_at is null`, [input.profileId, viewer.profileId]);
    return {
      exists: true, own, on: o.private_on, scopes, until: g?.until ?? null,
      text: own || scopes.includes('info') ? (o.text ?? '') : null,
      media: shown, interests,
      ...(own ? { available, counts: await openCounts(q, input.profileId) } : await (async () => {
        // Asking again for more (or for a longer term) works like the first request.
        const blocker = await requestBlocker(q, viewer, input.profileId);
        return { available, canRequest: blocker === null, reason: blocker, quota: await quota(q, viewer), age: (await ageState(q, viewer, account.id)).age };
      })()),
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
    const { viewers, age } = await ageState(q, acting, account.id);
    if (age !== 'ok') fail(422, 'rule_violation', { rule: 'age_check_required', who: age });
    await lockOwner(q, input.profileId);
    const blocker = await requestBlocker(q, acting, input.profileId);
    if (blocker === 'unavailable') fail(404, 'not_found');
    if (blocker) fail(422, 'rule_violation', { rule: blocker });
    const before = await quota(q, acting);
    if (before.left <= 0) fail(429, 'rate_limited', { rule: 'request_quota', resetsAt: before.resetsAt });
    const available = await availableScopes(q, input.profileId);
    if (!input.scopes.every((/** @type {Scope} */ s) => available.includes(s))) fail(422, 'rule_violation', { rule: 'scope_not_available' });
    const [r] = await q.query(
      `insert into feture.access_request (requester_profile_id, owner_profile_id, viewer_account_ids, scopes, acted_by)
       values ($1, $2, $3, $4, $5) returning id`, [acting.profileId, input.profileId, viewers, input.scopes, acting.accountId]);
    // A request opens no chat and sends no like; the owner decides in «Нужно решить».
    await enqueue(q, 'access.requested', input.profileId, { requestId: r.id, from: acting.profileId });
    const left = await quota(q, acting);
    return { id: r.id, scopes: input.scopes, state: 'pending', quotaLeft: left.left, quota: left };
  },

  async 'access.cancel'(q, { acting: a, input }) {
    const acting = need(a);
    // A decline still in its undo window looks waiting to the requester, so it can be cancelled like one; the
    // decline then never reaches them and the owner can no longer undo it.
    const [r] = await q.query(
      `select id, state, ${held()} held from feture.access_request where id = $1 and requester_profile_id = $2 for update`,
      [input.requestId, acting.profileId]);
    if (!r || !(r.state === 'pending' || r.held)) fail(404, 'not_found');
    await q.query(`update feture.access_request set state = 'cancelled', decided_at = now(), decided_by = $2 where id = $1`, [r.id, acting.accountId]);
    if (r.held) {
      const notice = await declineNotice(q, acting.profileId, r.id);
      if (notice && !notice.done_at && !notice.locked_until) await q.query(`delete from feture.outbox where id = $1`, [notice.id]);
    }
    return { state: 'cancelled', quota: await quota(q, acting) }; // the daily budget is not refunded
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
       where id = $1 and owner_profile_id = $2 and state = 'pending'
       returning requester_profile_id, decided_at + make_interval(secs => $4) undo_until`,
      [input.requestId, acting.profileId, acting.accountId, LIMITS.declineUndoSeconds]);
    if (!rows[0]) fail(404, 'not_found');
    // The notice waits out the undo window; the requester's views treat the request as waiting until then (held()).
    await enqueue(q, 'access.declined', rows[0].requester_profile_id, { requestId: input.requestId, silent: true },
      { delaySeconds: LIMITS.declineUndoSeconds });
    return { state: 'declined', reaskDays: LIMITS.reaskDays, undoUntil: rows[0].undo_until };
  },

  async 'access.undoDecline'(q, { acting: a, input }) {
    const acting = need(a);
    // Same lock as grant / switch off / close all: an undo cannot revive a request after everything was closed.
    await lockOwner(q, acting.profileId);
    const [r] = await q.query(
      `select r.id, r.state, r.decided_by, r.requester_profile_id, ${held('r.')} held from feture.access_request r
       where r.id = $1 and r.owner_profile_id = $2 for update`, [input.requestId, acting.profileId]);
    if (!r) fail(404, 'not_found');
    // Only the one who declined takes it back (a couple partner declines and undoes their own).
    if (r.state !== 'declined' || r.decided_by !== acting.accountId) fail(409, 'conflict', { state: r.state === 'declined' ? 'decided_by_partner' : r.state });
    if (!r.held) fail(409, 'conflict', { rule: 'undo_expired' });
    // The decline must not have reached the requester in any form.
    const notice = await declineNotice(q, r.requester_profile_id, r.id);
    if (notice && (notice.done_at || notice.locked_until)) fail(409, 'conflict', { rule: 'undo_expired' });
    // The request must still be one the owner could receive now (nothing closed it in between).
    const [ok] = await q.query(
      `select p.state = 'active' and s.private_on and s.requests_from = 'all' and not feture.blocked($1, $2)
         and exists (select 1 from feture.profile v where v.id = $2 and v.state = 'active') ok
       from feture.profile p join feture.profile_settings s on s.profile_id = p.id where p.id = $1`,
      [acting.profileId, r.requester_profile_id]);
    if (!ok?.ok) fail(409, 'conflict', { rule: 'request_closed' });
    await q.query(`update feture.access_request set state = 'pending', decided_at = null, decided_by = null where id = $1`, [r.id]);
    if (notice) await q.query(`delete from feture.outbox where id = $1`, [notice.id]);
    return { state: 'pending' };
  },

  async 'access.narrow'(q, { acting: a, input }) {
    const acting = need(a);
    const [g] = await q.query(
      `select id, scopes from feture.access_grant where owner_profile_id = $1 and viewer_profile_id = $2 and revoked_at is null
         and (until is null or until > now()) for update`,
      [acting.profileId, input.profileId]);
    if (!g) fail(404, 'not_found');
    if (!input.scopes.every((/** @type {string} */ s) => g.scopes.includes(s))) fail(422, 'rule_violation', { rule: 'widen_needs_request' });
    if (!input.scopes.length) {
      // Nothing left selected is a revoke (V21 nwOk → revoke), with the same notice.
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

  async 'access.lists'(q, { acting: a, input, cfg }) {
    const acting = need(a);
    if (input.filter && input.tab !== 'out' && input.tab !== 'incoming') fail(400, 'invalid_input', { fields: ['filter'] });
    const cur = readKeyset(input.cursor);
    const page = async (/** @type {any[]} */ rows) => {
      const { items, next } = keysetPage(rows, PAGE);
      return { items: await withFaces(q, cfg.media, acting, items, r => r.profile), next };
    };
    // Only active profiles not hidden by a block either way are listed; a paused or blocked side is not named.
    const who = (/** @type {string} */ col) =>
      `(select json_build_object('id', p.id, 'kind', p.kind, 'handle', p.handle, 'name', p.name) from feture.profile p where p.id = ${col})`;
    const live = (/** @type {string} */ col) =>
      `exists (select 1 from feture.profile p where p.id = ${col} and p.state = 'active') and not feture.blocked($1, ${col})`;
    const after = (/** @type {string} */ at, /** @type {string} */ id) => `($2::text is null or (${at}, ${id}) < ($2::timestamptz, $3::uuid))`;

    if (input.tab === 'out') {
      // «Мои запросы»: what I asked for, its state as I may know it, and what is open now. A decline inside its undo
      // window reads as waiting (held()); an open grant that ended reads as expired or revoked.
      const rows = await q.query(
        `select * from (
           select r.id, r.scopes, r.scopes requested, r.created_at, r.created_at::text cursor_at, r.id cursor_id,
             case when ${held('r.')} then 'pending'
                  when r.state not in ('granted', 'partial') then r.state
                  when g.revoked_at is null and (g.until is null or g.until > now()) then r.state
                  when g.revoked_at is null then 'expired'
                  -- a later answer to a repeat request took its place
                  when exists (select 1 from feture.access_grant n where n.owner_profile_id = r.owner_profile_id
                                 and n.viewer_profile_id = r.requester_profile_id and n.granted_at >= g.revoked_at and n.request_id <> r.id) then 'replaced'
                  else 'revoked' end state,
             case when ${held('r.')} then null else r.decided_at end decided_at,
             case when r.state = 'declined' and not ${held('r.')} then r.decided_at + make_interval(days => $5) end reask_at,
             case when r.state in ('granted', 'partial') and g.revoked_at is null and (g.until is null or g.until > now())
                  then json_build_object('scopes', g.scopes, 'until', g.until) end granted,
             ${who('r.owner_profile_id')} profile
           from feture.access_request r
           left join lateral (select x.scopes, x.until, x.revoked_at from feture.access_grant x where x.request_id = r.id
                              order by x.granted_at desc limit 1) g on true
           where r.requester_profile_id = $1 and ${live('r.owner_profile_id')}) o
         where ($4::text is null or o.state = 'pending') and ${after('o.created_at', 'o.id')}
         order by o.created_at desc, o.id desc limit $6`,
        [acting.profileId, cur.at, cur.id, input.filter ?? null, LIMITS.reaskDays, PAGE + 1]);
      const result = await page(rows);
      const left = await quota(q, acting);
      return { ...result, items: result.items.map(({ reask_at, decided_at, ...r }) => ({ ...r, reaskAt: reask_at, decidedAt: decided_at })),
        quotaLeft: left.left, quota: left };
    }
    if (input.tab === 'incoming') {
      // For the decision sheet: what was asked for, what is already open to them (a repeat request replaces it) and,
      // once per page, every part the owner has — parts that were not asked for can be opened too.
      const rows = await q.query(
        `select r.id, r.scopes, r.scopes requested, r.created_at, r.created_at::text cursor_at, r.id cursor_id,
           (select json_build_object('scopes', g.scopes, 'until', g.until) from feture.access_grant g
             where g.owner_profile_id = r.owner_profile_id and g.viewer_profile_id = r.requester_profile_id
               and g.revoked_at is null and (g.until is null or g.until > now())) already_open,
           ${who('r.requester_profile_id')} profile
         from feture.access_request r
         where r.owner_profile_id = $1 and r.state = 'pending' and ${live('r.requester_profile_id')} and ${after('r.created_at', 'r.id')}
         order by r.created_at desc, r.id desc limit $4`,
        [acting.profileId, cur.at, cur.id, PAGE + 1]);
      const result = await page(rows);
      return { ...result, items: result.items.map(({ already_open, ...r }) => ({ ...r, alreadyOpen: already_open })),
        available: await availableScopes(q, acting.profileId) };
    }
    if (input.tab === 'byme') {
      // «Открыто мной»: who sees which parts of my private part, until when.
      return page(await q.query(
        `select g.scopes, g.until, g.granted_at, g.granted_at::text cursor_at, g.id cursor_id, ${who('g.viewer_profile_id')} profile
         from feture.access_grant g
         where g.owner_profile_id = $1 and g.revoked_at is null and (g.until is null or g.until > now())
           and ${live('g.viewer_profile_id')} and ${after('g.granted_at', 'g.id')}
         order by g.granted_at desc, g.id desc limit $4`, [acting.profileId, cur.at, cur.id, PAGE + 1]));
    }
    // «Мне открыли»: grants to the profile I act as, for my account, while the owner's private part is on.
    return page(await q.query(
      `select g.scopes, g.until, g.granted_at, g.granted_at::text cursor_at, g.id cursor_id, ${who('g.owner_profile_id')} profile
       from feture.access_grant g join feture.profile_settings s on s.profile_id = g.owner_profile_id
       where g.viewer_profile_id = $1 and $4 = any(g.viewer_account_ids) and g.revoked_at is null and (g.until is null or g.until > now()) and s.private_on
         and ${live('g.owner_profile_id')} and ${after('g.granted_at', 'g.id')}
       order by g.granted_at desc, g.id desc limit $5`, [acting.profileId, cur.at, cur.id, acting.accountId, PAGE + 1]));
  },

  async 'access.quota'(q, { acting: a }) {
    return quota(q, need(a));
  },
};

/** @type {Record<string, Command>} */
export const access = Object.fromEntries(
  Object.entries(accessCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
