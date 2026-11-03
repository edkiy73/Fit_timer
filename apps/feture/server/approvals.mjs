// @ts-check
import { FeError, fail } from './errors.mjs';
import { enqueue } from './outbox.mjs';
import { readAbout } from './notify.mjs';

/** @typedef {import('./db.mjs').Q} Q @typedef {import('./profiles.mjs').Acting} Acting */
/**
 * Couple approvals (docs/notifications.md «Согласования пары и задачи», owner 03.11.2026). One partner proposes a
 * widening change; the other approves or rejects it. Outcomes, all final:
 *   pending → approved   the partner agreed and the change applied in the same transaction;
 *   pending → rejected   the partner refused (an optional comment); nothing changes, the author gets a result, no task;
 *   pending → cancelled  the author withdrew it, or a safety narrowing (hide, close access, stop) voided it;
 *   pending → expired    14 days passed (jobs.mjs sweepExpiredApprovals, or the first read after);
 *   pending → superseded a newer proposal of the same kind for the same object replaced it;
 *   pending → stale      the object changed before the partner agreed (`version` differs from `base_rev`, or apply
 *                        found it no longer applies): nothing is applied.
 * Every close goes through `close()`: it stores who and when, runs the kind's hook (a refused, withdrawn or expired
 * event goes back to the author's drafts) and enqueues `decide.resolved`, which tells the other side and sends the live
 * `changed` signal (decide + couple) to the couple's channel, so an open sheet on any device re-reads at once.
 *
 * A domain registers each kind:
 * - `apply(q, row)` runs inside the deciding transaction; a 4xx FeError means it no longer applies (→ stale).
 * - `always`: needs both partners even when the partner trusts (opening the couple's private part to someone).
 * - `version(q, row)`: a short string naming the object's current state; stored at creation, compared at approval.
 * - `preview(q, row)`: what both partners are shown — subject, object, before → after, the content as it would go
 *   (post text, event card without the exact address, the answers to an organizer or host). Only rows the couple may see.
 * - `onReject` / `onCancel` / `onExpire(q, row)`: give back what waited (an object in `pending_partner`); may return
 *   an object stored as `outcome` (e.g. `{eventDraftId}`) that the result card uses for «Изменить и отправить снова».
 * @typedef {(q: Q, row: ApprovalRow) => Promise<Record<string, unknown> | void>} Hook
 * @typedef {{apply: (q: Q, row: ApprovalRow) => Promise<void>, always?: boolean, version?: (q: Q, row: ApprovalRow) => Promise<string | null>,
 *   preview?: (q: Q, row: ApprovalRow) => Promise<Preview | null>, onReject?: Hook, onCancel?: Hook, onExpire?: Hook}} ApprovalKind
 * @typedef {{type: string, id: string | null, title: string | null, state?: string}} ObjectRef  state: ok | unavailable | deleted
 * @typedef {{object?: ObjectRef | null, subject?: {id: string, kind?: string, handle: string | null, name: string | null} | null,
 *   rows?: {field: string, before: unknown, after: unknown}[], [k: string]: unknown}} Preview
 * @typedef {{id: string, profile_id: string, kind: string, target_type: string, target_id: string | null,
 *   change: Record<string, any>, summary: unknown[], state: string, requested_by: string, base_rev?: string | null,
 *   comment?: string | null, outcome?: Record<string, unknown> | null, couple_name?: string | null, decided_by?: string | null,
 *   created_at?: string, expires_at?: string, decided_at?: string | null}} ApprovalRow
 */

/** The 19 kinds the app knows (src/fe/kit approval sheet, contracts/notifications.mjs decide.joint.<kind>). */
export const APPROVAL_KINDS = Object.freeze(['profile.update', 'profile.photos', 'profile.setVisibility', 'interests.set', 'post.publish', 'post.edit',
  'event.submit', 'event.update', 'event.rsvp', 'event.apply', 'access.grant', 'private.on', 'community.create', 'community.join',
  'link.propose', 'link.accept', 'link.visibility', 'location.set', 'chat.request']);
export const CLOSED_STATES = Object.freeze(['approved', 'rejected', 'cancelled', 'expired', 'superseded', 'stale']);

