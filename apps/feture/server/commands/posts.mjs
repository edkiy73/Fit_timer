// @ts-check
import { ACTIVITY_KINDS, DISPUTE_LIMITS, postFields, postsCommands } from '../../contracts/posts.mjs';
import { likePattern, writeCursor } from '../search.mjs';
import { acceptsMention, popularScore } from '../sql-rules.mjs';
import { fail, isUniqueViolation } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { needsPartner, registerApprovalKind, requestApproval } from '../approvals.mjs';
import { avatarSrc, mediaDto } from '../media/assets.mjs';
import { blockProfile } from './social.mjs';
import { canWrite, coverOf } from './communities.mjs';
import { PREMIUM_SQL, withFaces } from './faces.mjs';
import { hasPhotoCheck } from './verification.mjs';
import { dropHiddenPostPhotos, settleAvatar } from './photos.mjs';

/** Slice B: posts and what hangs on them (S1 §8, extract/feed-content.md).
 * Rules: text without media publishes at once (Q1); media waits until every file is checked; explicit media only in
 * posts for «По доступу» or «Только я» (Q2); a major edit of a post with media goes to review while the old version
 * stays live; couple posts need the partner's approval when the partner asked for it. Visibility is one SQL rule:
 * feture.post_visible (audience, blocks both ways, photo marks, disputes, author state).
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q
 * @typedef {import('../profiles.mjs').Acting} Acting
 */

const AUD = ['only', 'granted', 'followers', 'all'];
const PUBLIC_AUD = new Set(['all', 'followers']);
/** How many things one activity card carries (V21 actCard: the strip scrolls through them; the rest is «ещё N» from
 * `count`). */
const ACT_ITEMS = 20;

const MENTION = /@([A-Za-z0-9_.]{3,20})/g;

/** @param {Acting | null} acting @returns {Acting} */
const need = acting => { if (!acting) throw new Error('acting profile missing'); return acting; };

/** Discussions: the community must be published and the acting profile allowed to write there (members who are not
 * read-only; a couple when it or both partners are members). @param {Q} q @param {string | null | undefined} communityId @param {Acting} acting */
async function requireCommunityWriter(q, communityId, acting) {
  if (!communityId) return;
  const [c] = await q.query(`select state from feture.community where id = $1`, [communityId]);
  if (!c || c.state !== 'published' || !(await canWrite(q, communityId, acting))) fail(403, 'forbidden', { rule: 'community_members_only' });
}

/** @param {Q} q @param {string} postId @param {Acting} viewer @returns {Promise<any>} */
async function visiblePost(q, postId, viewer) {
  const [p] = await q.query(
    `select p.*, exists (select 1 from feture.profile_member m where m.profile_id = p.owner_profile_id and m.account_id = $3 and m.state = 'active') own
     from feture.post p where p.id = $1 and feture.post_visible(p, $2, $3)`, [postId, viewer.profileId, viewer.accountId]);
  if (!p) fail(404, 'not_found');
  return p;
}

/** How far a claimant of «это я на фото» is trusted (owner decision 28.10.2026, `DISPUTE_LIMITS`): the person
 * profile's photo verified against a selfie, the account old enough and no confirmed false claims. Per account: a
 * couple's partners are judged each on their own. `level` is what staff see: the first rule that fails.
 * @param {Q} q @param {string} accountId */
export async function claimantTrust(q, accountId) {
  const pv = await hasPhotoCheck(q);
  const [a] = await q.query(
    `select a.dispute_strikes strikes, ${pv ? 'coalesce(feture.photo_verified(a.person_profile_id), false)' : 'false'} verified,
            a.created_at <= now() - $2::interval old, a.created_at > now() - $3::interval young
     from feture.account a where a.id = $1`, [accountId, DISPUTE_LIMITS.trustedAccountAge, DISPUTE_LIMITS.attackYoungAge]);
  if (!a) return { trusted: false, young: true, strikes: 0, level: 'unverified' };
  const strikes = Number(a.strikes);
  const level = strikes >= DISPUTE_LIMITS.strikesRestricted ? 'restricted' : strikes > DISPUTE_LIMITS.trustMaxStrikes ? 'struck'
    : !a.verified ? 'unverified' : !a.old ? 'new' : 'trusted';
  return { trusted: level === 'trusted', young: a.young, strikes, level };
}

/** Words added between two texts (bag of words), for the major-edit rule. @param {string} a @param {string} b */
function addedWords(a, b) {
  const words = (/** @type {string} */ s) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const before = new Map();
  for (const w of words(a)) before.set(w, (before.get(w) ?? 0) + 1);
  let added = 0;
  for (const w of words(b)) { const n = before.get(w) ?? 0; if (n > 0) before.set(w, n - 1); else added++; }
  return { added, total: words(a).length };
}

/** Writes topics, media, poll, interests snapshot and photo marks for a post owned by `acting`.
 * @param {Q} q @param {string} postId @param {any} f @param {{profileId: string, accountId: string}} acting @param {{keepVotes?: boolean}} [opts] */
async function writeParts(q, postId, f, acting, { keepVotes = false } = {}) {
  if (f.topics.length) {
    const [{ n }] = await q.query('select count(*)::int n from feture.topic where id = any($1) and not hidden', [f.topics]);
    if (n !== f.topics.length) fail(400, 'invalid_input', { fields: ['topics'] });
  }
  if (f.mediaIds.length) {
    const rows = await q.query(
      `select id from feture.media_asset where id = any($1) and owner_profile_id = $2 and purpose in ('post', 'gallery')
         and state in ('uploaded', 'scanning', 'needs_review', 'approved')`, [f.mediaIds, acting.profileId]);
    if (rows.length !== f.mediaIds.length) fail(400, 'invalid_input', { fields: ['mediaIds'] });
  }
  await q.query(`delete from feture.media_attachment where target_type = 'post' and target_id = $1`, [postId]);
  for (const [i, assetId] of f.mediaIds.entries()) {
    await q.query(`insert into feture.media_attachment (asset_id, target_type, target_id, position) values ($1, 'post', $2, $3)`, [assetId, postId, i]);
  }
  const [oldPoll] = await q.query('select question, options from feture.poll where post_id = $1', [postId]);
  const samePoll = oldPoll && f.poll && oldPoll.question === f.poll.question && JSON.stringify(oldPoll.options) === JSON.stringify(f.poll.options);
  if (!samePoll || !keepVotes) {
    // A changed poll starts over: old votes were for other options.
    await q.query('delete from feture.poll where post_id = $1', [postId]);
    if (f.poll) await q.query('insert into feture.poll (post_id, question, options) values ($1, $2, $3)', [postId, f.poll.question, f.poll.options]);
  }
  // Interests on a post are a snapshot of the author's own public interests (never hidden, limits or private ones).
  let interests = [];
  if (f.interests.length) {
    interests = await q.query(
      `select i.topic_id "topicId", i.value, i.dir from feture.interest i join feture.topic t on t.id = i.topic_id
       where i.profile_id = $1 and i.topic_id = any($2) and i.vis = 'public' and i.value is not null and not t.hidden and t.category_id <> 'limits'`,
      [acting.profileId, f.interests]);
    if (interests.length !== f.interests.length) fail(422, 'rule_violation', { rule: 'interests_unavailable' });
  }
  if (f.albumId) {
    const [al] = await q.query('select vis from feture.album where id = $1 and owner_profile_id = $2', [f.albumId, acting.profileId]);
    // Albums are the gallery's: own album, posts for everyone or followers, never a community discussion (V21 ME-044).
    if (!al || f.audience === 'granted' || f.audience === 'only' || f.communityId) fail(400, 'invalid_input', { fields: ['albumId'] });
    if (al.vis === 'followers' && f.audience === 'all') f.audience = 'followers'; // a followers-only album narrows its posts
  }
  await q.query('update feture.post set interests = $2, audience = $3 where id = $1', [postId, JSON.stringify(interests), f.audience]);
  // Photo marks: people only, not the author's own members, not blocked either way. Changed media re-ask everyone.
  const [old] = await q.query(`select array_agg(profile_id) ids from feture.photo_tag where post_id = $1`, [postId]);
  const oldIds = new Set(old?.ids ?? []);
  // Marking people works on posts everyone can see: a marked person must see what they are asked to agree to.
  if (f.tags.length && f.audience !== 'all') fail(400, 'invalid_input', { fields: ['tags'] });
  if (f.tags.length) {
    const ok = await q.query(
      `select p.id from feture.profile p where p.id = any($1) and p.kind = 'person' and p.state = 'active'
         and not exists (select 1 from feture.profile_member m join feture.profile_member mine on mine.account_id = m.account_id
                         where m.profile_id = p.id and mine.profile_id = $2)
         and not feture.blocked($2, p.id)`, [f.tags, acting.profileId]);
    if (ok.length !== f.tags.length) fail(400, 'invalid_input', { fields: ['tags'] });
  }
  await q.query(`delete from feture.photo_tag where post_id = $1 and not (profile_id = any($2))`, [postId, f.tags]);
  for (const t of f.tags) if (!oldIds.has(t)) await q.query(`insert into feture.photo_tag (post_id, profile_id) values ($1, $2)`, [postId, t]);
}

/** Mentions in a text: persons only, allowed by their «Кто может упоминать», not blocked. Others stay plain text.
 * @param {Q} q @param {'post' | 'reply'} sourceType @param {string} sourceId @param {string} text @param {string} authorProfileId */
async function writeMentions(q, sourceType, sourceId, text, authorProfileId) {
  const handles = [...new Set([...text.matchAll(MENTION)].map(m => m[1].toLowerCase()))].slice(0, 20);
  await q.query(`delete from feture.mention where source_type = $1 and source_id = $2 and not notified`, [sourceType, sourceId]);
  if (!handles.length) return [];
  const rows = await q.query(
    `select p.id from feture.profile p where lower(p.handle) = any($1) and ${acceptsMention('p', '$2')}`,
    [handles, authorProfileId]);
  for (const r of rows) {
    await q.query(`insert into feture.mention (source_type, source_id, profile_id) values ($1, $2, $3) on conflict do nothing`, [sourceType, sourceId, r.id]);
  }
  return rows.map(r => r.id);
}

