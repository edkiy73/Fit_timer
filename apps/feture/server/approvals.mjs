// @ts-check
import { fail } from './errors.mjs';
import { enqueue } from './outbox.mjs';

/** @typedef {import('./db.mjs').Q} Q @typedef {import('./profiles.mjs').Acting} Acting */
/**
 * A domain registers how an approved change is applied. `apply` runs inside the deciding transaction,
 * so a stale change (target deleted, already applied) fails the decision instead of half-applying.
 * `always`: the change needs both partners even when the partner does not ask to approve changes
 * (opening the couple's private part — V21 «Приватную часть пары открывают только вдвоём»).
 * @typedef {{apply: (q: Q, approval: ApprovalRow) => Promise<void>, always?: boolean}} ApprovalKind
 * @typedef {{id: string, profile_id: string, kind: string, target_type: string, target_id: string | null,
 *   change: Record<string, unknown>, summary: unknown[], state: string, requested_by: string}} ApprovalRow
 */

/** @type {Map<string, ApprovalKind>} */
const KINDS = new Map();

/** @param {string} kind e.g. `post.publish`, `private.grant` @param {ApprovalKind} def */
export function registerApprovalKind(kind, def) {
  if (KINDS.has(kind)) throw new Error('approval kind registered twice: ' + kind);
  KINDS.set(kind, def);
}

/** True when this widening change must wait for the partner. Narrowing changes never call this.
 * Otherwise the change applies at once and the partner is only notified. @param {Acting} acting @param {string} kind */
export function needsPartner(acting, kind) {
  const def = KINDS.get(kind);
  if (!def) fail(500, 'approval_kind_unknown');
  return acting.kind === 'couple' && !!acting.partnerAccountId && (def.always === true || acting.partnerApproves);
}

/** Opens a pending change. One pending change per (profile, kind, target): a second one is 409.
 * @param {Q} q @param {Acting} acting
 * @param {{kind: string, targetType: string, targetId: string | null, change: Record<string, unknown>, summary: unknown[]}} req */
export async function requestApproval(q, acting, req) {
  if (!needsPartner(acting, req.kind)) fail(500, 'approval_not_needed');
  const rows = await q.query(
    `insert into feture.partner_approval (profile_id, kind, target_type, target_id, change, summary, requested_by, safety_epoch)
     select $1, $2, $3, $4, $5, $6, $7, safety_epoch from feture.profile where id = $1
     on conflict do nothing returning id`,
    [acting.profileId, req.kind, req.targetType, req.targetId, JSON.stringify(req.change), JSON.stringify(req.summary), acting.accountId]);
  if (!rows[0]) fail(409, 'approval_pending');
  await enqueue(q, 'decide.created', acting.profileId, { approvalId: rows[0].id, kind: req.kind, for: acting.partnerAccountId });
  return { approvalId: /** @type {string} */ (rows[0].id) };
}

/** The partner (never the requester) approves or returns a pending change.
 * @param {Q} q @param {Acting} acting @param {{approvalId: string, choice: 'approve' | 'return'}} input */
export async function decideApproval(q, acting, { approvalId, choice }) {
  const [row] = await q.query(
    `select a.id, a.profile_id, a.kind, a.target_type, a.target_id, a.change, a.summary, a.state, a.requested_by,
       a.expires_at <= now() expired, a.safety_epoch <> p.safety_epoch stale
     from feture.partner_approval a join feture.profile p on p.id = a.profile_id
     where a.id = $1 and a.profile_id = $2 for update of a`,
    [approvalId, acting.profileId]);
  if (!row) fail(404, 'not_found');
  if (row.state !== 'pending') fail(409, 'conflict', { state: row.state });
  if (row.requested_by === acting.accountId) fail(403, 'forbidden');
  if (row.expired || row.stale) {
    // Expired, or a partner narrowed something since (hid the couple, closed access): never apply.
    await close(q, row.id, row.expired ? 'expired' : 'cancelled', null);
    fail(409, 'conflict', { state: row.expired ? 'expired' : 'cancelled' });
  }
  if (choice === 'approve') {
    const kind = KINDS.get(row.kind);
    if (!kind) fail(500, 'approval_kind_unknown');
    await kind.apply(q, row);
  }
  const state = choice === 'approve' ? 'approved' : 'returned';
  await close(q, row.id, state, acting.accountId);
  await enqueue(q, 'decide.resolved', acting.profileId, { approvalId: row.id, kind: row.kind, state, for: row.requested_by });
  return { state };
}

/** The requester withdraws their own pending change. @param {Q} q @param {Acting} acting @param {string} approvalId */
export async function cancelApproval(q, acting, approvalId) {
  const rows = await q.query(
    `update feture.partner_approval set state = 'cancelled', decided_at = now()
     where id = $1 and profile_id = $2 and requested_by = $3 and state = 'pending' returning id`,
    [approvalId, acting.profileId, acting.accountId]);
  if (!rows[0]) fail(404, 'not_found');
  await enqueue(q, 'decide.resolved', acting.profileId, { approvalId, state: 'cancelled', for: acting.partnerAccountId });
  return { state: 'cancelled' };
}

/** Pending changes of the couple, both directions: «Ждёт согласия партнёра» and «Одобрить / Вернуть».
 * @param {Q} q @param {Acting} acting */
export async function listApprovals(q, acting) {
  const rows = await q.query(
    `select id, kind, target_type, target_id, summary, requested_by, created_at, expires_at
     from feture.partner_approval
     where profile_id = $1 and state = 'pending' and expires_at > now() order by created_at`,
    [acting.profileId]);
  return rows.map(r => ({
    id: r.id, kind: r.kind, targetType: r.target_type, targetId: r.target_id, summary: r.summary,
    mine: r.requested_by === acting.accountId, createdAt: r.created_at, expiresAt: r.expires_at,
  }));
}

/** @param {Q} q @param {string} id @param {string} state @param {string | null} by */
async function close(q, id, state, by) {
  await q.query('update feture.partner_approval set state = $2, decided_by = $3, decided_at = now() where id = $1', [id, state, by]);
}

/** Any member's immediate safety action on a couple (hide from Discover, close the private part, revoke all,
 * stop the couple): bumps the epoch and cancels every pending widening, so nothing approved later can
 * reopen what was just closed. @param {Q} q @param {Acting} acting @param {string} reason short code */
export async function narrowCouple(q, acting, reason) {
  if (acting.kind !== 'couple') return { cancelled: 0 };
  await q.query('update feture.profile set safety_epoch = safety_epoch + 1, updated_at = now() where id = $1', [acting.profileId]);
  const rows = await q.query(
    `update feture.partner_approval set state = 'cancelled', decided_at = now()
     where profile_id = $1 and state = 'pending' returning id`,
    [acting.profileId]);
  await enqueue(q, 'couple.narrowed', acting.profileId, { reason, for: acting.partnerAccountId, cancelled: rows.length });
  return { cancelled: rows.length };
}
