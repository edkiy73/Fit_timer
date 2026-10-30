// @ts-check
import { inboxCommands } from '../../contracts/inbox.mjs';
import { fail } from '../errors.mjs';
import { sha256 } from '../hash.mjs';
import { withFaces } from './faces.mjs';
import { incomingRequest } from '../sql-rules.mjs';
import { canonicalToken, webSubscription } from '../webpush.mjs';

/** Slice G2: the inbox of an account (S1 §13). Notifications are stored per account; «Нужно решить» is computed from its
 * source rows every time (couple invitations, access requests, partner approvals waiting or returned, community join
 * requests and event applications to decide, photo marks). A partner never sees the other's personal items; people
 * hidden by a block are left out everywhere. One number everywhere: the same predicates feed the list and the counters.
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q
 */

const ACTOR = `json_build_object('id', ap.id, 'kind', ap.kind, 'handle', ap.handle, 'name', ap.name)`;
// A notification for a profile stays only while the recipient is still one of its members (not an ex-partner).
const STILL_MEMBER = `(n.addressee_profile_id is null or exists (select 1 from feture.profile_member pm where pm.profile_id = n.addressee_profile_id and pm.account_id = n.recipient_account_id and pm.state = 'active'))`;
const CHAT_MEMBER = `exists (select 1 from feture.profile_member pm where pm.profile_id = cm.profile_id and pm.account_id = cm.account_id and pm.state = 'active')`;

/** Everything waiting for the account to decide, newest first. @param {Q} q @param {string} accountId */
async function decisions(q, accountId) {
  const mine = `select m.profile_id from feture.profile_member m join feture.profile p on p.id = m.profile_id
                where m.account_id = $1 and m.state = 'active' and p.state in ('active', 'paused')`;
  return q.query(
    `select * from (
       select 'pinv' kind, i.id, null::uuid addressee, ${ACTOR} actor, null::uuid object_id, i.created_at at
       from feture.couple_invite i join feture.account fa on fa.id = i.from_account join feture.profile ap on ap.id = fa.person_profile_id
       where i.to_account = $1 and i.state = 'pending' and i.expires_at > now()
       union all
       select 'req', r.id, r.owner_profile_id, ${ACTOR}, null, r.created_at
       from feture.access_request r join feture.profile ap on ap.id = r.requester_profile_id
       where r.owner_profile_id in (${mine}) and r.state = 'pending' and ap.state = 'active' and not feture.blocked(r.owner_profile_id, ap.id)
       union all
       select case when a.state = 'pending' then 'joint' else 'jointReturned' end, a.id, a.profile_id, null, a.target_id, a.created_at
       from feture.partner_approval a join feture.profile p on p.id = a.profile_id
       where a.profile_id in (${mine}) and (a.state = 'pending' and a.requested_by <> $1 and a.expires_at > now() and a.safety_epoch = p.safety_epoch
                                          or a.state = 'returned' and a.requested_by = $1 and a.decided_at > now() - interval '14 days')
       union all
       select 'capp', r.id, cm.profile_id, ${ACTOR}, r.community_id, r.created_at
       from feture.community_request r join feture.community_member cm on cm.community_id = r.community_id and cm.state = 'active' and cm.role in ('owner', 'host')
       join feture.community c on c.id = r.community_id and c.state = 'published'
       join feture.profile ap on ap.id = r.profile_id
       where cm.profile_id in (${mine}) and r.state = 'pending' and ap.state = 'active' and not feture.blocked(cm.profile_id, ap.id)
       union all
       select 'eapp', x.id, e.organizer_profile_id, ${ACTOR}, x.event_id, x.created_at
       from feture.event_application x join feture.event e on e.id = x.event_id and e.state = 'published' and e.ends_at > now()
       join feture.profile ap on ap.id = x.profile_id
       where e.organizer_profile_id in (${mine}) and x.state = 'pending' and ap.state = 'active' and not feture.blocked(e.organizer_profile_id, ap.id)
       union all
       select case when l.state = 'pending' then 'link' else 'linkChange' end, l.id, case when l.a_profile_id in (${mine}) then l.a_profile_id else l.b_profile_id end, ${ACTOR}, null, l.updated_at
       from feture.profile_link l
       join feture.profile ap on ap.id = case when l.state = 'pending' then l.a_profile_id when l.a_profile_id in (${mine}) then l.b_profile_id else l.a_profile_id end
       where (l.state = 'pending' and l.b_profile_id in (${mine})
              or l.state = 'ok' and l.change is not null and (l.a_profile_id in (${mine}) or l.b_profile_id in (${mine})) and (l.change->>'by')::uuid not in (${mine}))
         and ap.state = 'active' and not feture.blocked(case when l.a_profile_id in (${mine}) then l.a_profile_id else l.b_profile_id end, ap.id)
       union all
       select 'tag', t.post_id, t.profile_id, ${ACTOR}, t.post_id, coalesce(t.asked_at, p.published_at)
       from feture.photo_tag t join feture.post p on p.id = t.post_id and p.state = 'published' join feture.profile ap on ap.id = p.owner_profile_id
       where t.profile_id in (${mine}) and t.state = 'pending' and ap.state = 'active' and not feture.blocked(t.profile_id, ap.id)
     ) d order by at desc limit 200`, [accountId]);
}

