// @ts-check
import { inboxCommands } from '../../contracts/inbox.mjs';
import { CATALOG, FILTERS } from '../../contracts/notifications.mjs';
import { fail } from '../errors.mjs';
import { sha256 } from '../hash.mjs';
import { keysetPage, readKeyset } from '../cursor.mjs';
import { withFaces } from './faces.mjs';
import { decideItems } from '../approvals.mjs';
import { appealState } from './moderation.mjs';
import { incomingRequest } from '../sql-rules.mjs';
import { canonicalToken, webSubscription } from '../webpush.mjs';

/** Slice G2 + stage 5 (docs/notifications.md): the inbox of an account (S1 §13). Notifications are stored per account
 * and paged by a cursor over the whole history; «Нужно решить» is computed from its source rows every time (couple
 * invitations, access requests, partner approvals waiting, community join requests and event applications
 * to decide, photo marks), with no limit, each item with its initiator, object and revision. A partner never sees the
 * other's personal items; people hidden by a block are left out everywhere. One number everywhere: the same predicates
 * feed the lists and the counters.
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q
 */

const ACTOR = `json_build_object('id', ap.id, 'kind', ap.kind, 'handle', ap.handle, 'name', ap.name)`;
// A notification for a profile stays only while the recipient is still one of its members (not an ex-partner).
const STILL_MEMBER = `(n.addressee_profile_id is null or exists (select 1 from feture.profile_member pm where pm.profile_id = n.addressee_profile_id and pm.account_id = n.recipient_account_id and pm.state = 'active'))`;
const CHAT_MEMBER = `exists (select 1 from feture.profile_member pm where pm.profile_id = cm.profile_id and pm.account_id = cm.account_id and pm.state = 'active')`;
const MINE = `select m.profile_id from feture.profile_member m join feture.profile p on p.id = m.profile_id
                where m.account_id = $1 and m.state = 'active' and p.state in ('active', 'paused')`;

/** Everything waiting for the account to decide, newest first — all of it (docs/notifications.md «Счётчики»: no limit);
 * with `one`, only that item. @param {Q} q @param {string} accountId @param {{kind: string, id: string}} [one] */
async function decisions(q, accountId, one) {
  return q.query(
    `select * from (${decisionUnion()}) d where ($2::text is null or d.kind = $2 and d.id = $3::uuid) order by at desc, id desc`,
    [accountId, one?.kind ?? null, one?.id ?? null]);
}

/** The «Нужно решить» items of an account (one union over their source rows): who asks (`actor`), the profile it is
 * addressed to, the object it is about with its name (`object_type`, `title`), the revision a decision must carry
 * (`rev`) and what a card shows (`detail`: the parts asked for, the answers to a club's or an event's questions, the
 * kind of link). */