/** Notifies people once a post is out: mentions and photo-mark requests (only after media are checked, Q11).
 * @param {Q} q @param {string} postId */
async function announce(q, postId) {
  const [p] = await q.query('select owner_profile_id, type from feture.post where id = $1', [postId]);
  // Only people who can see the post hear about it (no hint of a post they may not read).
  const mentions = await q.query(
    `update feture.mention m set notified = true from feture.post p
     where m.source_type = 'post' and m.source_id = $1 and p.id = m.source_id and not m.notified and not m.removed
       and feture.post_visible(p, m.profile_id, (select a.id from feture.account a where a.person_profile_id = m.profile_id))
     returning m.profile_id`, [postId]);
  for (const m of mentions) await enqueue(q, 'mention.created', m.profile_id, { postId, from: p.owner_profile_id });
  const tags = await q.query(`update feture.photo_tag set asked_at = now() where post_id = $1 and state = 'pending' and asked_at is null returning profile_id`, [postId]);
  for (const t of tags) await enqueue(q, 'tag.requested', t.profile_id, { postId, from: p.owner_profile_id });
}

/** Publishes now or puts the post on review until its media are checked. Shared by the direct path, the couple
 * approval and the media.approved job. @param {Q} q @param {string} postId */
export async function settlePublication(q, postId) {
  const [p] = await q.query('select id, audience, state from feture.post where id = $1 for update', [postId]);
  if (!p || !['draft', 'review'].includes(p.state)) return p?.state ?? 'missing';
  const media = await q.query(
    `select m.state, m.explicitness from feture.media_attachment a join feture.media_asset m on m.id = a.asset_id
     where a.target_type = 'post' and a.target_id = $1`, [postId]);
  if (media.some(m => ['rejected', 'blocked', 'removed'].includes(m.state))) {
    await q.query(`update feture.post set state = 'draft', removed_reason = 'media_rejected' where id = $1`, [postId]);
    await enqueue(q, 'post.returned', null, { postId, reason: 'media_rejected' });
    return 'draft';
  }
  if (media.some(m => m.state !== 'approved')) {
    await q.query(`update feture.post set state = 'review' where id = $1`, [postId]);
    return 'review';
  }
  // Explicit media never go to public places (Q2): such a post goes back to its author.
  if (PUBLIC_AUD.has(p.audience) && media.some(m => m.explicitness !== 'safe')) {
    await q.query(`update feture.post set state = 'draft', removed_reason = 'explicit_in_public' where id = $1`, [postId]);
    await enqueue(q, 'post.returned', null, { postId, reason: 'explicit_in_public' });
    return 'draft';
  }
  await q.query(`update feture.post set state = 'published', published_at = coalesce(published_at, now()), removed_reason = null where id = $1`, [postId]);
  await announce(q, postId);
  return 'published';
}

/** @param {Q} q @param {string} postId @param {string} ownerProfileId */
async function doPublish(q, postId, ownerProfileId) {
  const [p] = await q.query('select state from feture.post where id = $1 and owner_profile_id = $2 for update', [postId, ownerProfileId]);
  if (!p) fail(404, 'not_found');
  if (p.state !== 'draft') fail(409, 'conflict', { state: p.state });
  return { state: await settlePublication(q, postId) };
}

/** Minor edits apply at once; a major edit of a post with media (new media, wider audience, many new words) goes to
 * review while the live version stays visible (V21 editNeedsReview). @param {Q} q @param {string} postId
 * @param {{profileId: string, accountId: string}} actor @param {number} rev @param {any} f */
export async function doEdit(q, postId, actor, rev, f) {
  const [p] = await q.query('select * from feture.post where id = $1 and owner_profile_id = $2 for update', [postId, actor.profileId]);
  if (!p) fail(404, 'not_found');
  if (p.state === 'draft' && p.created_by !== actor.accountId) fail(404, 'not_found'); // a couple's draft is its writer's alone
  if (p.rev !== rev) fail(409, 'conflict', { rev: p.rev });
  if (p.state === 'draft') {
    await q.query(`update feture.post set type = $2, title = $3, body = $4, in_feed = $5, topics = $6, album_id = $7, rev = rev + 1, updated_at = now() where id = $1`,
      [postId, f.type, f.title ?? null, f.body, f.inFeed, f.topics, f.albumId ?? null]);
    await writeParts(q, postId, f, actor);
    await writeMentions(q, 'post', postId, f.body, actor.profileId);
    return { state: 'draft', rev: p.rev + 1 };
  }
  if (!['published', 'review'].includes(p.state)) fail(409, 'conflict', { state: p.state });
  const oldMedia = (await q.query(`select asset_id from feture.media_attachment where target_type = 'post' and target_id = $1`, [postId])).map(r => r.asset_id);
  const hasMedia = oldMedia.length > 0 || f.mediaIds.length > 0;
  const words = addedWords(`${p.title ?? ''} ${p.body}`, `${f.title ?? ''} ${f.body}`);
  const major = hasMedia && (f.mediaIds.some((/** @type {string} */ m) => !oldMedia.includes(m))
    || AUD.indexOf(f.audience) > AUD.indexOf(p.audience) || words.added > Math.max(12, Math.ceil(words.total * 0.3)));
  if (major) {
    await q.query(`update feture.post_revision set state = 'superseded', decided_at = now() where post_id = $1 and state = 'review'`, [postId]);
    const [r] = await q.query(`insert into feture.post_revision (post_id, payload, submitted_by, base_rev) values ($1, $2, $3, $4) returning id`,
      [postId, JSON.stringify(f), actor.accountId, p.rev]);
    await enqueue(q, 'moderation.postRevision', actor.profileId, { postId, revisionId: r.id });
    return { state: p.state, revision: r.id, review: true };
  }
  // A minor edit after a major one replaces it: staff review only the latest wish of the author.
  await q.query(`update feture.post_revision set state = 'superseded', decided_at = now() where post_id = $1 and state = 'review'`, [postId]);
  return applyEdit(q, postId, actor, f, oldMedia);
}

/** Writes an edit over a live post (minor edits, and major ones once staff approved the revision).
 * @param {Q} q @param {string} postId @param {{profileId: string, accountId: string}} actor @param {any} f @param {string[]} oldMedia */
export async function applyEdit(q, postId, actor, f, oldMedia) {
  // Reordering the same photos is not a change of photos (no re-asking marked people).
  const mediaChanged = JSON.stringify([...oldMedia].sort()) !== JSON.stringify([...f.mediaIds].sort());
  const [p] = await q.query(
    `update feture.post set type = $2, title = $3, body = $4, in_feed = $5, topics = $6, album_id = $7, rev = rev + 1, edited_at = now(), updated_at = now()
     where id = $1 returning state, rev`, [postId, f.type, f.title ?? null, f.body, f.inFeed, f.topics, f.albumId ?? null]);
  if (mediaChanged) await q.query(`update feture.photo_tag set state = 'pending', asked_at = null, decided_at = null where post_id = $1`, [postId]);
  // A dispute («это я на фото») is lifted only by staff (S4), never by an edit.
  await writeParts(q, postId, f, actor, { keepVotes: true });
  await writeMentions(q, 'post', postId, f.body, actor.profileId);
  await announce(q, postId);
  await dropHiddenPostPhotos(q, actor.profileId); // a narrowed post takes its photos off the profile
  return { state: p.state, rev: p.rev };
}

/** Owner rule, 28.10.2026: a change of who sees a post never lets an unreviewed version out. Paths that change a post
 * outside doEdit (moving it into an album, narrowing it to followers) bump its rev; an open revision (a wider audience
 * or new photos waiting for staff) is then carried over to the new version instead of turning stale — it stays in the
 * review queue, follows the post's album, and is narrowed with it when the album is for followers. Nothing becomes
 * visible here: the live post keeps its own (narrower) audience until staff approve. @param {Q} q @param {string[]} postIds */
export async function rebaseRevisions(q, postIds) {
  if (!postIds.length) return;
  await q.query(
    `update feture.post_revision r set base_rev = p.rev,
       payload = (case when p.album_id is null then r.payload - 'albumId' else jsonb_set(r.payload, '{albumId}', to_jsonb(p.album_id::text)) end)
         || (case when al.vis = 'followers' and r.payload->>'audience' = 'all' then '{"audience": "followers"}'::jsonb else '{}'::jsonb end)
     from feture.post p left join feture.album al on al.id = p.album_id
     where r.post_id = p.id and p.id = any($1::uuid[]) and r.state = 'review'`, [postIds]);
}

/** A live post as the editor's fields (postFields), to change one thing through the usual edit path.
 * @param {Q} q @param {string} postId */
export async function postFieldsOf(q, postId) {
  const [p] = await q.query('select type, title, body, audience, in_feed, topics, interests, album_id, community_id from feture.post where id = $1', [postId]);
  const mediaIds = (await q.query(`select asset_id from feture.media_attachment where target_type = 'post' and target_id = $1 order by position`, [postId])).map(r => r.asset_id);
  const [poll] = await q.query('select question, options from feture.poll where post_id = $1', [postId]);
  const tags = (await q.query('select profile_id from feture.photo_tag where post_id = $1 order by profile_id', [postId])).map(r => r.profile_id);
  return {
    type: p.type, ...(p.title ? { title: p.title } : {}), body: p.body, audience: p.audience, inFeed: p.in_feed, topics: p.topics, mediaIds,
    ...(poll ? { poll: { question: poll.question, options: poll.options } } : {}),
    interests: p.interests.map((/** @type {any} */ i) => i.topicId), ...(p.album_id ? { albumId: p.album_id } : {}), tags,
    ...(p.community_id ? { communityId: p.community_id } : {}),
  };
}

