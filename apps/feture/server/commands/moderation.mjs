// @ts-check
import { moderationCommands } from '../../contracts/moderation.mjs';
import { fail } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { journal, requireStaff } from './staff.mjs';
import { applyEdit } from './posts.mjs';

/** S4 step 3 (docs/server/S4-MODERATION.md §2–4): reports grouped by target, decisions with a statement of reasons,
 * «это я на фото» disputes, profile sanctions. Staff never decide about their own profiles or couple; every decision
 * is journalled; reporters are told the outcome without being named to the author.
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q
 */

const MODERATORS = ['owner', 'lead', 'moderator'];
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

/** Suspends or restores a profile; a person's account follows its person profile. @param {Q} q @param {string} profileId @param {boolean} suspend */
async function setSuspended(q, profileId, suspend) {
  const [p] = await q.query(
    suspend
      ? `update feture.profile set state = 'suspended', restore_until = null, paused_at = null, updated_at = now() where id = $1 and state in ('active', 'paused') returning kind`
      : `update feture.profile set state = 'active', updated_at = now() where id = $1 and state = 'suspended' returning kind`, [profileId]);
  if (!p) fail(409, 'conflict');
  if (p.kind === 'person') {
    await q.query(`update feture.account set state = $2, updated_at = now() where person_profile_id = $1 and state = $3`,
      [profileId, suspend ? 'suspended' : 'active', suspend ? 'active' : 'suspended']);
  }
}

/** @type {Record<keyof typeof moderationCommands, Command['run']>} */
const run = {
  async 'staff.reportQueue'(q, { account, input }) {
    await requireStaff(q, account.id, MODERATORS);
    const groups = await q.query(
      `select r.target_type, r.target_id, count(*)::int reports, min(r.created_at) first_at, max(r.created_at) last_at,
         array_agg(distinct r.reason) reasons, min(${PRIORITY.replace(/reason/g, 'r.reason')}) priority,
         array_remove(array_agg(nullif(r.details, '')), null) details
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
      items.push({ targetType: g.target_type, targetId: g.target_id, reports: g.reports, reasons: g.reasons, priority: g.priority,
        details: g.details.slice(0, 5), firstAt: g.first_at, lastAt: g.last_at, excerpt: snap.excerpt, state: snap.state, media: snap.media, author });
    }
    return { items };
  },

  async 'staff.reportDecide'(q, { account, input }) {
    await requireStaff(q, account.id, MODERATORS);
    const t = await targetOwner(q, account.id, input.targetType, input.targetId);
    if (input.decision === 'remove') {
      if (input.targetType === 'post') await q.query(`update feture.post set state = 'removed', removed_reason = $2, updated_at = now() where id = $1`, [input.targetId, input.rule]);
      if (input.targetType === 'reply') await q.query(`update feture.reply set state = 'removed' where id = $1`, [input.targetId]);
      if (input.targetType === 'profile') await setSuspended(q, input.targetId, true);
      // The author learns what was removed and under which rule, and how to appeal (DSA art. 17).
      await enqueue(q, 'content.removed', t.owner, { targetType: input.targetType, targetId: input.targetId, rule: input.rule });
    }
    const reporters = await q.query(
      `update feture.report set state = 'resolved', resolution = $3, resolved_at = now()
       where target_type = $1 and target_id = $2 and state = 'open' returning reporter_profile_id`,
      [input.targetType, input.targetId, input.decision === 'remove' ? 'removed' : 'kept']);
    for (const r of reporters) await enqueue(q, 'report.resolved', r.reporter_profile_id, { targetType: input.targetType, resolution: input.decision === 'remove' ? 'removed' : 'kept' });
    await journal(q, account.id, 'report.' + input.decision, input.targetType, input.targetId, { rule: input.rule ?? null, reports: reporters.length, note: input.note ? true : false });
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
      await q.query(`update feture.post set disputed_at = null where id = $1`, [input.postId]);
      await enqueue(q, 'post.restored', t.owner, { postId: input.postId });
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
      const f = r.payload;
      // The approved version must still meet the publication rules: every file checked, nothing explicit in public.
      const media = f.mediaIds.length ? await q.query(
        `select state, explicitness from feture.media_asset where id = any($1) and owner_profile_id = $2`, [f.mediaIds, r.owner_profile_id]) : [];
      if (media.length !== f.mediaIds.length || media.some(m => m.state !== 'approved')) fail(409, 'conflict', { rule: 'media_not_ready' });
      if (['all', 'followers'].includes(f.audience) && media.some(m => m.explicitness !== 'safe')) fail(422, 'rule_violation', { rule: 'explicit_in_public' });
      const oldMedia = (await q.query(`select asset_id from feture.media_attachment where target_type = 'post' and target_id = $1`, [r.post_id])).map(x => x.asset_id);
      await applyEdit(q, r.post_id, { profileId: r.owner_profile_id, accountId: r.submitted_by }, f, oldMedia);
    }
    await q.query(`update feture.post_revision set state = $2, decided_at = now() where id = $1`, [r.id, input.decision === 'approve' ? 'approved' : 'rejected']);
    await enqueue(q, input.decision === 'approve' ? 'revision.approved' : 'revision.rejected', r.owner_profile_id, { postId: r.post_id, rule: input.rule ?? null });
    await journal(q, account.id, 'revision.' + input.decision, 'post', r.post_id, { revisionId: r.id, rule: input.rule ?? null });
    return { state: input.decision === 'approve' ? 'approved' : 'rejected' };
  },

  async 'staff.sanction'(q, { account, input }) {
    const roles = await requireStaff(q, account.id, ['owner', 'lead']);
    await targetOwner(q, account.id, 'profile', input.profileId);
    if (input.decision === 'lift' && !roles.some(r => r === 'owner' || r === 'lead')) fail(403, 'forbidden');
    await setSuspended(q, input.profileId, input.decision === 'suspend');
    await enqueue(q, input.decision === 'suspend' ? 'profile.suspended' : 'profile.restored', input.profileId, { rule: input.rule });
    await journal(q, account.id, 'sanction.' + input.decision, 'profile', input.profileId, { rule: input.rule });
    return { state: input.decision === 'suspend' ? 'suspended' : 'active' };
  },
};

/** @type {Record<string, Command>} */
export const moderation = Object.fromEntries(
  Object.entries(moderationCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
