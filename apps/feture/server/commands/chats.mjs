// @ts-check
import { chatsCommands } from '../../contracts/chats.mjs';
import { fail } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { mediaDto } from '../media/assets.mjs';
import { requireUnrestricted } from '../profiles.mjs';
import { withFaces } from './faces.mjs';
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

/** @param {Acting | null} acting @returns {Acting} */
const need = acting => { if (!acting) throw new Error('acting profile missing'); return acting; };

/** Opens the conversation of a new match for the accounts of both sides. @param {Q} q @param {string} matchId @param {string} a @param {string} b */
export async function openConversation(q, matchId, a, b) {
  const [c] = await q.query(
    `insert into feture.conversation (match_id, profile_a, profile_b) values ($1, least($2::uuid, $3::uuid), greatest($2::uuid, $3::uuid)) returning id`, [matchId, a, b]);
  await q.query(
    `insert into feture.conversation_member (conversation_id, account_id, profile_id)
     select $1, m.account_id, m.profile_id from feture.profile_member m where m.profile_id in ($2, $3) and m.state = 'active'
     on conflict do nothing`, [c.id, a, b]);
  return c.id;
}

/** Ends the active conversations between two profiles (or all of one profile when `b` is null).
 * @param {Q} q @param {string} a @param {string | null} b @param {'unmatch' | 'block' | 'pair_ended' | 'account_deleted'} reason */
export async function endConversations(q, a, b, reason) {
  await q.query(
    `update feture.conversation set state = 'ended', ended_reason = $3, ended_at = now()
     where state = 'active' and ($2::uuid is null and (profile_a = $1 or profile_b = $1) or profile_a = least($1::uuid, $2::uuid) and profile_b = greatest($1::uuid, $2::uuid))`,
    [a, b, reason]);
}

/** The conversation as the acting profile's member account sees it. @param {Q} q @param {string} conversationId @param {Acting} acting
 * @param {{lock?: boolean}} [opts] */
async function memberOf(q, conversationId, acting, { lock = false } = {}) {
  const [c] = await q.query(
    `select c.*, cm.last_read_seq, cm.muted, cm.archived, case when c.profile_a = cm.profile_id then c.profile_b else c.profile_a end other
     from feture.conversation c join feture.conversation_member cm on cm.conversation_id = c.id and cm.account_id = $2 and cm.profile_id = $3
     where c.id = $1 ${lock ? 'for update of c' : ''}`, [conversationId, acting.accountId, acting.profileId]);
  if (!c) fail(404, 'not_found');
  // Blocked either way: the conversation is gone for both (it was ended by the block).
  if (c.other && (await q.query('select feture.blocked($1, $2) b', [acting.profileId, c.other]))[0].b) fail(404, 'not_found');
  return c;
}

/** May a new message go out? Active conversation, active match, both sides active. @param {Q} q @param {any} c */
async function requireOpen(q, c) {
  if (c.state !== 'active') fail(409, 'conflict', { rule: 'ended' });
  const [m] = await q.query(`select 1 from feture.profile_match where id = $1 and ended_at is null`, [c.match_id]);
  if (!m) fail(409, 'conflict', { rule: 'no_match' });
  const [{ n }] = await q.query(`select count(*)::int n from feture.profile where id in ($1, $2) and state = 'active'`, [c.profile_a, c.profile_b]);
  if (n !== 2) fail(409, 'conflict', { rule: 'pair_inactive' });
}

/** Appends a message with the next seq and tells the other side's members (push in slice G2).
 * @param {Q} q @param {any} c @param {Acting} acting @param {{body: string, replyTo?: string, assetId?: string, mode?: string}} m */
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
  await enqueue(q, 'message.created', c.other, { conversationId: c.id, seq: Number(seq), for: others.filter(o => !o.muted).map(o => o.account_id) });
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
  const due = await db.query(
    `update feture.message_media_view v set done = true from feture.message m
     where m.id = v.message_id and not v.done and (
       v.opened_at is not null and m.media_mode = 'once'
       or v.opened_at is not null and v.opened_at + (case m.media_mode when 't15' then 15 when 't120' then 120 else 1440 end) * interval '1 minute' < now()
       or v.opened_at is null and m.created_at < now() - interval '${UNOPENED_DAYS} days')
     returning v.message_id`);
  // Also files whose last view finished but whose burn was lost (a crash between the two steps).
  const finished = await db.query(
    `select m.id message_id from feture.message m join feture.media_asset a on a.id = m.media_asset_id
     where m.media_mode <> 'normal' and a.state not in ('removed', 'blocked')
       and not exists (select 1 from feture.message_media_view v where v.message_id = m.id and not v.done) limit 200`);
  for (const id of new Set([...due, ...finished].map(r => r.message_id))) await db.tx(q => burnIfDone(q, id));
  return due.length;
}

