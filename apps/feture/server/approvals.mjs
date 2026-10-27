// @ts-check
import { FeError, fail } from './errors.mjs';
import { enqueue } from './outbox.mjs';

/** @typedef {import('./db.mjs').Q} Q @typedef {import('./profiles.mjs').Acting} Acting */
/**
 * A domain registers how an approved change is applied. `apply` runs inside the deciding transaction,
 * so a stale change (target deleted, already applied) fails the decision instead of half-applying.
 * `always`: the change needs both partners even when the partner does not ask to approve changes
 * (opening the couple's private part — V21 «Приватную часть пары открывают только вдвоём»).
 * `preview`: what the deciding partner (and the author of a returned change) is shown besides the raw change — the post
 * text, the event card, the person asking for access. It reads only the couple's own rows.
 * @typedef {{apply: (q: Q, approval: ApprovalRow) => Promise<void>, always?: boolean, preview?: (q: Q, approval: ApprovalRow) => Promise<unknown>}} ApprovalKind
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
  // Expired or stale pendings would otherwise hold the one-pending-per-target slot forever.
  await q.query(
    `update feture.partner_approval a set state = case when a.expires_at <= now() then 'expired' else 'cancelled' end, decided_at = now()
     from feture.profile p
     where p.id = a.profile_id and a.profile_id = $1 and a.state = 'pending'
       and (a.expires_at <= now() or a.safety_epoch <> p.safety_epoch)`,
    [acting.profileId]);
  const rows = await q.query(
    `insert into feture.partner_approval (profile_id, kind, target_type, target_id, change, summary, requested_by, safety_epoch)
     select $1, $2, $3, $4, $5, $6, $7, safety_epoch from feture.profile where id = $1
     on conflict do nothing returning id`,
    [acting.profileId, req.kind, req.targetType, req.targetId, JSON.stringify(req.change), JSON.stringify(req.summary), acting.accountId]);
  if (!rows[0]) fail(409, 'approval_pending');
  // A new version of a returned change replaces it: «на доработке» ends once the author sends the next one.
  await q.query(
    `update feture.partner_approval set state = 'cancelled' where profile_id = $1 and kind = $2 and target_type = $3
       and target_id is not distinct from $4::uuid and state = 'returned'`, [acting.profileId, req.kind, req.targetType, req.targetId]);
  await enqueue(q, 'decide.created', acting.profileId, { approvalId: rows[0].id, kind: req.kind, for: acting.partnerAccountId });
  return { approvalId: /** @type {string} */ (rows[0].id) };
}

/** The partner (never the requester) approves or returns a pending change. An expired or stale change is
 * closed and reported as `{state}` without applying it (not thrown, so the closing write commits).
 * The profile row is locked too: a concurrent narrowing (narrowCouple) waits for this decision or vice versa.
 * @param {Q} q @param {Acting} acting @param {{approvalId: string, choice: 'approve' | 'return', comment?: string}} input */
export async function decideApproval(q, acting, { approvalId, choice, comment }) {
  const [row] = await q.query(
    `select a.id, a.profile_id, a.kind, a.target_type, a.target_id, a.change, a.summary, a.state, a.requested_by,
       a.expires_at <= now() expired, a.safety_epoch <> p.safety_epoch stale
     from feture.partner_approval a join feture.profile p on p.id = a.profile_id
     where a.id = $1 and a.profile_id = $2 for update of a, p`,
    [approvalId, acting.profileId]);
  if (!row) fail(404, 'not_found');
  if (row.state !== 'pending') fail(409, 'conflict', { state: row.state });
  if (row.requested_by === acting.accountId) fail(403, 'forbidden');
  if (row.expired || row.stale) {
    // Expired, or a partner narrowed something since (hid the couple, closed access): never apply.
    const state = row.expired ? 'expired' : 'cancelled';
    await close(q, row.id, state, null);
    await enqueue(q, 'decide.resolved', acting.profileId, { approvalId: row.id, kind: row.kind, state, for: row.requested_by });
    return { state, applied: false };
  }
  if (choice === 'approve') {
    const kind = KINDS.get(row.kind);
    if (!kind) fail(500, 'approval_kind_unknown');
    // If the target changed meanwhile (request declined, revision moved), the change cannot apply any more:
    // undo whatever apply did, close the approval as cancelled and tell both, instead of leaving it pending.
    await q.query('savepoint approval_apply');
    try {
      await kind.apply(q, row);
    } catch (error) {
      if (!(error instanceof FeError) || ![400, 404, 409, 422].includes(error.status)) throw error;
      await q.query('rollback to savepoint approval_apply');
      await close(q, row.id, 'cancelled', null);
      await enqueue(q, 'decide.resolved', acting.profileId, { approvalId: row.id, kind: row.kind, state: 'cancelled', for: row.requested_by });
      return { state: 'cancelled', applied: false, reason: error.code };
    }
  }
  const state = choice === 'approve' ? 'approved' : 'returned';
  // «Вернуть на доработку» may carry a note for the author (V21 returnSend); approving never does.
  await close(q, row.id, state, acting.accountId, choice === 'return' && comment ? comment : null);
  await enqueue(q, 'decide.resolved', acting.profileId, { approvalId: row.id, kind: row.kind, state, for: row.requested_by });
  return { state, applied: choice === 'approve' };
}

