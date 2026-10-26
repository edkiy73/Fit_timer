// @ts-check
import { moderationCommands } from '../../contracts/moderation.mjs';
import { fail } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { journal, requireStaff } from './staff.mjs';
import { applyEdit, settlePublication } from './posts.mjs';
import { narrowCouple } from '../approvals.mjs';
import { closeAll } from './access.mjs';

/** S4 step 3 (docs/server/S4-MODERATION.md §2–4): reports grouped by target, decisions with a statement of reasons,
 * «это я на фото» disputes, profile sanctions. Staff never decide about their own profiles or couple; every decision
 * is journalled; reporters are told the outcome without being named to the author.
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q
 */

const MODERATORS = ['owner', 'lead', 'moderator'];
const RANK = { owner: 4, lead: 3, moderator: 2, verifier: 1, auditor: 1, support: 1 };
// Suspensions for these rules (and CSAM) can be lifted by the owner only (S4 §5).
const OWNER_ONLY_LIFT = new Set(['minors', 'illegal', 'csam']);
// Queue order (S4 §2): minors first, then threats, private material, spam, the rest.
const PRIORITY = `case reason when 'minor' then 0 when 'threat' then 2 when 'private' then 3 when 'spam' then 5 else 6 end`;

/** Owner profile of a report target, refusing the staff member's own. @param {Q} q @param {string} staffAccount @param {string} type @param {string} id */
async function targetOwner(q, staffAccount, type, id) {
  const [t] = await q.query(
    type === 'post' ? `select owner_profile_id owner, state from feture.post where id = $1 for update`
      : type === 'reply' ? `select author_profile_id owner, state from feture.reply where id = $1 for update`
        : `select id owner, state from feture.profile where id = $1 for update`, [id]);
  if (!t) fail(404, 'not_found');
  const [{ own }] = await q.query(
    `select exists (select 1 from feture.profile_member where profile_id = $1 and account_id = $2) own`, [t.owner, staffAccount]);
  if (own) fail(403, 'forbidden');
  return t;
}

/** Suspends or restores a person and everything they act as: the account, the person profile and their couple
 * (the couple is closed like a safety stop, so the partner cannot keep acting as it). A couple profile alone can
 * be suspended too. @param {Q} q @param {string} profileId @param {boolean} suspend @param {string} rule */
async function setSuspended(q, profileId, suspend, rule) {
  const [p] = await q.query(`select id, kind, state from feture.profile where id = $1 for update`, [profileId]);
  if (!p || (suspend ? !['active', 'paused'].includes(p.state) : p.state !== 'suspended')) fail(409, 'conflict');
  const profiles = [p.id];
  if (p.kind === 'person') {
    const couples = await q.query(
      `select pr.id from feture.profile_member m join feture.profile pr on pr.id = m.profile_id
       join feture.account a on a.id = m.account_id
       where a.person_profile_id = $1 and m.profile_kind = 'couple' and m.state = 'active' and pr.state in ('active', 'paused', 'suspended')`, [p.id]);
    profiles.push(...couples.map(c => c.id));
  }
  for (const id of profiles) {
    if (suspend) {
      const [x] = await q.query(`select kind, state from feture.profile where id = $1`, [id]);
      if (x.kind === 'couple' && x.state !== 'suspended') {
        const partners = await q.query(`select account_id from feture.profile_member where profile_id = $1 and state = 'active'`, [id]);
        await narrowCouple(q, Object.freeze({ accountId: partners[0].account_id, profileId: id, kind: 'couple', state: x.state, partnerAccountId: partners[1]?.account_id ?? null, partnerApproves: false, writable: true }), 'suspended');
        await closeAll(q, id, 'couple_stopped');
      }
      await q.query(`update feture.profile set state = 'suspended', restore_until = null, paused_at = null, updated_at = now() where id = $1 and state <> 'suspended'`, [id]);
    } else {
      await q.query(`update feture.profile set state = 'active', updated_at = now() where id = $1 and state = 'suspended'`, [id]);
    }
  }
  if (p.kind === 'person') {
    await q.query(`update feture.account set state = $2, suspension_rule = $4, updated_at = now() where person_profile_id = $1 and state = $3`,
      [p.id, suspend ? 'suspended' : 'active', suspend ? 'active' : 'suspended', suspend ? rule : null]);
  }
}

