// @ts-check
/** Notifications from outbox events (S1 §13, extract/people-discover-chats.md §4).
 * Fan-out: an event caused by other people to a profile goes to every active member (a couple → both partners); a
 * partner's own action for the couple carries `for` and goes only to the other partner. Nothing is sent about people
 * hidden by a block, nor to the account that caused it. Items that «Нужно решить» already shows (requests, approvals,
 * applications, photo marks, couple invitations) and chat messages make no inbox row, so each counts once; push
 * delivery comes with a provider.
 * @typedef {import('./db.mjs').Db} Db @typedef {import('./db.mjs').Q} Q @typedef {import('./outbox.mjs').OutboxItem} OutboxItem
 */

/** topic → notification type, the payload key naming the actor profile, and the object. */
const TYPES = /** @type {Record<string, {type: string, actor?: string, object?: [string, string]}>} */ ({
  'like.received': { type: 'like', actor: 'from' },
  'match.created': { type: 'match', actor: 'with', object: ['conversation', 'conversationId'] },
  'follow.created': { type: 'follow', actor: 'from' },
  'reply.created': { type: 'reply', actor: 'from', object: ['post', 'postId'] },
  'reaction.created': { type: 'postLike', actor: 'from', object: ['post', 'postId'] },
  'mention.created': { type: 'mention', actor: 'from', object: ['post', 'postId'] },
  'tag.answered': { type: 'tagAnswered', object: ['post', 'postId'] },
  'post.disputed': { type: 'postDisputed', object: ['post', 'postId'] },
  'post.restored': { type: 'postRestored', object: ['post', 'postId'] },
  'dispute.resolved': { type: 'disputeResolved', object: ['post', 'postId'] },
  'revision.approved': { type: 'revisionApproved', object: ['post', 'postId'] },
  'revision.rejected': { type: 'revisionRejected', object: ['post', 'postId'] },
  'content.removed': { type: 'contentRemoved' },
  'report.resolved': { type: 'reportResolved' },
  'access.granted': { type: 'grant', actor: 'owner' },
  'community.approved': { type: 'communityApproved', object: ['community', 'communityId'] },
  'community.declined': { type: 'communityDeclined', object: ['community', 'communityId'] },
  'community.member': { type: 'communityMember', object: ['community', 'communityId'] },
  'community.published': { type: 'communityPublished', object: ['community', 'communityId'] },
  'community.rejected': { type: 'communityRejected', object: ['community', 'communityId'] },
  'discussion.removed': { type: 'discussionRemoved', object: ['post', 'postId'] },
  'event.approve': { type: 'eventPublished', object: ['event', 'eventId'] },
  'event.reject': { type: 'eventRejected', object: ['event', 'eventId'] },
  'event.hide': { type: 'eventHidden', object: ['event', 'eventId'] },
  'event.applicationApproved': { type: 'eventApplicationApproved', object: ['event', 'eventId'] },
  'event.applicationDeclined': { type: 'eventApplicationDeclined', object: ['event', 'eventId'] },
  'profile.suspended': { type: 'profileSuspended' },
  'profile.restored': { type: 'profileRestored' },
  'decide.resolved': { type: 'pair.decided', object: ['approval', 'approvalId'] },
  'couple.declined': { type: 'pair.declined', object: ['invite', 'inviteId'] },
  'couple.created': { type: 'pair.created' },
  'couple.deleted': { type: 'pair.deleted' },
  'couple.stopped': { type: 'pair.stopped' },
  'couple.restored': { type: 'pair.restored' },
  'couple.restoreRequested': { type: 'pair.restoreRequested' },
  'couple.narrowed': { type: 'pair.narrowed' },
  'couple.changed': { type: 'pair.acted' },
  'couple.approvalChanged': { type: 'pair.trust' },
});
/** Payload fields kept in `data` (codes and ids only, never free text). */
const KEEP = ['what', 'change', 'reason', 'state', 'kind', 'resolution', 'rule', 'targetType', 'targetId', 'answer', 'outcome', 'changes', 'approves'];

/** @param {any} payload */
const pick = payload => Object.fromEntries(KEEP.filter(k => payload[k] !== undefined).map(k => [k, payload[k]]));

/** Writes one notification per recipient account. @param {Q} q @param {OutboxItem} item
 * @param {{type: string, actor?: string | null, objectType?: string | null, objectId?: string | null, data?: object}} n
 * @param {{account: string, profile: string | null}[]} recipients */