function decisionUnion() {
  const mine = MINE;
  return `
       select 'pinv' kind, i.id, null::uuid addressee, ${ACTOR} actor, null::uuid object_id, i.created_at at, null::text object_type, null::text title, null::int rev, null::jsonb detail
       from feture.couple_invite i join feture.account fa on fa.id = i.from_account join feture.profile ap on ap.id = fa.person_profile_id
       where i.to_account = $1 and i.state = 'pending' and i.expires_at > now()
       union all
       select 'req', r.id, r.owner_profile_id, ${ACTOR}, r.id, r.created_at, 'accessRequest', null, null, jsonb_build_object('scopes', r.scopes)
       from feture.access_request r join feture.profile ap on ap.id = r.requester_profile_id
       where r.owner_profile_id in (${mine}) and r.state = 'pending' and ap.state = 'active' and not feture.blocked(r.owner_profile_id, ap.id)
       union all
       select 'joint', a.id, a.profile_id, null, a.target_id, a.created_at, null, null, null, null
       from feture.partner_approval a join feture.profile p on p.id = a.profile_id
       where a.profile_id in (${mine}) and a.state = 'pending' and a.requested_by <> $1 and a.expires_at > now() and a.safety_epoch = p.safety_epoch
       union all
       select 'capp', r.id, cm.profile_id, ${ACTOR}, r.community_id, r.created_at, 'community', c.name, r.rev,
         jsonb_build_object('question', c.join_question, 'answer', r.answer)
       from feture.community_request r join feture.community_member cm on cm.community_id = r.community_id and cm.state = 'active' and cm.role in ('owner', 'host')
       join feture.community c on c.id = r.community_id and c.state = 'published'
       join feture.profile ap on ap.id = r.profile_id
       where cm.profile_id in (${mine}) and r.state = 'pending' and ap.state = 'active' and not feture.blocked(cm.profile_id, ap.id)
       union all
       select 'eapp', x.id, e.organizer_profile_id, ${ACTOR}, x.event_id, x.created_at, 'event', e.title, x.rev,
         jsonb_build_object('questions', to_jsonb(e.questions), 'answers', to_jsonb(x.answers), 'note', x.note, 'startsAt', e.starts_at, 'tz', e.tz)
       from feture.event_application x join feture.event e on e.id = x.event_id and e.state = 'published' and e.ends_at > now()
       join feture.profile ap on ap.id = x.profile_id
       where e.organizer_profile_id in (${mine}) and x.state = 'pending' and ap.state = 'active' and not feture.blocked(e.organizer_profile_id, ap.id)
       union all
       select case when l.state = 'pending' then 'link' else 'linkChange' end, l.id, case when l.a_profile_id in (${mine}) then l.a_profile_id else l.b_profile_id end, ${ACTOR}, l.id, l.updated_at,
         'link', null, null, jsonb_build_object('kind', l.kind, 'to', l.change->>'kind')
       from feture.profile_link l
       join feture.profile ap on ap.id = case when l.state = 'pending' then l.a_profile_id when l.a_profile_id in (${mine}) then l.b_profile_id else l.a_profile_id end
       where (l.state = 'pending' and l.b_profile_id in (${mine})
              or l.state = 'ok' and l.change is not null and (l.a_profile_id in (${mine}) or l.b_profile_id in (${mine})) and (l.change->>'by')::uuid not in (${mine}))
         and ap.state = 'active' and not feture.blocked(case when l.a_profile_id in (${mine}) then l.a_profile_id else l.b_profile_id end, ap.id)
       union all
       select 'tag', t.post_id, t.profile_id, ${ACTOR}, t.post_id, coalesce(t.asked_at, p.published_at), 'post', null, null, null
       from feture.photo_tag t join feture.post p on p.id = t.post_id and p.state = 'published' join feture.profile ap on ap.id = p.owner_profile_id
       where t.profile_id in (${mine}) and t.state = 'pending' and ap.state = 'active' and not feture.blocked(t.profile_id, ap.id)`;
}

/** How many items wait for the account: the same predicates as the list, counted in SQL. @param {Q} q @param {string} accountId */
async function decisionCount(q, accountId) {
  const [{ n }] = await q.query(`select count(*)::int n from (${decisionUnion()}) d`, [accountId]);
  return n;
}

/** A «Нужно решить» row as the screen gets it: the initiator, the action's kind, the object with its name, the details.
 * @param {any} r @param {Record<string, string>} kinds the addressee profiles' kinds */
function decisionDto(r, kinds) {
  const d = r.detail ?? {};
  /** @type {{q: string | null, a: string}[] | undefined} */
  let answers;
  if (r.kind === 'capp') answers = d.question || d.answer ? [{ q: d.question || null, a: d.answer ?? '' }] : [];
  if (r.kind === 'eapp') answers = [...(d.questions ?? []).map((/** @type {string} */ q, /** @type {number} */ i) => ({ q, a: d.answers?.[i] ?? '' })),
    ...(d.note ? [{ q: null, a: d.note }] : [])];
  return {
    kind: r.kind, id: r.id, objectId: r.object_id, actor: r.actor, at: r.at, label: kinds[r.addressee] === 'couple' ? 'couple' : 'me', addressee: r.addressee,
    object: r.object_type ? { type: r.object_type, id: r.object_id, title: r.title ?? null, ...(r.kind === 'eapp' ? { startsAt: new Date(d.startsAt).toISOString(), tz: d.tz } : {}) } : null,
    ...(r.rev != null ? { rev: r.rev } : {}),
    ...(answers ? { answers } : {}),
    ...(r.kind === 'req' ? { scopes: d.scopes ?? [] } : {}),
    ...(r.kind === 'link' || r.kind === 'linkChange' ? { link: { kind: d.kind, to: d.to ?? null } } : {}),
  };
}