/** @type {Map<string, ApprovalKind>} */
const KINDS = new Map();

/** @param {string} kind e.g. `post.publish`, `access.grant` @param {ApprovalKind} def */
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

/** A couple's action applied at once (trust mode): a line in the partner's couple history (notify.mjs `pair.acted`; the
 * catalog decides whether it also pushes — docs/notifications.md «Push»). Nothing for a person or a couple without a
 * partner. `extra`: the ids the row opens (an event, a community, a profile as `target`).
 * @param {Q} q @param {Acting} acting @param {string} what @param {Record<string, unknown>} [extra] */
export async function partnerActed(q, acting, what, extra = {}) {
  if (acting.kind !== 'couple' || !acting.partnerAccountId) return;
  await enqueue(q, 'couple.changed', acting.profileId, { ...extra, for: acting.partnerAccountId, what });
}

const COLUMNS = `a.id, a.profile_id, a.kind, a.target_type, a.target_id, a.change, a.summary, a.state, a.requested_by, a.base_rev, a.comment,
  a.outcome, a.couple_name, a.decided_by, a.created_at, a.expires_at, a.decided_at`;

/** Opens a pending change. A pending one of the same kind for the same object is replaced («заменено новым»).
 * @param {Q} q @param {Acting} acting
 * @param {{kind: string, targetType: string, targetId: string | null, change: Record<string, unknown>, summary: unknown[]}} req */
export async function requestApproval(q, acting, req) {
  if (!needsPartner(acting, req.kind)) fail(500, 'approval_not_needed');
  // Expired or voided pendings of the couple are closed first (the job may not have run yet).
  await closePending(q, `a.profile_id = $1 and a.expires_at <= now()`, [acting.profileId], 'expired');
  await closePending(q, `a.profile_id = $1 and a.safety_epoch <> (select safety_epoch from feture.profile where id = a.profile_id)`, [acting.profileId], 'cancelled', { hooks: false });
  const old = await closePending(q, `a.profile_id = $1 and a.kind = $2 and a.target_type = $3 and a.target_id is not distinct from $4::uuid`,
    [acting.profileId, req.kind, req.targetType, req.targetId], 'superseded', { by: acting.accountId, hooks: false });
  const def = /** @type {ApprovalKind} */ (KINDS.get(req.kind));
  const draft = /** @type {ApprovalRow} */ ({ id: '', profile_id: acting.profileId, kind: req.kind, target_type: req.targetType, target_id: req.targetId,
    change: req.change, summary: req.summary, state: 'pending', requested_by: acting.accountId });
  const base = def.version ? await def.version(q, draft) : null;
  const rows = await q.query(
    `insert into feture.partner_approval (profile_id, kind, target_type, target_id, change, summary, requested_by, safety_epoch, base_rev, couple_name)
     select $1, $2, $3, $4, $5, $6, $7, safety_epoch, $8, coalesce(nullif(name, ''), '@' || handle) from feture.profile where id = $1
     on conflict do nothing returning id`,
    [acting.profileId, req.kind, req.targetType, req.targetId, JSON.stringify(req.change), JSON.stringify(req.summary), acting.accountId, base]);
  if (!rows[0]) fail(409, 'approval_pending');
  if (old.length) await q.query(`update feture.partner_approval set superseded_by = $2 where id = any($1)`, [old, rows[0].id]);
  await enqueue(q, 'decide.created', acting.profileId, { approvalId: rows[0].id, kind: req.kind, for: acting.partnerAccountId });
  return { approvalId: /** @type {string} */ (rows[0].id) };
}

/** The partner (never the author) approves or rejects a pending change. An expired, voided or stale one is closed and
 * reported as `{state}` without applying it (not thrown, so the closing write commits). The profile row is locked
 * too: a concurrent narrowing (narrowCouple) waits for this decision or vice versa. A second device or a replay with
 * another opId finds it closed: 409 with the state; the same opId replays the stored answer (handler pipeline).
 * @param {Q} q @param {Acting} acting @param {{approvalId: string, choice: 'approve' | 'reject', comment?: string}} input */
