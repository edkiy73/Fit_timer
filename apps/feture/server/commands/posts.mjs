// @ts-check
import { postsCommands } from '../../contracts/posts.mjs';
import { fail, isUniqueViolation } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { needsPartner, registerApprovalKind, requestApproval } from '../approvals.mjs';
import { mediaDto } from '../media/assets.mjs';
import { blockProfile } from './social.mjs';
import { canWrite } from './communities.mjs';

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
    if (!al || f.audience === 'granted' || f.audience === 'only') fail(400, 'invalid_input', { fields: ['albumId'] });
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
    `select p.id from feture.profile p join feture.profile_settings s on s.profile_id = p.id
     where lower(p.handle) = any($1) and p.kind = 'person' and p.state = 'active' and p.id <> $2
       and not feture.blocked($2, p.id)
       and (s.mentions_from = 'all' or (s.mentions_from = 'follow' and exists (select 1 from feture.follow f where f.follower_profile_id = p.id and f.target_profile_id = $2)))`,
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
  if (p.type === 'note') await enqueue(q, 'note.published', p.owner_profile_id, { postId });
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
async function doEdit(q, postId, actor, rev, f) {
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
  return { state: p.state, rev: p.rev };
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
});
registerApprovalKind('post.edit', {
  apply: async (q, row) => {
    const c = /** @type {any} */ (row.change);
    await doEdit(q, String(row.target_id), { profileId: row.profile_id, accountId: row.requested_by }, c.rev, c.post);
  },
});

/** Post DTO for one viewer. @param {Q} q @param {any} p @param {Acting} viewer @param {import('../media/assets.mjs').MediaConfig} media @param {boolean} showExplicit */
async function postDto(q, p, viewer, media, showExplicit) {
  const [author] = await q.query(`select id, kind, handle, name from feture.profile where id = $1`, [p.owner_profile_id]);
  const assets = await q.query(
    `select m.* from feture.media_attachment a join feture.media_asset m on m.id = a.asset_id where a.target_type = 'post' and a.target_id = $1 order by a.position`, [p.id]);
  const place = p.own ? 'own' : PUBLIC_AUD.has(p.audience) ? 'public' : 'private';
  const mediaOut = [];
  for (const m of assets) {
    const d = await mediaDto(media, m, { viewerProfileId: viewer.profileId, place, showExplicit });
    if (d) mediaOut.push(d);
  }
  const [poll] = await q.query('select question, options from feture.poll where post_id = $1', [p.id]);
  let pollOut = null;
  if (poll) {
    const [mine] = await q.query('select option from feture.poll_vote where post_id = $1 and profile_id = $2', [p.id, viewer.profileId]);
    // Results only after one's own vote (V21 pollHTML).
    const counts = mine || p.own ? (await q.query('select option, count(*)::int n from feture.poll_vote where post_id = $1 group by option', [p.id])) : null;
    pollOut = { question: poll.question, options: poll.options, myVote: mine?.option ?? null, results: counts && poll.options.map((/** @type {string} */ _, /** @type {number} */ i) => counts.find(c => c.option === i)?.n ?? 0) };
  }
  const [c] = await q.query(
    `select (select count(*)::int from feture.reaction where target_type = 'post' and target_id = $1) likes,
            exists (select 1 from feture.reaction where target_type = 'post' and target_id = $1 and profile_id = $2) liked,
            (select count(*)::int from feture.reply r where r.post_id = $1 and r.state = 'published' and not feture.blocked($2, r.author_profile_id)) replies,
            exists (select 1 from feture.saved_item where profile_id = $2 and kind = 'post' and target_id = $1::text) saved`, [p.id, viewer.profileId]);
  const tags = await q.query(
    `select p.id, p.handle, p.name, t.state from feture.photo_tag t join feture.profile p on p.id = t.profile_id
     where t.post_id = $1 and ($2 or t.state = 'ok' or t.profile_id = $3) and not feture.blocked($3, p.id)`, [p.id, p.own, viewer.profileId]);
  return {
    id: p.id, type: p.type, title: p.title, body: p.body, audience: p.own ? p.audience : (p.audience === 'all' ? undefined : p.audience),
    topics: p.topics, interests: p.interests, author, media: mediaOut, poll: pollOut, tags,
    likes: c.likes, liked: c.liked, replies: c.replies, saved: c.saved,
    publishedAt: p.published_at, editedAt: p.edited_at,
    ...(p.own ? { state: p.state, rev: p.rev, inFeed: p.in_feed, returned: p.removed_reason } : {}),
  };
}

