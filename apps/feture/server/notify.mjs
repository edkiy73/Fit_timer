// @ts-check
/** Notifications from outbox events (S1 §13, extract/people-discover-chats.md §4).
 * Fan-out: an event caused by other people to a profile goes to every active member (a couple → both partners); a
 * partner's own action for the couple carries `for` and goes only to the other partner. Nothing is sent about people
 * hidden by a block, nor to the account that caused it. Items that «Нужно решить» already shows (requests, approvals,
 * applications, photo marks, couple invitations) and chat messages make no inbox row, so each counts once; push
 * delivery comes with a provider.
 * @typedef {import('./db.mjs').Db} Db @typedef {import('./db.mjs').Q} Q @typedef {import('./outbox.mjs').OutboxItem} OutboxItem
 * @typedef {import('./realtime.mjs').Signal} Signal
 */

import { pushKind, queuePush } from './push.mjs';

/** topic → notification type, the payload key naming the actor profile, and the object. */
const TYPES = /** @type {Record<string, {type: string, actor?: string, object?: [string, string]}>} */ ({
  'like.received': { type: 'like', actor: 'from' },
  'match.created': { type: 'match', actor: 'with', object: ['conversation', 'conversationId'] },
  // A message request (owner 29.10.2026): an inbox row and a push; a hide takes it back (chat.requestAnswer).
  'chat.requested': { type: 'chatRequest', actor: 'from', object: ['conversation', 'conversationId'] },
  'follow.created': { type: 'follow', actor: 'from' },
  'reply.created': { type: 'reply', actor: 'from', object: ['post', 'postId'] },
  'reaction.created': { type: 'postLike', actor: 'from', object: ['post', 'postId'] },
  'mention.created': { type: 'mention', actor: 'from', object: ['post', 'postId'] },
  'mention.removed': { type: 'mentionRemoved', actor: 'from', object: ['post', 'postId'] },
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
  'verification.decided': { type: 'ageCheck' },
  'verification.photoDecided': { type: 'photoCheck' },
  'profile.restricted': { type: 'profileRestricted' },
  'profile.unrestricted': { type: 'profileUnrestricted' },
  'appeal.decided': { type: 'appealDecided' },
  'link.accepted': { type: 'linkAccepted', actor: 'from' },
  'link.declined': { type: 'linkDeclined', actor: 'from' },
  'link.changed': { type: 'linkChanged', actor: 'from' },
  'link.removed': { type: 'linkRemoved', actor: 'from' },
  'dating.launched': { type: 'datingLaunched' },
  'support.replied': { type: 'supportReply' },
  'premium.gifted': { type: 'premiumGift', actor: 'from' },
});
/** Payload fields kept in `data` (codes and ids only, never free text). */
const KEEP = ['what', 'change', 'reason', 'state', 'kind', 'resolution', 'rule', 'targetType', 'targetId', 'answer', 'outcome', 'changes', 'approves', 'ticketId', 'days'];

/** @param {any} payload */
const pick = payload => Object.fromEntries(KEEP.filter(k => payload[k] !== undefined).map(k => [k, payload[k]]));

/** The realtime channel for a recipient: its profile, or for an item addressed to the account (a couple invite) the
 * account's own person profile — an empty profile reached nobody, so the screen kept its cached list.
 * @param {Q} q @param {{account: string, profile: string | null}} r @returns {Promise<string | null>} */
async function signalTo(q, r) {
  if (r.profile) return r.profile;
  const [a] = await q.query('select person_profile_id from feture.account where id = $1', [r.account]);
  return a?.person_profile_id ?? null;
}

/** Writes one notification per recipient account. @param {Q} q @param {OutboxItem} item
 * @param {{type: string, actor?: string | null, objectType?: string | null, objectId?: string | null, data?: object}} n
 * @param {{account: string, profile: string | null}[]} recipients @param {Signal[]} out realtime signals, sent after commit */
