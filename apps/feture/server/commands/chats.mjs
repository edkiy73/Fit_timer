// @ts-check
import { chatsCommands, REQUEST_LIMITS } from '../../contracts/chats.mjs';
import { fail } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { mediaDto } from '../media/assets.mjs';
import { requireUnrestricted } from '../profiles.mjs';
import { needsPartner, registerApprovalKind, requestApproval } from '../approvals.mjs';
import { incomingRequest } from '../sql-rules.mjs';
import { withFaces } from './faces.mjs';
import { otherProfile } from './access.mjs';
import { lockPair } from './discover.mjs';
import { typingTag } from '../realtime.mjs';

/** Slice G1: conversations and messages (S1 §12, extract/people-discover-chats.md §1.11–1.12, §2.5).
 * A conversation comes only with a match (a request, grant, follow or gift never opens one). Members are the accounts of
 * both sides; a couple side reads and writes together. An ended conversation keeps its history and takes nothing new.
 * Ephemeral media need both sides confirmed adults; the timer starts at the first conscious open, never at render; the
 * file goes once every recipient is done, unopened ones after 7 days (Q21).
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q @typedef {import('../db.mjs').Db} Db
 * @typedef {import('../profiles.mjs').Acting} Acting
 */

const TTL_MIN = { t15: 15, t120: 120, t1440: 1440 };
const UNOPENED_DAYS = 7;
// A disappearing CLIP: opening hands out a grant, the view is spent / the timer starts when playback begins
// (chat.mediaStarted). A grant never started runs out after GRANT_SEC and then counts as the view (the server cannot
// tell «still loading» from «downloaded but never reported»); GRANT_SLACK_SEC covers a late request. The clip link is
// valid GRANT_LINK_SEC from the grant, and a finished clip stays served for CLIP_BURN_GRACE_MIN so it can play out.
const GRANT_SEC = 120;
const GRANT_SLACK_SEC = 10;
const GRANT_LINK_SEC = 300;
const CLIP_BURN_GRACE_MIN = 10;

/** @param {Acting | null} acting @returns {Acting} */
const need = acting => { if (!acting) throw new Error('acting profile missing'); return acting; };

/** Opens the conversation of a new match for the accounts of both sides. A request between the two (waiting, answered
 * or hidden) becomes this match's chat instead of a second conversation: a mutual like never waits for an answer.
 * @param {Q} q @param {string} matchId @param {string} a @param {string} b */
export async function openConversation(q, matchId, a, b) {
  const [r] = await q.query(
    `update feture.conversation set match_id = $1, request_state = 'accepted', answered_at = coalesce(answered_at, now())
     where state = 'active' and origin = 'request' and match_id is null and profile_a = least($2::uuid, $3::uuid) and profile_b = greatest($2::uuid, $3::uuid)
     returning id`, [matchId, a, b]);
  if (r) { await addMembers(q, r.id, a, b); return r.id; }
  const [c] = await q.query(
    `insert into feture.conversation (match_id, profile_a, profile_b) values ($1, least($2::uuid, $3::uuid), greatest($2::uuid, $3::uuid)) returning id`, [matchId, a, b]);
  await addMembers(q, c.id, a, b);
  return c.id;
}

/** The active accounts of both sides become members (a couple: both partners). @param {Q} q @param {string} id @param {string} a @param {string} b */
async function addMembers(q, id, a, b) {
  await q.query(
    `insert into feture.conversation_member (conversation_id, account_id, profile_id)
     select $1, m.account_id, m.profile_id from feture.profile_member m where m.profile_id in ($2, $3) and m.state = 'active'
     on conflict do nothing`, [id, a, b]);
}

/** Ends the active conversations between two profiles (or all of one profile when `b` is null).
 * @param {Q} q @param {string} a @param {string | null} b @param {'unmatch' | 'block' | 'pair_ended' | 'account_deleted'} reason */
export async function endConversations(q, a, b, reason) {
  await q.query(
    `update feture.conversation set state = 'ended', ended_reason = $3, ended_at = now()
     where state = 'active' and ($2::uuid is null and (profile_a = $1 or profile_b = $1) or profile_a = least($1::uuid, $2::uuid) and profile_b = greatest($1::uuid, $2::uuid))`,
    [a, b, reason]);
}

/** The conversation as the acting profile's member account sees it. A request the acting side hid or reported is gone
 * for it (`hiddenToo`: still found, for writing back to its sender).
 * @param {Q} q @param {string} conversationId @param {Acting} acting @param {{lock?: boolean, hiddenToo?: boolean}} [opts] */
async function memberOf(q, conversationId, acting, { lock = false, hiddenToo = false } = {}) {
  const [c] = await q.query(
    `select c.*, cm.last_read_seq, cm.muted, cm.archived, case when c.profile_a = cm.profile_id then c.profile_b else c.profile_a end other
     from feture.conversation c join feture.conversation_member cm on cm.conversation_id = c.id and cm.account_id = $2 and cm.profile_id = $3
     where c.id = $1 ${lock ? 'for update of c' : ''}`, [conversationId, acting.accountId, acting.profileId]);
  if (!c) fail(404, 'not_found');
  if (!hiddenToo && c.origin === 'request' && ['hidden', 'reported'].includes(c.request_state) && c.request_from !== acting.profileId) fail(404, 'not_found');
  // Blocked either way: the conversation is gone for both (it was ended by the block).
  if (c.other && (await q.query('select feture.blocked($1, $2) b', [acting.profileId, c.other]))[0].b) fail(404, 'not_found');
  return c;
}

/** May a new message go out? Active conversation, active match (or a request: answered, or the recipient answering it
 * now — writing back is answering; its sender waits), both sides active. @param {Q} q @param {any} c @param {Acting} acting */
async function requireOpen(q, c, acting) {
  if (c.state !== 'active') fail(409, 'conflict', { rule: 'ended' });
  if (c.origin === 'request') {
    if (c.request_state !== 'accepted') {
      if (c.request_from === acting.profileId) fail(409, 'conflict', { rule: 'request_pending' });
      await acceptRequest(q, c, acting);
    }
  } else {
    const [m] = await q.query(`select 1 from feture.profile_match where id = $1 and ended_at is null`, [c.match_id]);
    if (!m) fail(409, 'conflict', { rule: 'no_match' });
  }
  const [{ n }] = await q.query(`select count(*)::int n from feture.profile where id in ($1, $2) and state = 'active'`, [c.profile_a, c.profile_b]);
  if (n !== 2) fail(409, 'conflict', { rule: 'pair_inactive' });
}

