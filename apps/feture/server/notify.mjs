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

import { CATALOG, destination, noteKey, pushUrl } from '../contracts/notifications.mjs';
import { queuePush } from './push.mjs';
import { queueEmail } from './email.mjs';

/** topic → notification type, the payload key naming the actor profile, and the object. */
const TYPES = /** @type {Record<string, {type: string, actor?: string, object?: [string, string]}>} */ ({
  'like.received': { type: 'like', actor: 'from' },
  'match.created': { type: 'match', actor: 'with', object: ['conversation', 'conversationId'] },
  // A message request (owner 29.10.2026): an inbox row and a push; a hide takes it back (chat.requestAnswer).
  'chat.requested': { type: 'chatRequest', actor: 'from', object: ['conversation', 'conversationId'] },
  // The request was accepted (owner decision 7, 03.11.2026): its sender is told and the row opens the chat.
  'chat.accepted': { type: 'chatAccepted', actor: 'from', object: ['conversation', 'conversationId'] },
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
  // Its time passed while it waited for staff: it is a draft again (audit item 32). The event row is gone; the draft opens.
  'event.lateDraft': { type: 'eventLate' },
  'event.hide': { type: 'eventHidden', object: ['event', 'eventId'] },
  'community.ownerChanged': { type: 'communityOwner', object: ['community', 'communityId'] },
  'event.applicationApproved': { type: 'eventApplicationApproved', object: ['event', 'eventId'] },
  // The partner marked the couple while this person is marked alone (audit item 56): they decide (В11).
  'event.pairGoing': { type: 'eventPairGoing', actor: 'from', object: ['event', 'eventId'] },
  'event.applicationDeclined': { type: 'eventApplicationDeclined', object: ['event', 'eventId'] },
  'profile.suspended': { type: 'profileSuspended' },
  'profile.restored': { type: 'profileRestored' },
  'decide.resolved': { type: 'pair.decided', object: ['approval', 'approvalId'] },
  'couple.declined': { type: 'pair.declined', object: ['invite', 'inviteId'] },
  // An invitation nobody answered in time (couples.mjs expireInvites): the inviter is told.
  'couple.inviteExpired': { type: 'pair.inviteExpired', object: ['invite', 'inviteId'] },
  'couple.created': { type: 'pair.created' },
  'couple.deleted': { type: 'pair.deleted' },
  'couple.stopped': { type: 'pair.stopped' },
  'couple.unavailable': { type: 'pair.unavailable' },
  'couple.restored': { type: 'pair.restored' },
  'couple.restoreRequested': { type: 'pair.restoreRequested' },
  'couple.narrowed': { type: 'pair.narrowed' },
  'couple.changed': { type: 'pair.acted' },
  'couple.approvalChanged': { type: 'pair.trust' },
  // Staff decisions that used to say nothing (audit 30.10): a city proposal, a Premium grant / withdrawal, a staff role.
  'place.decided': { type: 'placeDecided' },
  'premium.granted': { type: 'premiumGranted' },
  'premium.revoked': { type: 'premiumRevoked' },
  'staff.role': { type: 'staffRole' },
  'verification.decided': { type: 'ageCheck' },
  'verification.photoDecided': { type: 'photoCheck' },
  'profile.restricted': { type: 'profileRestricted' },
  'profile.unrestricted': { type: 'profileUnrestricted' },
  'appeal.decided': { type: 'appealDecided' },
  'link.accepted': { type: 'linkAccepted', actor: 'from', object: ['link', 'linkId'] },
  'link.declined': { type: 'linkDeclined', actor: 'from', object: ['link', 'linkId'] },
  'link.changed': { type: 'linkChanged', actor: 'from', object: ['link', 'linkId'] },
  'link.removed': { type: 'linkRemoved', actor: 'from' },
  'dating.launched': { type: 'datingLaunched' },
  'support.replied': { type: 'supportReply' },
  // Closed by support without an answer: «Обращение закрыто».
  'support.closed': { type: 'supportClosed' },
  'premium.gifted': { type: 'premiumGift', actor: 'from' },
  // A sign-in from a new device (server/signin.mjs): to the account, always (no setting turns it off); opens «Мои устройства».
  'signin.new': { type: 'signinNew' },
});