/** A partner's proposal with its own fields (server/approvals.mjs decideItems — the contract the inbox renders):
 * `approvalKind` (one of the 19), `actor` {id, name} (the author), `addressee` (the couple's id, as on every item) with
 * `addresseeName` (its name then), `object` {type, id, title}, `summary` (one short safe line), `approvalId`, `rev`
 * (a number, when the object's version is one) and `baseRev` (the version string the proposal was made on).
 * @param {Q} q @param {string} accountId @param {any[]} items decisionDto rows */
async function withApprovals(q, accountId, items) {
  const joint = await decideItems(q, items.filter(x => x.kind === 'joint').map(x => x.id), accountId);
  return items.map(x => {
    const j = x.kind === 'joint' ? joint.get(x.id) : null;
    if (!j) return x;
    // `rev` stays a number on every item (the inbox parses it so): the object's version when it is one, and always the
    // proposal's own version string as `baseRev`; no `summary` when there is nothing safe to say.
    const { rev: _, ...rest } = x;
    return { ...rest, approvalKind: j.kind, actor: j.actor, addresseeName: j.addressee?.name ?? null, object: j.object, approvalId: j.approvalId,
      ...(j.summary ? { summary: j.summary } : {}), ...(typeof j.rev === 'string' && /^\d+$/.test(j.rev) ? { rev: Number(j.rev) } : {}), baseRev: j.rev ?? null };
  });
}

/** @param {Q} q @param {any[]} rows */
async function addresseeKinds(q, rows) {
  return Object.fromEntries((await q.query(`select id, kind from feture.profile where id = any($1)`, [rows.map(r => r.addressee).filter(Boolean)])).map(r => [r.id, r.kind]));
}

/** Notification types a filter chip shows (the catalog's `filter`); «Другое» also takes types this server does not know. */
const FILTER_TYPES = Object.fromEntries(FILTERS.map(f => [f, Object.keys(CATALOG).filter(k => CATALOG[k].filter === f)]));
const ALL_TYPES = Object.keys(CATALOG);

/** The rows of the inbox (S1 §13): the account's, not taken back, not about someone gone or blocked, and only while
 * the account is still a member of the profile they are addressed to. The object comes with its name and whether the
 * addressee may still see it (an event's time and zone, a cancelled one); a post is never named. */
const NOTE_ROWS = `select n.id, n.type, n.kind, n.object_type, n.object_id, n.sub_object_type, n.sub_object_id, n.couple_id, n.couple_name, n.data, n.created_at,
         n.created_at::text cursor_at, n.id cursor_id, n.read_at, n.addressee_profile_id, n.collapse_key, adr.kind addressee_kind,
         case when ap.id is null then null else ${ACTOR} end actor,
         case n.object_type
           when 'event' then (select json_build_object('title', e.title, 'startsAt', e.starts_at, 'tz', e.tz, 'state', e.state,
                                'visible', e.state = 'cancelled' or feture.event_visible(e, coalesce(n.addressee_profile_id, acc.person_profile_id), n.recipient_account_id))
                              from feture.event e where e.id = n.object_id)
           when 'community' then (select json_build_object('title', c.name, 'state', c.state,
                                    'visible', feture.community_visible(c, coalesce(n.addressee_profile_id, acc.person_profile_id), n.recipient_account_id))
                                  from feture.community c where c.id = n.object_id)
           when 'post' then (select json_build_object('visible', feture.post_visible(p, coalesce(n.addressee_profile_id, acc.person_profile_id), n.recipient_account_id))
                             from feture.post p where p.id = n.object_id)
         end object_info
       from feture.notification n join feture.account acc on acc.id = n.recipient_account_id
       left join feture.profile ap on ap.id = n.actor_profile_id left join feture.profile adr on adr.id = n.addressee_profile_id
       where n.recipient_account_id = $1 and n.retracted_at is null
         and (ap.id is null or ap.state = 'active' and (n.addressee_profile_id is null or not feture.blocked(n.addressee_profile_id, ap.id)))
         and ${STILL_MEMBER}`;

/** A row as the screen gets it. `couple` / `coupleName`: the couple it is addressed to and its name at the time (the
 * actor's own name is never sent from the snapshot: someone gone is not named). `object.gone`: the addressee may no
 * longer see it (the card says the catalog's «Больше недоступно», nothing of the object). `collapse`: the catalog's
 * collapse key (rows with one key show as one summary card). @param {any} row */