/** Appends a message with the next seq and tells the other side's members (push in slice G2); the first message of a
 * request (`quiet`) is announced as the request instead.
 * @param {Q} q @param {any} c @param {Acting} acting @param {{body: string, replyTo?: string, assetId?: string, mode?: string, quiet?: boolean}} m */
async function append(q, c, acting, m) {
  if (m.replyTo) {
    const [r] = await q.query('select 1 from feture.message where id = $1 and conversation_id = $2', [m.replyTo, c.id]);
    if (!r) fail(400, 'invalid_input', { fields: ['replyTo'] });
  }
  const [{ seq }] = await q.query(`update feture.conversation set last_seq = last_seq + 1, last_message_at = now() where id = $1 returning last_seq seq`, [c.id]);
  const [msg] = await q.query(
    `insert into feture.message (conversation_id, seq, author_profile_id, sender_account_id, body, reply_to, media_asset_id, media_mode)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id, seq, created_at`,
    [c.id, seq, acting.profileId, acting.accountId, m.body, m.replyTo ?? null, m.assetId ?? null, m.mode ?? 'normal']);
  // The sender has read up to here; a new message brings the conversation back from the recipients' archive.
  const [before] = await q.query(`select last_read_seq from feture.conversation_member where conversation_id = $1 and account_id = $2`, [c.id, acting.accountId]);
  await q.query(`update feture.conversation_member set last_read_seq = $2 where conversation_id = $1 and account_id = $3`, [c.id, seq, acting.accountId]);
  // Answering reads what came before: the other side's messages up to here get a read time (only if any were unread).
  if (before && Number(seq) - 1 > Number(before.last_read_seq)) await markRead(q, c.id, acting.accountId, Number(seq) - 1);
  const others = await q.query(
    `update feture.conversation_member set archived = false where conversation_id = $1 and profile_id <> $2 returning account_id, muted`, [c.id, acting.profileId]);
  if (!m.quiet) await enqueue(q, 'message.created', c.other, { conversationId: c.id, seq: Number(seq), for: others.filter(o => !o.muted).map(o => o.account_id) });
  return { id: msg.id, seq: Number(msg.seq), at: msg.created_at, recipients: others.map(o => o.account_id) };
}

/** Remembers when a member's read mark moved forward (V21 chatReadInfo). @param {Q} q @param {string} conversationId
 * @param {string} accountId @param {number} upTo */
async function markRead(q, conversationId, accountId, upTo) {
  await q.query(`insert into feture.conversation_read (conversation_id, account_id, up_to_seq) values ($1, $2, $3) on conflict do nothing`, [conversationId, accountId, upTo]);
}

/** «Something new in chats» to the other side and to the sender's own profile (a couple partner sees it too).
 * Only the kind travels (S2 §8): never the conversation id, which an ex-member holding an old token could link.
 * @param {(profile: string | null | undefined, kind: 'chat') => void} signal @param {any} c @param {Acting} acting */
function chatSignal(signal, c, acting) {
  signal(c.other, 'chat');
  if (acting.kind === 'couple') signal(acting.profileId, 'chat');
}

/** Viewer-side state of an ephemeral media message. @param {any} m @param {any} view */
function ephemeralState(m, view) {
  if (!view) return 'none';
  if (view.done) return 'done';
  if (!view.opened_at && view.granted_at && Date.now() - new Date(view.granted_at).getTime() > (GRANT_SEC + GRANT_SLACK_SEC) * 1e3) return 'done';
  if (view.opened_at) {
    if (m.media_mode === 'once') return 'done';
    const until = new Date(view.opened_at).getTime() + TTL_MIN[/** @type {keyof typeof TTL_MIN} */ (m.media_mode)] * 6e4;
    return until > Date.now() ? 'open' : 'done';
  }
  return Date.now() - new Date(m.created_at).getTime() > UNOPENED_DAYS * 864e5 ? 'done' : 'unopened';
}

/** When every recipient is done with an ephemeral file, it goes (served copies at once, the upload by media.purge).
 * @param {Q} q @param {string} messageId */
async function burnIfDone(q, messageId) {
  const [x] = await q.query(
    `select m.media_asset_id from feture.message m where m.id = $1 and m.media_asset_id is not null
       and not exists (select 1 from feture.message_media_view v where v.message_id = m.id and not v.done)
       -- A clip that just started playing plays out first; the sweep burns it after CLIP_BURN_GRACE_MIN.
       and not exists (select 1 from feture.message_media_view v join feture.media_asset a on a.id = m.media_asset_id
         where v.message_id = m.id and a.kind = 'video' and v.opened_at > now() - interval '${CLIP_BURN_GRACE_MIN} minutes')
       -- A file in an open report stays as evidence until the report is decided.
       and not exists (select 1 from feture.report r where r.state = 'open' and r.target_type = 'conversation' and m.id = any(r.message_ids))`, [messageId]);
  if (!x) return;
  const rows = await q.query(`update feture.media_asset set state = 'removed', removed_at = now() where id = $1 and state not in ('removed', 'blocked') returning owner_profile_id`, [x.media_asset_id]);
  if (rows[0]) {
    await enqueue(q, 'media.hide', rows[0].owner_profile_id, { assetId: x.media_asset_id });
    await enqueue(q, 'media.purge', rows[0].owner_profile_id, { assetId: x.media_asset_id });
  }
}

/** Timers that ran out and unopened files older than 7 days count as done; finished files go. @param {Db} db */
export async function sweepEphemeral(db) {
  if (!(await db.query(`select to_regclass('feture.message_media_view') is not null ok`))[0].ok) return 0;
  const grants = (await db.query(`select exists (select 1 from information_schema.columns where table_schema = 'feture' and table_name = 'message_media_view' and column_name = 'granted_at') ok`))[0].ok;
  const due = await db.query(
    `update feture.message_media_view v set done = true from feture.message m
     where m.id = v.message_id and not v.done and (
       v.opened_at is not null and m.media_mode = 'once'
       or v.opened_at is not null and v.opened_at + (case m.media_mode when 't15' then 15 when 't120' then 120 else 1440 end) * interval '1 minute' < now()
       or v.opened_at is null and m.created_at < now() - interval '${UNOPENED_DAYS} days'
       ${grants ? `or v.opened_at is null and v.granted_at is not null and v.granted_at + interval '${GRANT_SEC + GRANT_SLACK_SEC} seconds' < now()` : ''})
     returning v.message_id`);
  // Also files whose last view finished but whose burn was lost (a crash between the two steps).
  const finished = await db.query(
    `select m.id message_id from feture.message m join feture.media_asset a on a.id = m.media_asset_id
     where m.media_mode <> 'normal' and a.state not in ('removed', 'blocked')
       and not exists (select 1 from feture.message_media_view v where v.message_id = m.id and not v.done)
       -- A clip that just started plays out before its served copies go.
       and not exists (select 1 from feture.message_media_view v where v.message_id = m.id and a.kind = 'video' and v.opened_at > now() - interval '${CLIP_BURN_GRACE_MIN} minutes')
     limit 200`);
  for (const id of new Set([...due, ...finished].map(r => r.message_id))) await db.tx(q => burnIfDone(q, id));
  return due.length;
}