async function write(q, item, n, recipients) {
  for (const r of recipients) {
    // Never to the account that caused it, never about someone hidden by a block.
    if (n.actor) {
      const [{ skip }] = await q.query(
        `select exists (select 1 from feture.profile_member where profile_id = $1 and account_id = $2 and state = 'active')
           or ($3::uuid is not null and feture.blocked($3, $1)) skip`, [n.actor, r.account, r.profile]);
      if (skip) continue;
    }
    await q.query(
      `insert into feture.notification (recipient_account_id, addressee_profile_id, type, actor_profile_id, object_type, object_id, data, source)
       values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (source, recipient_account_id) do nothing`,
      [r.account, r.profile, n.type, n.actor ?? null, n.objectType ?? null, n.objectId ?? null, JSON.stringify(n.data ?? {}), item.id]);
  }
}

/** Members of a profile, or the explicit `for` account(s). @param {Q} q @param {string | null} profileId @param {any} payload */
async function recipientsOf(q, profileId, payload) {
  if (payload.for) return [payload.for].flat().map((/** @type {string} */ a) => ({ account: a, profile: profileId }));
  if (!profileId) return [];
  const rows = await q.query(`select account_id from feture.profile_member where profile_id = $1 and state = 'active'`, [profileId]);
  return rows.map(r => ({ account: r.account_id, profile: profileId }));
}

/** People following an event: «иду»/«интересно», and applications still open (or closed by the cancel itself).
 * `admittedOnly`: the organizer's own words go only to admitted people. @param {Q} q @param {string} eventId @param {boolean} admittedOnly */
async function eventFollowers(q, eventId, admittedOnly) {
  const rows = await q.query(
    `select distinct pm.account_id, x.profile_id from (
       select r.profile_id from feture.event_rsvp r join feture.event e on e.id = r.event_id
       where r.event_id = $1 and (not $2 and r.status in ('going', 'interested') or $2 and r.status = 'going' and not e.requires_application)
       union
       select a.profile_id from feture.event_application a
       where a.event_id = $1 and (not $2 and a.state in ('pending', 'approved', 'closed') or $2 and a.state = 'approved')) x
     join feture.profile_member pm on pm.profile_id = x.profile_id and pm.state = 'active'`, [eventId, admittedOnly]);
  return rows.map(r => ({ account: r.account_id, profile: r.profile_id }));
}

/** @param {Db} db */
export function notifyHandlers(db) {
  /** @type {Record<string, (item: OutboxItem) => Promise<void>>} */
  const handlers = {};
  for (const [topic, def] of Object.entries(TYPES)) {
    handlers[topic] = async item => {
      const p = /** @type {any} */ (item.payload);
      await db.tx(async q => {
        const recipients = await recipientsOf(q, item.profile_id, p);
        await write(q, item, {
          type: def.type, actor: def.actor ? p[def.actor] ?? null : null,
          objectType: def.object?.[0] ?? null, objectId: def.object ? p[def.object[1]] ?? null : null, data: pick(p),
        }, recipients);
      });
    };
  }
  // Event updates go to the people following the event, not to the organizer the item is addressed to.
  for (const [topic, type, admittedOnly] of /** @type {const} */ ([['event.cancelled', 'eventCancelled', false], ['event.changed', 'eventChanged', false], ['event.announcement', 'eventAnnouncement', true]])) {
    handlers[topic] = async item => {
      const p = /** @type {any} */ (item.payload);
      await db.tx(async q => write(q, item, { type, actor: item.profile_id, objectType: 'event', objectId: p.eventId, data: pick(p) }, await eventFollowers(q, p.eventId, admittedOnly)));
    };
  }
  // A new article goes to the author's subscribers.
  handlers['note.published'] = async item => {
    const p = /** @type {any} */ (item.payload);
    await db.tx(async q => {
      const rows = await q.query(
        `select pm.account_id, s.subscriber_profile_id from feture.note_subscription s join feture.profile_member pm on pm.profile_id = s.subscriber_profile_id and pm.state = 'active'
         where s.author_profile_id = $1`, [item.profile_id]);
      await write(q, item, { type: 'notePublished', actor: item.profile_id, objectType: 'post', objectId: p.postId }, rows.map(r => ({ account: r.account_id, profile: r.subscriber_profile_id })));
    });
  };
  // A withdrawn like takes its notification back (V21: «они не узнают»).
  handlers['like.withdrawn'] = async item => {
    const p = /** @type {any} */ (item.payload);
    await db.query(
      `update feture.notification set retracted_at = now() where type = 'like' and addressee_profile_id = $1 and actor_profile_id = $2 and retracted_at is null`,
      [item.profile_id, p.from]);
  };
  return handlers;
}