/** Deletes an own post (post.delete and the gallery selection): a couple's post, a removed one or one under open
 * reports is archived instead. @param {Q} q @param {Acting} acting @param {string} postId */
export async function deletePost(q, acting, postId) {
  const [p] = await q.query(`select state from feture.post where id = $1 and owner_profile_id = $2 for update`, [postId, acting.profileId]);
  if (!p) fail(404, 'not_found');
  await q.query(`update feture.partner_approval set state = 'cancelled', decided_at = now() where target_type = 'post' and target_id = $1 and state = 'pending'`, [postId]);
  // A post removed by moderation or under open reports is only hidden, so the evidence stays for staff (S4 §3).
  const [{ reported }] = await q.query(`select exists (select 1 from feture.report where target_type = 'post' and target_id = $1 and state = 'open') reported`, [postId]);
  if (acting.kind === 'couple' || p.state === 'removed' || reported) {
    // A couple's post is hidden into the couple's archive, not destroyed by one partner (V21 «Скрыть совместную»).
    await q.query(`update feture.post set state = 'archived', updated_at = now() where id = $1`, [postId]);
    return 'archived';
  }
  await q.query(`delete from feture.media_attachment where target_type = 'post' and target_id = $1`, [postId]);
  await q.query(`delete from feture.reaction where target_type = 'reply' and target_id in (select id from feture.reply where post_id = $1)`, [postId]);
  await q.query(`delete from feture.reaction where target_type = 'post' and target_id = $1`, [postId]);
  await q.query(`delete from feture.post where id = $1`, [postId]);
  return 'deleted';
}

registerApprovalKind('post.publish', {
  apply: async (q, row) => {
    // The partner approved exactly this version: if the draft changed since, nothing is published.
    const [p] = await q.query('select rev from feture.post where id = $1', [row.target_id]);
    if (!p || p.rev !== /** @type {any} */ (row.change).rev) fail(409, 'conflict', { rule: 'changed_since_approval' });
    // Still allowed to write in the community at the moment of publication.
    const [d] = await q.query('select p.community_id, o.kind from feture.post p join feture.profile o on o.id = p.owner_profile_id where p.id = $1', [row.target_id]);
    await requireCommunityWriter(q, d.community_id, /** @type {Acting} */ ({ profileId: row.profile_id, accountId: row.requested_by, kind: d.kind }));
    await doPublish(q, String(row.target_id), row.profile_id);
  },
  // The draft as it is now; `changed` when it was edited after the request (approving would then fail).
  preview: async (q, row) => {
    const [p] = await q.query(
      `select p.type, p.title, left(p.body, 300) body, p.audience, p.rev,
         (select count(*)::int from feture.media_attachment ma where ma.target_type = 'post' and ma.target_id = p.id) media
       from feture.post p where p.id = $1 and p.owner_profile_id = $2`, [row.target_id, row.profile_id]);
    return p ? { post: { type: p.type, title: p.title, body: p.body, audience: p.audience, media: p.media, rev: p.rev, changed: p.rev !== /** @type {any} */ (row.change).rev } } : null;
  },
});
registerApprovalKind('post.edit', {
  apply: async (q, row) => {
    const c = /** @type {any} */ (row.change);
    await doEdit(q, String(row.target_id), { profileId: row.profile_id, accountId: row.requested_by }, c.rev, c.post);
  },
  // The proposed version, not the live one.
  preview: async (_q, row) => {
    const c = /** @type {any} */ (row.change);
    return { post: { type: c.post.type, title: c.post.title ?? null, body: String(c.post.body).slice(0, 300), audience: c.post.audience, media: c.post.mediaIds.length, rev: c.rev } };
  },
});

/** An edit by the acting profile: the partner's approval for a couple post (unless it only narrows the audience),
 * then the minor/major rules of doEdit. Shared by «Сохранить» and publishing saved edits.
 * @param {Q} q @param {Acting} acting @param {string} postId @param {number} rev @param {any} f */
async function editPost(q, acting, postId, rev, f) {
  const [p] = await q.query(`select * from feture.post where id = $1 and owner_profile_id = $2`, [postId, acting.profileId]);
  if (!p) fail(404, 'not_found');
  // Only narrowing the audience, with nothing else changed, skips the partner of a couple post.
  const media = (await q.query(`select asset_id from feture.media_attachment where target_type = 'post' and target_id = $1 order by position`, [postId])).map(r => r.asset_id);
  const onlyNarrowing = AUD.indexOf(f.audience) < AUD.indexOf(p.audience) && f.type === p.type && (f.title ?? null) === p.title && f.body === p.body
    && f.inFeed === p.in_feed && JSON.stringify(f.topics) === JSON.stringify(p.topics) && JSON.stringify(f.mediaIds) === JSON.stringify(media)
    && !f.poll && !f.tags.length && !f.interests.length;
  if (p.state !== 'draft' && needsPartner(acting, 'post.edit') && !onlyNarrowing) {
    return { pending: await requestApproval(q, acting, { kind: 'post.edit', targetType: 'post', targetId: postId, change: { rev, post: f }, summary: ['post'] }) };
  }
  return doEdit(q, postId, acting, rev, f);
}

/** People behind likes or poll votes, newest first, 30 a page (V21 likers / pollPeople). Listed: the viewer's own
 * profiles, and active people who show their marks («Показывать мои отметки»), not blocked either way and not
 * restricted. Everyone else is only counted («и ещё N»). `source` selects (profile_id, created_at) with its own
 * parameters from $3 on. @param {Q} q @param {Acting} viewer @param {import('../media/assets.mjs').MediaConfig} media
 * @param {string} source @param {unknown[]} params @param {string | undefined} cursor */
async function markers(q, viewer, media, source, params, cursor) {
  const cur = readCursor(cursor);
  const base = [viewer.profileId, viewer.accountId, ...params];
  const people = `with src as (${source}), x as (
    select src.profile_id id, src.created_at, p.kind, p.handle, p.name,
      exists (select 1 from feture.profile_member m where m.profile_id = p.id and m.account_id = $2 and m.state = 'active') mine,
      p.state = 'active' and coalesce(s.show_likes, true) and not feture.blocked($1, p.id) and not feture.restricted(p.id) shown
    from src join feture.profile p on p.id = src.profile_id left join feture.profile_settings s on s.profile_id = p.id)`;
  const [{ total, hidden }] = await q.query(`${people} select count(*)::int total, count(*) filter (where not (mine or shown))::int hidden from x`, base);
  const n = base.length;
  const rows = await q.query(
    `${people} select id, kind, handle, name, mine, created_at from x where (mine or shown)
       and ($${n + 1}::timestamptz is null or (created_at, id) < ($${n + 1}::timestamptz, $${n + 2}::uuid))
     order by created_at desc, id desc limit 31`, [...base, cur?.at ?? null, cur?.id ?? null]);
  const page = rows.slice(0, 30);
  const last = page[page.length - 1];
  const items = page.map(({ created_at: _, ...r }) => r);
  await withFaces(q, media, viewer, items, r => r);
  return { total, hidden, items, next: rows.length > 30 ? writeCursor(last.created_at, last.id) : null };
}

/** «Подписки» activity of the people the viewer follows (V21 followStream): likes of posts the viewer may see, events
 * they show they go to, communities they show they joined, whom they followed — last 30 days. Each person's «Кто видит
 * мою активность» (off hides it; followers — the viewer follows them), «Показывать мои отметки» for likes, blocks both
 * ways, «Не показывать активность» and muted authors are respected. Actions of one kind by one person with no pause
 * longer than 6 hours fold into one card. Keyset on (last action, card id), like posts.
 * @param {Q} q @param {Acting} viewer @param {string[]} kinds @param {{at: string, id: string} | null} cur @param {number} limit */
async function activityBursts(q, viewer, kinds, cur, limit) {
  return q.query(
    `with people as (
       select p.id from feture.follow f
       join feture.profile p on p.id = f.target_profile_id and p.state = 'active'
       join feture.profile_settings s on s.profile_id = p.id
       where f.follower_profile_id = $1 and s.activity_vis <> 'off' and not feture.blocked($1, p.id)
         and not exists (select 1 from feture.feed_hide h where h.profile_id = $1 and h.kind in ('activity', 'author') and h.target_id = p.id)
     ), acts as (
       select r.profile_id actor, 'likes' typ, r.target_id target, r.created_at t
       from people join feture.reaction r on r.profile_id = people.id and r.target_type = 'post'
       join feture.profile_settings s on s.profile_id = people.id and s.show_likes
       join feture.post p on p.id = r.target_id
       where 'likes' = any($3) and r.created_at > now() - interval '30 days' and p.owner_profile_id <> r.profile_id
         and p.state = 'published' and p.community_id is null and feture.post_visible(p, $1, $2)
         and not exists (select 1 from feture.feed_hide h where h.profile_id = $1 and h.kind = 'post' and h.target_id = p.id)
       union all
       select r.profile_id, 'events', r.event_id, r.updated_at
       from people join feture.event_rsvp r on r.profile_id = people.id join feture.event e on e.id = r.event_id
       where 'events' = any($3) and r.status in ('going', 'interested') and r.show_in_list and r.updated_at > now() - interval '30 days'
         and e.state = 'published' and feture.event_visible(e, $1, $2)
       union all
       select m.profile_id, 'communities', m.community_id, m.joined_at
       from people join feture.community_member m on m.profile_id = people.id and m.state = 'active' and m.listed
       join feture.community c on c.id = m.community_id
       where 'communities' = any($3) and m.joined_at > now() - interval '30 days' and c.privacy <> 'hidden' and feture.community_visible(c, $1, $2)
       union all
       select f.follower_profile_id, 'follows', f.target_profile_id, f.created_at
       from people join feture.follow f on f.follower_profile_id = people.id
       join feture.profile t on t.id = f.target_profile_id and t.state = 'active'
       where 'follows' = any($3) and f.created_at > now() - interval '30 days' and not feture.blocked($1, t.id) and not feture.restricted(t.id)
     ), marked as (
       select *, case when t - lag(t) over w <= interval '6 hours' then 0 else 1 end brk from acts window w as (partition by actor, typ order by t, target)
     ), numbered as (
       select *, sum(brk) over (partition by actor, typ order by t, target rows unbounded preceding) burst from marked
     ), bursts as (
       select actor, typ, max(t) last_at, count(*)::int n, (array_agg(target order by t desc))[1:${ACT_ITEMS}] targets,
              md5(actor::text || typ || min(t)::text)::uuid id
       from numbered group by actor, typ, burst
     )
     select * from bursts where ($4::timestamptz is null or (last_at, id) < ($4::timestamptz, $5::uuid))
     order by last_at desc, id desc limit $6`,
    [viewer.profileId, viewer.accountId, kinds, cur?.at ?? null, cur?.id ?? null, limit]);
}