/** @type {Record<keyof typeof chatsCommands, Command['run']>} */
const run = {
  async 'chats.list'(q, { account, input, cfg }) {
    // Unread counts are per reading account; conversations with someone blocked either way are not listed.
    const rows = await q.query(
      `select c.id, c.state, c.last_seq, c.last_message_at, c.created_at, cm.profile_id side, sp.kind side_kind, cm.muted, cm.archived,
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
       order by coalesce(c.last_message_at, c.created_at) desc limit 200`, [account.id, input.archived, input.filter]);
    const assets = await q.query('select * from feture.media_asset where id = any($1)', [rows.map(r => r.avatar_asset_id).filter(Boolean)]);
    const items = [];
    for (const r of rows) {
      const asset = assets.find(a => a.id === r.avatar_asset_id);
      items.push({
        id: r.id, state: r.state, side: { id: r.side, kind: r.side_kind }, newMatch: Number(r.last_seq) === 0,
        other: {
          id: r.other_id, kind: r.other_kind, handle: r.other_handle, name: r.other_name || r.other_handle,
          avatar: asset ? await mediaDto(cfg.media, asset, { viewerProfileId: r.side, place: 'public', showExplicit: false, staff: false }).catch(() => null) : null,
        },
        unread: r.unread, muted: r.muted, archived: r.archived, last: r.last, at: r.last_message_at ?? r.created_at,
      });
    }
    return { items };
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
    return { state: c.state, endedReason: c.ended_reason, items, otherRead: Number(read), lastSeq: Number(c.last_seq), typingTag: typingTag(String(cfg.pepper), c.id) };
  },

  async 'chat.send'(q, { acting: a, input, signal }) {
    const acting = need(a);
    await requireUnrestricted(q, acting);
    const c = await memberOf(q, input.conversationId, acting, { lock: true });
    await requireOpen(q, c);
    const out = await append(q, c, acting, { body: input.body, replyTo: input.replyTo });
    chatSignal(signal, c, acting);
    return { id: out.id, seq: out.seq };
  },

  async 'chat.sendMedia'(q, { acting: a, input, signal }) {
    const acting = need(a);
    await requireUnrestricted(q, acting);
    const c = await memberOf(q, input.conversationId, acting, { lock: true });
    await requireOpen(q, c);
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
    if (input.mode !== 'normal') {
      // Ephemeral media: everyone on both sides confirmed an adult.
      const [{ ok }] = await q.query(
        `select coalesce(bool_and(coalesce(a.age_verified_until > now(), false)), false) ok from feture.conversation_member cm join feture.account a on a.id = cm.account_id
         where cm.conversation_id = $1`, [c.id]);
      if (!ok) fail(422, 'rule_violation', { rule: 'age_required' });
    }
    await q.query(`insert into feture.media_attachment (asset_id, target_type, target_id) values ($1, 'message', $2) on conflict do nothing`, [input.assetId, c.id]);
    const out = await append(q, c, acting, { body: input.body, replyTo: input.replyTo, assetId: input.assetId, mode: input.mode });
    if (input.mode !== 'normal') {
      await q.query(`insert into feture.message_media_view (message_id, viewer_account_id) select $1, unnest($2::uuid[])`, [out.id, out.recipients]);
    }
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
    if (state === 'unopened') {
      // Nothing is used up unless the viewer can really see it now.
      if (c.state !== 'active') fail(409, 'conflict', { rule: 'ended' });
      if (!asset || asset.state !== 'approved' || !asset.copies_at) fail(409, 'conflict', { rule: 'pending' });
      if (asset.explicitness !== 'safe' && !prefs.show_explicit) fail(422, 'rule_violation', { rule: 'explicit_off' });
      await q.query(`update feture.message_media_view set opened_at = now(), done = $3 where message_id = $1 and viewer_account_id = $2`,
        [m.id, acting.accountId, m.media_mode === 'once']);
    }
    const media = asset && asset.state !== 'removed'
      ? await mediaDto(cfg.media, { ...asset, view_rule: 'once' }, { viewerProfileId: acting.profileId, place: 'chat', showExplicit: prefs.show_explicit, opened: true, staff: false }).catch(() => null)
      : null;
    if (m.media_mode === 'once') await burnIfDone(q, m.id);
    const until = m.media_mode === 'once' ? null : new Date((view?.opened_at ? new Date(view.opened_at).getTime() : Date.now()) + TTL_MIN[/** @type {keyof typeof TTL_MIN} */ (m.media_mode)] * 6e4);
    return { media, until, gone: false };
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
};

/** @type {Record<string, Command>} */
export const chats = Object.fromEntries(
  Object.entries(chatsCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
