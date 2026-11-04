// @ts-check
import { enqueue } from './outbox.mjs';

/** @typedef {import('./db.mjs').Q} Q */

/** Closes the open reports on targets with one outcome and tells each reporter once («Жалоба рассмотрена»): `removed`
 * (the violation was confirmed), `kept` (none found) or `unavailable` (the material is gone — a closed community, a
 * deleted account or couple — so nobody can decide on it; audit 04.11.2026 item 22). Never names the reporter to the
 * author or the other way round. `side`: for a chat, only the reports about that side.
 * @param {Q} q @param {string} targetType @param {string[]} targetIds @param {'removed' | 'kept' | 'unavailable'} resolution
 * @param {string | null} [side] @returns {Promise<number>} how many reports were closed */
export async function closeReports(q, targetType, targetIds, resolution, side = null) {
  if (!targetIds.length) return 0;
  const reporters = await q.query(
    `update feture.report set state = 'resolved', resolution = $3, resolved_at = now()
     where target_type = $1 and target_id = any($2::uuid[]) and state = 'open' and ($4::uuid is null or reported_profile_id = $4)
     returning reporter_profile_id`,
    [targetType, targetIds, resolution, side]);
  // An automatic report (the word filter) has no reporter to tell.
  for (const r of reporters) if (r.reporter_profile_id) await enqueue(q, 'report.resolved', r.reporter_profile_id, { targetType, resolution });
  return reporters.length;
}

/** Closes the open «это я на фото» disputes on posts that are gone (removed by staff or a host, deleted or archived by
 * the author, with a deleted account or couple): no strikes for anyone, and each claimant hears once that the post is
 * gone (`dispute.resolved`, outcome `gone`; audit item 25). @param {Q} q @param {string[]} postIds */
export async function closeDisputes(q, postIds) {
  if (!postIds.length) return;
  const claims = await q.query(
    `update feture.photo_dispute set state = 'closed', decided_at = now() where post_id = any($1::uuid[]) and state = 'open'
     returning post_id, claimant_profile_id`, [postIds]);
  for (const c of claims) if (c.claimant_profile_id) await enqueue(q, 'dispute.resolved', c.claimant_profile_id, { postId: c.post_id, outcome: 'gone' });
}

/** Closes open appeals of profiles that are gone (a deleted account or couple): no decision, nothing to tell (audit
 * item 24). For the decision card an appeal that closed this way reads as none. @param {Q} q @param {string[]} profileIds */
export async function closeAppeals(q, profileIds) {
  if (!profileIds.length) return;
  await q.query(`update feture.appeal set state = 'closed', decided_at = now() where profile_id = any($1::uuid[]) and state = 'open'`, [profileIds]);
}

/** Closes the open appeal on one target its author changed or withdrew meanwhile (a rejected event edited or taken back
 * to drafts): the decision under appeal no longer stands for what is there now (audit item 38).
 * @param {Q} q @param {string} targetType @param {string} targetId */
export async function closeAppealOn(q, targetType, targetId) {
  await q.query(`update feture.appeal set state = 'closed', decided_at = now() where target_type = $1 and target_id = $2 and state = 'open'`, [targetType, targetId]);
}