/** Activity cards for the screen: the person, how many, and up to ACT_ITEMS of the things — a liked post with its
 * first picture and what it is made of (V21 likeThumb), an event or a community with its cover, a person with their
 * face. @param {Q} q @param {Acting} viewer @param {import('../media/assets.mjs').MediaConfig} media @param {any[]} bursts */
async function activityDtos(q, viewer, media, bursts) {
  if (!bursts.length) return [];
  const ids = (/** @type {string} */ typ) => [...new Set(bursts.filter(b => b.typ === typ).flatMap(b => b.targets))];
  const [posts, events, groups, people] = await Promise.all([
    ids('likes').length ? q.query(
      `select x.id, x.title, left(x.body, 140) excerpt, x.type = 'note' article, x.audience, x.owner_profile_id,
              json_build_object('id', o.id, 'kind', o.kind, 'handle', o.handle, 'name', o.name) author,
              exists (select 1 from feture.poll pl where pl.post_id = x.id) poll, jsonb_array_length(x.interests) > 0 interests,
              (select count(*)::int from feture.media_attachment a join feture.media_asset m on m.id = a.asset_id
                where a.target_type = 'post' and a.target_id = x.id and m.kind <> 'video') photos,
              (select count(*)::int from feture.media_attachment a join feture.media_asset m on m.id = a.asset_id
                where a.target_type = 'post' and a.target_id = x.id and m.kind = 'video') videos,
              (select to_jsonb(m) from feture.media_attachment a join feture.media_asset m on m.id = a.asset_id
                where a.target_type = 'post' and a.target_id = x.id order by a.position limit 1) first_asset
       from feture.post x join feture.profile o on o.id = x.owner_profile_id where x.id = any($1::uuid[])`, [ids('likes')]) : [],
    ids('events').length ? q.query(
      `select e.id, e.title, e.format, e.starts_at "startsAt", e.state, e.plate,
              (select to_jsonb(m) from feture.media_asset m where m.id = e.cover_asset_id) cover_asset
       from feture.event e where e.id = any($1::uuid[])`, [ids('events')]) : [],
    ids('communities').length ? q.query(
      `select c.id, c.name, c.privacy, c.plate,
              (select count(*)::int from feture.community_member m where m.community_id = c.id and m.state = 'active') members,
              (select to_jsonb(m) from feture.media_asset m where m.id = c.cover_asset_id) cover_asset
       from feture.community c where c.id = any($1::uuid[])`, [ids('communities')]) : [],
    ids('follows').length ? q.query(
      `select p.id, p.kind, p.handle, p.name from feture.profile p where p.id = any($1::uuid[])`, [ids('follows')]) : [],
  ]);
  const [actors] = await Promise.all([
    q.query(`select p.id, p.kind, p.handle, p.name from feture.profile p where p.id = any($1::uuid[])`, [[...new Set(bursts.map(b => b.actor))]]),
    withFaces(q, media, viewer, people, r => r),
  ]);
  await withFaces(q, media, viewer, actors, r => r);
  // Pictures are signed in the same tick (the delivery coalesces them). A liked post's picture follows the post's own
  // audience (explicit stays covered — the viewer opens the post to choose); a cover is what a public place shows.
  /** @param {any} d */
  const pic = d => (d?.src ? d.src.thumb ?? d.src.blur ?? null : null);
  const pubCover = async (/** @type {any} */ x) => { const { cover_asset, ...r } = x; return { ...r, cover: pic(await coverOf(media, cover_asset, viewer.profileId)) }; };
  const [postOut, eventOut, groupOut] = await Promise.all([
    Promise.all(posts.map(async ({ first_asset, audience, owner_profile_id, ...x }) => {
      const place = owner_profile_id === viewer.profileId ? 'own' : PUBLIC_AUD.has(audience) ? 'public' : 'private';
      const d = first_asset && media?.delivery ? await mediaDto(media, first_asset, { viewerProfileId: viewer.profileId, place, showExplicit: false }).catch(() => null) : null;
      return { ...x, thumb: pic(d), video: first_asset?.kind === 'video', durationMs: first_asset?.kind === 'video' ? first_asset.duration_ms ?? null : null };
    })),
    Promise.all(events.map(pubCover)),
    Promise.all(groups.map(pubCover)),
  ]);
  /** @type {Record<string, any[]>} */
  const pool = { likes: postOut, events: eventOut, communities: groupOut, follows: people };
  return bursts.map(b => ({
    kind: 'activity', id: b.id, activity: b.typ, actor: actors.find(x => x.id === b.actor), count: b.n, at: new Date(b.last_at).toISOString(),
    items: b.targets.map((/** @type {string} */ t) => pool[b.typ].find(x => x.id === t)).filter(Boolean),
  }));
}

/** Post DTO for one viewer. @param {Q} q @param {any} p @param {Acting} viewer @param {import('../media/assets.mjs').MediaConfig} media @param {boolean} showExplicit */
async function postDto(q, p, viewer, media, showExplicit) {
  return (await postDtos(q, [p], viewer, media, showExplicit))[0];
}

/** Post DTOs for a page: one query per kind of data for all posts (not per post), then media URLs signed together.
 * @param {Q} q @param {any[]} rows @param {Acting} viewer @param {import('../media/assets.mjs').MediaConfig} media @param {boolean} showExplicit */
async function postDtos(q, rows, viewer, media, showExplicit) {
  if (!rows.length) return [];
  const pv = await hasPhotoCheck(q);
  const ids = rows.map(p => p.id);
  const owners = [...new Set(rows.map(p => p.owner_profile_id))];
  const ownIds = rows.filter(p => p.own).map(p => p.id);
  const [authors, assets, polls, mine, counts, tags, mentions, disputes] = await Promise.all([
    // The name badges (V21 nameBadges): «Фото подтверждено» and the public Premium crown.
    q.query(`select p.id, p.kind, p.handle, p.name, p.avatar_asset_id, ${pv ? 'feture.photo_verified(p.id)' : 'false'} "photoVerified", ${PREMIUM_SQL} premium
             from feture.profile p where p.id = any($1::uuid[])`, [owners]),
    q.query(`select a.target_id post_id, m.* from feture.media_attachment a join feture.media_asset m on m.id = a.asset_id
             where a.target_type = 'post' and a.target_id = any($1::uuid[]) order by a.target_id, a.position`, [ids]),
    q.query('select post_id, question, options from feture.poll where post_id = any($1::uuid[])', [ids]),
    q.query('select post_id, option from feture.poll_vote where post_id = any($1::uuid[]) and profile_id = $2', [ids, viewer.profileId]),
    q.query(
      `select pid id,
              (select count(*)::int from feture.reaction where target_type = 'post' and target_id = pid) likes,
              exists (select 1 from feture.reaction where target_type = 'post' and target_id = pid and profile_id = $2) liked,
              (select count(*)::int from feture.reply r where r.post_id = pid and r.state = 'published' and not feture.blocked($2, r.author_profile_id)) replies,
              exists (select 1 from feture.saved_item where profile_id = $2 and kind = 'post' and target_id = pid::text) saved
       from unnest($1::uuid[]) pid`, [ids, viewer.profileId]),
    q.query(
      `select t.post_id, p.id, p.handle, p.name, t.state from feture.photo_tag t join feture.profile p on p.id = t.profile_id
       where t.post_id = any($1::uuid[]) and (t.post_id = any($2::uuid[]) or t.state = 'ok' or t.profile_id = $3) and not feture.blocked($3, p.id)`,
      [ids, ownIds, viewer.profileId]),
    // Mentions that are links: not removed by the person (V21 unmentionMe), active, not blocked either way.
    q.query(
      `select m.source_id post_id, p.id, p.handle from feture.mention m join feture.profile p on p.id = m.profile_id
       where m.source_type = 'post' and m.source_id = any($1::uuid[]) and not m.removed and p.state = 'active' and not feture.blocked($2, p.id)`,
      [ids, viewer.profileId]),
    // Own posts hidden by an open «это я на фото» claim: the author sees that, never the claimant.
    ownIds.length ? q.query(`select distinct d.post_id from feture.photo_dispute d where d.post_id = any($1::uuid[]) and d.state = 'open' and d.hid`, [ownIds]) : [],
  ]);
  // Results only after one's own vote (V21 pollHTML), or for the author.
  const showResults = polls.map(pl => pl.post_id).filter(id => ownIds.includes(id) || mine.some(m => m.post_id === id));
  const authorAvatars = [...new Set(authors.map(a => a.avatar_asset_id).filter(Boolean))];
  const [results, avatarRows] = await Promise.all([
    showResults.length ? q.query('select post_id, option, count(*)::int n from feture.poll_vote where post_id = any($1::uuid[]) group by post_id, option', [showResults]) : [],
    authorAvatars.length ? q.query('select * from feture.media_asset where id = any($1::uuid[])', [authorAvatars]) : [],
  ]);
  // Every picture of the page is signed in the same tick (the delivery coalesces them into one storage call).
  const avatarOf = new Map(await Promise.all(avatarRows.map(async a => {
    const d = await mediaDto(media, a, { viewerProfileId: viewer.profileId, place: 'public', showExplicit: false }).catch(() => null);
    return /** @type {[string, string | null]} */ ([a.id, d && !d.blurred && d.src ? (d.src.thumb ?? d.src.card ?? null) : null]);
  })));
  const mediaOf = await Promise.all(rows.map(p => {
    const place = p.own ? 'own' : PUBLIC_AUD.has(p.audience) ? 'public' : 'private';
    return Promise.all(assets.filter(m => m.post_id === p.id).map(({ post_id: _, ...m }) => mediaDto(media, m, { viewerProfileId: viewer.profileId, place, showExplicit }))).then(l => l.filter(Boolean));
  }));
  return rows.map((p, k) => {
    const row = authors.find(a => a.id === p.owner_profile_id);
    const { avatar_asset_id: authorAvatar, ...author } = row;
    author.avatar = authorAvatar ? avatarOf.get(authorAvatar) ?? null : null;
    const poll = polls.find(pl => pl.post_id === p.id);
    const my = mine.find(m => m.post_id === p.id);
    const res = showResults.includes(p.id) ? results.filter(r => r.post_id === p.id) : null;
    const pollOut = poll ? { question: poll.question, options: poll.options, myVote: my?.option ?? null, results: res && poll.options.map((/** @type {string} */ _, /** @type {number} */ i) => res.find(x => x.option === i)?.n ?? 0) } : null;
    const c = counts.find(x => x.id === p.id);
    return {
      id: p.id, type: p.type, title: p.title, body: p.body, audience: p.own ? p.audience : (p.audience === 'all' ? undefined : p.audience),
      topics: p.topics, interests: p.interests, author, media: mediaOf[k], poll: pollOut,
      tags: tags.filter(t => t.post_id === p.id).map(({ post_id: _, ...t }) => t),
      mentions: mentions.filter(m => m.post_id === p.id).map(({ post_id: _, ...m }) => m),
      likes: c.likes, liked: c.liked, replies: c.replies, saved: c.saved,
      publishedAt: p.published_at, editedAt: p.edited_at,
      // The gallery album goes back to its owner only (the post menu and the editor keep it; V21 postAlbum / setAlbum).
      ...(p.own ? { state: p.state, rev: p.rev, inFeed: p.in_feed, returned: p.removed_reason, ...('album_id' in p ? { albumId: p.album_id } : {}),
        ...(disputes.some(d => d.post_id === p.id) ? { dispute: { note: p.dispute_note ?? null } } : {}) } : {}),
    };
  });
}