async function write(q, item, n, recipients, out) {
  const by = /** @type {any} */ (item.payload).by;
  // Nothing about someone who is gone or no longer active: nobody would see it.
  if (n.actor && !(await q.query(`select 1 from feture.profile where id = $1 and state = 'active'`, [n.actor]))[0]) return;
  for (const r of recipients) {
    if (by && r.account === by) continue; // never to the account that caused it
    if (n.objectType === 'post' && n.objectId && r.profile) {
      // A post the recipient may not see is not announced either.
      const [v] = await q.query('select feture.post_visible(p, $2, $3) ok from feture.post p where p.id = $1', [n.objectId, r.profile, r.account]);
      if (!v?.ok) continue;
    }
    // Never to the account that caused it, never about someone hidden by a block.
    if (n.actor) {
      const [{ skip }] = await q.query(
        `select exists (select 1 from feture.profile_member where profile_id = $1 and account_id = $2 and state = 'active')
           or ($3::uuid is not null and feture.blocked($3, $1)) skip`, [n.actor, r.account, r.profile]);
      if (skip) continue;
    }
    const added = await q.query(
      `insert into feture.notification (recipient_account_id, addressee_profile_id, type, actor_profile_id, object_type, object_id, data, source)
       values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (source, recipient_account_id) do nothing returning id`,
      [r.account, r.profile, n.type, n.actor ?? null, n.objectType ?? null, n.objectId ?? null, JSON.stringify(n.data ?? {}), item.id]);
    if (added[0]) {
      await queuePush(q, item, r, pushKind(n.type), added[0].id);
      const to = await signalTo(q, r); if (to) out.push({ profile: to, kind: 'notify' });
    }
  }
}

/** Members of a profile, or the explicit `for` account(s). @param {Q} q @param {string | null} profileId @param {any} payload */
async function recipientsOf(q, profileId, payload) {
  if ('for' in payload) {
    const accounts = (await q.query(`select id from feture.account where id = any($1) and state = 'active'`, [[payload.for].flat().filter(Boolean)])).map(r => r.id);
    if (!profileId) return accounts.map((/** @type {string} */ a) => ({ account: a, profile: null }));
    // Only while still a member of the profile it is addressed to (an ex-partner gets nothing).
    const rows = await q.query(`select account_id from feture.profile_member where profile_id = $1 and account_id = any($2) and state = 'active'`, [profileId, accounts]);
    return rows.map(r => ({ account: r.account_id, profile: profileId }));
  }
  if (!profileId) return [];
  const rows = await q.query(`select account_id from feture.profile_member where profile_id = $1 and state = 'active'`, [profileId]);
  return rows.map(r => ({ account: r.account_id, profile: profileId }));
}

/** People following an event: «иду»/«интересно», and applications still open (or closed by the cancel itself).
 * `admittedOnly`: the organizer's own words go only to admitted people. `saved`: also those who saved it and did not
 * answer «Не иду» — a cancel reaches everyone who still sees the cancelled event (sql-rules.mjs cancelledFor).
 * @param {Q} q @param {string} eventId @param {boolean} admittedOnly @param {boolean} [saved] */
async function eventFollowers(q, eventId, admittedOnly, saved = false) {
  const rows = await q.query(
    `select distinct pm.account_id, x.profile_id from (
       select r.profile_id from feture.event_rsvp r join feture.event e on e.id = r.event_id
       where r.event_id = $1 and (not $2 and r.status in ('going', 'interested') or $2 and r.status = 'going' and not e.requires_application)
       union
       select a.profile_id from feture.event_application a
       where a.event_id = $1 and (not $2 and a.state in ('pending', 'approved', 'closed') or $2 and a.state = 'approved')
       union
       select s.profile_id from feture.saved_item s
       where $3 and s.kind = 'event' and s.target_id = $1::text
         and not exists (select 1 from feture.event_rsvp r where r.event_id = $1 and r.profile_id = s.profile_id and r.status = 'not_going')) x
     join feture.profile_member pm on pm.profile_id = x.profile_id and pm.state = 'active'`, [eventId, admittedOnly, saved]);
  return rows.map(r => ({ account: r.account_id, profile: r.profile_id }));
}