/* ---------------- message requests (owner 29.10.2026) ---------------- */

/** What a request is to the side `profileId`: null for a chat; its sender waits (`renewAt`: when it may send another
 * one — a hidden request looks exactly like an unanswered one); its recipient sees where they know each other from.
 * @param {any} c conversation row @param {string} profileId */
function requestView(c, profileId) {
  if (c.origin !== 'request' || c.request_state === 'accepted') return null;
  if (c.request_from === profileId) {
    return { role: 'sender', renewAt: new Date(new Date(c.request_at).getTime() + REQUEST_LIMITS.reaskDays * 864e5).toISOString() };
  }
  return { role: 'recipient', context: c.request_context ?? [], at: c.request_at };
}

/** The recipient answers: the request becomes a normal chat, read up to here. @param {Q} q @param {any} c @param {Acting} acting */
async function acceptRequest(q, c, acting) {
  await q.query(`update feture.conversation set request_state = 'accepted', answered_at = now() where id = $1`, [c.id]);
  c.request_state = 'accepted';
  const [r] = await q.query(
    `update feture.conversation_member set last_read_seq = $3 where conversation_id = $1 and account_id = $2 and last_read_seq < $3 returning 1`,
    [c.id, acting.accountId, c.last_seq]);
  if (r) await markRead(q, c.id, acting.accountId, Number(c.last_seq));
}

/** A photo, clip or voice message of the acting profile that may go into a chat in `mode`. @param {Q} q @param {Acting} acting
 * @param {{assetId: string, mode: string, body: string}} input */
async function chatAsset(q, acting, input) {
  // A photo or clip uploaded for chats, or a voice message (its own purpose, always «normal»).
  const [asset] = await q.query(
    `select id, state, view_rule, purpose from feture.media_asset where id = $1 and owner_profile_id = $2 and purpose in ('chat', 'voice') and state in ('uploaded', 'scanning', 'needs_review', 'approved')`,
    [input.assetId, acting.profileId]);
  if (!asset) fail(400, 'invalid_input', { fields: ['assetId'] });
  if (asset.purpose === 'voice' && (input.mode !== 'normal' || input.body)) fail(400, 'invalid_input', { fields: ['mode'] });
  // The mode was chosen at upload (view rule); an ephemeral file goes out only once it passed its checks.
  if ((input.mode === 'normal') !== (asset.view_rule === 'normal')) fail(400, 'invalid_input', { fields: ['mode'] });
  if (input.mode !== 'normal' && asset.state !== 'approved') fail(409, 'conflict', { rule: 'pending' });
  const [used] = await q.query('select 1 from feture.message where media_asset_id = $1', [input.assetId]);
  if (used) fail(409, 'conflict', { rule: 'already_sent' }); // one file, one message (a unique index backs this)
  return asset;
}

/** Posts a media message into an open conversation. @param {Q} q @param {any} c @param {Acting} acting
 * @param {{assetId: string, mode: string, body: string, replyTo?: string, quiet?: boolean}} input */
async function sendMediaInto(q, c, acting, input) {
  await chatAsset(q, acting, input);
  if (input.mode !== 'normal') {
    // Ephemeral media: everyone on both sides confirmed an adult.
    const [{ ok }] = await q.query(
      `select coalesce(bool_and(coalesce(a.age_verified_until > now(), false)), false) ok from feture.conversation_member cm join feture.account a on a.id = cm.account_id
       where cm.conversation_id = $1`, [c.id]);
    if (!ok) fail(422, 'rule_violation', { rule: 'age_required' });
  }
  await q.query(`insert into feture.media_attachment (asset_id, target_type, target_id) values ($1, 'message', $2) on conflict do nothing`, [input.assetId, c.id]);
  const out = await append(q, c, acting, { body: input.body, replyTo: input.replyTo, assetId: input.assetId, mode: input.mode, quiet: input.quiet });
  if (input.mode !== 'normal') {
    await q.query(`insert into feture.message_media_view (message_id, viewer_account_id) select $1, unnest($2::uuid[])`, [out.id, out.recipients]);
  }
  return out;
}

/** The active conversation of two profiles (there is at most one: a match and a request share it). @param {Q} q
 * @param {string} a @param {string} b @param {boolean} [lock] */
async function pairConversation(q, a, b, lock = false) {
  const [c] = await q.query(
    `select * from feture.conversation where state = 'active' and profile_a = least($1::uuid, $2::uuid) and profile_b = greatest($1::uuid, $2::uuid)
     order by created_at desc limit 1 ${lock ? 'for update' : ''}`, [a, b]);
  return c ?? null;
}

/** Where the sender and the recipient know each other from: the sender follows them, a community both are in, an event
 * both go to (or one organises) that has not long passed. @param {Q} q @param {string} from @param {string} to */
async function requestContext(q, from, to) {
  const [r] = await q.query(
    `select exists (select 1 from feture.follow where follower_profile_id = $1 and target_profile_id = $2) follows,
       (select coalesce(json_agg(x), '[]') from (select c.id, c.name from feture.community c
          join feture.community_member a on a.community_id = c.id and a.profile_id = $1 and a.state = 'active'
          join feture.community_member b on b.community_id = c.id and b.profile_id = $2 and b.state = 'active'
          where c.state = 'published' order by greatest(a.joined_at, b.joined_at) desc limit 2) x) communities,
       (select coalesce(json_agg(x), '[]') from (select e.id, e.title, e.starts_at "startsAt" from feture.event e
          where e.state = 'published' and e.ends_at > now() - interval '30 days'
            and (e.organizer_profile_id = $1 or exists (select 1 from feture.event_rsvp r where r.event_id = e.id and r.profile_id = $1 and r.status in ('going', 'interested'))
                 or exists (select 1 from feture.event_application p where p.event_id = e.id and p.profile_id = $1 and p.state = 'approved'))
            and (e.organizer_profile_id = $2 or exists (select 1 from feture.event_rsvp r where r.event_id = e.id and r.profile_id = $2 and r.status in ('going', 'interested'))
                 or exists (select 1 from feture.event_application p where p.event_id = e.id and p.profile_id = $2 and p.state = 'approved'))
          order by e.starts_at limit 2) x) events`, [from, to]);
  return [
    ...r.communities.map((/** @type {any} */ c) => ({ kind: 'community', id: c.id, name: c.name })),
    ...r.events.map((/** @type {any} */ e) => ({ kind: 'event', id: e.id, title: e.title, startsAt: e.startsAt })),
    ...(r.follows ? [{ kind: 'follows' }] : []),
  ];
}