/** @type {Record<keyof typeof inboxCommands, Command['run']>} */
const run = {
  async 'notifications.list'(q, { account, input, cfg }) {
    let cur = null;
    if (input.cursor) {
      try { cur = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')); } catch { /* checked below */ }
      if (!Array.isArray(cur) || typeof cur[0] !== 'string' || !/^[0-9a-f-]{36}$/.test(cur[1]) || Number.isNaN(Date.parse(cur[0]))) fail(400, 'invalid_input', { fields: ['cursor'] });
    }
    const rows = await q.query(
      `select n.id, n.type, n.object_type, n.object_id, n.data, n.created_at, n.created_at::text cursor_at, n.read_at, n.addressee_profile_id, adr.kind addressee_kind,
         case when ap.id is null then null else ${ACTOR} end actor
       from feture.notification n left join feture.profile ap on ap.id = n.actor_profile_id left join feture.profile adr on adr.id = n.addressee_profile_id
       where n.recipient_account_id = $1 and n.retracted_at is null
         and (ap.id is null or ap.state = 'active' and (n.addressee_profile_id is null or not feture.blocked(n.addressee_profile_id, ap.id)))
         and ${STILL_MEMBER}
         and ($2::timestamptz is null or (n.created_at, n.id) < ($2::timestamptz, $3::uuid))
       order by n.created_at desc, n.id desc limit 51`, [account.id, cur?.[0] ?? null, cur?.[1] ?? null]);
    const page = rows.slice(0, 50);
    const last = page[page.length - 1];
    await withFaces(q, cfg.media, { profileId: account.person_profile_id, accountId: account.id }, page, r => r.actor);
    return {
      // «Тебе» / «Паре» by the profile it is addressed to.
      items: page.map(({ addressee_kind, addressee_profile_id, object_type, object_id, created_at, read_at, cursor_at: _, ...r }) => ({
        ...r, label: addressee_kind === 'couple' ? 'couple' : 'me', addressee: addressee_profile_id, object: object_type ? { type: object_type, id: object_id } : null,
        at: created_at, read: !!read_at,
      })),
      // Full microsecond precision: rows in the same millisecond as the page edge are not skipped.
      next: rows.length > 50 ? Buffer.from(JSON.stringify([last.cursor_at, last.id])).toString('base64url') : null,
    };
  },

  async 'notifications.read'(q, { account, input }) {
    const rows = await q.query('update feture.notification set read_at = coalesce(read_at, now()) where id = $1 and recipient_account_id = $2 returning id', [input.id, account.id]);
    if (!rows[0]) fail(404, 'not_found');
    return { read: true };
  },

  async 'notifications.readAll'(q, { account }) {
    const rows = await q.query('update feture.notification set read_at = now() where recipient_account_id = $1 and read_at is null and retracted_at is null returning 1', [account.id]);
    return { read: rows.length };
  },

  async 'decide.list'(q, { account, cfg }) {
    const rows = await decisions(q, account.id);
    await withFaces(q, cfg.media, { profileId: account.person_profile_id, accountId: account.id }, rows, r => r.actor);
    const kinds = Object.fromEntries((await q.query(`select id, kind from feture.profile where id = any($1)`, [rows.map(r => r.addressee).filter(Boolean)])).map(r => [r.id, r.kind]));
    return {
      items: rows.map(r => ({ kind: r.kind, id: r.id, objectId: r.object_id, actor: r.actor, at: r.at, label: kinds[r.addressee] === 'couple' ? 'couple' : 'me', addressee: r.addressee })),
    };
  },

  async 'inbox.counts'(q, { account }) {
    // The decisions and the counters are independent reads: asked side by side, the slower one sets the time.
    const [list, [c]] = await Promise.all([decisions(q, account.id), q.query(
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
    const decide = list.length;
    // The bell shows unread news plus everything to decide; «Нужно решить» is the same number everywhere.
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