/** Topics that are only history or staff markers: the worker marks them done without telling anyone, and the 7-day
 * sweep removes them (some «told already today» checks read the outbox). Every enqueued topic is either handled or
 * listed here (tests/fe-notify-topics-postgres.mjs).
 * - `access.revoked`, `access.declined`, `match.ended`: silent by owner decision (the other side is not told).
 *   `access.declined` waits out the undo window first (its `available_at`), so an undo still finds it undelivered.
 * - `moderation.*`: staff queues read their own tables (reports, revisions, checks, appeals); nobody reads the marker.
 *   A CSAM case alerts owner and lead through its own `staff.alert` (jobs.mjs `safety.csamMatch`). */
export const SILENT_TOPICS = Object.freeze(['access.revoked', 'access.declined', 'match.ended',
  'moderation.ageCheck', 'moderation.appeal', 'moderation.community', 'moderation.csamCase', 'moderation.event',
  'moderation.mediaReview', 'moderation.photoCheck', 'moderation.postRevision', 'moderation.report']);
/** Payload fields kept in `data` (codes and ids only, never free text; `device` / `place` of a new sign-in are Core's
 * device family and the edge network's «city|CC», never anything a person typed). `postId`, `replyId`, `communityId`:
 * what the destination resolver needs (a reply to highlight, the community of a removed discussion). */
const KEEP = ['why', 'scope', 'device', 'place', 'what', 'change', 'reason', 'state', 'kind', 'resolution', 'rule', 'targetType', 'targetId', 'answer', 'outcome', 'changes', 'approves', 'ticketId', 'days', 'until', 'target', 'purpose', 'count', 'role', 'grant',
  'postId', 'replyId', 'communityId', 'eventId', 'draftId'];
/** Results of a decision about the person's own report, claim or material (moderation, hosts): they reach the person even
 * when the material is gone or hidden since — the right to hear one's own decision is not the right to open the
 * material. The row keeps only the safe result (codes, ids); the inbox opens the object only while it is still
 * accessible (inbox.mjs NOTE_ROWS `visible`, «Больше недоступно» otherwise). */