export async function decideApproval(q, acting, { approvalId, choice, comment }) {
  const [row] = await q.query(
    `select ${COLUMNS}, a.expires_at <= now() expired, a.safety_epoch <> p.safety_epoch voided
     from feture.partner_approval a join feture.profile p on p.id = a.profile_id
     where a.id = $1 and a.profile_id = $2 for update of a, p`,
    [approvalId, acting.profileId]);
  if (!row) fail(404, 'not_found');
  if (row.state !== 'pending') fail(409, 'conflict', { state: row.state });
  if (row.requested_by === acting.accountId) fail(403, 'forbidden');
  if (row.expired) { await close(q, row, 'expired', {}); return { state: 'expired', applied: false }; }
  // A partner narrowed something since (hid the couple, closed access): never apply.
  if (row.voided) { await close(q, row, 'cancelled', { hooks: false }); return { state: 'cancelled', applied: false }; }
  if (choice === 'reject') {
    await close(q, row, 'rejected', { decidedBy: acting.accountId, comment: comment ?? null, by: acting.accountId });
    return { state: 'rejected', applied: false };
  }
  const kind = KINDS.get(row.kind);
  if (!kind) fail(500, 'approval_kind_unknown');
  if (kind.version && (await kind.version(q, row)) !== row.base_rev) {
    await close(q, row, 'stale', { by: acting.accountId, hooks: false });
    return { state: 'stale', applied: false };
  }
  // If the target changed meanwhile in a way the version does not see (request declined, community closed), the change
  // cannot apply any more: undo whatever apply did and close it as stale instead of leaving it pending.
  await q.query('savepoint approval_apply');
  try {
    await kind.apply(q, row);
  } catch (error) {
    if (!(error instanceof FeError) || ![400, 404, 409, 422].includes(error.status)) throw error;
    await q.query('rollback to savepoint approval_apply');
    await close(q, row, 'stale', { by: acting.accountId, hooks: false });
    return { state: 'stale', applied: false, reason: error.code };
  }
  await close(q, row, 'approved', { decidedBy: acting.accountId, by: acting.accountId });
  return { state: 'approved', applied: true };
}

/** The author withdraws their own pending change (V21 jointCancel). @param {Q} q @param {Acting} acting @param {string} approvalId */
export async function cancelApproval(q, acting, approvalId) {
  const [row] = await q.query(
    `select ${COLUMNS} from feture.partner_approval a where a.id = $1 and a.profile_id = $2 and a.requested_by = $3 for update`,
    [approvalId, acting.profileId, acting.accountId]);
  if (!row) fail(404, 'not_found');
  if (row.state !== 'pending') fail(409, 'conflict', { state: row.state });
  await close(q, row, 'cancelled', { by: acting.accountId });
  return { state: 'cancelled' };
}

/** Closes every pending approval matching `where` (SQL over `a`, with `params`) as `state`. Domains call this instead
 * of updating the table, so the other side is told and the live signal goes out. `by`: the account that caused it (it
 * gets no row about its own action). `silent`: no inbox row at all, only the live signal (the caller's own notice
 * covers it). `hooks: false` when the caller already deals with the object (a withdrawn event).
 * Returns the closed ids. @param {Q} q @param {string} where @param {unknown[]} params @param {string} state
 * @param {{by?: string | null, hooks?: boolean, silent?: boolean}} [opts] */
export async function closePending(q, where, params, state, opts = {}) {
  const rows = await q.query(`select ${COLUMNS} from feture.partner_approval a where a.state = 'pending' and (${where}) order by a.created_at for update`, params);
  for (const row of rows) await close(q, row, state, opts);
  return rows.map(r => /** @type {string} */ (r.id));
}

/** @param {Q} q @param {ApprovalRow} row @param {string} state
 * @param {{decidedBy?: string | null, comment?: string | null, by?: string | null, hooks?: boolean, silent?: boolean}} opts */