/** Opaque keyset cursor over (published_at, id). @param {string | undefined} c */
function readCursor(c) {
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
    const acting = need(a);
    const [p] = await q.query(`select * from feture.post where id = $1 and owner_profile_id = $2`, [input.postId, acting.profileId]);
    if (!p) fail(404, 'not_found');
    // Only narrowing the audience, with nothing else changed, skips the partner of a couple post.
    const f = input.post;
    const media = (await q.query(`select asset_id from feture.media_attachment where target_type = 'post' and target_id = $1 order by position`, [input.postId])).map(r => r.asset_id);
    const onlyNarrowing = AUD.indexOf(f.audience) < AUD.indexOf(p.audience) && f.type === p.type && (f.title ?? null) === p.title && f.body === p.body
      && f.inFeed === p.in_feed && JSON.stringify(f.topics) === JSON.stringify(p.topics) && JSON.stringify(f.mediaIds) === JSON.stringify(media)
      && !f.poll && !f.tags.length && !f.interests.length;
    if (p.state !== 'draft' && needsPartner(acting, 'post.edit') && !onlyNarrowing) {
      return { pending: await requestApproval(q, acting, { kind: 'post.edit', targetType: 'post', targetId: input.postId, change: { rev: input.rev, post: input.post }, summary: ['post'] }) };
    }
    return doEdit(q, input.postId, acting, input.rev, input.post);
  },

  async 'post.delete'(q, { acting: a, input }) {
    const acting = need(a);
    const [p] = await q.query(`select state from feture.post where id = $1 and owner_profile_id = $2 for update`, [input.postId, acting.profileId]);
    if (!p) fail(404, 'not_found');
    await q.query(`update feture.partner_approval set state = 'cancelled', decided_at = now() where target_type = 'post' and target_id = $1 and state = 'pending'`, [input.postId]);
    // A post removed by moderation or under open reports is only hidden, so the evidence stays for staff (S4 §3).
    const [{ reported }] = await q.query(`select exists (select 1 from feture.report where target_type = 'post' and target_id = $1 and state = 'open') reported`, [input.postId]);
    if (acting.kind === 'couple' || p.state === 'removed' || reported) {
      // A couple's post is hidden into the couple's archive, not destroyed by one partner (V21 «Скрыть совместную»).
      await q.query(`update feture.post set state = 'archived', updated_at = now() where id = $1`, [input.postId]);
      if (acting.kind === 'couple') await enqueue(q, 'couple.changed', acting.profileId, { for: acting.partnerAccountId, what: 'post_archived' });
      return { state: 'archived' };
    }
    await q.query(`delete from feture.media_attachment where target_type = 'post' and target_id = $1`, [input.postId]);
    await q.query(`delete from feture.reaction where target_type = 'reply' and target_id in (select id from feture.reply where post_id = $1)`, [input.postId]);
    await q.query(`delete from feture.reaction where target_type = 'post' and target_id = $1`, [input.postId]);
    await q.query(`delete from feture.post where id = $1`, [input.postId]);
    return { state: 'deleted' };
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
    const rows = await q.query(
      `select p.*, false own from feture.post p
       where p.state = 'published' and p.in_feed and p.community_id is null and feture.post_visible(p, $1, $2)
         and not exists (select 1 from feture.feed_hide h where h.profile_id = $1 and ((h.kind = 'post' and h.target_id = p.id) or (h.kind = 'author' and h.target_id = p.owner_profile_id)))
         and ($3::text[] is null or p.topics && $3)
         and ($4 = 'forYou' or p.owner_profile_id = $1
              or exists (select 1 from feture.follow f where f.follower_profile_id = $1 and f.target_profile_id = p.owner_profile_id)
              or (p.type = 'note' and exists (select 1 from feture.note_subscription n where n.subscriber_profile_id = $1 and n.author_profile_id = p.owner_profile_id)))
         and ($5::timestamptz is null or (p.published_at, p.id) < ($5::timestamptz, $6::uuid))
       order by p.published_at desc, p.id desc limit $7`,
      [viewer.profileId, viewer.accountId, input.topics?.length ? input.topics : null, input.tab, cur?.at ?? null, cur?.id ?? null, input.limit + 1]);
    const [acc] = await q.query('select show_explicit from feture.account where id = $1', [account.id]);
    const page = rows.slice(0, input.limit);
    const items = [];
    for (const p of page) items.push(await postDto(q, { ...p, own: p.owner_profile_id === viewer.profileId }, viewer, cfg.media, !!acc.show_explicit));
    const last = page[page.length - 1];
    return { items, next: rows.length > input.limit ? Buffer.from(JSON.stringify([new Date(last.published_at).toISOString(), last.id])).toString('base64url') : null };
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
    const items = [];
    for (const p of page) items.push(await postDto(q, p, viewer, cfg.media, !!acc.show_explicit));
    const last = page[page.length - 1];
    return { items, next: rows.length > 20 ? Buffer.from(JSON.stringify([new Date(last.published_at).toISOString(), last.id])).toString('base64url') : null };
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
    for (const p of rows) items.push(await postDto(q, p, viewer, cfg.media, !!acc.show_explicit));
    return { items, revisions };
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

  async 'post.replies'(q, { acting: a, input }) {
    const viewer = need(a);
    await visiblePost(q, input.postId, viewer);
    const rows = await q.query(
      `select r.id, r.parent_id, r.state, r.body, r.created_at, r.edited_at, r.rev, r.author_profile_id = $2 mine,
         feture.blocked($2, r.author_profile_id) hidden,
         (select json_build_object('id', p.id, 'kind', p.kind, 'handle', p.handle, 'name', p.name) from feture.profile p where p.id = r.author_profile_id and p.state = 'active') author,
         (select count(*)::int from feture.reaction x where x.target_type = 'reply' and x.target_id = r.id) likes,
         exists (select 1 from feture.reply c where c.parent_id = r.id and c.state = 'published') has_replies
       from feture.reply r where r.post_id = $1 and r.state <> 'removed' order by r.created_at`, [input.postId, viewer.profileId]);
    // Deleted without live replies disappear; with replies they stay as a stub; blocked authors show as hidden.
    const items = rows.filter(r => r.state === 'published' || r.has_replies).map(r => ({
      id: r.id, parentId: r.parent_id, createdAt: r.created_at, editedAt: r.edited_at, likes: r.likes,
      ...(r.state === 'deleted' ? { deleted: true } : r.hidden ? { hidden: true } : { body: r.body, author: r.author, mine: r.mine, rev: r.mine ? r.rev : undefined }),
    }));
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
    await enqueue(q, 'tag.answered', t.owner_profile_id, { postId: input.postId, answer: input.answer });
    return { answer: input.answer };
  },

  async 'tag.object'(q, { acting: a, input }) {
    const viewer = need(a);
    const p = await visiblePost(q, input.postId, viewer);
    if (p.own) fail(422, 'rule_violation', { rule: 'own_post' });
    // «Это я на фото» only makes sense where there are photos; text posts go through reports.
    const [{ n }] = await q.query(`select count(*)::int n from feture.media_attachment where target_type = 'post' and target_id = $1`, [input.postId]);
    if (!n) fail(422, 'rule_violation', { rule: 'no_photos' });
    const [t] = await q.query('select state from feture.photo_tag where post_id = $1 and profile_id = $2', [input.postId, viewer.profileId]);
    if (t) {
      await q.query(`update feture.photo_tag set state = 'no', decided_at = now() where post_id = $1 and profile_id = $2`, [input.postId, viewer.profileId]);
    } else {
      // «Это я на фото — против публикации»: hidden for everyone at once until staff decide; the objector is not named.
      await q.query(`update feture.post set disputed_at = coalesce(disputed_at, now()), disputed_by = coalesce(disputed_by, $2) where id = $1`, [input.postId, viewer.profileId]);
      await enqueue(q, 'moderation.dispute', p.owner_profile_id, { postId: input.postId, by: viewer.profileId });
    }
    await enqueue(q, 'post.disputed', p.owner_profile_id, { postId: input.postId });
    return { hidden: true };
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
    if (ownerProfile === viewer.profileId) fail(422, 'rule_violation', { rule: 'own_content' });
    try {
      const [r] = await q.query(
        `insert into feture.report (reporter_profile_id, reporter_account, target_type, target_id, target_rev, reason, details, snapshot)
         values ($1, $2, $3, $4, $5, $6, $7,
           case $3 when 'post' then (select jsonb_build_object('title', title, 'body', body, 'audience', audience) from feture.post where id = $4)
                   when 'reply' then (select jsonb_build_object('body', body) from feture.reply where id = $4)
                   else (select jsonb_build_object('name', p.name, 'handle', p.handle, 'bio', d.bio) from feture.profile p left join feture.profile_details d on d.profile_id = p.id where p.id = $4) end)
         returning id`,
        [viewer.profileId, account.id, input.targetType, input.targetId, rev, input.reason, input.details]);
      await enqueue(q, 'moderation.report', ownerProfile, { reportId: r.id, reason: input.reason });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error; // one open report per target: repeating it is a no-op
    }
    // The reporter stops seeing what they reported (V21 rpSend); blocking is optional.
    if (input.targetType === 'post') await q.query(`insert into feture.feed_hide (profile_id, kind, target_id) values ($1, 'post', $2) on conflict do nothing`, [viewer.profileId, input.targetId]);
    if (input.alsoBlock && ownerProfile) await blockProfile(q, viewer, ownerProfile);
    return { reported: true };
  },
};

/** @type {Record<string, Command>} */
export const posts = Object.fromEntries(
  Object.entries(postsCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