/** New requests the profile may still send today: 10 a day, 3 once several of its requests were hidden or reported
 * in the last two weeks. @param {Q} q @param {string} profileId */
async function requestQuota(q, profileId) {
  const L = REQUEST_LIMITS;
  const [r] = await q.query(
    `select (select count(*)::int from feture.conversation where origin = 'request' and request_from = $1 and request_at > now() - interval '1 day') today,
       (select count(*)::int from feture.conversation where origin = 'request' and request_from = $1 and request_state in ('hidden', 'reported')
          and answered_at > now() - make_interval(days => $2)) refused`, [profileId, L.lowWindowDays]);
  const max = r.refused >= L.lowAfter ? L.perDayLow : L.perDay;
  return { max, left: Math.max(0, max - r.today) };
}

/** Why the acting profile may not send `t` a request now (null: it may), and where they know each other from.
 * Order: who they are (related, restricted, adults), a recent «Прекратить общение», the recipient's «Кто может мне
 * писать», then the sender's daily limit. @param {Q} q @param {Acting} acting @param {{id: string, related: boolean}} t */
async function chatRequestBlocker(q, acting, t) {
  const context = await requestContext(q, acting.profileId, t.id);
  const [x] = await q.query(
    `select feture.restricted($1) me_restricted, feture.restricted($2) restricted,
       -- Hidden from the recipient (a persona writing to a real person): never reaches them.
       feture.blocked($2, $1) hidden,
       not exists (select 1 from feture.profile_member m join feture.account a on a.id = m.account_id
         where m.profile_id in ($1, $2) and m.state = 'active' and (a.state <> 'active' or a.birth_date is null or a.birth_date > current_date - interval '18 years')) adults,
       exists (select 1 from feture.conversation c where c.profile_a = least($1::uuid, $2::uuid) and c.profile_b = greatest($1::uuid, $2::uuid)
         and c.state = 'ended' and c.ended_reason = 'unmatch' and c.ended_at > now() - make_interval(days => $3)) ended,
       (select messages_from from feture.profile_settings where profile_id = $2) messages_from`, [acting.profileId, t.id, REQUEST_LIMITS.reaskDays]);
  /** @param {string} rule */
  const no = rule => ({ rule, context, quota: null });
  if (x.me_restricted) return no('restricted');
  if (t.related) return no('related');
  if (x.restricted || x.hidden || !x.adults) return no('unavailable');
  if (x.ended) return no('request_wait');
  if (x.messages_from === 'none') return no('messages_closed');
  if (x.messages_from !== 'all' && !context.length) return no('messages_known');
  const quota = await requestQuota(q, acting.profileId);
  return { rule: quota.left > 0 ? null : 'requests_day', context, quota };
}

/** Sends (or, after 30 days without an answer, sends again) a request as the acting profile; also the apply of a
 * couple's approved request, so every check runs again then. A conversation already there takes the message instead:
 * a match or an answered request as usual, a request from the other side as its answer.
 * @param {Q} q @param {Acting} acting @param {{profileId: string, body: string, assetId?: string | null}} input
 * @param {(profile: string | null | undefined, kind: any) => void} signal @param {{approved?: boolean}} [opts] */
async function startRequest(q, acting, input, signal, { approved = false } = {}) {
  await requireUnrestricted(q, acting);
  const t = await otherProfile(q, acting, input.profileId);
  await lockPair(q, acting.profileId, t.id);
  await q.query(`select pg_advisory_xact_lock(hashtextextended('fe-chatreq:' || $1, 0))`, [acting.profileId]);
  const body = input.body.trim();
  const existing = await pairConversation(q, acting.profileId, t.id, true);
  const mine = existing && existing.origin === 'request' && existing.request_state !== 'accepted' && existing.request_from === acting.profileId;
  if (existing && !mine) {
    const c = await memberOf(q, existing.id, acting, { lock: true, hiddenToo: true });
    await requireOpen(q, c, acting);
    const out = input.assetId ? await sendMediaInto(q, c, acting, { assetId: input.assetId, mode: 'normal', body })
      : await append(q, c, acting, { body });
    chatSignal(signal, c, acting);
    return { conversationId: c.id, state: 'chat', id: out.id, seq: out.seq };
  }
  if (mine && Date.now() - new Date(existing.request_at).getTime() < REQUEST_LIMITS.reaskDays * 864e5) {
    fail(409, 'conflict', { rule: 'request_pending', conversationId: existing.id });
  }
  const { rule, context, quota } = await chatRequestBlocker(q, acting, t);
  if (rule === 'requests_day') fail(429, 'rate_limited', { kind: 'chat.request', rule, max: quota?.max });
  if (rule === 'unavailable') fail(404, 'not_found');
  if (rule) fail(422, 'rule_violation', { rule });
  if (input.assetId) await chatAsset(q, acting, { assetId: input.assetId, mode: 'normal', body });
  if (!approved && needsPartner(acting, 'chat.request')) {
    return { pending: await requestApproval(q, acting, {
      kind: 'chat.request', targetType: 'profile', targetId: t.id, change: { profileId: t.id, body, assetId: input.assetId ?? null }, summary: ['chat.request'] }) };
  }
  /** @type {any} */
  let c;
  if (mine) {
    [c] = await q.query(
      `update feture.conversation set request_state = 'pending', request_at = now(), request_context = $2, answered_at = null where id = $1 returning *`,
      [existing.id, JSON.stringify(context)]);
  } else {
    [c] = await q.query(
      `insert into feture.conversation (profile_a, profile_b, origin, request_state, request_from, request_at, request_context)
       values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), 'request', 'pending', $1, now(), $3) returning *`,
      [acting.profileId, t.id, JSON.stringify(context)]);
  }
  await addMembers(q, c.id, acting.profileId, t.id);
  c.other = t.id;
  const out = input.assetId ? await sendMediaInto(q, c, acting, { assetId: input.assetId, mode: 'normal', body, quiet: true })
    : await append(q, c, acting, { body, quiet: true });
  await enqueue(q, 'chat.requested', t.id, { from: acting.profileId, conversationId: c.id, by: acting.accountId });
  if (acting.kind === 'couple') await enqueue(q, 'couple.changed', acting.profileId, { for: acting.partnerAccountId, what: 'chatRequest' });
  chatSignal(signal, c, acting);
  return { conversationId: c.id, state: 'request', id: out.id, seq: out.seq };
}