/** @param {Db} db @param {(s: Signal) => void} [emit] realtime signals of committed items (S2 §8), sent by the worker */
export function notifyHandlers(db, emit = () => {}) {
  /** A transaction whose realtime signals are emitted only once it committed.
   * @param {(q: Q, out: Signal[]) => Promise<void>} fn */
  const tx = async fn => {
    /** @type {Signal[]} */
    const out = [];
    await db.tx(q => fn(q, out));
    for (const x of out) if (x.profile) emit(x);
  };
  /** @type {Record<string, (item: OutboxItem) => Promise<void>>} */
  const handlers = {};
  for (const [topic, def] of Object.entries(TYPES)) {
    handlers[topic] = async item => {
      const p = /** @type {any} */ (item.payload);
      await tx(async (q, out) => {
        const recipients = await recipientsOf(q, item.profile_id, p);
        await write(q, item, {
          type: def.type, actor: def.actor ? p[def.actor] ?? null : null,
          objectType: def.object?.[0] ?? null, objectId: def.object ? p[def.object[1]] ?? null : null, data: pick(p),
        }, recipients, out);
      });
    };
  }
  // Event updates go to the people following the event, not to the organizer the item is addressed to.
  for (const [topic, type, admittedOnly] of /** @type {const} */ ([['event.cancelled', 'eventCancelled', false], ['event.changed', 'eventChanged', false],
    ['event.announcement', 'eventAnnouncement', true], ['event.reminder', 'eventReminder', true]])) {
    handlers[topic] = async item => {
      const p = /** @type {any} */ (item.payload);
      if (topic === 'event.reminder') {
        // Only for an event still going ahead at that time.
        const [e] = await db.query(`select 1 from feture.event where id = $1 and state = 'published' and starts_at > now()`, [p.eventId]);
        if (!e) return;
      }
      // An event cancelled because its organizer deleted the account names nobody.
      await tx(async (q, out) => write(q, item, { type, actor: p.organizerGone ? null : item.profile_id, objectType: 'event', objectId: p.eventId, data: pick(p) }, await eventFollowers(q, p.eventId, admittedOnly, topic === 'event.cancelled'), out));
    };
  }
  // A community closed because its owner deleted the account: members are told, nobody is named.
  handlers['community.closed'] = async item => {
    const p = /** @type {any} */ (item.payload);
    await tx(async (q, out) => {
      const rows = await q.query(
        `select pm.account_id, cm.profile_id from feture.community_member cm join feture.profile_member pm on pm.profile_id = cm.profile_id and pm.state = 'active'
         where cm.community_id = $1 and cm.state = 'active' and cm.profile_id <> $2`, [p.communityId, item.profile_id]);
      await write(q, item, { type: 'communityClosed', actor: null, objectType: 'community', objectId: p.communityId }, rows.map(r => ({ account: r.account_id, profile: r.profile_id })), out);
    });
  };
  // Chat messages make no inbox row, only a push to the members who did not mute the conversation.
  handlers['message.created'] = async item => {
    await db.tx(async q => {
      for (const r of await recipientsOf(q, item.profile_id, item.payload)) await queuePush(q, item, r, 'messages');
    });
  };
  // Things to decide are in «Нужно решить», not in the inbox; the recipients get a push.
  for (const topic of ['decide.created', 'access.requested', 'community.requested', 'event.applied', 'couple.invited', 'tag.requested']) {
    handlers[topic] = async item => {
      await tx(async (q, out) => {
        for (const r of await recipientsOf(q, item.profile_id, item.payload)) {
          const by = /** @type {any} */ (item.payload).from;
          if (by && (await q.query(`select feture.blocked($1, $2) b`, [r.profile ?? by, by]))[0].b) continue;
          await queuePush(q, item, r, 'decide');
          const to = await signalTo(q, r); if (to) out.push({ profile: to, kind: 'decide' });
        }
      });
    };
  }
  // A like is announced only while it still stands (a retried item must not bring back a withdrawn one).
  const plain = handlers['like.received'];
  handlers['like.received'] = async item => {
    const [l] = await db.query(`select 1 from feture.profile_like where from_profile_id = $1 and to_profile_id = $2 and state in ('active', 'matched')`,
      [/** @type {any} */ (item.payload).from, item.profile_id]);
    if (l) await plain(item);
  };
  // A returned approval is already in «Нужно решить» of the one who asked; only other outcomes are news.
  const decided = handlers['decide.resolved'];
  handlers['decide.resolved'] = async item => { if (/** @type {any} */ (item.payload).state !== 'returned') await decided(item); };
  // A withdrawn like takes its notification back (V21: «они не узнают»).
  handlers['like.withdrawn'] = async item => {
    const p = /** @type {any} */ (item.payload);
    const gone = await db.query(
      `update feture.notification set retracted_at = now() where type = 'like' and addressee_profile_id = $1 and actor_profile_id = $2 and retracted_at is null returning id`,
      [item.profile_id, p.from]);
    if (gone.length && item.profile_id) emit({ profile: item.profile_id, kind: 'notify' });
  };
  return handlers;
}