/** Staff never sanction someone of equal or higher rank; the owner only through SQL. @param {Q} q @param {string[]} roles @param {string} profileId */
async function checkRank(q, roles, profileId) {
  const mine = Math.max(...roles.map(r => RANK[/** @type {keyof typeof RANK} */ (r)] ?? 0));
  const theirs = await q.query(
    `select sr.role from feture.staff_role sr join feture.profile_member m on m.account_id = sr.account_id
     where m.profile_id = $1 and m.state = 'active' and sr.revoked_at is null`, [profileId]);
  if (theirs.some(r => r.role === 'owner' || (RANK[/** @type {keyof typeof RANK} */ (r.role)] ?? 0) >= mine)) fail(403, 'forbidden');
}

/** @type {Record<keyof typeof moderationCommands, Command['run']>} */
const run = {
  async 'staff.reportQueue'(q, { account, input }) {
    await requireStaff(q, account.id, MODERATORS);
    const groups = await q.query(
      `select r.target_type, r.target_id, count(*)::int reports, min(r.created_at) first_at, max(r.created_at) last_at,
         array_agg(distinct r.reason) reasons, min(${PRIORITY.replace(/reason/g, 'r.reason')}) priority,
         array_remove(array_agg(nullif(r.details, '')), null) details,
         (array_agg(r.snapshot order by r.created_at) filter (where r.snapshot is not null))[1] snapshot
       from feture.report r where r.state = 'open' group by r.target_type, r.target_id
       order by priority, first_at limit $1`, [input.limit]);
    const items = [];
    for (const g of groups) {
      // Snapshot of what was reported; the author's identity is shown, the reporters' is not.
      const [snap] = await q.query(
        g.target_type === 'post'
          ? `select p.owner_profile_id owner, coalesce(p.title || ': ', '') || left(p.body, 400) excerpt, p.state,
               (select count(*)::int from feture.media_attachment a where a.target_type = 'post' and a.target_id = p.id) media
             from feture.post p where p.id = $1`
          : g.target_type === 'reply'
            ? `select author_profile_id owner, left(body, 400) excerpt, state, 0 media from feture.reply where id = $1`
            : `select p.id owner, coalesce(p.name, '') || ' @' || coalesce(p.handle, '') || ' — ' || left(coalesce(d.bio, ''), 300) excerpt, p.state, 0 media
               from feture.profile p left join feture.profile_details d on d.profile_id = p.id where p.id = $1`, [g.target_id]);
      if (!snap) continue;
      const [{ own }] = await q.query(`select exists (select 1 from feture.profile_member where profile_id = $1 and account_id = $2) own`, [snap.owner, account.id]);
      if (own) continue;
      const [author] = await q.query(`select id, kind, handle, name, state from feture.profile where id = $1`, [snap.owner]);
      // Evidence as it was when first reported (S4 §3), plus how it looks now.
      items.push({ targetType: g.target_type, targetId: g.target_id, reports: g.reports, reasons: g.reasons, priority: g.priority,
        details: g.details.slice(0, 5), firstAt: g.first_at, lastAt: g.last_at, reported: g.snapshot, excerpt: snap.excerpt, state: snap.state, media: snap.media, author });
    }
    return { items };
  },

  async 'staff.reportDecide'(q, { account, input }) {
    await requireStaff(q, account.id, MODERATORS);
    const t = await targetOwner(q, account.id, input.targetType, input.targetId);
    // A decision answers open reports, once, on live content.
    const [{ open }] = await q.query(`select count(*)::int open from feture.report where target_type = $1 and target_id = $2 and state = 'open'`, [input.targetType, input.targetId]);
    if (!open) fail(409, 'conflict', { rule: 'no_open_reports' });
    const live = input.targetType === 'post' ? ['published', 'review'] : input.targetType === 'reply' ? ['published'] : ['active'];
    if (input.decision === 'remove' && !live.includes(t.state)) fail(409, 'conflict', { state: t.state });
    if (input.decision === 'remove') {
      if (input.targetType === 'post') await q.query(`update feture.post set state = 'removed', removed_reason = $2, updated_at = now() where id = $1`, [input.targetId, input.rule]);
      if (input.targetType === 'reply') await q.query(`update feture.reply set state = 'removed' where id = $1`, [input.targetId]);
      // The author learns what was removed and under which rule, and how to appeal (DSA art. 17).
      await enqueue(q, 'content.removed', t.owner, { targetType: input.targetType, targetId: input.targetId, rule: input.rule });
    }
    const reporters = await q.query(
      `update feture.report set state = 'resolved', resolution = $3, resolved_at = now()
       where target_type = $1 and target_id = $2 and state = 'open' returning reporter_profile_id`,
      [input.targetType, input.targetId, input.decision === 'remove' ? 'removed' : 'kept']);
    for (const r of reporters) await enqueue(q, 'report.resolved', r.reporter_profile_id, { targetType: input.targetType, resolution: input.decision === 'remove' ? 'removed' : 'kept' });
    await journal(q, account.id, 'report.' + input.decision, input.targetType, input.targetId, { rule: input.rule ?? null, reports: reporters.length, note: input.note });
    return { resolved: reporters.length, action: input.decision };
  },

  async 'staff.disputeQueue'(q, { account, input }) {
    await requireStaff(q, account.id, MODERATORS);
    const items = await q.query(
      `select p.id, p.disputed_at, left(coalesce(p.title || ': ', '') || p.body, 300) excerpt,
         (select count(*)::int from feture.media_attachment a where a.target_type = 'post' and a.target_id = p.id) media
       from feture.post p
       where p.disputed_at is not null and p.state = 'published'
         and not exists (select 1 from feture.profile_member m where m.profile_id = p.owner_profile_id and m.account_id = $1)
       order by p.disputed_at limit $2`, [account.id, input.limit]);
    return { items };
  },

  async 'staff.disputeDecide'(q, { account, input }) {
    await requireStaff(q, account.id, MODERATORS);
    const t = await targetOwner(q, account.id, 'post', input.postId);
    const [p] = await q.query('select disputed_at from feture.post where id = $1', [input.postId]);
    if (!p.disputed_at || t.state !== 'published') fail(409, 'conflict');
    if (input.restore) {
      // Restored only when the person is not recognisable or consent is confirmed (V21 M01).
      const [{ disputed_by: by }] = await q.query(`update feture.post set disputed_at = null where id = $1 returning (select disputed_by from feture.post where id = $1) disputed_by`, [input.postId]);
      await q.query(`update feture.post set disputed_by = null where id = $1`, [input.postId]);
      await enqueue(q, 'post.restored', t.owner, { postId: input.postId });
      if (by) await enqueue(q, 'dispute.resolved', by, { postId: input.postId, outcome: 'restored' });
    } else {
      await q.query(`update feture.post set state = 'removed', removed_reason = 'consent', updated_at = now() where id = $1`, [input.postId]);
      await enqueue(q, 'content.removed', t.owner, { targetType: 'post', targetId: input.postId, rule: 'consent' });
    }
    await journal(q, account.id, input.restore ? 'dispute.restore' : 'dispute.remove', 'post', input.postId);
    return { state: input.restore ? 'published' : 'removed' };
  },

  async 'staff.revisionQueue'(q, { account, input }) {
    await requireStaff(q, account.id, MODERATORS);
    const items = await q.query(
      `select r.id, r.post_id, r.created_at, r.payload, left(coalesce(p.title || ': ', '') || p.body, 300) live
       from feture.post_revision r join feture.post p on p.id = r.post_id
       where r.state = 'review' and not exists (select 1 from feture.profile_member m where m.profile_id = p.owner_profile_id and m.account_id = $1)
       order by r.created_at limit $2`, [account.id, input.limit]);
    return { items: items.map(r => ({ id: r.id, postId: r.post_id, createdAt: r.created_at, live: r.live, proposed: r.payload })) };
  },

  async 'staff.revisionDecide'(q, { account, input }) {
    await requireStaff(q, account.id, MODERATORS);
    const [r] = await q.query(
      `select r.*, p.owner_profile_id, p.state post_state from feture.post_revision r join feture.post p on p.id = r.post_id where r.id = $1 for update of r, p`,
      [input.revisionId]);
    if (!r) fail(404, 'not_found');
    await targetOwner(q, account.id, 'post', r.post_id);
    if (r.state !== 'review' || !['published', 'review'].includes(r.post_state)) fail(409, 'conflict', { state: r.state });
    if (input.decision === 'approve') {
      // Approving a revision made on an older version would overwrite later edits: refused as stale.
      const [{ rev: now }] = await q.query('select rev from feture.post where id = $1', [r.post_id]);
      if (r.base_rev !== null && r.base_rev !== now) fail(409, 'conflict', { rule: 'stale_revision' });
      const f = r.payload;
      // The approved version must still meet the publication rules: every file checked, nothing explicit in public.
      const media = f.mediaIds.length ? await q.query(
        `select state, explicitness from feture.media_asset where id = any($1) and owner_profile_id = $2`, [f.mediaIds, r.owner_profile_id]) : [];
      if (media.length !== f.mediaIds.length || media.some(m => m.state !== 'approved')) fail(409, 'conflict', { rule: 'media_not_ready' });
      if (['all', 'followers'].includes(f.audience) && media.some(m => m.explicitness !== 'safe')) fail(422, 'rule_violation', { rule: 'explicit_in_public' });
      const oldMedia = (await q.query(`select asset_id from feture.media_attachment where target_type = 'post' and target_id = $1`, [r.post_id])).map(x => x.asset_id);
      await applyEdit(q, r.post_id, { profileId: r.owner_profile_id, accountId: r.submitted_by }, f, oldMedia);
      if (r.post_state === 'review') await settlePublication(q, r.post_id);
    }
    await q.query(`update feture.post_revision set state = $2, decided_at = now() where id = $1`, [r.id, input.decision === 'approve' ? 'approved' : 'rejected']);
    await enqueue(q, input.decision === 'approve' ? 'revision.approved' : 'revision.rejected', r.owner_profile_id, { postId: r.post_id, rule: input.rule ?? null });
    await journal(q, account.id, 'revision.' + input.decision, 'post', r.post_id, { revisionId: r.id, rule: input.rule ?? null });
    return { state: input.decision === 'approve' ? 'approved' : 'rejected' };
  },

  async 'staff.sanction'(q, { account, input }) {
    const roles = await requireStaff(q, account.id, ['owner', 'lead']);
    await targetOwner(q, account.id, 'profile', input.profileId);
    await checkRank(q, roles, input.profileId);
    if (input.decision === 'lift') {
      const [{ rule }] = await q.query(
        `select coalesce((select a.suspension_rule from feture.account a where a.person_profile_id = $1), '') rule`, [input.profileId]);
      if (OWNER_ONLY_LIFT.has(rule) && !roles.includes('owner')) fail(403, 'forbidden');
    }
    await setSuspended(q, input.profileId, input.decision === 'suspend', input.rule);
    await enqueue(q, input.decision === 'suspend' ? 'profile.suspended' : 'profile.restored', input.profileId, { rule: input.rule });
    await journal(q, account.id, 'sanction.' + input.decision, 'profile', input.profileId, { rule: input.rule });
    return { state: input.decision === 'suspend' ? 'suspended' : 'active' };
  },
};

/** @type {Record<string, Command>} */
export const moderation = Object.fromEntries(
  Object.entries(moderationCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