/** A report of a request by its recipient closes it like a hide and counts against its sender (report.create).
 * @param {Q} q @param {string} conversationId @param {string} reporter */
export async function markRequestReported(q, conversationId, reporter) {
  await q.query(
    `update feture.conversation set request_state = 'reported', answered_at = now()
     where id = $1 and origin = 'request' and request_state in ('pending', 'hidden') and request_from is distinct from $2`, [conversationId, reporter]);
}

/** «Прекратить общение» in a chat that began as a request (there is no match to end). @param {Q} q @param {string} a @param {string} b */
export async function endRequestChat(q, a, b) {
  const c = await pairConversation(q, a, b, true);
  if (!c || c.origin !== 'request') return false;
  await endConversations(q, a, b, 'unmatch');
  return true;
}

// A couple's request waits for the partner when they asked to approve; approved, it is sent then with every check again.
registerApprovalKind('chat.request', {
  apply: async (q, row) => {
    const c = /** @type {any} */ (row.change);
    const [p] = await q.query(
      `select p.kind, (select account_id from feture.profile_member where profile_id = p.id and account_id <> $2 and state = 'active' limit 1) partner
       from feture.profile p where p.id = $1`, [row.profile_id, row.requested_by]);
    const acting = /** @type {Acting} */ ({ profileId: row.profile_id, accountId: row.requested_by, kind: p.kind, partnerAccountId: p.partner ?? null, partnerApproves: true, state: 'active', writable: true });
    await startRequest(q, acting, { profileId: c.profileId, body: c.body ?? '', assetId: c.assetId }, () => {}, { approved: true });
  },
  // Who would get it (while still there and not blocked) and the message.
  preview: async (q, row) => {
    const c = /** @type {any} */ (row.change);
    const [p] = await q.query(`select id, kind, handle, name from feture.profile where id = $1 and state = 'active' and not feture.blocked($2, id)`, [c.profileId, row.profile_id]);
    return { profile: p ?? null, message: { body: c.body ?? '', photo: !!c.assetId } };
  },
});