/** Opaque keyset cursor over (published_at, id). @param {string | undefined} c */
export function readCursor(c) {
  if (!c) return null;
  try {
    const [at, id] = JSON.parse(Buffer.from(c, 'base64url').toString('utf8'));
    if (typeof at === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id) && !Number.isNaN(Date.parse(at))) return { at, id };
  } catch { /* invalid below */ }
  fail(400, 'invalid_input', { fields: ['cursor'] });
}

/** @type {Record<keyof typeof postsCommands, Command['run']>} */
const run = {
  async 'post.saveDraft'(q, { acting: a, input }) {
    const acting = need(a);
    const f = input.post;
    let postId = input.postId;
    if (postId) {
      const [p] = await q.query(`select state, created_by from feture.post where id = $1 and owner_profile_id = $2 for update`, [postId, acting.profileId]);
      if (!p || p.created_by !== acting.accountId) fail(404, 'not_found'); // a couple's draft belongs to the partner who wrote it
      if (p.state !== 'draft') fail(409, 'conflict', { state: p.state });
      // Changing a draft the partner is asked to approve withdraws that request: they must see the final version.
      await q.query(`update feture.partner_approval set state = 'cancelled', decided_at = now() where target_type = 'post' and target_id = $1 and state = 'pending'`, [postId]);
      await q.query(`update feture.post set type = $2, title = $3, body = $4, in_feed = $5, topics = $6, album_id = $7, rev = rev + 1, updated_at = now() where id = $1`,
        [postId, f.type, f.title ?? null, f.body, f.inFeed, f.topics, f.albumId ?? null]);
    } else {
      await requireCommunityWriter(q, f.communityId, acting);
      // A discussion is for the community: everyone there, never in the main feed.
      if (f.communityId) { f.audience = 'all'; f.inFeed = false; }
      [{ id: postId }] = await q.query(
        `insert into feture.post (owner_profile_id, created_by, type, title, body, audience, in_feed, topics, album_id, community_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
        [acting.profileId, acting.accountId, f.type, f.title ?? null, f.body, f.audience, f.inFeed, f.topics, f.albumId ?? null, f.communityId ?? null]);
    }
    await writeParts(q, postId, f, acting);
    await writeMentions(q, 'post', postId, f.body, acting.profileId);
    return { id: postId, state: 'draft' };
  },

  async 'post.publish'(q, { acting: a, input }) {
    const acting = need(a);
    const [p] = await q.query(`select state, created_by, rev, type, title, body, audience, community_id from feture.post where id = $1 and owner_profile_id = $2`, [input.postId, acting.profileId]);
    if (!p || p.created_by !== acting.accountId) fail(404, 'not_found');
    if (p.state !== 'draft') fail(409, 'conflict', { state: p.state });
    await requireCommunityWriter(q, p.community_id, acting);
    if (needsPartner(acting, 'post.publish')) {
      const change = { postId: input.postId, rev: p.rev, type: p.type, title: p.title, body: p.body, audience: p.audience };
      return { pending: await requestApproval(q, acting, { kind: 'post.publish', targetType: 'post', targetId: input.postId, change, summary: ['post'] }) };
    }
    const out = await doPublish(q, input.postId, acting.profileId);
    if (acting.kind === 'couple') await enqueue(q, 'couple.changed', acting.profileId, { for: acting.partnerAccountId, what: 'post' });
    return out;
  },

  async 'post.edit'(q, { acting: a, input }) {
    return editPost(q, need(a), input.postId, input.rev, input.post);
  },

  async 'post.delete'(q, { acting: a, input }) {
    const acting = need(a);
    const state = await deletePost(q, acting, input.postId);
    await dropHiddenPostPhotos(q, acting.profileId); // its photos leave the profile with it (V21 galSelDel)
    if (acting.kind === 'couple') await enqueue(q, 'couple.changed', acting.profileId, { for: acting.partnerAccountId, what: 'post_archived' });
    return { state };
  },

  async 'post.get'(q, { acting: a, input, cfg, account }) {
    const viewer = need(a);
    const p = await visiblePost(q, input.postId, viewer);
    const [acc] = await q.query('select show_explicit from feture.account where id = $1', [account.id]);
    return { post: await postDto(q, p, viewer, cfg.media, !!acc.show_explicit) };
  },

  async 'feed.list'(q, { acting: a, input, cfg, account }) {
    const viewer = need(a);
    const cur = readCursor(input.cursor);
    const popular = input.tab === 'popular';
    // «Подписки» with `activity`: a mixed stream of posts and activity cards; every item then has `kind`. Activity has
    // no topics or kinds of post, so topic/type filters and search leave only posts (V21 feedFilters).
    const kinds = input.activity ? (input.activity.length ? input.activity : [...ACTIVITY_KINDS]) : null;
    const filtered = !!(input.topics?.length || input.excludeTopics?.length || input.types?.length || input.q);
    const actKinds = kinds && !filtered ? kinds.filter((/** @type {string} */ k) => k !== 'posts') : [];
    const rows = !kinds || kinds.includes('posts') ? await q.query(
      `select p.*, false own from feture.post p
       where p.state = 'published' and p.in_feed and p.community_id is null and feture.post_visible(p, $1, $2)
         and not exists (select 1 from feture.feed_hide h where h.profile_id = $1 and ((h.kind = 'post' and h.target_id = p.id) or (h.kind = 'author' and h.target_id = p.owner_profile_id)))
         and ($3::text[] is null or p.topics && $3)
         and ($9::text[] is null or not p.topics && $9)
         and ($8::text is null or p.title ilike $8 or p.body ilike $8)
         and ($10::text[] is null or ('note' = any($10) and p.type = 'note'
              or 'photo' = any($10) and exists (select 1 from feture.media_attachment ma where ma.target_type = 'post' and ma.target_id = p.id)
              or 'poll' = any($10) and exists (select 1 from feture.poll pl where pl.post_id = p.id)
              or 'interests' = any($10) and jsonb_array_length(p.interests) > 0
              or 'text' = any($10) and p.type = 'post' and jsonb_array_length(p.interests) = 0
                 and not exists (select 1 from feture.media_attachment ma where ma.target_type = 'post' and ma.target_id = p.id)
                 and not exists (select 1 from feture.poll pl where pl.post_id = p.id)))
         and (not $11::boolean or (p.topics && coalesce((select array_agg(i.topic_id) from feture.interest i where i.profile_id = $1 and i.value is not null), '{}')
              and not p.topics && coalesce((select array_agg(i.topic_id) from feture.interest i where i.profile_id = $1 and i.mark = 'hard'), '{}')))
         and ($4 in ('forYou', 'popular') or p.owner_profile_id = $1
              or exists (select 1 from feture.follow f where f.follower_profile_id = $1 and f.target_profile_id = p.owner_profile_id))
         and ($5::timestamptz is null or (p.published_at, p.id) < ($5::timestamptz, $6::uuid))
         and ($4 <> 'popular' or p.published_at > now() - interval '7 days')
       order by case when $4 = 'popular' then ${popularScore('p', '$1')} end desc nulls last,
                p.published_at desc, p.id desc limit $7`,
      [viewer.profileId, viewer.accountId, input.topics?.length ? input.topics : null, input.tab, popular ? null : cur?.at ?? null, popular ? null : cur?.id ?? null, input.limit + 1,
       // Search (I01): words in the title or text; % and _ typed by the person are literal.
       likePattern(input.q), input.excludeTopics?.length ? input.excludeTopics : null, input.types?.length ? input.types : null,
       // «Популярное» by my interests (V21 popTag): topics the acting profile rated, never its hard limits.
       !!input.myInterests]) : [];
    const [acc] = await q.query('select show_explicit from feture.account where id = $1', [account.id]);
    if (!kinds) {
      const page = rows.slice(0, input.limit);
      // Posts are built side by side: the pool gate caps database concurrency, media URL signing overlaps.
      const items = await postDtos(q, page.map(p => ({ ...p, own: p.owner_profile_id === viewer.profileId })), viewer, cfg.media, !!acc.show_explicit);
      const last = page[page.length - 1];
      // «Популярное» (V21 F01) is one page of the last 7 days by popularScore; the keyset cursor follows time, so no next page.
      return { items, next: !popular && rows.length > input.limit ? writeCursor(last.published_at, last.id) : null };
    }
    const bursts = actKinds.length ? await activityBursts(q, viewer, actKinds, cur, input.limit + 1) : [];
    // Both sources follow the same (time, id) keyset, so merging them and cutting at `limit` pages correctly.
    const merged = [...rows.map(r => ({ at: new Date(r.published_at), id: r.id, post: r, burst: null })),
      ...bursts.map(b => ({ at: new Date(b.last_at), id: b.id, post: null, burst: b }))]
      .sort((x, y) => y.at.getTime() - x.at.getTime() || (x.id < y.id ? 1 : x.id > y.id ? -1 : 0));
    const page = merged.slice(0, input.limit);
    const postRows = page.filter(x => x.post).map(x => ({ ...x.post, own: x.post.owner_profile_id === viewer.profileId }));
    const postOut = await postDtos(q, postRows, viewer, cfg.media, !!acc.show_explicit);
    const cards = await activityDtos(q, viewer, cfg.media, page.filter(x => x.burst).map(x => x.burst));
    const items = page.map(x => x.post ? { kind: 'post', ...postOut.find(d => d.id === x.id) } : cards.find(c => c.id === x.id));
    const last = page[page.length - 1];
    return { items, next: merged.length > input.limit ? writeCursor(last.at, last.id) : null };
  },

  async 'profile.posts'(q, { acting: a, input, cfg, account }) {
    const viewer = need(a);
    const cur = readCursor(input.cursor);
    const rows = await q.query(
      `select p.*, exists (select 1 from feture.profile_member m where m.profile_id = p.owner_profile_id and m.account_id = $2 and m.state = 'active') own
       from feture.post p
       where p.owner_profile_id = $3 and p.state = 'published' and p.community_id is null and feture.post_visible(p, $1, $2)
         and ($4::timestamptz is null or (p.published_at, p.id) < ($4::timestamptz, $5::uuid))
       order by p.published_at desc, p.id desc limit 21`,
      [viewer.profileId, viewer.accountId, input.profileId, cur?.at ?? null, cur?.id ?? null]);
    const [acc] = await q.query('select show_explicit from feture.account where id = $1', [account.id]);
    const page = rows.slice(0, 20);
    const items = await postDtos(q, page, viewer, cfg.media, !!acc.show_explicit);
    const last = page[page.length - 1];
    return { items, next: rows.length > 20 ? writeCursor(last.published_at, last.id) : null };
  },

  async 'me.posts'(q, { acting: a, cfg, account }) {
    const viewer = need(a);
    // Drafts of a couple are visible only to the partner who wrote them.
    const rows = await q.query(
      `select p.*, true own from feture.post p where p.owner_profile_id = $1 and p.state <> 'archived'
         and (p.state <> 'draft' or p.created_by = $2) order by coalesce(p.published_at, p.updated_at) desc limit 100`, [viewer.profileId, viewer.accountId]);
    const revisions = await q.query(
      `select r.id, r.post_id, r.created_at from feture.post_revision r join feture.post p on p.id = r.post_id where p.owner_profile_id = $1 and r.state = 'review'`, [viewer.profileId]);
    const [acc] = await q.query('select show_explicit from feture.account where id = $1', [account.id]);
    const items = [];
    items.push(...await postDtos(q, rows, viewer, cfg.media, !!acc.show_explicit));
    // Saved, not yet published edits: only the partner who saved them sees them (like a couple's drafts).
    const saved = await q.query(
      `select e.post_id, e.payload, e.base_rev, e.saved_at from feture.post_saved_edit e join feture.post p on p.id = e.post_id
       where p.owner_profile_id = $1 and e.saved_by = $2 and p.state in ('published', 'review') order by e.saved_at desc`, [viewer.profileId, viewer.accountId]);
    const pendingEdits = [];
    for (const e of saved) {
      const post = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload;
      const assets = post.mediaIds?.length
        ? await q.query(`select * from feture.media_asset where id = any($1::uuid[]) and owner_profile_id = $2`, [post.mediaIds, viewer.profileId]) : [];
      const media = [];
      for (const id of post.mediaIds ?? []) {
        const asset = assets.find(x => x.id === id);
        const d = asset ? await mediaDto(cfg.media, asset, { viewerProfileId: viewer.profileId, place: 'own', showExplicit: !!acc.show_explicit }) : null;
        if (d) media.push(d);
      }
      pendingEdits.push({ postId: e.post_id, baseRev: e.base_rev, savedAt: e.saved_at, post, media });
    }
    return { items, revisions, pendingEdits };
  },

  async 'post.saveEdits'(q, { acting: a, input }) {
    const acting = need(a);
    const [p] = await q.query(`select state, rev from feture.post where id = $1 and owner_profile_id = $2 for update`, [input.postId, acting.profileId]);
    if (!p) fail(404, 'not_found');
    // A draft is saved with post.saveDraft; saved edits are for a post that is already out.
    if (!['published', 'review'].includes(p.state)) fail(409, 'conflict', { state: p.state });
    if (p.rev !== input.rev) fail(409, 'conflict', { rev: p.rev });
    const [other] = await q.query(`select saved_by from feture.post_saved_edit where post_id = $1`, [input.postId]);
    if (other && other.saved_by !== acting.accountId) fail(409, 'conflict', { rule: 'partner_editing' });
    await q.query(
      `insert into feture.post_saved_edit (post_id, payload, saved_by, base_rev) values ($1, $2, $3, $4)
       on conflict (post_id) do update set payload = excluded.payload, base_rev = excluded.base_rev, saved_at = now()`,
      [input.postId, JSON.stringify(input.post), acting.accountId, p.rev]);
    return { saved: true, baseRev: p.rev };
  },

  async 'post.publishEdits'(q, { acting: a, input }) {
    const acting = need(a);
    const [e] = await q.query(
      `select e.payload, e.base_rev from feture.post_saved_edit e join feture.post p on p.id = e.post_id
       where e.post_id = $1 and p.owner_profile_id = $2 and e.saved_by = $3 for update of e`, [input.postId, acting.profileId, acting.accountId]);
    if (!e) fail(404, 'not_found');
    const parsed = postFields.safeParse(typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload);
    if (!parsed.success) fail(400, 'invalid_input', { fields: ['post'] });
    // The same path as «Сохранить»: partner approval, minor/major edit and review. A post changed since the edits
    // were saved refuses them (409 with the current rev); the saved edits stay until discarded.
    const out = await editPost(q, acting, input.postId, e.base_rev, parsed.data);
    await q.query(`delete from feture.post_saved_edit where post_id = $1`, [input.postId]);
    return out;
  },

  async 'post.discardEdits'(q, { acting: a, input }) {
    const acting = need(a);
    const [p] = await q.query(`select 1 from feture.post where id = $1 and owner_profile_id = $2`, [input.postId, acting.profileId]);
    if (!p) fail(404, 'not_found');
    const rows = await q.query(`delete from feture.post_saved_edit where post_id = $1 and saved_by = $2 returning 1`, [input.postId, acting.accountId]);
    return { discarded: rows.length > 0 };
  },

  async 'post.likers'(q, { acting: a, input, cfg }) {
    const viewer = need(a);
    let postId = input.targetId;
    if (input.targetType === 'reply') {
      const [r] = await q.query(`select post_id, feture.blocked($2, author_profile_id) b from feture.reply where id = $1 and state = 'published'`, [input.targetId, viewer.profileId]);
      if (!r || r.b) fail(404, 'not_found');
      postId = r.post_id;
    }
    await visiblePost(q, postId, viewer);
    return markers(q, viewer, cfg.media, `select profile_id, created_at from feture.reaction where target_type = $3 and target_id = $4`, [input.targetType, input.targetId], input.cursor);
  },

  async 'poll.voters'(q, { acting: a, input, cfg }) {
    const viewer = need(a);
    const p = await visiblePost(q, input.postId, viewer);
    const [poll] = await q.query('select options from feture.poll where post_id = $1', [input.postId]);
    if (!poll) fail(404, 'not_found');
    if (input.option >= poll.options.length) fail(400, 'invalid_input', { fields: ['option'] });
    // Who chose what opens after one's own vote, as the results do (V21 pollPeople); the author always sees it.
    if (!p.own) {
      const [v] = await q.query('select 1 from feture.poll_vote where post_id = $1 and profile_id = $2', [input.postId, viewer.profileId]);
      if (!v) fail(403, 'forbidden', { rule: 'vote_first' });
    }
    return markers(q, viewer, cfg.media, `select profile_id, created_at from feture.poll_vote where post_id = $3 and option = $4`, [input.postId, input.option], input.cursor);
  },

  async 'post.unmentionMe'(q, { acting: a, input }) {
    const viewer = need(a);
    const p = await visiblePost(q, input.postId, viewer);
    let author = p.owner_profile_id, own = p.own;
    if (input.replyId) {
      const [r] = await q.query(`select author_profile_id from feture.reply where id = $1 and post_id = $2 and state = 'published'`, [input.replyId, input.postId]);
      if (!r) fail(404, 'not_found');
      author = r.author_profile_id; own = author === viewer.profileId;
    }
    if (own) fail(422, 'rule_violation', { rule: 'own_post' });
    const source = [input.replyId ? 'reply' : 'post', input.replyId ?? input.postId, viewer.profileId];
    const [m] = await q.query(`select removed from feture.mention where source_type = $1 and source_id = $2 and profile_id = $3 for update`, source);
    if (!m) fail(404, 'not_found');
    if (m.removed) return { removed: true };
    // The text keeps the name; the mention stops being a link and is never announced again (notified).
    await q.query(`update feture.mention set removed = true, notified = true where source_type = $1 and source_id = $2 and profile_id = $3`, source);
    await enqueue(q, 'mention.removed', author, { postId: input.postId, ...(input.replyId ? { replyId: input.replyId } : {}), from: viewer.profileId });
    return { removed: true };
  },

  async 'reaction.set'(q, { acting: a, input }) {
    const viewer = need(a);
    const postId = input.targetType === 'post' ? input.targetId
      : (await q.query(`select post_id from feture.reply where id = $1 and state = 'published'`, [input.targetId]))[0]?.post_id;
    if (!postId) fail(404, 'not_found');
    const p = await visiblePost(q, postId, viewer);
    if (input.on && p.community_id) await requireCommunityWriter(q, p.community_id, viewer); // only members react in a community
    if (!input.on) {
      await q.query(`delete from feture.reaction where target_type = $1 and target_id = $2 and profile_id = $3`, [input.targetType, input.targetId, viewer.profileId]);
      return { liked: false };
    }
    const rows = await q.query(
      `insert into feture.reaction (target_type, target_id, profile_id, acted_by) values ($1, $2, $3, $4) on conflict do nothing returning 1`,
      [input.targetType, input.targetId, viewer.profileId, viewer.accountId]);
    // Like, unlike, like again: the author hears about it once a day per post and person.
    const [{ told }] = await q.query(
      `select exists (select 1 from feture.outbox where topic = 'reaction.created' and profile_id = $1 and payload->>'postId' = $2
         and payload->>'from' = $3 and created_at > now() - interval '1 day') told`, [p.owner_profile_id, postId, viewer.profileId]);
    if (rows.length && !p.own && !told) await enqueue(q, 'reaction.created', p.owner_profile_id, { postId, from: viewer.profileId, targetType: input.targetType });
    return { liked: true };
  },

  async 'poll.vote'(q, { acting: a, input }) {
    const viewer = need(a);
    const p = await visiblePost(q, input.postId, viewer);
    if (p.community_id) await requireCommunityWriter(q, p.community_id, viewer); // only members vote in a community
    const [poll] = await q.query('select options from feture.poll where post_id = $1', [input.postId]);
    if (!poll) fail(404, 'not_found');
    if (input.option === null) {
      await q.query('delete from feture.poll_vote where post_id = $1 and profile_id = $2', [input.postId, viewer.profileId]);
      return { myVote: null };
    }
    if (input.option >= poll.options.length) fail(400, 'invalid_input', { fields: ['option'] });
    try {
      // To change a vote, withdraw it first (V21 setVote).
      await q.query(`insert into feture.poll_vote (post_id, profile_id, option, acted_by) values ($1, $2, $3, $4)`, [input.postId, viewer.profileId, input.option, viewer.accountId]);
    } catch (error) {
      if (isUniqueViolation(error)) fail(409, 'conflict', { rule: 'already_voted' });
      throw error;
    }
    return { myVote: input.option };
  },

  async 'reply.create'(q, { acting: a, input }) {
    const viewer = need(a);
    const p = await visiblePost(q, input.postId, viewer);
    if (p.state !== 'published') fail(409, 'conflict', { state: p.state });
    if (p.community_id) await requireCommunityWriter(q, p.community_id, viewer);
    let parentAuthor = null;
    if (input.parentId) {
      const [parent] = await q.query(`select author_profile_id from feture.reply where id = $1 and post_id = $2 and state = 'published'`, [input.parentId, input.postId]);
      if (!parent) fail(404, 'not_found');
      const [{ b }] = await q.query('select feture.blocked($1, $2) b', [viewer.profileId, parent.author_profile_id]);
      if (b) fail(404, 'not_found');
      parentAuthor = parent.author_profile_id;
    }
    const [r] = await q.query(
      `insert into feture.reply (post_id, parent_id, author_profile_id, sent_by, body) values ($1, $2, $3, $4, $5) returning id`,
      [input.postId, input.parentId ?? null, viewer.profileId, viewer.accountId, input.body]);
    const told = new Set([viewer.profileId]);
    for (const to of [parentAuthor, p.owner_profile_id]) {
      if (to && !told.has(to)) { told.add(to); await enqueue(q, 'reply.created', to, { postId: input.postId, replyId: r.id, from: viewer.profileId }); }
    }
    for (const m of await writeMentions(q, 'reply', r.id, input.body, viewer.profileId)) {
      await q.query(`update feture.mention set notified = true where source_type = 'reply' and source_id = $1 and profile_id = $2`, [r.id, m]);
      await enqueue(q, 'mention.created', m, { postId: input.postId, replyId: r.id, from: viewer.profileId });
    }
    return { id: r.id };
  },

  async 'reply.edit'(q, { acting: a, input }) {
    const viewer = need(a);
    const rows = await q.query(
      `update feture.reply set body = $3, rev = rev + 1, edited_at = now() where id = $1 and author_profile_id = $2 and state = 'published' and rev = $4 returning rev`,
      [input.replyId, viewer.profileId, input.body, input.rev]);
    if (!rows[0]) fail(409, 'conflict');
    return { rev: rows[0].rev };
  },

  async 'reply.delete'(q, { acting: a, input }) {
    const viewer = need(a);
    const rows = await q.query(
      `update feture.reply set state = 'deleted', body = '', edited_at = now() where id = $1 and author_profile_id = $2 and state = 'published' returning id`,
      [input.replyId, viewer.profileId]);
    if (!rows[0]) fail(404, 'not_found');
    return { state: 'deleted' };
  },

  async 'post.replies'(q, { acting: a, input, cfg }) {
    const viewer = need(a);
    await visiblePost(q, input.postId, viewer);
    const rows = await q.query(
      `select r.id, r.parent_id, r.state, r.body, r.created_at, r.edited_at, r.rev, r.author_profile_id = $2 mine,
         feture.blocked($2, r.author_profile_id) hidden,
         (select json_build_object('id', p.id, 'kind', p.kind, 'handle', p.handle, 'name', p.name, 'avatarAssetId', p.avatar_asset_id) from feture.profile p where p.id = r.author_profile_id and p.state = 'active') author,
         (select count(*)::int from feture.reaction x where x.target_type = 'reply' and x.target_id = r.id) likes,
         exists (select 1 from feture.reaction x where x.target_type = 'reply' and x.target_id = r.id and x.profile_id = $2) liked,
         exists (select 1 from feture.reply c where c.parent_id = r.id and c.state = 'published') has_replies,
         (select coalesce(json_agg(json_build_object('id', mp.id, 'handle', mp.handle)), '[]'::json) from feture.mention m join feture.profile mp on mp.id = m.profile_id
          where m.source_type = 'reply' and m.source_id = r.id and not m.removed and mp.state = 'active' and not feture.blocked($2, mp.id)) mentions
       from feture.reply r where r.post_id = $1 and r.state <> 'removed' order by r.created_at`, [input.postId, viewer.profileId]);
    // Deleted without live replies disappear; with replies they stay as a stub; blocked authors show as hidden.
    const items = [];
    for (const r of rows.filter(x => x.state === 'published' || x.has_replies)) {
      let author = null;
      if (r.author) {
        const { avatarAssetId, ...rest } = r.author;
        author = { ...rest, avatar: await avatarSrc(q, cfg.media, avatarAssetId, viewer.profileId) };
      }
      items.push({
        id: r.id, parentId: r.parent_id, createdAt: r.created_at, editedAt: r.edited_at, likes: r.likes,
        ...(r.state === 'deleted' ? { deleted: true } : r.hidden ? { hidden: true } : { body: r.body, author, mine: r.mine, liked: r.liked, rev: r.mine ? r.rev : undefined, mentions: typeof r.mentions === 'string' ? JSON.parse(r.mentions) : r.mentions }),
      });
    }
    return { items };
  },

  async 'tag.answer'(q, { acting: a, input }) {
    const viewer = need(a);
    const [t] = await q.query(`select t.state, p.owner_profile_id from feture.photo_tag t join feture.post p on p.id = t.post_id where t.post_id = $1 and t.profile_id = $2 for update of t`, [input.postId, viewer.profileId]);
    if (!t) fail(404, 'not_found');
    if (input.answer === 'remove') {
      // Removing one's mark keeps the photo; it no longer names the person.
      await q.query('delete from feture.photo_tag where post_id = $1 and profile_id = $2', [input.postId, viewer.profileId]);
    } else {
      await q.query(`update feture.photo_tag set state = $3, decided_at = now() where post_id = $1 and profile_id = $2`, [input.postId, viewer.profileId, input.answer]);
    }
    await settleAvatar(q, t.owner_profile_id); // a post with an unconfirmed mark is not public: nor is its photo as an avatar
    await enqueue(q, 'tag.answered', t.owner_profile_id, { postId: input.postId, answer: input.answer });
    return { answer: input.answer };
  },

  async 'tag.object'(q, { acting: a, input, account }) {
    const viewer = need(a);
    const p = await visiblePost(q, input.postId, viewer);
    if (p.own) fail(422, 'rule_violation', { rule: 'own_post' });
    // «Это я на фото» only makes sense where there are photos; text posts go through reports.
    const [{ n }] = await q.query(`select count(*)::int n from feture.media_attachment where target_type = 'post' and target_id = $1`, [input.postId]);
    if (!n) fail(422, 'rule_violation', { rule: 'no_photos' });
    const L = DISPUTE_LIMITS;
    // Claims of one account are counted under a lock (parallel requests cannot pass a limit together).
    await q.query(`select pg_advisory_xact_lock(hashtext('feture-dispute:' || $1))`, [account.id]);
    const [open] = await q.query(`select hid from feture.photo_dispute where post_id = $1 and claimant_account = $2 and state = 'open'`, [input.postId, account.id]);
    if (open) return { hidden: open.hid, queued: true };
    const count = async (/** @type {boolean} */ tagged, /** @type {string} */ window) => (await q.query(
      `select count(*)::int n from feture.photo_dispute where claimant_account = $1 and tagged = $2 and created_at > now() - $3::interval`,
      [account.id, tagged, window]))[0].n;
    const [t] = await q.query('select state from feture.photo_tag where post_id = $1 and profile_id = $2', [input.postId, viewer.profileId]);
    const trust = await claimantTrust(q, account.id);
    let hid = false, suspicious = false, attack = false;
    if (t) {
      // A person marked on the photo: their «no» hides it at once, as a declined mark (V21 tagObject).
      if (await count(true, '1 day') >= L.taggedPerDay) fail(429, 'rate_limited');
      await q.query(`update feture.photo_tag set state = 'no', decided_at = now() where post_id = $1 and profile_id = $2`, [input.postId, viewer.profileId]);
      hid = true;
    } else {
      if (trust.strikes >= L.strikesRestricted) fail(422, 'rule_violation', { rule: 'claims_restricted' });
      if (await count(false, '1 day') >= L.untaggedPerDay || await count(false, L.monthWindow) >= L.untaggedPerMonth) fail(429, 'rate_limited', { rule: 'claim_limit' });
      suspicious = trust.young || !trust.trusted;
      // Mass attack guard: several suspicious claims against one author within a day suspend instant hiding of their
      // posts; the claims still reach staff first.
      await q.query(`select pg_advisory_xact_lock(hashtext('feture-dispute-author:' || $1))`, [p.owner_profile_id]);
      const [{ n: recent }] = await q.query(
        `select count(*)::int n from feture.photo_dispute where author_profile_id = $1 and not tagged and suspicious and created_at > now() - $2::interval`,
        [p.owner_profile_id, L.attackWindow]);
      attack = recent + (suspicious ? 1 : 0) >= L.attackClaims;
      if (attack) await q.query(`update feture.photo_dispute set attack = true where author_profile_id = $1 and state = 'open' and not attack`, [p.owner_profile_id]);
      hid = trust.trusted && trust.strikes < L.strikesNoInstant && !attack;
      if (hid) await q.query(`update feture.post set disputed_at = coalesce(disputed_at, now()), disputed_by = coalesce(disputed_by, $2) where id = $1`, [input.postId, viewer.profileId]);
      // A claim that only queues still takes the post out of the claimant's own feed, as a report does.
      else await q.query(`insert into feture.feed_hide (profile_id, kind, target_id) values ($1, 'post', $2) on conflict do nothing`, [viewer.profileId, input.postId]);
    }
    await q.query(
      `insert into feture.photo_dispute (post_id, author_profile_id, claimant_profile_id, claimant_account, tagged, trusted, suspicious, hid, attack)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [input.postId, p.owner_profile_id, viewer.profileId, account.id, !!t, trust.trusted, suspicious, hid, attack]);
    // The author learns only that someone in the photo objects, never who; nothing while the post stays visible.
    if (hid) {
      await enqueue(q, 'post.disputed', p.owner_profile_id, { postId: input.postId });
      await settleAvatar(q, p.owner_profile_id);
    }
    return { hidden: hid, queued: true };
  },

  async 'post.disputeExplain'(q, { acting: a, input }) {
    const viewer = need(a);
    const p = await visiblePost(q, input.postId, viewer);
    if (!p.own) fail(404, 'not_found');
    // Only while the post is hidden by an open dispute: that is all the author is told about.
    const [{ hidden }] = await q.query(`select exists (select 1 from feture.photo_dispute where post_id = $1 and state = 'open' and hid) hidden`, [input.postId]);
    if (!hidden) fail(409, 'conflict', { rule: 'not_disputed' });
    await q.query(`update feture.post set dispute_note = $2 where id = $1`, [input.postId, input.note || null]);
    return { note: input.note || null };
  },

  async 'report.create'(q, { acting: a, input, account }) {
    const viewer = need(a);
    let ownerProfile = null;
    let rev = null;
    if (input.targetType === 'post') { const p = await visiblePost(q, input.targetId, viewer); ownerProfile = p.owner_profile_id; rev = p.rev; }
    if (input.targetType === 'reply') {
      const [r] = await q.query('select post_id, author_profile_id, rev from feture.reply where id = $1', [input.targetId]);
      if (!r) fail(404, 'not_found');
      await visiblePost(q, r.post_id, viewer);
      ownerProfile = r.author_profile_id; rev = r.rev;
    }
    if (input.targetType === 'profile') {
      const [p] = await q.query(`select id from feture.profile where id = $1 and state = 'active'`, [input.targetId]);
      if (!p) fail(404, 'not_found');
      ownerProfile = p.id;
    }
    /** @type {any} */
    let snapshot = null;
    if (input.targetType === 'community') {
      const [c] = await q.query(`select c.owner_profile_id, c.name, c.description, c.rules from feture.community c where c.id = $1 and feture.community_visible(c, $2, $3)`,
        [input.targetId, viewer.profileId, viewer.accountId]);
      if (!c) fail(404, 'not_found');
      ownerProfile = c.owner_profile_id; snapshot = { name: c.name, description: c.description, rules: c.rules };
    }
    if (input.targetType === 'event') {
      const [e] = await q.query(`select e.organizer_profile_id, e.title, e.description, e.area, e.rev from feture.event e where e.id = $1 and feture.event_visible(e, $2, $3)`,
        [input.targetId, viewer.profileId, viewer.accountId]);
      if (!e) fail(404, 'not_found');
      ownerProfile = e.organizer_profile_id; rev = e.rev; snapshot = { title: e.title, description: e.description, area: e.area };
    }
    if (input.targetType === 'conversation') {
      // Only a member reports a chat, and only the other side's messages, which are copied as evidence.
      const [c] = await q.query(
        `select case when c.profile_a = cm.profile_id then c.profile_b else c.profile_a end other from feture.conversation c
         join feture.conversation_member cm on cm.conversation_id = c.id and cm.account_id = $2 and cm.profile_id = $3 where c.id = $1`,
        [input.targetId, viewer.accountId, viewer.profileId]);
      if (!c) fail(404, 'not_found');
      const msgs = await q.query(
        `select seq, body, media_asset_id is not null media, created_at from feture.message where conversation_id = $1 and id = any($2) and author_profile_id = $3 order by seq`,
        [input.targetId, input.messageIds, c.other]);
      if (msgs.length !== input.messageIds.length) fail(400, 'invalid_input', { fields: ['messageIds'] });
      ownerProfile = c.other; snapshot = { messages: msgs.map(m => ({ seq: Number(m.seq), body: m.body, media: m.media, at: m.created_at })) };
    }
    if (ownerProfile === viewer.profileId) fail(422, 'rule_violation', { rule: 'own_content' });
    // One open report per target and reporter. Repeating it never fails the transaction; for a chat, newly selected
    // messages are added to the evidence.
    const [r] = await q.query(
      `insert into feture.report (reporter_profile_id, reporter_account, target_type, target_id, target_rev, reason, details, message_ids, reported_profile_id, snapshot)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $10, case when $9::jsonb is not null then $9::jsonb when $3 = 'post' then (select jsonb_build_object('title', title, 'body', body, 'audience', audience) from feture.post where id = $4)
                 when $3 = 'reply' then (select jsonb_build_object('body', body) from feture.reply where id = $4)
                 else (select jsonb_build_object('name', p.name, 'handle', p.handle, 'bio', d.bio) from feture.profile p left join feture.profile_details d on d.profile_id = p.id where p.id = $4) end)
       on conflict (reporter_profile_id, target_type, target_id) where state = 'open' do update set
         message_ids = case when report.target_type = 'conversation'
           then (select array_agg(m) from (select distinct unnest(coalesce(report.message_ids, '{}') || coalesce(excluded.message_ids, '{}')) m limit 20) x) else report.message_ids end,
         snapshot = case when report.target_type = 'conversation'
           then jsonb_build_object('messages', coalesce(report.snapshot->'messages', '[]'::jsonb) || coalesce(excluded.snapshot->'messages', '[]'::jsonb)) else report.snapshot end
       returning id, (xmax = 0) inserted`,
      [viewer.profileId, account.id, input.targetType, input.targetId, rev, input.reason, input.details, input.messageIds ?? null, snapshot ? JSON.stringify(snapshot) : null, input.targetType === 'conversation' ? ownerProfile : null]);
    if (r.inserted) await enqueue(q, 'moderation.report', ownerProfile, { reportId: r.id, reason: input.reason });
    // The reporter stops seeing what they reported (V21 rpSend); blocking is optional.
    if (input.targetType === 'post') await q.query(`insert into feture.feed_hide (profile_id, kind, target_id) values ($1, 'post', $2) on conflict do nothing`, [viewer.profileId, input.targetId]);
    if (input.alsoBlock && ownerProfile) await blockProfile(q, viewer, ownerProfile);
    return { reported: true };
  },
};

/** @type {Record<string, Command>} */
export const posts = Object.fromEntries(
  Object.entries(postsCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