const OWN_DECISIONS = new Set(['disputeResolved', 'postRestored', 'postDisputed', 'revisionApproved', 'revisionRejected', 'contentRemoved',
  'reportResolved', 'discussionRemoved', 'tagAnswered', 'mediaDecided']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The collapse key of a row by its catalog rule: one per type, per object or per actor (null: never collapsed).
 * @param {string | null} key @param {{objectId?: string | null, actor?: string | null}} n */
function collapseKey(key, n) {
  const rule = key ? CATALOG[key].collapse : 'none';
  if (rule === 'type') return key;
  if (rule === 'object') return n.objectId ? `${key}:${n.objectId}` : null;
  if (rule === 'actor') return n.actor ? `${key}:${n.actor}` : null;
  return null;
}
/** @param {{name?: string | null, handle?: string | null} | null} p */
const shownName = p => (p ? p.name || (p.handle ? '@' + p.handle : null) : null);

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

/** Writes one notification per recipient account, shaped by the catalog (contracts/notifications.mjs): its record kind,
 * the nested object (a reply), the couple it is addressed to with the couple's and the actor's names as they are now
 * (an old row keeps them after a rename, a pause or a break-up), its collapse key; and queues the push with the route
 * the destination resolver chose. @param {Q} q @param {OutboxItem} item
 * @param {{type: string, actor?: string | null, objectType?: string | null, objectId?: string | null, data?: Record<string, any>, couple?: string | null}} n
 * @param {{account: string, profile: string | null}[]} recipients @param {Signal[]} out realtime signals, sent after commit */
async function write(q, item, n, recipients, out) {
  const by = /** @type {any} */ (item.payload).by;
  /** @type {Map<string, any>} */
  const seen = new Map();
  const profile = async (/** @type {string | null | undefined} */ id) => {
    if (!id) return null;
    if (!seen.has(id)) seen.set(id, (await q.query(`select id, kind, name, handle, state from feture.profile where id = $1`, [id]))[0] ?? null);
    return seen.get(id);
  };
  const actor = await profile(n.actor);
  // Nothing about someone who is gone or no longer active: nobody would see it.
  if (n.actor && actor?.state !== 'active') return;
  const data = n.data ?? {};
  const key = noteKey(n.type, data);
  const sub = typeof data.replyId === 'string' && UUID.test(data.replyId) ? { type: 'reply', id: data.replyId } : null;
  for (const r of recipients) {
    if (by && r.account === by) continue; // never to the account that caused it
    if (n.objectType === 'post' && n.objectId && r.profile && !OWN_DECISIONS.has(n.type)) {
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
    const addressee = await profile(r.profile);
    const couple = addressee?.kind === 'couple' ? addressee : n.couple ? await profile(n.couple) : null;
    const added = await q.query(
      `insert into feture.notification (recipient_account_id, addressee_profile_id, type, actor_profile_id, object_type, object_id, data, source,
         kind, sub_object_type, sub_object_id, couple_id, actor_name, couple_name, collapse_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) on conflict (source, recipient_account_id) do nothing returning id`,
      [r.account, r.profile, n.type, n.actor ?? null, n.objectType ?? null, n.objectId ?? null, JSON.stringify(data), item.id,
        key ? CATALOG[key].kind : 'notice', sub?.type ?? null, sub?.id ?? null, couple?.id ?? null, shownName(actor), shownName(couple), collapseKey(key, n)]);
    if (added[0]) {
      const route = destination({ type: n.type, id: added[0].id, data, object: n.objectType ? { type: n.objectType, id: n.objectId ?? null } : null, sub,
        actor: n.actor ?? null, addressee: r.profile, couple: couple?.id ?? null });
      // History only (the catalog's `push.off`: a partner's everyday action in trust mode, a daily summary): no push.
      if (!(key && CATALOG[key].push.off)) await queuePush(q, item, r, key ? CATALOG[key].push.cat : 'other', added[0].id, undefined, { key, url: pushUrl(route) });
      // Its email by the catalog's mode (server/email.mjs); a new sign-in is mailed at once by server/signin.mjs.
      if (key && key !== 'signinNew') await queueEmail(q, { account: r.account, ref: `n:${added[0].id}`, mode: CATALOG[key].email, url: pushUrl(route),
        object: n.objectType && n.objectId ? `${n.type}:${n.objectType}:${n.objectId}` : null });
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
async function eventFollowers(q, eventId, admittedOnly, saved = false, seeing = false) {
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
     join feture.profile_member pm on pm.profile_id = x.profile_id and pm.state = 'active'
     where not $4 or exists (select 1 from feture.event e where e.id = $1 and feture.event_visible(e, x.profile_id, pm.account_id))`, [eventId, admittedOnly, saved, seeing]);
  return rows.map(r => ({ account: r.account_id, profile: r.profile_id }));
}

/** The «Нужно решить» kind each decision topic makes (server/commands/inbox.mjs decisions()), and its object. */
const DECIDE_OF = /** @type {Record<string, string>} */ ({
  'decide.created': 'joint', 'access.requested': 'req', 'community.requested': 'capp',
  'event.applied': 'eapp', 'couple.invited': 'pinv', 'tag.requested': 'tag', 'link.proposed': 'link', 'link.changeProposed': 'linkChange',
});
const DECIDE_OBJECT = /** @type {Record<string, (p: any) => {type: string, id: string} | null>} */ ({
  'decide.created': p => ({ type: 'approval', id: p.approvalId }),
  'community.requested': p => ({ type: 'community', id: p.communityId }), 'event.applied': p => ({ type: 'event', id: p.eventId }),
  'tag.requested': p => ({ type: 'post', id: p.postId }),
  'access.requested': p => ({ type: 'accessRequest', id: p.requestId }), 'couple.invited': p => ({ type: 'invite', id: p.inviteId }),
  'link.proposed': p => ({ type: 'link', id: p.linkId }), 'link.changeProposed': p => ({ type: 'link', id: p.linkId }),
});

/** The id of the «Нужно решить» item each decision topic makes (server/commands/inbox.mjs decisions() `id`). */
const DECIDE_ID = /** @type {Record<string, (p: any) => unknown>} */ ({
  'decide.created': p => p.approvalId, 'access.requested': p => p.requestId, 'community.requested': p => p.requestId,
  'event.applied': p => p.applicationId, 'couple.invited': p => p.inviteId, 'tag.requested': p => p.postId,
  'link.proposed': p => p.linkId, 'link.changeProposed': p => p.linkId,
});

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
          // A deleted couple is named by the payload: the item is addressed to the account, the couple is gone.
          couple: def.type === 'pair.deleted' && typeof p.profileId === 'string' ? p.profileId : null,
        }, recipients, out);
      });
    };
  }
  // A photo, clip or voice message decided by staff: the owner is told once per batch — decisions on the same kind of
  // file with the same outcome within 15 minutes (the six photos of one post) are one row that counts them.
  handlers['media.decided'] = async item => {
    const p = /** @type {any} */ (item.payload);
    await tx(async (q, out) => {
      // What it belongs to, so the row opens it: a post, a community or event cover, the chat the file was sent in.
      const [at] = await q.query(`select target_type, target_id from feture.media_attachment where asset_id = $1 order by created_at limit 1`, [p.assetId]);
      /** @type {[string, string] | null} */
      let object = null;
      if (at && ['post', 'community', 'event'].includes(at.target_type)) object = [at.target_type, at.target_id];
      else if (at?.target_type === 'message') {
        const [m] = await q.query(`select conversation_id from feture.message where id = $1`, [at.target_id]);
        if (m) object = ['conversation', m.conversation_id];
      }
      for (const r of await recipientsOf(q, item.profile_id, p)) {
        const [prev] = await q.query(
          `select id from feture.notification
           where recipient_account_id = $1 and type = 'mediaDecided' and retracted_at is null and read_at is null
             and created_at > now() - interval '15 minutes' and data->>'purpose' = $2 and data->>'state' = $3
             and coalesce(data->>'reason', '') = $4 and coalesce(data->>'kind', '') = $5
             and object_id is not distinct from $6::uuid and addressee_profile_id is not distinct from $7::uuid
           order by created_at desc limit 1`,
          [r.account, p.purpose, p.state, p.reason ?? '', p.kind ?? '', object?.[1] ?? null, r.profile]);
        if (prev) {
          await q.query(`update feture.notification set data = jsonb_set(data, '{count}', to_jsonb(coalesce((data->>'count')::int, 1) + 1)) where id = $1`, [prev.id]);
          // Open screens still refresh: the row they show now counts one more.
          const to = await signalTo(q, r); if (to) out.push({ profile: to, kind: 'notify' });
          continue;
        }
        await write(q, item, { type: 'mediaDecided', actor: null, objectType: object?.[0] ?? null, objectId: object?.[1] ?? null, data: pick(p) }, [r], out);
      }
    });
  };
  // Something waits for staff (a serious report, a photo dispute, a support request, a legal notice): one row per kind
  // while it is unread, with a count; a push for the first one.
  handlers['staff.alert'] = async item => {
    const p = /** @type {any} */ (item.payload);
    await tx(async (q, out) => {
      for (const r of await recipientsOf(q, item.profile_id, p)) {
        if (p.by && r.account === p.by) continue;
        const [prev] = await q.query(
          `select id from feture.notification
           where recipient_account_id = $1 and type = 'staffAlert' and retracted_at is null and read_at is null
             and created_at > now() - interval '15 minutes' and data->>'what' = $2 and coalesce(data->>'reason', '') = $3
           order by created_at desc limit 1`, [r.account, p.what, p.reason ?? '']);
        if (prev) {
          await q.query(`update feture.notification set data = jsonb_set(data, '{count}', to_jsonb(coalesce((data->>'count')::int, 1) + 1)) where id = $1`, [prev.id]);
          const to = await signalTo(q, r); if (to) out.push({ profile: to, kind: 'notify' });
          continue;
        }
        await write(q, item, { type: 'staffAlert', actor: null, data: pick(p) }, [r], out);
      }
    });
  };
  // New members of an open community: one summary row a day to its owner and hosts, no push (owner decision 7; the
  // item comes from jobs.mjs sweepCommunityJoins with the day's count). An account in two host profiles gets one row.
  handlers['community.joins'] = async item => {
    const p = /** @type {any} */ (item.payload);
    await tx(async (q, out) => {
      const rows = await q.query(
        `select distinct on (pm.account_id) pm.account_id, cm.profile_id from feture.community_member cm
         join feture.community c on c.id = cm.community_id and c.state = 'published'
         join feture.profile_member pm on pm.profile_id = cm.profile_id and pm.state = 'active'
         where cm.community_id = $1 and cm.state = 'active' and cm.role in ('owner', 'host')
         order by pm.account_id, case cm.role when 'owner' then 0 else 1 end, cm.profile_id`, [p.communityId]);
      await write(q, item, { type: 'communityJoins', actor: null, objectType: 'community', objectId: p.communityId, data: pick(p) },
        rows.map(r => ({ account: r.account_id, profile: r.profile_id })), out);
    });
  };
  // Event updates go to the people following the event, not to the organizer the item is addressed to.
  for (const [topic, type, admittedOnly] of /** @type {const} */ ([['event.cancelled', 'eventCancelled', false], ['event.changed', 'eventChanged', false],
    ['event.announcement', 'eventAnnouncement', true], ['event.reminder', 'eventReminder', true], ['event.unavailable', 'eventUnavailable', false]])) {
    handlers[topic] = async item => {
      const p = /** @type {any} */ (item.payload);
      if (topic === 'event.reminder') {
        // Only for an event still going ahead at that time.
        const [e] = await db.query(`select 1 from feture.event where id = $1 and state = 'published' and starts_at > now()`, [p.eventId]);
        if (!e) return;
      }
      // An event cancelled because its organizer deleted the account names nobody.
      // «Отменено» and «недоступно» reach everyone who followed it; the rest only people who still see the event (audit 35).
      const gone = topic === 'event.cancelled' || topic === 'event.unavailable';
      await tx(async (q, out) => write(q, item, { type, actor: p.organizerGone || topic === 'event.unavailable' ? null : item.profile_id, objectType: 'event', objectId: p.eventId, data: pick(p) },
        await eventFollowers(q, p.eventId, admittedOnly, gone, !gone), out));
    };
  }
  // A community closed because its owner deleted the account: members are told, nobody is named.
  // Closed by its owner, or with the owner's account; or hidden by staff («больше недоступно»): members are told, and for
  // an owner's close also people whose request was waiting (audit items 14, 33). Nobody is named.
  for (const [topic, type] of /** @type {const} */ ([['community.closed', 'communityClosed'], ['community.unavailable', 'communityUnavailable']])) {
    handlers[topic] = async item => {
      const p = /** @type {any} */ (item.payload);
      await tx(async (q, out) => {
        const rows = await q.query(
          `select distinct pm.account_id, x.profile_id from (
             select cm.profile_id from feture.community_member cm where cm.community_id = $1 and cm.state = 'active' and cm.profile_id <> $2
             union select unnest($3::uuid[])) x
           join feture.profile_member pm on pm.profile_id = x.profile_id and pm.state = 'active'`, [p.communityId, item.profile_id, Array.isArray(p.waiting) ? p.waiting : []]);
        await write(q, item, { type, actor: null, objectType: 'community', objectId: p.communityId, data: pick(p) }, rows.map(r => ({ account: r.account_id, profile: r.profile_id })), out);
      });
    };
  }
  // The rules changed (audit item 39): members other than whoever changed them.
  handlers['community.rulesChanged'] = async item => {
    const p = /** @type {any} */ (item.payload);
    await tx(async (q, out) => {
      const rows = await q.query(
        `select pm.account_id, cm.profile_id from feture.community_member cm join feture.profile_member pm on pm.profile_id = cm.profile_id and pm.state = 'active'
         where cm.community_id = $1 and cm.state = 'active' and pm.account_id <> $2 and not cm.muted`, [p.communityId, p.by]);
      await write(q, item, { type: 'communityRules', actor: null, objectType: 'community', objectId: p.communityId }, rows.map(r => ({ account: r.account_id, profile: r.profile_id })), out);
    });
  };
  // Chat messages make no inbox row, only a push to the members who did not mute the conversation.
  handlers['message.created'] = async item => {
    await db.tx(async q => {
      const p = /** @type {any} */ (item.payload);
      const message = p.conversationId && p.seq != null ? { conversationId: p.conversationId, seq: Number(p.seq) } : undefined;
      for (const r of await recipientsOf(q, item.profile_id, p)) {
        // The chat itself, as the profile that is in it.
        const url = pushUrl(destination({ type: 'message', data: { conversationId: p.conversationId }, addressee: r.profile }));
        await queuePush(q, item, r, 'messages', undefined, message, { key: 'message', url });
      }
    });
  };
  // Things to decide are in «Нужно решить», not in the inbox; the recipients get a push and their open screens a signal.
  // `from` names who asks: nothing reaches someone who blocked them (or whom they blocked) since. An item addressed to
  // the account (a couple invite) is checked against the account's own person profile.
  /** @param {OutboxItem} item */
  const toDecide = item => tx(async (q, out) => {
    const p = /** @type {any} */ (item.payload);
    const by = p.from;
    const kind = DECIDE_OF[item.topic] ?? null;
    for (const r of await recipientsOf(q, item.profile_id, item.payload)) {
      const to = await signalTo(q, r);
      if (by && to && (await q.query(`select feture.blocked($1, $2) b`, [to, by]))[0].b) continue;
      const [adr] = r.profile ? await q.query(`select kind from feture.profile where id = $1`, [r.profile]) : [];
      const type = kind ? `decide.${kind}` : 'decide.pinv';
      const route = destination({ type, data: { ...p, label: adr?.kind === 'couple' ? 'couple' : 'me' }, object: DECIDE_OBJECT[item.topic]?.(p) ?? null,
        addressee: r.profile, couple: adr?.kind === 'couple' ? r.profile : null });
      // A partner's proposal names its kind («{name} предлагает опубликовать пост от пары»).
      const sub = { label: adr?.kind === 'couple' ? 'couple' : 'me', ...(item.topic === 'decide.created' ? { approvalKind: p.kind } : {}) };
      // The item itself, so the push and the email are checked again when they would go (decided meanwhile: nothing).
      const id = DECIDE_ID[item.topic]?.(p);
      const decide = kind && typeof id === 'string' ? { kind, id } : null;
      const key = noteKey(type, sub);
      await queuePush(q, item, r, 'decide', undefined, undefined, { key, url: pushUrl(route), decide });
      if (decide && key) await queueEmail(q, { account: r.account, ref: `d:${kind}:${id}`, object: `decide:${kind}:${id}`, mode: CATALOG[key].email, url: pushUrl(route) });
      if (to) out.push({ profile: to, kind: 'decide' });
    }
  });
  for (const topic of ['decide.created', 'access.requested', 'community.requested', 'event.applied', 'couple.invited', 'tag.requested',
    'link.proposed', 'link.changeProposed']) handlers[topic] = toDecide;
  // A like is announced only while it still stands (a retried item must not bring back a withdrawn one).
  const plain = handlers['like.received'];
  handlers['like.received'] = async item => {
    const [l] = await db.query(`select 1 from feture.profile_like where from_profile_id = $1 and to_profile_id = $2 and state in ('active', 'matched')`,
      [/** @type {any} */ (item.payload).from, item.profile_id]);
    if (l) await plain(item);
  };
  // How an approval ended is a result row for the one it concerns (server/approvals.mjs close()); none when the caller's
  // own notice covers it (`silent`: the approvals a pause or a narrowing voided — one «Пара на паузе», not three).
  const decided = handlers['decide.resolved'];
  handlers['decide.resolved'] = async item => { if (!(/** @type {any} */ (item.payload).silent)) await decided(item); };
  // A post sent back to drafts after its photos were checked (posts.mjs settlePublication): its author is told, while it
  // is still a draft (a couple's draft is its writer's alone — the post visibility check in write() keeps it so).
  handlers['post.returned'] = async item => {
    const p = /** @type {any} */ (item.payload);
    await tx(async (q, out) => {
      const [post] = await q.query(`select owner_profile_id from feture.post where id = $1 and state = 'draft'`, [p.postId]);
      if (!post) return;
      await write(q, item, { type: 'postReturned', actor: null, objectType: 'post', objectId: p.postId, data: pick(p) },
        await recipientsOf(q, post.owner_profile_id, {}), out);
    });
  };
  for (const topic of SILENT_TOPICS) handlers[topic] = async () => {};
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

/** Marks notifications about one object read (docs/notifications.md «Счётчики»): opening a chat reads its match and
 * request rows (`account`, `types`), a decided task reads its own row for every member of the profile that decided
 * (`profile`, `kind: 'task'`). Returns how many rows changed, so the caller can refresh the counters.
 * @param {Q} q @param {{account?: string, profile?: string, types?: string[], kind?: string, objectType: string, objectId: string}} o */
export async function readAbout(q, { account, profile, types, kind, objectType, objectId }) {
  const rows = await q.query(
    `update feture.notification n set read_at = now()
     where n.read_at is null and n.object_type = $1 and n.object_id = $2
       and ($3::uuid is null or n.recipient_account_id = $3)
       and ($4::uuid is null or n.recipient_account_id in (select account_id from feture.profile_member where profile_id = $4 and state = 'active'))
       and ($5::text[] is null or n.type = any($5)) and ($6::text is null or n.kind = $6)
     returning n.id`, [objectType, objectId, account ?? null, profile ?? null, types ?? null, kind ?? null]);
  return rows.length;
}