/** @type {Record<keyof typeof chatsCommands, Command['run']>} */
const run = {
  async 'chats.list'(q, { account, input, cfg }) {
    // Unread counts are per reading account; conversations with someone blocked either way are not listed. Requests
    // others sent and nobody answered yet go to `requests` («Запросы»), hidden and reported ones nowhere.
    const rows = await q.query(
      `select c.id, c.state, c.last_seq, c.last_message_at, c.created_at, cm.profile_id side, sp.kind side_kind, cm.muted, cm.archived,
         c.origin, c.request_state, c.request_from, c.request_at, c.request_context, ${incomingRequest('c', 'cm')} incoming,
         o.id other_id, o.kind other_kind, o.handle other_handle, o.name other_name, o.avatar_asset_id,
         (select count(*)::int from feture.message m where m.conversation_id = c.id and m.seq > cm.last_read_seq and m.sender_account_id is distinct from $1) unread,
         (select json_build_object('body', left(m.body, 80), 'media', m.media_asset_id is not null, 'mode', m.media_mode, 'mine', m.sender_account_id = $1,
            'kind', (select a.kind from feture.media_asset a where a.id = m.media_asset_id))
            from feture.message m where m.conversation_id = c.id order by m.seq desc limit 1) last
       from feture.conversation_member cm join feture.conversation c on c.id = cm.conversation_id
       join feture.profile sp on sp.id = cm.profile_id
       join feture.profile o on o.id = case when c.profile_a = cm.profile_id then c.profile_b else c.profile_a end
       where cm.account_id = $1 and cm.archived = $2 and ($3 = 'all' or $3 = 'me' and sp.kind = 'person' or $3 = 'couple' and sp.kind = 'couple')
         and exists (select 1 from feture.profile_member pm where pm.profile_id = cm.profile_id and pm.account_id = cm.account_id and pm.state = 'active')
         and not feture.blocked(cm.profile_id, o.id) and (c.last_seq > 0 or c.state = 'active')
         and not (${incomingRequest('c', 'cm')} and (c.request_state <> 'pending' or c.state <> 'active' or $2))
       order by coalesce(c.last_message_at, c.created_at) desc limit 200`, [account.id, input.archived, input.filter]);
    const assets = await q.query('select * from feture.media_asset where id = any($1)', [rows.map(r => r.avatar_asset_id).filter(Boolean)]);
    /** @type {any[]} */ const items = [];
    /** @type {any[]} */ const requests = [];
    for (const r of rows) {
      const asset = assets.find(a => a.id === r.avatar_asset_id);
      const row = {
        id: r.id, state: r.state, side: { id: r.side, kind: r.side_kind }, newMatch: Number(r.last_seq) === 0,
        other: {
          id: r.other_id, kind: r.other_kind, handle: r.other_handle, name: r.other_name || r.other_handle,
          avatar: asset ? await mediaDto(cfg.media, asset, { viewerProfileId: r.side, place: 'public', showExplicit: false, staff: false }).catch(() => null) : null,
        },
        unread: r.incoming ? 0 : r.unread, muted: r.muted, archived: r.archived, last: r.last, at: r.last_message_at ?? r.created_at,
        origin: r.origin, request: requestView(r, r.side),
      };
      (r.incoming ? requests : items).push(row);
    }
    return { items, requests };
  },

  async 'chat.messages'(q, { acting: a, input, account, cfg }) {
    const viewer = need(a);
    const c = await memberOf(q, input.conversationId, viewer);
    const rows = await q.query(
      `select m.*, v.opened_at, v.done from feture.message m
       left join feture.message_media_view v on v.message_id = m.id and v.viewer_account_id = $2
       where m.conversation_id = $1 and ($3::bigint is null or m.seq < $3) and ($4::bigint is null or m.seq > $4)
       order by m.seq ${input.afterSeq !== undefined ? 'asc' : 'desc'} limit $5`,
      [c.id, viewer.accountId, input.beforeSeq ?? null, input.afterSeq ?? null, input.limit]);
    const [prefs] = await q.query('select chat_blur, show_explicit from feture.account where id = $1', [account.id]);
    const assets = await q.query('select * from feture.media_asset where id = any($1)', [rows.map(r => r.media_asset_id).filter(Boolean)]);
    const voiceIds = rows.filter(m => assets.find(x => x.id === m.media_asset_id)?.kind === 'audio').map(m => m.id);
    const listens = voiceIds.length ? await q.query('select message_id, account_id from feture.message_listen where message_id = any($1)', [voiceIds]) : [];
    // Only for the sender's own messages: when each member of the other side read it (V21 chatReadInfo; a couple has
    // two readers) and how each recipient handled a disappearing photo (V21 chatMedia). Each reader comes with their
    // person profile (owner, 28.10: a couple chat shows WHICH partner read) — only to a member of this conversation,
    // which memberOf above already checked; the list keeps a fixed order of the other side's members.
    const mineSeqs = rows.filter(m => m.author_profile_id === viewer.profileId).map(m => Number(m.seq));
    const readers = mineSeqs.length ? await q.query(
      `select cm.account_id, cm.last_read_seq, pp.id reader_id, pp.handle reader_handle, pp.name reader_name,
         coalesce(array_agg(json_build_object('seq', r.up_to_seq, 'readAt', r.read_at) order by r.up_to_seq) filter (where r.up_to_seq is not null), '{}') marks
       from feture.conversation_member cm
       left join feture.account acc on acc.id = cm.account_id
       left join feture.profile pp on pp.id = acc.person_profile_id and pp.state = 'active'
       left join feture.conversation_read r on r.conversation_id = cm.conversation_id and r.account_id = cm.account_id and r.up_to_seq >= $3
       where cm.conversation_id = $1 and cm.profile_id <> $2 group by cm.account_id, cm.last_read_seq, pp.id, pp.handle, pp.name order by cm.account_id`,
      [c.id, viewer.profileId, Math.min(...mineSeqs)]) : [];
    const people = await withFaces(q, cfg.media, viewer, readers.map(r => r.reader_id ? { id: r.reader_id, handle: r.reader_handle, name: r.reader_name } : null), p => p);
    const ephemeralMine = rows.filter(m => m.author_profile_id === viewer.profileId && m.media_mode !== 'normal').map(m => m.id);
    const views = ephemeralMine.length ? await q.query(
      `select message_id, viewer_account_id, opened_at, done from feture.message_media_view where message_id = any($1) order by viewer_account_id`, [ephemeralMine]) : [];
    /** @param {any} m */
    const readBy = m => readers.map((r, i) => {
      const mark = r.marks.find((/** @type {any} */ x) => Number(x.seq) >= Number(m.seq));
      const p = /** @type {any} */ (people[i]);
      return { read: Number(r.last_read_seq) >= Number(m.seq), readAt: mark ? mark.readAt : null,
        reader: p ? { id: p.id, handle: p.handle, name: p.name, avatar: p.avatar ?? null } : null };
    });
    /** @param {any} m */
    const viewsOf = m => views.filter(v => v.message_id === m.id).map(v => {
      const st = ephemeralState(m, v);
      return { state: st === 'unopened' ? 'unopened' : st === 'open' ? 'open' : v.opened_at ? 'opened' : 'expired', openedAt: v.opened_at };
    });
    const items = [];
    for (const m of rows.sort((x, y) => Number(x.seq) - Number(y.seq))) {
      const mine = m.author_profile_id === viewer.profileId;
      let media = null;
      const asset = assets.find(x => x.id === m.media_asset_id);
      if (m.media_mode !== 'normal') {
        // Ephemeral: never a link here; recipients open it with chat.openMedia.
        const kind = asset?.kind === 'video' ? 'video' : 'image';
        media = mine
          ? { ephemeral: true, kind, mode: m.media_mode, state: asset && asset.state !== 'removed' ? 'sent' : 'done', views: viewsOf(m) }
          : { ephemeral: true, kind, mode: m.media_mode, state: ephemeralState(m, { opened_at: m.opened_at, done: m.done }) };
      } else if (m.media_asset_id) {
        media = asset ? await mediaDto(cfg.media, asset, {
          viewerProfileId: viewer.profileId, place: 'chat', showExplicit: prefs.show_explicit && !prefs.chat_blur, blurAll: prefs.chat_blur, staff: false,
        }).catch(() => null) : null;
        // A photo the viewer may not see yet (still being checked) or any more (removed) is still a photo message:
        // never an empty bubble, never a link.
        if (!media) media = ['uploaded', 'scanning', 'needs_review'].includes(asset?.state) ? { pending: true, src: null } : { gone: true, src: null };
        // «Прослушано»: a recipient sees whether they played it; the sender whether the other side did.
        if (asset?.kind === 'audio') {
          media = { ...media, kind: 'audio', listened: listens.some(l => l.message_id === m.id && (mine || l.account_id === viewer.accountId)) };
        } else if (asset?.kind === 'video' && !media.kind) media = { ...media, kind: 'video' };
      }
      items.push({ id: m.id, seq: Number(m.seq), mine, author: m.author_profile_id, body: m.body, replyTo: m.reply_to, media, at: m.created_at, ...(mine ? { readBy: readBy(m) } : {}) });
    }
    // Receipts: how far the other side has read (the furthest of its members).
    const [{ read }] = await q.query(
      `select coalesce(max(last_read_seq), 0)::bigint read from feture.conversation_member where conversation_id = $1 and profile_id <> $2`, [c.id, viewer.profileId]);
    return { state: c.state, endedReason: c.ended_reason, items, otherRead: Number(read), lastSeq: Number(c.last_seq), typingTag: typingTag(String(cfg.pepper), c.id),
      request: requestView(c, viewer.profileId) };
  },

  async 'chat.send'(q, { acting: a, input, signal }) {
    const acting = need(a);
    await requireUnrestricted(q, acting);
    const c = await memberOf(q, input.conversationId, acting, { lock: true });
    await requireOpen(q, c, acting);
    const out = await append(q, c, acting, { body: input.body, replyTo: input.replyTo });
    chatSignal(signal, c, acting);
    return { id: out.id, seq: out.seq };
  },

  async 'chat.sendMedia'(q, { acting: a, input, signal }) {
    const acting = need(a);
    await requireUnrestricted(q, acting);
    const c = await memberOf(q, input.conversationId, acting, { lock: true });
    await requireOpen(q, c, acting);
    const out = await sendMediaInto(q, c, acting, input);
    chatSignal(signal, c, acting);
    return { id: out.id, seq: out.seq };
  },

  async 'chat.openMedia'(q, { acting: a, input, cfg }) {
    // The first conscious tap starts the timer («once» closes at once); a render never does.
    const acting = need(a);
    // Locked: two partners opening at once must still burn the file when both are done.
    const [m] = await q.query('select * from feture.message where id = $1 for update', [input.messageId]);
    if (!m) fail(404, 'not_found');
    const c = await memberOf(q, m.conversation_id, acting);
    if (!m.media_asset_id) fail(400, 'invalid_input', { fields: ['messageId'] });
    const [asset] = await q.query('select * from feture.media_asset where id = $1', [m.media_asset_id]);
    const [prefs] = await q.query('select show_explicit from feture.account where id = $1', [acting.accountId]);
    if (m.media_mode === 'normal') {
      // Blurred by default (chatBlur); a tap shows it, explicit only for those who turned it on.
      const media = asset ? await mediaDto(cfg.media, asset, { viewerProfileId: acting.profileId, place: 'chat', showExplicit: prefs.show_explicit, opened: true, staff: false }).catch(() => null) : null;
      return { media, until: null, gone: !media };
    }
    if (m.author_profile_id === acting.profileId) {
      // The sender may look at their own file until it burns out.
      if (!asset || asset.state === 'removed') return { media: null, gone: true };
      return { media: await mediaDto(cfg.media, { ...asset, view_rule: 'once' }, { viewerProfileId: acting.profileId, place: 'chat', showExplicit: true, staff: false }) };
    }
    const [view] = await q.query('select * from feture.message_media_view where message_id = $1 and viewer_account_id = $2 for update', [m.id, acting.accountId]);
    const state = ephemeralState(m, view);
    if (state === 'none') fail(404, 'not_found');
    if (state === 'done') {
      if (view && !view.done) await q.query('update feture.message_media_view set done = true where message_id = $1 and viewer_account_id = $2', [m.id, acting.accountId]);
      await burnIfDone(q, m.id);
      return { media: null, gone: true }; // returned, not thrown: the closing writes must commit
    }
    // A disappearing clip is only granted here; the view is spent / the timer starts at chat.mediaStarted.
    const clip = asset?.kind === 'video';
    let grant = /** @type {Date | null} */ (null);
    if (state === 'unopened') {
      // Nothing is used up unless the viewer can really see it now.
      if (c.state !== 'active') fail(409, 'conflict', { rule: 'ended' });
      if (!asset || asset.state !== 'approved' || !asset.copies_at) fail(409, 'conflict', { rule: 'pending' });
      if (asset.explicitness !== 'safe' && !prefs.show_explicit) fail(422, 'rule_violation', { rule: 'explicit_off' });
      if (clip) {
        // A grant still running is shown again with a link that dies at the first grant's expiry; it is never extended.
        grant = view.granted_at ? new Date(view.granted_at) : new Date();
        if (!view.granted_at) await q.query('update feture.message_media_view set granted_at = $3 where message_id = $1 and viewer_account_id = $2', [m.id, acting.accountId, grant]);
      } else {
        await q.query(`update feture.message_media_view set opened_at = now(), done = $3 where message_id = $1 and viewer_account_id = $2`,
          [m.id, acting.accountId, m.media_mode === 'once']);
      }
    }
    const fileTtlCap = grant ? Math.max(1, Math.floor((grant.getTime() + GRANT_LINK_SEC * 1e3 - Date.now()) / 1e3)) : undefined;
    const media = asset && asset.state !== 'removed'
      ? await mediaDto(cfg.media, { ...asset, view_rule: 'once' }, { viewerProfileId: acting.profileId, place: 'chat', showExplicit: prefs.show_explicit, opened: true, staff: false, ...(fileTtlCap ? { fileTtlCap } : {}) }).catch(() => null)
      : null;
    if (grant) return { media, until: null, gone: !media, ...(media ? { startBy: new Date(grant.getTime() + GRANT_SEC * 1e3) } : {}) };
    if (m.media_mode === 'once') await burnIfDone(q, m.id);
    const until = m.media_mode === 'once' ? null : new Date((view?.opened_at ? new Date(view.opened_at).getTime() : Date.now()) + TTL_MIN[/** @type {keyof typeof TTL_MIN} */ (m.media_mode)] * 6e4);
    return { media, until, gone: false };
  },

  async 'chat.mediaStarted'(q, { acting: a, input }) {
    // The clip really began to play for this viewer: now the single view is spent (once) / the timer starts. Only the
    // recipient, only after chat.openMedia gave a grant, only inside it; a repeat of the same report changes nothing.
    const acting = need(a);
    const [m] = await q.query('select * from feture.message where id = $1 for update', [input.messageId]);
    if (!m) fail(404, 'not_found');
    await memberOf(q, m.conversation_id, acting);
    if (m.media_mode === 'normal' || m.author_profile_id === acting.profileId) fail(404, 'not_found');
    const [view] = await q.query('select * from feture.message_media_view where message_id = $1 and viewer_account_id = $2 for update', [m.id, acting.accountId]);
    if (!view) fail(404, 'not_found');
    const ttl = TTL_MIN[/** @type {keyof typeof TTL_MIN} */ (m.media_mode)];
    if (view.opened_at) {
      const until = ttl ? new Date(new Date(view.opened_at).getTime() + ttl * 6e4) : null;
      return { started: true, until, gone: false }; // a repeat of the report (a retry): nothing changes
    }
    if (view.done) return { started: false, until: null, gone: true };
    if (!view.granted_at) fail(409, 'conflict', { rule: 'not_opened' });
    if (Date.now() - new Date(view.granted_at).getTime() > (GRANT_SEC + GRANT_SLACK_SEC) * 1e3) {
      // The grant ran out unstarted: it counts as the view.
      await q.query('update feture.message_media_view set done = true where message_id = $1 and viewer_account_id = $2', [m.id, acting.accountId]);
      await burnIfDone(q, m.id);
      return { started: false, until: null, gone: true };
    }
    const once = m.media_mode === 'once';
    const [{ at }] = await q.query(`update feture.message_media_view set opened_at = now(), done = $3 where message_id = $1 and viewer_account_id = $2 returning opened_at at`, [m.id, acting.accountId, once]);
    // No burn here: the served copy outlives the playback by CLIP_BURN_GRACE_MIN (the sweep burns finished clips).
    return { started: true, until: ttl ? new Date(new Date(at).getTime() + ttl * 6e4) : null, gone: false };
  },

  async 'chat.listened'(q, { acting: a, input, signal }) {
    // A recipient played a voice message: remembered once per account; the sender's bubble turns «прослушано».
    const acting = need(a);
    const [m] = await q.query(
      `select m.id, m.conversation_id, m.author_profile_id from feture.message m join feture.media_asset x on x.id = m.media_asset_id and x.kind = 'audio'
       where m.id = $1`, [input.messageId]);
    if (!m) fail(404, 'not_found');
    const c = await memberOf(q, m.conversation_id, acting); // a block or a lost membership hides it like any message
    if (m.author_profile_id === acting.profileId) return { listened: false };
    const rows = await q.query(`insert into feture.message_listen (message_id, account_id) values ($1, $2) on conflict do nothing returning 1`, [m.id, acting.accountId]);
    if (rows[0]) signal(c.other, 'chat');
    return { listened: true };
  },

  async 'chat.typing'(q, { acting: a, input, signal, cfg }) {
    // Only into an open conversation; the other side hears «печатает…» with the conversation's opaque tag, nothing else.
    const acting = need(a);
    const c = await memberOf(q, input.conversationId, acting);
    if (c.state !== 'active' || !c.other) return { sent: false };
    signal(c.other, 'typing', typingTag(String(cfg.pepper), c.id));
    return { sent: true };
  },

  async 'chat.read'(q, { acting: a, input, signal }) {
    // Forward only; never past the last message.
    const acting = need(a);
    const c = await memberOf(q, input.conversationId, acting);
    // Reading a request does not answer it: its sender sees nothing read until it is answered.
    if (c.origin === 'request' && c.request_state !== 'accepted' && c.request_from !== acting.profileId) return { readSeq: Number(c.last_read_seq) };
    const [r] = await q.query(
      `update feture.conversation_member set last_read_seq = greatest(last_read_seq, least($3::bigint, $4::bigint))
       where conversation_id = $1 and account_id = $2 returning last_read_seq`, [c.id, acting.accountId, input.upToSeq, c.last_seq]);
    // A read receipt moved: the other side's ticks update (only when it really moved forward).
    if (Number(r.last_read_seq) > Number(c.last_read_seq)) {
      await markRead(q, c.id, acting.accountId, Number(r.last_read_seq));
      signal(c.other, 'chat');
    }
    return { readSeq: Number(r.last_read_seq) };
  },

  async 'chat.starters'(q, { acting: a, input }) {
    const acting = need(a);
    const c = await memberOf(q, input.conversationId, acting);
    if (!c.other) return { topics: [] };
    // Topic ids only, and only interests BOTH profiles show to everyone (never granted/only ones, never hard limits);
    // the ones marked «обсудить» and rated higher come first.
    const rows = await q.query(
      `select i.topic_id from feture.interest i join feture.interest j on j.topic_id = i.topic_id and j.profile_id = $2 and j.vis = 'public'
       join feture.topic t on t.id = i.topic_id and not t.hidden
       where i.profile_id = $1 and i.vis = 'public' and coalesce(i.mark, '') <> 'hard'
         and exists (select 1 from feture.profile o where o.id = $2 and o.state = 'active') and coalesce(j.mark, '') <> 'hard'
       order by (i.mark = 'discuss' or j.mark = 'discuss') desc nulls last, coalesce(i.value, 0) + coalesce(j.value, 0) desc, i.topic_id limit 5`,
      [acting.profileId, c.other]);
    return { topics: rows.map(r => r.topic_id) };
  },

  async 'chat.mute'(q, { acting: a, input }) {
    const acting = need(a);
    const c = await memberOf(q, input.conversationId, acting);
    await q.query('update feture.conversation_member set muted = $3 where conversation_id = $1 and account_id = $2', [c.id, acting.accountId, input.on]);
    return { muted: input.on };
  },

  async 'chat.archive'(q, { acting: a, input }) {
    const acting = need(a);
    const c = await memberOf(q, input.conversationId, acting);
    await q.query('update feture.conversation_member set archived = $3 where conversation_id = $1 and account_id = $2', [c.id, acting.accountId, input.on]);
    return { archived: input.on };
  },

  async 'chat.with'(q, { acting: a, input }) {
    // «Написать»: the open conversation with them, else whether a request may go out (and the reason when not).
    const acting = need(a);
    const t = await otherProfile(q, acting, input.profileId);
    const c = await pairConversation(q, acting.profileId, t.id);
    if (c) {
      const [m] = await q.query('select 1 from feture.conversation_member where conversation_id = $1 and account_id = $2 and profile_id = $3', [c.id, acting.accountId, acting.profileId]);
      const goneForMe = c.origin === 'request' && ['hidden', 'reported'].includes(c.request_state) && c.request_from !== acting.profileId;
      // Their request I hid: writing to them answers it (chat.request takes it), so it is offered like a new message.
      if (m && goneForMe) return { conversationId: null, canRequest: true, answers: true, context: c.request_context ?? [] };
      if (m) return { conversationId: c.id, request: requestView(c, acting.profileId) };
    }
    const { rule, context, quota } = await chatRequestBlocker(q, acting, t);
    if (rule === 'unavailable') fail(404, 'not_found');
    return { conversationId: null, canRequest: !rule, ...(rule ? { rule } : {}), context, ...(quota ? { left: quota.left, max: quota.max } : {}) };
  },

  async 'chat.request'(q, { acting: a, input, signal }) {
    return startRequest(q, need(a), input, signal);
  },

  async 'chat.requestAnswer'(q, { acting: a, input, signal }) {
    // Either member of the recipient side answers; hiding tells the sender nothing and takes back its notification.
    const acting = need(a);
    const c = await memberOf(q, input.conversationId, acting, { lock: true });
    if (c.origin !== 'request' || c.request_state !== 'pending' || c.request_from === acting.profileId || c.state !== 'active') fail(409, 'conflict', { rule: 'not_request' });
    if (input.answer === 'accept') {
      await acceptRequest(q, c, acting);
      chatSignal(signal, c, acting);
      return { state: 'accepted' };
    }
    await q.query(`update feture.conversation set request_state = 'hidden', answered_at = now() where id = $1`, [c.id]);
    await q.query(`update feture.notification set retracted_at = now() where type = 'chatRequest' and object_id = $1 and retracted_at is null`, [c.id]);
    signal(acting.profileId, 'chat');
    return { state: 'hidden' };
  },
};

/** @type {Record<string, Command>} */
export const chats = Object.fromEntries(
  Object.entries(chatsCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