async function close(q, row, state, { decidedBy = null, comment = null, by = null, hooks = true, silent = false }) {
  const def = KINDS.get(row.kind);
  const hook = !hooks ? undefined : state === 'rejected' ? def?.onReject : state === 'cancelled' ? def?.onCancel : state === 'expired' ? def?.onExpire : undefined;
  const outcome = hook ? await hook(q, row) : null;
  await q.query(
    `update feture.partner_approval set state = $2, decided_by = $3, decided_at = now(), comment = $4, outcome = coalesce($5::jsonb, outcome) where id = $1`,
    [row.id, state, decidedBy, comment, outcome ? JSON.stringify(outcome) : null]);
  // A decided task reads its own inbox row, for both members (docs/notifications.md «Счётчики»).
  await readAbout(q, { profile: row.profile_id, kind: 'task', objectType: 'approval', objectId: row.id });
  // The author learns how it ended; a withdrawal by the author is news for the partner whose task it was.
  const partner = state === 'cancelled' && by === row.requested_by
    ? (await q.query(`select account_id from feture.profile_member where profile_id = $1 and account_id <> $2 and state = 'active' limit 1`, [row.profile_id, row.requested_by]))[0]?.account_id ?? null
    : null;
  await enqueue(q, 'decide.resolved', row.profile_id, { approvalId: row.id, kind: row.kind, state, for: partner ?? row.requested_by, ...(by ? { by } : {}), ...(silent ? { silent: true } : {}) });
}

/** Background expiry (jobs.mjs): pending changes past their date are closed as expired — the author gets «Срок истёк»,
 * the partner's task goes. @param {Q} q @param {number} [limit] */
export async function expireApprovals(q, limit = 100) {
  return (await closePending(q, `a.id in (select id from feture.partner_approval where state = 'pending' and expires_at <= now() order by expires_at limit ${Math.max(1, Math.min(500, limit | 0))} for update skip locked)`, [], 'expired')).length;
}

