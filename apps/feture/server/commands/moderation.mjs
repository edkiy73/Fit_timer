// @ts-check
import { moderationCommands } from '../../contracts/moderation.mjs';
import { fail, isUniqueViolation } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { journal, requireStaff } from './staff.mjs';
import { applyEdit, claimantTrust, settlePublication } from './posts.mjs';
import { DISPUTE_LIMITS } from '../../contracts/posts.mjs';
import { narrowCouple } from '../approvals.mjs';
import { closeAll } from './access.mjs';
import { settleAvatar } from './photos.mjs';

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
        : type === 'community' ? `select owner_profile_id owner, state from feture.community where id = $1 for update`
          : type === 'event' ? `select organizer_profile_id owner, state from feture.event where id = $1 for update`
            : type === 'conversation' ? `select profile_a owner, profile_b other, state from feture.conversation where id = $1 for update`
              : `select id owner, state from feture.profile where id = $1 for update`, [id]);
  if (!t) fail(404, 'not_found');
  const [{ own }] = await q.query(
    `select exists (select 1 from feture.profile_member where profile_id in ($1, $3) and account_id = $2) own`, [t.owner, staffAccount, t.other ?? t.owner]);
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
    await requireStaff(q, account, MODERATORS);
    const groups = await q.query(
      `select r.target_type, r.target_id, count(*)::int reports, min(r.created_at) first_at, max(r.created_at) last_at,
         array_agg(distinct r.reason) reasons, min(${PRIORITY.replace(/reason/g, 'r.reason')}) priority,
         array_remove(array_agg(nullif(r.details, '')), null) details,
         (array_agg(r.snapshot order by r.created_at) filter (where r.snapshot is not null))[1] snapshot,
         (array_agg(r.reporter_profile_id order by r.created_at))[1] first_reporter, r.reported_profile_id
       from feture.report r where r.state = 'open' group by r.target_type, r.target_id, r.reported_profile_id
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
            : g.target_type === 'community'
              ? `select owner_profile_id owner, name || ' — ' || left(description, 300) excerpt, state, 0 media from feture.community where id = $1`
              : g.target_type === 'event'
                ? `select organizer_profile_id owner, title || ' — ' || left(description, 300) excerpt, state, 0 media from feture.event where id = $1`
                // A chat: the side reported by the first reporter; the evidence is the copied messages.
                : g.target_type === 'conversation'
                  ? `select $2::uuid owner, '' excerpt, state, 0 media from feture.conversation where id = $1`
                  : `select p.id owner, coalesce(p.name, '') || ' @' || coalesce(p.handle, '') || ' — ' || left(coalesce(d.bio, ''), 300) excerpt, p.state, 0 media
               from feture.profile p left join feture.profile_details d on d.profile_id = p.id where p.id = $1`,
        g.target_type === 'conversation' ? [g.target_id, g.reported_profile_id] : [g.target_id]);
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
    await requireStaff(q, account, MODERATORS);
    const t = await targetOwner(q, account.id, input.targetType, input.targetId);
    // A decision answers open reports, once, on live content.
    const side = input.targetType === 'conversation' ? input.reportedProfileId ?? null : null;
    const [{ open }] = await q.query(`select count(*)::int open from feture.report where target_type = $1 and target_id = $2 and state = 'open' and ($3::uuid is null or reported_profile_id = $3)`,
      [input.targetType, input.targetId, side]);
    if (!open) fail(409, 'conflict', { rule: 'no_open_reports' });
    const live = input.targetType === 'post' ? ['published', 'review'] : input.targetType === 'reply' ? ['published']
      : input.targetType === 'community' ? ['published'] : input.targetType === 'event' ? ['published', 'cancelled'] : ['active'];
    if (input.decision === 'remove' && !live.includes(t.state)) fail(409, 'conflict', { state: t.state });
    if (input.decision === 'remove') {
      if (input.targetType === 'post') {
        await q.query(`update feture.post set state = 'removed', removed_reason = $2, updated_at = now() where id = $1`, [input.targetId, input.rule]);
        await settleAvatar(q, t.owner); // a profile photo taken from the post goes with it (restored on appeal)
      }
      if (input.targetType === 'reply') await q.query(`update feture.reply set state = 'removed' where id = $1`, [input.targetId]);
      if (input.targetType === 'community') await q.query(`update feture.community set state = 'hidden', reject_reason = $2, updated_at = now() where id = $1`, [input.targetId, input.rule]);
      if (input.targetType === 'event') {
        await q.query(`update feture.event set state = 'hidden', reject_reason = $2, rev = rev + 1, updated_at = now() where id = $1`, [input.targetId, input.rule]);
        await q.query(`update feture.event_application set state = 'closed', decided_at = now(), rev = rev + 1 where event_id = $1 and state = 'pending'`, [input.targetId]);
      }
      // The author learns what was removed and under which rule, and how to appeal (DSA art. 17).
      await enqueue(q, 'content.removed', t.owner, { targetType: input.targetType, targetId: input.targetId, rule: input.rule });
    }
    const reporters = await q.query(
      `update feture.report set state = 'resolved', resolution = $3, resolved_at = now()
       where target_type = $1 and target_id = $2 and state = 'open' and ($4::uuid is null or reported_profile_id = $4) returning reporter_profile_id`,
      [input.targetType, input.targetId, input.decision === 'remove' ? 'removed' : 'kept', side]);
    for (const r of reporters) await enqueue(q, 'report.resolved', r.reporter_profile_id, { targetType: input.targetType, resolution: input.decision === 'remove' ? 'removed' : 'kept' });
    await journal(q, account.id, 'report.' + input.decision, input.targetType, input.targetId, { from: t.state, rule: input.rule ?? null, reports: reporters.length, note: input.note });
    return { resolved: reporters.length, action: input.decision };
  },

  async 'staff.disputeQueue'(q, { account, input }) {
    await requireStaff(q, account, MODERATORS);
    // Posts with open «это я на фото» claims (owner decision 28.10.2026): claims that could not hide the post (it is
    // still visible) come first as urgent, then by age. Claimants are never named; staff see whether each was marked
    // on the photo, their trust level and strikes, a possible attack on the author and the author's explanation.
    const rows = await q.query(
      `select p.id, p.disputed_at, p.dispute_note note, left(coalesce(p.title || ': ', '') || p.body, 300) excerpt,
         (select count(*)::int from feture.media_attachment a where a.target_type = 'post' and a.target_id = p.id) media,
         min(d.created_at) opened_at, bool_or(d.hid) hid, bool_or(d.attack) attack, bool_or(d.tagged) tagged,
         json_agg(json_build_object('account', d.claimant_account, 'tagged', d.tagged, 'hid', d.hid, 'at', d.created_at) order by d.created_at) claims
       from feture.photo_dispute d join feture.post p on p.id = d.post_id
       where d.state = 'open' and p.state = 'published'
         and not exists (select 1 from feture.profile_member m where m.profile_id = p.owner_profile_id and m.account_id = $1)
       group by p.id
       order by (p.disputed_at is null and not bool_or(d.hid)) desc, min(d.created_at) limit $2`, [account.id, input.limit]);
    const items = [];
    for (const r of rows) {
      const claims = [];
      for (const c of typeof r.claims === 'string' ? JSON.parse(r.claims) : r.claims) {
        const tr = c.account ? await claimantTrust(q, c.account) : { level: 'unverified', strikes: 0 };
        claims.push({ tagged: c.tagged, hid: c.hid, at: c.at, trust: tr.level, strikes: tr.strikes });
      }
      const hidden = !!r.disputed_at || r.hid;
      items.push({ id: r.id, disputed_at: r.disputed_at, opened_at: r.opened_at, excerpt: r.excerpt, media: r.media, hidden, urgent: !hidden,
        attack: !!r.attack, tagged: !!r.tagged, note: r.note ?? null, claims });
    }
    // Accounts that reached the claim restriction wait for a staff look (S4: a person, so staff may see the handle).
    const flagged = await q.query(
      `select p.id "profileId", p.handle, a.dispute_strikes strikes, a.dispute_flagged_at "flaggedAt"
       from feture.account a join feture.profile p on p.id = a.person_profile_id
       where a.dispute_flagged_at is not null and (a.dispute_reviewed_at is null or a.dispute_reviewed_at < a.dispute_flagged_at) and a.id <> $1
       order by a.dispute_flagged_at limit 20`, [account.id]);
    return { items, flagged };
  },

  async 'staff.disputeDecide'(q, { account, input }) {
    await requireStaff(q, account, MODERATORS);
    const t = await targetOwner(q, account.id, 'post', input.postId);
    const [p] = await q.query('select disputed_at from feture.post where id = $1', [input.postId]);
    const claims = await q.query(`select id, claimant_profile_id, claimant_account, tagged from feture.photo_dispute where post_id = $1 and state = 'open' for update`, [input.postId]);
    if ((!p.disputed_at && !claims.length) || t.state !== 'published') fail(409, 'conflict');
    await q.query(`update feture.photo_dispute set state = $2, decided_at = now() where post_id = $1 and state = 'open'`, [input.postId, input.restore ? 'rejected' : 'confirmed']);
    if (input.restore) {
      // «Не подтвердилось»: the post is back at once, the author is told (if it was hidden), every claimant who was not
      // marked on the photo gets a strike. A marked person's own «no» stays: that mark is theirs to decide.
      await q.query(`update feture.post set disputed_at = null, disputed_by = null, dispute_note = null where id = $1`, [input.postId]);
      await settleAvatar(q, t.owner);
      if (p.disputed_at) await enqueue(q, 'post.restored', t.owner, { postId: input.postId });
      const struck = new Set();
      for (const c of claims) {
        if (c.claimant_profile_id) await enqueue(q, 'dispute.resolved', c.claimant_profile_id, { postId: input.postId, outcome: 'restored' });
        if (c.tagged || !c.claimant_account || struck.has(c.claimant_account)) continue;
        struck.add(c.claimant_account);
        const [s] = await q.query(
          `update feture.account set dispute_strikes = dispute_strikes + 1,
             dispute_flagged_at = case when dispute_strikes + 1 >= $2 and dispute_flagged_at is null then now() else dispute_flagged_at end
           where id = $1 returning dispute_strikes strikes, person_profile_id`, [c.claimant_account, DISPUTE_LIMITS.strikesRestricted]);
        if (s && s.strikes === DISPUTE_LIMITS.strikesRestricted) await journal(q, account.id, 'dispute.claimantRestricted', 'profile', s.person_profile_id, { strikes: s.strikes });
      }
    } else {
      await q.query(`update feture.post set state = 'removed', removed_reason = 'consent', updated_at = now() where id = $1`, [input.postId]);
      await settleAvatar(q, t.owner);
      await enqueue(q, 'content.removed', t.owner, { targetType: 'post', targetId: input.postId, rule: 'consent' });
      for (const c of claims) if (c.claimant_profile_id) await enqueue(q, 'dispute.resolved', c.claimant_profile_id, { postId: input.postId, outcome: 'removed' });
    }
    await journal(q, account.id, input.restore ? 'dispute.restore' : 'dispute.remove', 'post', input.postId, { from: t.state, claims: claims.length, note: input.note });
    return { state: input.restore ? 'published' : 'removed' };
  },

  async 'staff.disputeClaimantReviewed'(q, { account, input }) {
    await requireStaff(q, account, MODERATORS);
    await targetOwner(q, account.id, 'profile', input.profileId);
    const rows = await q.query(
      `update feture.account set dispute_reviewed_at = now() where person_profile_id = $1 and dispute_flagged_at is not null returning id`, [input.profileId]);
    if (!rows[0]) fail(404, 'not_found');
    await journal(q, account.id, 'dispute.claimantReviewed', 'profile', input.profileId, {});
    return { reviewed: true };
  },

  async 'staff.revisionQueue'(q, { account, input }) {
    await requireStaff(q, account, MODERATORS);
    const items = await q.query(
      `select r.id, r.post_id, r.created_at, r.payload, left(coalesce(p.title || ': ', '') || p.body, 300) live
       from feture.post_revision r join feture.post p on p.id = r.post_id
       where r.state = 'review' and not exists (select 1 from feture.profile_member m where m.profile_id = p.owner_profile_id and m.account_id = $1)
       order by r.created_at limit $2`, [account.id, input.limit]);
    return { items: items.map(r => ({ id: r.id, postId: r.post_id, createdAt: r.created_at, live: r.live, proposed: r.payload })) };
  },

  async 'staff.revisionDecide'(q, { account, input }) {
    await requireStaff(q, account, MODERATORS);
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
    // A suspension (ban) is a dangerous action: a code from the last 10 minutes (staff.mjs FRESH_WINDOW).
    const roles = await requireStaff(q, account, ['owner', 'lead'], { fresh: input.decision === 'suspend' });
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

  async 'staff.restrict'(q, { account, input }) {
    // Restriction (S4 §4): out of Discover and search, no new likes, access requests, messages or links; the access
    // it was given is revoked. Lighter than a suspension, so moderators may apply it.
    const roles = await requireStaff(q, account, MODERATORS);
    await targetOwner(q, account.id, 'profile', input.profileId);
    await checkRank(q, roles, input.profileId);
    if (input.on && input.rule === 'appeal_granted') fail(400, 'invalid_input', { fields: ['rule'] });
    if (!input.on) {
      // Restrictions for minors or illegal content are lifted by leads only.
      const [{ rule }] = await q.query(`select coalesce(restriction_rule, '') rule from feture.profile where id = $1`, [input.profileId]);
      if (OWNER_ONLY_LIFT.has(rule) && !roles.some(r => r === 'owner' || r === 'lead')) fail(403, 'forbidden');
    }
    const rows = await q.query(
      `update feture.profile set restricted_at = $2, restriction_rule = $3, updated_at = now() where id = $1 and (restricted_at is null) = $4 returning id`,
      [input.profileId, input.on ? new Date() : null, input.on ? input.rule : null, input.on]);
    if (!rows[0]) fail(409, 'conflict', { rule: input.on ? 'already_restricted' : 'not_restricted' });
    if (input.on) {
      // The person and the couples they act as.
      const sides = `select $1::uuid union select m.profile_id from feture.profile_member m join feture.account a on a.id = m.account_id
                     where a.person_profile_id = $1 and m.state = 'active'`;
      await q.query(`update feture.access_grant set revoked_at = now() where viewer_profile_id in (${sides}) and revoked_at is null`, [input.profileId]);
      await q.query(`update feture.access_request set state = 'closed', closed_reason = 'revoked', decided_at = now() where requester_profile_id in (${sides}) and state = 'pending'`, [input.profileId]);
    }
    await enqueue(q, input.on ? 'profile.restricted' : 'profile.unrestricted', input.profileId, { rule: input.rule });
    await journal(q, account.id, input.on ? 'restrict.on' : 'restrict.off', 'profile', input.profileId, { rule: input.rule, note: input.note });
    return { restricted: input.on };
  },

  async 'staff.placeQueue'(q, { account, input }) {
    await requireStaff(q, account, [...MODERATORS, 'verifier']);
    const items = await q.query(
      `select pl.id, pl.country, pl.name_ru, pl.name_en, pl.created_at,
         (select count(*)::int from feture.profile_details d where d.city_id = pl.id) used
       from feture.place pl where pl.state = 'pending' order by pl.created_at limit $1`, [input.limit]);
    return { items };
  },

  async 'staff.placeDecide'(q, { account, input }) {
    await requireStaff(q, account, [...MODERATORS, 'verifier']);
    const rows = await q.query(
      `update feture.place set state = $2, name_ru = coalesce($3, name_ru), name_en = coalesce($4, name_en) where id = $1 and state = 'pending' returning id`,
      [input.placeId, input.decision === 'approve' ? 'approved' : 'rejected', input.nameRu ?? null, input.nameEn ?? null]);
    if (!rows[0]) fail(409, 'conflict');
    await journal(q, account.id, 'place.' + input.decision, 'place', input.placeId, {});
    return { decision: input.decision };
  },

  async 'appeal.create'(q, { acting: a, input }) {
    // The author appeals a removal (or a restriction of their profile); a lead who did not decide it looks again.
    if (!a) throw new Error('acting profile missing');
    const own = {
      post: `select owner_profile_id o, state = 'removed' hit from feture.post where id = $1`,
      reply: `select author_profile_id o, state = 'removed' hit from feture.reply where id = $1`,
      community: `select owner_profile_id o, state = 'hidden' hit from feture.community where id = $1`,
      event: `select organizer_profile_id o, state = 'hidden' hit from feture.event where id = $1`,
      profile: `select id o, restricted_at is not null hit from feture.profile where id = $1`,
    }[/** @type {'post'} */ (input.targetType)];
    const [t] = await q.query(own, [input.targetId]);
    if (!t || t.o !== a.profileId) fail(404, 'not_found');
    if (!t.hit) fail(409, 'conflict', { rule: 'nothing_to_appeal' });
    // Only a staff decision is appealed here (a host's removal in a community is the community's own matter).
    const [d] = await q.query(
      `select id from feture.staff_action where target_type = $1 and target_id = $2 and action = any($3) order by created_at desc limit 1`,
      [input.targetType, input.targetId, APPEALABLE[/** @type {keyof typeof APPEALABLE} */ (input.targetType)]]);
    if (!d) fail(409, 'conflict', { rule: 'nothing_to_appeal' });
    try {
      const [r] = await q.query(`insert into feture.appeal (account_id, profile_id, target_type, target_id, body, staff_action_id) values ($1, $2, $3, $4, $5, $6) returning id`,
        [a.accountId, a.profileId, input.targetType, input.targetId, input.body, d.id]);
      await enqueue(q, 'moderation.appeal', a.profileId, { appealId: r.id });
      return { id: r.id, state: 'open' };
    } catch (error) {
      if (isUniqueViolation(error)) fail(409, 'conflict', { rule: 'appeal_open' });
      throw error;
    }
  },

  async 'staff.appealQueue'(q, { account, input }) {
    await requireStaff(q, account, ['owner', 'lead']);
    const items = await q.query(
      `select ap.id, ap.target_type, ap.target_id, ap.body, ap.created_at, p.handle,
         (select json_build_object('action', s.action, 'detail', s.detail, 'at', s.created_at, 'mine', s.staff_account_id = $1) from feture.staff_action s
          where s.id = ap.staff_action_id) decision
       from feture.appeal ap join feture.profile p on p.id = ap.profile_id
       where ap.state = 'open' and not exists (select 1 from feture.profile_member m where m.profile_id = ap.profile_id and m.account_id = $1)
       order by ap.created_at limit $2`, [account.id, input.limit]);
    return { items };
  },

  async 'staff.appealDecide'(q, { account, input }) {
    await requireStaff(q, account, ['owner', 'lead']);
    const [ap] = await q.query('select * from feture.appeal where id = $1 for update', [input.appealId]);
    if (!ap) fail(404, 'not_found');
    if (ap.state !== 'open') fail(409, 'conflict', { state: ap.state });
    const [{ own }] = await q.query(`select exists (select 1 from feture.profile_member where profile_id = $1 and account_id = $2) own`, [ap.profile_id, account.id]);
    if (own) fail(403, 'forbidden');
    // Another person looks again: whoever made the decision under appeal may not decide the appeal.
    const [decision] = await q.query(`select staff_account_id, detail from feture.staff_action where id = $1`, [ap.staff_action_id]);
    if (decision.staff_account_id === account.id) fail(403, 'forbidden', { rule: 'same_staff' });
    let restored = false;
    if (input.grant) restored = await restoreTarget(q, ap.target_type, ap.target_id, decision.detail?.from ?? null);
    await q.query(`update feture.appeal set state = $2, decided_by = $3, note = nullif($4, ''), decided_at = now() where id = $1`,
      [ap.id, input.grant ? 'granted' : 'denied', account.id, input.note]);
    await enqueue(q, 'appeal.decided', ap.profile_id, { appealId: ap.id, state: input.grant ? 'granted' : 'denied', targetType: ap.target_type, targetId: ap.target_id });
    await journal(q, account.id, input.grant ? 'appeal.grant' : 'appeal.deny', ap.target_type, ap.target_id, { appealId: ap.id, note: input.note });
    return { state: input.grant ? 'granted' : 'denied', restored };
  },
};

/** Staff decisions that may be appealed, per target. */
const APPEALABLE = {
  post: ['report.remove', 'dispute.remove'], reply: ['report.remove'], community: ['report.remove'], event: ['report.remove', 'event.hide'], profile: ['restrict.on'],
};

/** Puts the target back where it was before the decision (never simply «published»): a post that was still being
 * checked goes through its checks again; a cancelled event stays cancelled.
 * @param {Q} q @param {string} type @param {string} id @param {string | null} from @returns {Promise<boolean>} */
async function restoreTarget(q, type, id, from) {
  if (type === 'post') {
    if (from === 'review') {
      const rows = await q.query(`update feture.post set state = 'review', removed_reason = null, updated_at = now() where id = $1 and state = 'removed' returning id`, [id]);
      if (rows[0]) await settlePublication(q, id);
      return rows.length > 0;
    }
    const rows = await q.query(`update feture.post set state = 'published', removed_reason = null, updated_at = now() where id = $1 and state = 'removed' returning owner_profile_id`, [id]);
    if (rows[0]) await settleAvatar(q, rows[0].owner_profile_id); // its profile photo comes back with it
    return rows.length > 0;
  }
  if (type === 'reply') return (await q.query(`update feture.reply set state = 'published' where id = $1 and state = 'removed' and body <> '' returning id`, [id])).length > 0;
  if (type === 'community') return (await q.query(`update feture.community set state = 'published', reject_reason = null, updated_at = now() where id = $1 and state = 'hidden' returning id`, [id])).length > 0;
  if (type === 'event') {
    const back = from === 'cancelled' ? 'cancelled' : 'published';
    return (await q.query(`update feture.event set state = $2, reject_reason = null, rev = rev + 1, updated_at = now() where id = $1 and state = 'hidden' returning id`, [id, back])).length > 0;
  }
  return (await q.query(`update feture.profile set restricted_at = null, restriction_rule = null, updated_at = now() where id = $1 and restricted_at is not null returning id`, [id])).length > 0;
}

/** @type {Record<string, Command>} */
export const moderation = Object.fromEntries(
  Object.entries(moderationCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