/** The requester withdraws their own pending change, or drops one the partner returned (V21 jointCancel).
 * @param {Q} q @param {Acting} acting @param {string} approvalId */
export async function cancelApproval(q, acting, approvalId) {
  const rows = await q.query(
    `update feture.partner_approval set state = 'cancelled', decided_at = coalesce(decided_at, now())
     where id = $1 and profile_id = $2 and requested_by = $3 and state in ('pending', 'returned') returning id`,
    [approvalId, acting.profileId, acting.accountId]);
  if (!rows[0]) fail(404, 'not_found');
  await enqueue(q, 'decide.resolved', acting.profileId, { approvalId, state: 'cancelled', for: acting.partnerAccountId });
  return { state: 'cancelled' };
}

/** Changes of the couple, both directions: «Ждёт согласия партнёра», «Одобрить / Вернуть», and for 14 days the ones
 * returned «на доработку» with the partner's note (V21 pairReturned / jointWorkHTML). `version` counts the proposals for
 * the same target so far; `preview` is the kind's view of what would change (post text, event card, who asks).
 * @param {Q} q @param {Acting} acting */
export async function listApprovals(q, acting) {
  const rows = await q.query(
    `select a.id, a.profile_id, a.kind, a.target_type, a.target_id, a.change, a.summary, a.state, a.requested_by, a.return_note,
       a.created_at, a.expires_at, a.decided_at,
       (select count(*)::int from feture.partner_approval v where v.profile_id = a.profile_id and v.kind = a.kind and v.target_type = a.target_type
          and v.target_id is not distinct from a.target_id and v.id <= a.id) version
     from feture.partner_approval a
     where a.profile_id = $1 and (a.state = 'pending' and a.expires_at > now() or a.state = 'returned' and a.decided_at > now() - interval '14 days')
     order by a.created_at`,
    [acting.profileId]);
  const out = [];
  for (const r of rows) {
    const def = KINDS.get(r.kind);
    out.push({
      // Both partners see exactly what would change (values, not just field names) before deciding.
      id: r.id, kind: r.kind, targetType: r.target_type, targetId: r.target_id, change: r.change, summary: r.summary,
      mine: r.requested_by === acting.accountId, state: r.state, comment: r.return_note ?? null, version: r.version,
      preview: def?.preview ? await def.preview(q, r) : null,
      createdAt: r.created_at, expiresAt: r.expires_at, returnedAt: r.state === 'returned' ? r.decided_at : null,
    });
  }
  return out;
}

/** @param {Q} q @param {string} id @param {string} state @param {string | null} by @param {string | null} [note] */
async function close(q, id, state, by, note = null) {
  await q.query('update feture.partner_approval set state = $2, decided_by = $3, decided_at = now(), return_note = $4 where id = $1', [id, state, by, note]);
}

/** Any member's immediate safety action on a couple (hide from Discover, close the private part, revoke all,
 * stop the couple): bumps the epoch and cancels every pending widening, so nothing approved later can
 * reopen what was just closed. Narrowing commands call this FIRST, before their own revocations: the epoch
 * update locks the profile row, so a decision already applying a widening finishes before the revocation reads.
 * @param {Q} q @param {Acting} acting @param {string} reason short code */
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