/** People shown on an approval: the author and whoever decided, by their person profile. @param {Q} q @param {string[]} accounts */
async function peopleOf(q, accounts) {
  const ids = [...new Set(accounts.filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await q.query(
    `select a.id account, p.id, p.handle, p.name from feture.account a join feture.profile p on p.id = a.person_profile_id where a.id = any($1)`, [ids]);
  return new Map(rows.map(r => [r.account, { id: r.id, name: r.name || (r.handle ? '@' + r.handle : null) }]));
}

/** One approval as both partners see it: kind, author, the couple it is addressed to (name then), the object, the full
 * preview, the state, who decided and when, the comment. A pending one past its date reads as expired.
 * @param {Q} q @param {ApprovalRow & {version?: number}} r @param {string} accountId @param {Map<string, any>} people */
async function dto(q, r, accountId, people) {
  const def = KINDS.get(r.kind);
  const expired = r.state === 'pending' && r.expires_at && new Date(r.expires_at).getTime() <= Date.now();
  const preview = def?.preview ? await def.preview(q, r) : null;
  const object = preview?.object ?? { type: r.target_type.split(':')[0], id: r.target_id, title: null, state: 'ok' };
  return {
    id: r.id, kind: r.kind, state: expired ? 'expired' : r.state, mine: r.requested_by === accountId,
    initiator: people.get(r.requested_by) ?? null, decidedBy: r.decided_by ? people.get(r.decided_by) ?? null : null,
    addressee: { id: r.profile_id, name: r.couple_name ?? null },
    object, objectState: object.state ?? 'ok', preview, change: r.change, summary: r.summary, comment: r.comment ?? null,
    rev: r.base_rev ?? null, version: r.version ?? 1, outcome: r.outcome ?? null,
    createdAt: r.created_at, expiresAt: r.expires_at, decidedAt: expired ? r.expires_at : r.decided_at ?? null,
  };
}

const VERSION = `(select count(*)::int from feture.partner_approval v where v.profile_id = a.profile_id and v.kind = a.kind and v.target_type = a.target_type
  and v.target_id is not distinct from a.target_id and v.id <= a.id) version`;

/** Open changes of the couple, both directions (Q01 «Ждёт подтверждения»). `version` counts the proposals for the same
 * object so far. @param {Q} q @param {Acting} acting */
export async function listApprovals(q, acting) {
  const rows = await q.query(
    `select ${COLUMNS}, ${VERSION} from feture.partner_approval a
     where a.profile_id = $1 and a.state = 'pending' and a.expires_at > now() order by a.created_at`, [acting.profileId]);
  const people = await peopleOf(q, rows.flatMap(r => [r.requested_by, r.decided_by]));
  const out = [];
  for (const r of rows) out.push(await dto(q, r, acting.accountId, people));
  return out;
}

/** `approval.get`: one approval by id in any state, for a current member of its couple only — a former partner, a
 * stranger and a deleted couple get not_found. @param {Q} q @param {string} accountId @param {string} approvalId */
export async function getApproval(q, accountId, approvalId) {
  const [r] = await q.query(
    `select ${COLUMNS}, ${VERSION} from feture.partner_approval a join feture.profile p on p.id = a.profile_id and p.state <> 'deleted'
     where a.id = $1 and exists (select 1 from feture.profile_member m where m.profile_id = a.profile_id and m.account_id = $2 and m.state = 'active')`,
    [approvalId, accountId]);
  if (!r) fail(404, 'not_found');
  return dto(q, r, accountId, await peopleOf(q, [r.requested_by, r.decided_by]));
}

/** «Нужно решить» rows of approvals waiting for this account (server/commands/inbox.mjs): the field contract the inbox
 * renders — `kind` (one of the 19), `actor` {id, name} (the author), `addressee` {id, name} (the couple, name then),
 * `object` {type, id, title}, `summary` (one short safe line), `approvalId`, `rev`. @param {Q} q @param {string[]} ids @param {string} accountId */
export async function decideItems(q, ids, accountId) {
  if (!ids.length) return new Map();
  const rows = await q.query(`select ${COLUMNS} from feture.partner_approval a where a.id = any($1)`, [ids]);
  const people = await peopleOf(q, rows.map(r => r.requested_by));
  /** @type {Map<string, any>} */
  const out = new Map();
  for (const r of rows) {
    const d = await dto(q, r, accountId, people);
    out.set(r.id, {
      kind: d.kind, actor: d.initiator, addressee: d.addressee,
      object: { type: d.object.type, id: d.object.id, title: d.object.title },
      summary: summaryLine(d.preview, d.object), approvalId: d.id, rev: d.rev,
    });
  }
  return out;
}

/** One short line of what changes, from what both partners already see: the object's title, the person it concerns, or
 * the changed fields as codes (the screen names them). Never an address, a message body or private data.
 * @param {Preview | null} p @param {ObjectRef} o */
function summaryLine(p, o) {
  const cut = (/** @type {unknown} */ s) => (typeof s === 'string' && s.trim() ? (s.trim().length > 80 ? s.trim().slice(0, 79) + '…' : s.trim()) : null);
  return cut(o.title) ?? cut(p?.subject?.name ?? (p?.subject?.handle ? '@' + p.subject.handle : null)) ?? (p?.rows?.length ? p.rows.map(r => r.field).join(', ') : null);
}

/** Any member's immediate safety action on a couple (hide from Discover, close the private part, revoke all,
 * stop the couple): bumps the epoch and cancels every pending widening, so nothing approved later can
 * reopen what was just closed. Narrowing commands call this FIRST, before their own revocations: the epoch
 * update locks the profile row, so a decision already applying a widening finishes before the revocation reads.
 * `notify: false` — the caller's own notice says it all (a pause is one «Пара на паузе», not two).
 * @param {Q} q @param {Acting} acting @param {string} reason short code @param {{notify?: boolean}} [opts] */
export async function narrowCouple(q, acting, reason, { notify = true } = {}) {
  if (acting.kind !== 'couple') return { cancelled: 0 };
  await q.query('update feture.profile set safety_epoch = safety_epoch + 1, updated_at = now() where id = $1', [acting.profileId]);
  const ids = await closePending(q, `a.profile_id = $1`, [acting.profileId], 'cancelled', { by: acting.accountId, silent: true });
  if (notify) await enqueue(q, 'couple.narrowed', acting.profileId, { reason, for: acting.partnerAccountId, cancelled: ids.length });
  return { cancelled: ids.length };
}