function noteDto(row) {
  const { addressee_kind, addressee_profile_id, object_type, object_id, object_info, sub_object_type, sub_object_id, couple_id, couple_name, collapse_key,
    created_at, read_at, cursor_at: _a, cursor_id: _i, ...r } = row;
  const info = object_info ?? null;
  const gone = !!object_type && ['event', 'community', 'post'].includes(object_type) && (!info || !info.visible);
  const object = object_type ? {
    type: object_type, id: object_id, gone,
    ...(info && !gone && info.title ? { title: info.title } : {}),
    ...(info && !gone && object_type === 'event' && info.startsAt ? { startsAt: new Date(info.startsAt).toISOString(), tz: info.tz, state: info.state } : {}),
  } : null;
  return {
    ...r, label: addressee_kind === 'couple' ? 'couple' : 'me', addressee: addressee_profile_id, object,
    sub: sub_object_type ? { type: sub_object_type, id: sub_object_id } : null, couple: couple_id, coupleName: couple_name, collapse: collapse_key ?? null,
    at: created_at, read: !!read_at,
  };
}

/** @type {Record<keyof typeof inboxCommands, Command['run']>} */
const run = {
  async 'notifications.list'(q, { account, input, cfg }) {
    const cur = readKeyset(input.cursor);
    const types = input.filter ? FILTER_TYPES[input.filter] : null;
    const rows = await q.query(
      `${NOTE_ROWS}
         and ($2::timestamptz is null or (n.created_at, n.id) < ($2::timestamptz, $3::uuid))
         and ($4::text[] is null or n.type = any($4) or $5 and not n.type = any($6))
       order by n.created_at desc, n.id desc limit 51`, [account.id, cur.at, cur.id, types, input.filter === 'other', ALL_TYPES]);
    // Full microsecond precision in the cursor: rows in the same millisecond as the page edge are not skipped.
    const page = rows.slice(0, 50);
    const { next } = keysetPage(rows, 50);
    await withFaces(q, cfg.media, { profileId: account.person_profile_id, accountId: account.id }, page, r => r.actor);
    return { items: page.map(noteDto), next };
  },

  async 'notifications.get'(q, { account, input, cfg }) {
    const [row] = await q.query(`${NOTE_ROWS} and n.id = $2`, [account.id, input.id]);
    if (!row) fail(404, 'not_found');
    await withFaces(q, cfg.media, { profileId: account.person_profile_id, accountId: account.id }, [row], r => r.actor);
    const item = noteDto(row);
    // A moderation decision's card: may it be appealed, is an appeal open or decided — only about the person's own
    // target. A resolved report keeps only its outcome: nothing of the reported material, never other reporters.
    const d = row.data ?? {};
    const profile = row.addressee_profile_id ?? account.person_profile_id;
    /** @type {string | null} */
    let appeal = null;
    if (['contentRemoved', 'appealDecided'].includes(row.type) && typeof d.targetType === 'string' && typeof d.targetId === 'string') appeal = await appealState(q, profile, d.targetType, d.targetId);
    else if (row.type === 'profileRestricted') appeal = await appealState(q, profile, 'profile', profile);
    if (row.type === 'reportResolved') item.data = { resolution: d.resolution ?? null };
    return { item, appeal };
  },

  async 'notifications.read'(q, { account, input }) {
    const ids = input.ids ?? [input.id];
    const rows = await q.query('update feture.notification set read_at = coalesce(read_at, now()) where id = any($1) and recipient_account_id = $2 returning id', [ids, account.id]);
    if (!rows[0]) fail(404, 'not_found');
    return { read: true, count: rows.length };
  },

  async 'notifications.readAll'(q, { account }) {
    const rows = await q.query('update feture.notification set read_at = now() where recipient_account_id = $1 and read_at is null and retracted_at is null returning 1', [account.id]);
    return { read: rows.length };
  },

  async 'decide.list'(q, { account, cfg }) {
    const rows = await decisions(q, account.id);
    await withFaces(q, cfg.media, { profileId: account.person_profile_id, accountId: account.id }, rows, r => r.actor);
    const kinds = await addresseeKinds(q, rows);
    return { items: await withApprovals(q, account.id, rows.map(r => decisionDto(r, kinds))) };
  },

  async 'decide.get'(q, { account, input, cfg }) {
    // One item by ID with its revision: a decision reads it fresh, never looks for it in a list page.
    const rows = await decisions(q, account.id, { kind: input.kind, id: input.id });
    if (!rows[0]) fail(404, 'not_found');
    await withFaces(q, cfg.media, { profileId: account.person_profile_id, accountId: account.id }, rows, r => r.actor);
    return { item: (await withApprovals(q, account.id, [decisionDto(rows[0], await addresseeKinds(q, rows))]))[0] };
  },

  async 'inbox.counts'(q, { account }) {
    // The decisions and the counters are independent reads: asked side by side, the slower one sets the time.
    const [decide, [c]] = await Promise.all([decisionCount(q, account.id), q.query(
      `select
         (select count(*)::int from feture.notification n left join feture.profile ap on ap.id = n.actor_profile_id
          where n.recipient_account_id = $1 and n.read_at is null and n.retracted_at is null
            and (ap.id is null or ap.state = 'active' and (n.addressee_profile_id is null or not feture.blocked(n.addressee_profile_id, ap.id)))
            and ${STILL_MEMBER}) notifications,
         (select count(*)::int from feture.conversation_member cm join feture.conversation c on c.id = cm.conversation_id
            join feture.profile o on o.id = case when c.profile_a = cm.profile_id then c.profile_b else c.profile_a end
          where cm.account_id = $1 and not cm.archived and not feture.blocked(cm.profile_id, o.id) and ${CHAT_MEMBER} and not ${incomingRequest('c', 'cm')}
            and exists (select 1 from feture.message m where m.conversation_id = c.id and m.seq > cm.last_read_seq and m.sender_account_id is distinct from $1)) chats,
         (select count(*)::int from feture.conversation_member cm join feture.conversation c on c.id = cm.conversation_id
            join feture.profile o on o.id = case when c.profile_a = cm.profile_id then c.profile_b else c.profile_a end
          where cm.account_id = $1 and c.state = 'active' and c.last_seq = 0 and not cm.archived and not feture.blocked(cm.profile_id, o.id) and ${CHAT_MEMBER}) new_matches,
         (select count(*)::int from feture.conversation_member cm join feture.conversation c on c.id = cm.conversation_id
            join feture.profile o on o.id = case when c.profile_a = cm.profile_id then c.profile_b else c.profile_a end
          where cm.account_id = $1 and c.state = 'active' and c.request_state = 'pending' and ${incomingRequest('c', 'cm')}
            and not feture.blocked(cm.profile_id, o.id) and ${CHAT_MEMBER}) requests,
         (select count(*)::int from feture.profile_like l join feture.profile_member m on m.profile_id = l.to_profile_id and m.account_id = $1 and m.state = 'active'
            join feture.profile ap on ap.id = l.from_profile_id
          where l.state = 'active' and ap.state = 'active' and not feture.blocked(l.to_profile_id, ap.id)) likes,
         exists (select 1 from feture.staff_role r where r.account_id = $1 and r.revoked_at is null) staff`, [account.id])]);
    // The bell shows unread news plus everything to decide, and the screen names each number on its own.
    return { decide, notifications: c.notifications, bell: c.notifications + decide, chats: c.chats, newMatches: c.new_matches, requests: c.requests, likes: c.likes, staff: c.staff };
  },

  async 'push.register'(q, { account, input }) {
    // A browser subscription is checked (a known push service over https, real keys) and stored in one form, so the
    // server never posts to an address a client made up and the same browser is always the same device row.
    const token = input.platform === 'web' ? webToken(input.token) : input.token;
    // A device belongs to whoever signed in on it last.
    await q.query(
      `insert into feture.push_device (token_hash, account_id, platform, token, tz) values ($1, $2, $3, $4, coalesce($5, 'UTC'))
       on conflict (token_hash) do update set account_id = $2, platform = $3, tz = coalesce($5, push_device.tz), last_seen_at = now()`,
      [sha256(token), account.id, input.platform, token, input.tz ?? null]);
    return { registered: true };
  },

  async 'push.unregister'(q, { account, input }) {
    const web = webSubscription(input.token);
    await q.query('delete from feture.push_device where token_hash = $1 and account_id = $2', [sha256(web ? canonicalToken(web) : input.token), account.id]);
    return { registered: false };
  },
};

/** @param {string} token */
function webToken(token) {
  const s = webSubscription(token);
  if (!s) fail(400, 'invalid_input', { fields: ['token'] });
  return canonicalToken(s);
}

/** @type {Record<string, Command>} */
export const inbox = Object.fromEntries(
  Object.entries(inboxCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
