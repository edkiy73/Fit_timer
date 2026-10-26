// @ts-check
import { randomBytes } from 'node:crypto';
import { communitiesCommands } from '../../contracts/communities.mjs';
import { fail, isUniqueViolation } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { sha256 } from '../hash.mjs';
import { needsPartner, registerApprovalKind, requestApproval } from '../approvals.mjs';
import { journal, requireStaff } from './staff.mjs';

/** Slice D1: communities and discussions (S1 §9, extract/communities-events.md).
 * A community is owned by a profile (a couple can run one) and goes to staff before it is published; major edits
 * (name, description, cover, wider privacy) wait for staff while the published version stays (Q15). Removal from a
 * community is a ban: coming back needs a new request even for an open one (Q14). Members are unlisted by default
 * (Q13). A hidden community exists only for members and holders of an invitation link.
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q
 * @typedef {import('../profiles.mjs').Acting} Acting
 */

const PRIVACY = ['hidden', 'closed', 'open'];
const MAJOR = ['name', 'description', 'coverAssetId'];
const COLS = { name: 'name', description: 'description', topics: 'topics', privacy: 'privacy', joinQuestion: 'join_question', rules: 'rules', placeId: 'place_id', coverAssetId: 'cover_asset_id', plate: 'plate' };

/** @param {Acting | null} acting @returns {Acting} */
const need = acting => { if (!acting) throw new Error('acting profile missing'); return acting; };

/** The community if the viewer may see it (or holds a valid invitation to a hidden one). @param {Q} q @param {string} id
 * @param {Acting} viewer @param {string} [invite] */
async function visible(q, id, viewer, invite) {
  const [c] = await q.query(
    `select c.*, feture.community_visible(c, $2, $3) can_see,
       exists (select 1 from feture.profile_member m where m.profile_id = c.owner_profile_id and m.account_id = $3 and m.state = 'active') own
     from feture.community c where c.id = $1`, [id, viewer.profileId, viewer.accountId]);
  if (!c) fail(404, 'not_found');
  if (c.can_see) return c;
  if (invite && c.state === 'published' && c.privacy === 'hidden') {
    const [inv] = await q.query(`select 1 from feture.community_invite where token_hash = $1 and community_id = $2 and revoked_at is null and expires_at > now()`, [sha256(invite), id]);
    const [{ b }] = await q.query('select feture.blocked($1, $2) b', [viewer.profileId, c.owner_profile_id]);
    if (inv && !b) return c;
  }
  fail(404, 'not_found');
}

/** @param {Q} q @param {string} communityId @param {string} profileId */
async function membership(q, communityId, profileId) {
  const [m] = await q.query(`select * from feture.community_member where community_id = $1 and profile_id = $2`, [communityId, profileId]);
  return m ?? null;
}

/** @param {Q} q @param {string} communityId @param {string} profileId */
async function isReader(q, communityId, profileId) {
  const [{ ok }] = await q.query('select feture.community_reader($1, $2) ok', [communityId, profileId]);
  return ok;
}

/** Owner or host acting for the community (the acting profile, or its owner profile for the owner role).
 * @param {Q} q @param {string} communityId @param {Acting} acting @param {'owner' | 'host'} least */
async function requireHost(q, communityId, acting, least) {
  const m = await membership(q, communityId, acting.profileId);
  if (!m || m.state !== 'active' || (least === 'owner' ? m.role !== 'owner' : !['owner', 'host'].includes(m.role))) fail(403, 'forbidden');
  return m;
}

/** May the acting profile write in the community (discussions, replies, reactions)? A couple writes «от пары» when the
 * couple is a member, or when both partners are members who may write. @param {Q} q @param {string} communityId @param {Acting} acting */
export async function canWrite(q, communityId, acting) {
  const m = await membership(q, communityId, acting.profileId);
  if (m) return m.state === 'active' && !m.read_only;
  if (acting.kind !== 'couple') return false;
  const [{ ok }] = await q.query(
    `select count(*) = 2 ok from feture.profile_member pm join feture.account a on a.id = pm.account_id
     join feture.community_member cm on cm.community_id = $2 and cm.profile_id = a.person_profile_id and cm.state = 'active' and not cm.read_only
     where pm.profile_id = $1 and pm.state = 'active'`, [acting.profileId, communityId]);
  return ok;
}

/** Topics, cover and place of a create or an edit: known topics, the owner's own community cover, an approved place
 * or one the author submitted. @param {Q} q @param {string} ownerProfileId @param {string} accountId @param {any} f */
async function checkRefs(q, ownerProfileId, accountId, f) {
  if (f.topics) {
    const [{ n }] = await q.query('select count(*)::int n from feture.topic where id = any($1) and not hidden', [f.topics]);
    if (n !== f.topics.length) fail(400, 'invalid_input', { fields: ['topics'] });
  }
  if (f.coverAssetId) {
    const [a] = await q.query(`select 1 from feture.media_asset where id = $1 and owner_profile_id = $2 and purpose = 'community' and state in ('uploaded', 'scanning', 'needs_review', 'approved')`, [f.coverAssetId, ownerProfileId]);
    if (!a) fail(400, 'invalid_input', { fields: ['coverAssetId'] });
  }
  if (f.placeId) {
    const [pl] = await q.query(`select 1 from feture.place where id = $1 and (state = 'approved' or state = 'pending' and submitted_by = $2)`, [f.placeId, accountId]);
    if (!pl) fail(400, 'invalid_input', { fields: ['placeId'] });
  }
}

/** Is a profile kept out of a community: blocked with its owner, or one of the profile's people (or their couple) was
 * removed from it (a ban covers the person and the couple alike, Q14)? @param {Q} q @param {any} c @param {string} profileId */
async function keptOut(q, c, profileId) {
  const [{ out, banned }] = await q.query(
    `select feture.blocked($2, $3) out,
       exists (select 1 from feture.community_member cm
               join feture.profile_member x on x.profile_id = cm.profile_id
               join feture.profile_member y on y.account_id = x.account_id and y.profile_id = $2
               where cm.community_id = $1 and cm.state = 'removed') banned`, [c.id, profileId, c.owner_profile_id]);
  return { out, banned };
}

/** @param {Q} q @param {string} ownerProfileId @param {string} accountId @param {any} f */
async function createCommunity(q, ownerProfileId, accountId, f) {
  await checkRefs(q, ownerProfileId, accountId, f);
  let c;
  try {
    [c] = await q.query(
      `insert into feture.community (owner_profile_id, created_by, name, description, topics, privacy, join_question, rules, place_id, cover_asset_id, plate)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
      [ownerProfileId, accountId, f.name, f.description, f.topics, f.privacy, f.privacy === 'open' ? null : (f.joinQuestion ?? null), f.rules, f.placeId ?? null, f.coverAssetId ?? null, f.plate]);
  } catch (error) {
    if (isUniqueViolation(error)) fail(409, 'conflict', { field: 'name' });
    throw error;
  }
  await q.query(`insert into feture.community_member (community_id, profile_id, role, listed) values ($1, $2, 'owner', true)`, [c.id, ownerProfileId]);
  await enqueue(q, 'moderation.community', ownerProfileId, { communityId: c.id });
  return { id: c.id, state: 'in_review' };
}

/** @param {Q} q @param {string} communityId @param {string} profileId @param {string} accountId */
async function joinNow(q, communityId, profileId, accountId) {
  await q.query(
    `insert into feture.community_member (community_id, profile_id) values ($1, $2)
     on conflict (community_id, profile_id) do update set state = 'active', joined_at = now(), removed_at = null`, [communityId, profileId]);
  await enqueue(q, 'community.joined', profileId, { communityId, by: accountId });
}

registerApprovalKind('community.create', {
  apply: async (q, row) => { await createCommunity(q, row.profile_id, row.requested_by, row.change); },
});
registerApprovalKind('community.join', {
  apply: async (q, row) => {
    const c = /** @type {any} */ (row.change);
    const [cm] = await q.query(`select id, state, privacy, owner_profile_id from feture.community where id = $1`, [c.communityId]);
    if (!cm || cm.state !== 'published') fail(409, 'conflict');
    // Re-checked at approval: a block since, a ban, a hidden community whose invitation was revoked meanwhile.
    const { out, banned } = await keptOut(q, cm, row.profile_id);
    if (out) fail(409, 'conflict');
    if (cm.privacy === 'hidden') {
      const [inv] = await q.query(`select 1 from feture.community_invite where token_hash = decode($1, 'hex') and community_id = $2 and revoked_at is null and expires_at > now()`, [c.inviteHash ?? '', cm.id]);
      if (!inv) fail(409, 'conflict');
    }
    const m = await membership(q, c.communityId, row.profile_id);
    if (m?.state === 'active') fail(409, 'conflict');
    if (cm.privacy === 'open' && !banned) await joinNow(q, c.communityId, row.profile_id, row.requested_by);
    else await q.query(`insert into feture.community_request (community_id, profile_id, answer, acted_by) values ($1, $2, $3, $4)`, [c.communityId, row.profile_id, c.answer, row.requested_by]);
  },
});

/** @type {Record<keyof typeof communitiesCommands, Command['run']>} */
const run = {
  async 'community.create'(q, { acting: a, input }) {
    const acting = need(a);
    const { opId: _, ...f } = input;
    if (needsPartner(acting, 'community.create')) {
      return { pending: await requestApproval(q, acting, { kind: 'community.create', targetType: 'community:' + f.name.toLowerCase(), targetId: null, change: f, summary: [f.name] }) };
    }
    return createCommunity(q, acting.profileId, acting.accountId, f);
  },

  async 'community.update'(q, { acting: a, input }) {
    const acting = need(a);
    await requireHost(q, input.communityId, acting, 'owner');
    const [c] = await q.query(`select * from feture.community where id = $1 for update`, [input.communityId]);
    if (c.rev !== input.rev) fail(409, 'conflict', { rev: c.rev });
    const { opId: _, communityId: __, rev: ___, ...f } = input;
    await checkRefs(q, c.owner_profile_id, acting.accountId, f);
    if (f.privacy === 'open') f.joinQuestion = null; // an open community has no join question
    /** @type {Record<string, unknown>} */
    const now = /** @type {Record<string, unknown>} */ ({}), later = /** @type {Record<string, unknown>} */ ({});
    for (const [k, v] of Object.entries(f)) {
      if (v === undefined) continue;
      const major = c.state === 'published' && (MAJOR.includes(k) || (k === 'privacy' && PRIVACY.indexOf(String(v)) > PRIVACY.indexOf(c.privacy)));
      (major ? later : now)[k] = v;
    }
    // A join question that comes with opening the community waits together with the privacy change.
    if ('privacy' in later && 'joinQuestion' in now) { later.joinQuestion = now.joinQuestion; delete now.joinQuestion; }
    if (Object.keys(now).length) {
      const keys = Object.keys(now);
      await q.query(
        `update feture.community set ${keys.map((k, i) => `${COLS[/** @type {keyof typeof COLS} */ (k)]} = $${i + 2}`).join(', ')}, rev = rev + 1, updated_at = now() where id = $1`,
        [c.id, ...keys.map(k => now[k])]);
    }
    if (Object.keys(later).length) {
      // The published version stays until staff check the new name, description, cover or wider privacy.
      await q.query(`update feture.community set pending_change = coalesce(pending_change, '{}'::jsonb) || $2::jsonb, rev = rev + 1 where id = $1`, [c.id, JSON.stringify(later)]);
      await enqueue(q, 'moderation.community', c.owner_profile_id, { communityId: c.id, change: true });
    }
    const [{ rev }] = await q.query('select rev from feture.community where id = $1', [c.id]);
    return { rev, review: Object.keys(later) };
  },

  async 'community.get'(q, { acting: a, input }) {
    const viewer = need(a);
    const c = await visible(q, input.communityId, viewer, input.invite);
    const m = await membership(q, c.id, viewer.profileId);
    const [counts] = await q.query(
      `select count(*) filter (where state = 'active')::int members,
              (select count(*)::int from feture.community_request r where r.community_id = $1 and r.state = 'pending') requests
       from feture.community_member where community_id = $1`, [c.id]);
    const [req] = await q.query(`select id, state from feture.community_request where community_id = $1 and profile_id = $2 order by created_at desc limit 1`, [c.id, viewer.profileId]);
    const hosts = await q.query(
      `select p.id, p.kind, p.handle, p.name, cm.role from feture.community_member cm join feture.profile p on p.id = cm.profile_id
       where cm.community_id = $1 and cm.state = 'active' and cm.role in ('owner', 'host') and p.state = 'active' and not feture.blocked($2, p.id)`, [c.id, viewer.profileId]);
    const host = m?.state === 'active' && ['owner', 'host'].includes(m.role);
    return {
      community: {
        id: c.id, name: c.name, description: c.description, topics: c.topics, privacy: c.privacy, joinQuestion: c.privacy === 'open' ? null : c.join_question,
        rules: c.rules, placeId: c.place_id, plate: c.plate, members: counts.members, hosts,
        me: m ? { role: m.role, state: m.state, listed: m.listed, readOnly: m.read_only, muted: m.muted } : null,
        request: req?.state === 'pending' ? { id: req.id } : null,
        ...(host ? { pendingRequests: counts.requests } : {}),
        ...(c.own ? { state: c.state, rev: c.rev, pendingChange: c.pending_change, rejectReason: c.reject_reason } : {}),
      },
    };
  },

  async 'community.catalog'(q, { acting: a, input }) {
    const viewer = need(a);
    let cur = null;
    if (input.cursor) {
      try { cur = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')); } catch { /* checked below */ }
      if (!Array.isArray(cur) || typeof cur[0] !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(cur[1]) || Number.isNaN(Date.parse(cur[0]))) {
        fail(400, 'invalid_input', { fields: ['cursor'] });
      }
    }
    const rows = await q.query(
      `select c.id, c.name, c.topics, c.privacy, c.place_id, c.plate, c.published_at,
         (select count(*)::int from feture.community_member m where m.community_id = c.id and m.state = 'active') members,
         exists (select 1 from feture.community_member m where m.community_id = c.id and m.profile_id = $1 and m.state = 'active') joined
       from feture.community c
       where c.state = 'published' and c.privacy <> 'hidden' and feture.community_visible(c, $1, $2)
         and ($3::text[] is null or c.topics && $3) and ($4::text is null or c.privacy = $4)
         and ($5::timestamptz is null or (c.published_at, c.id) < ($5::timestamptz, $6::uuid))
       order by c.published_at desc, c.id desc limit 21`,
      [viewer.profileId, viewer.accountId, input.topics?.length ? input.topics : null, input.privacy ?? null, cur?.[0] ?? null, cur?.[1] ?? null]);
    const page = rows.slice(0, 20);
    const last = page[page.length - 1];
    return { items: page.map(({ published_at: _, ...r }) => r), next: rows.length > 20 ? Buffer.from(JSON.stringify([new Date(last.published_at).toISOString(), last.id])).toString('base64url') : null };
  },

  async 'community.mine'(q, { acting: a }) {
    const viewer = need(a);
    const rows = await q.query(
      `select c.id, c.name, c.state, c.privacy, cm.role, cm.state member_state from feture.community_member cm join feture.community c on c.id = cm.community_id
       where cm.profile_id = $1 and cm.state = 'active' and c.state <> 'deleted' order by cm.joined_at desc`, [viewer.profileId]);
    const requests = await q.query(
      `select r.id, c.id community_id, c.name from feture.community_request r join feture.community c on c.id = r.community_id
       where r.profile_id = $1 and r.state = 'pending'`, [viewer.profileId]);
    return { hosting: rows.filter(r => r.role !== 'member'), member: rows.filter(r => r.role === 'member'), requests };
  },

  async 'community.join'(q, { acting: a, input }) {
    const acting = need(a);
    const c = await visible(q, input.communityId, acting, input.invite);
    if (c.state !== 'published') fail(409, 'conflict', { state: c.state });
    const m = await membership(q, c.id, acting.profileId);
    if (m?.state === 'active') fail(409, 'conflict', { state: 'member' });
    const { banned } = await keptOut(q, c, acting.profileId);
    const [{ pending }] = await q.query(`select exists (select 1 from feture.community_request where community_id = $1 and profile_id = $2 and state = 'pending') pending`, [c.id, acting.profileId]);
    if (pending) fail(409, 'conflict', { state: 'pending' });
    if (c.privacy !== 'open' && c.join_question && input.answer.length < 10) fail(400, 'invalid_input', { fields: ['answer'] });
    // A couple joining shows the couple there: a widening the partner decides on when they asked to.
    if (needsPartner(acting, 'community.join')) {
      return { pending: await requestApproval(q, acting, { kind: 'community.join', targetType: 'community', targetId: c.id, change: { communityId: c.id, answer: input.answer, inviteHash: input.invite ? sha256(input.invite).toString('hex') : null }, summary: [c.name] }) };
    }
    if (c.privacy === 'open' && !banned) {
      await joinNow(q, c.id, acting.profileId, acting.accountId);
      return { state: 'member' };
    }
    // Closed, hidden, or removed before (a ban): a request the hosts decide on.
    const [r] = await q.query(`insert into feture.community_request (community_id, profile_id, answer, acted_by) values ($1, $2, $3, $4) returning id`,
      [c.id, acting.profileId, c.privacy === 'open' ? '' : input.answer, acting.accountId]);
    await enqueue(q, 'community.requested', c.owner_profile_id, { communityId: c.id, requestId: r.id });
    return { state: 'requested', id: r.id };
  },

  async 'community.requestWithdraw'(q, { acting: a, input }) {
    const acting = need(a);
    const rows = await q.query(
      `update feture.community_request set state = 'withdrawn', decided_at = now(), rev = rev + 1 where id = $1 and profile_id = $2 and state = 'pending' returning id`,
      [input.requestId, acting.profileId]);
    if (!rows[0]) fail(404, 'not_found');
    return { state: 'withdrawn' };
  },

  async 'community.requests'(q, { acting: a, input }) {
    const acting = need(a);
    await requireHost(q, input.communityId, acting, 'host');
    const items = await q.query(
      `select r.id, r.state, r.answer, r.created_at, r.decided_at, r.rev, json_build_object('id', p.id, 'kind', p.kind, 'handle', p.handle, 'name', p.name) profile
       from feture.community_request r join feture.profile p on p.id = r.profile_id
       where r.community_id = $1 and ($2 = 'pending' and r.state = 'pending' or $2 = 'history' and r.state <> 'pending')
         and p.state = 'active' and not feture.blocked($3, p.id)
       order by r.created_at desc limit 50`, [input.communityId, input.tab, acting.profileId]);
    return { items };
  },

  async 'community.requestDecide'(q, { acting: a, input }) {
    const acting = need(a);
    const [r] = await q.query(`select * from feture.community_request where id = $1 for update`, [input.requestId]);
    if (!r) fail(404, 'not_found');
    await requireHost(q, r.community_id, acting, 'host');
    const [c] = await q.query(`select id, state, owner_profile_id from feture.community where id = $1`, [r.community_id]);
    if (c.state !== 'published') fail(409, 'conflict', { state: c.state });
    if (r.state !== 'pending' || r.rev !== input.rev) fail(409, 'conflict', { state: r.state, rev: r.rev });
    const [{ active }] = await q.query(`select exists (select 1 from feture.profile where id = $1 and state = 'active') active`, [r.profile_id]);
    if (input.approve && (!active || (await keptOut(q, c, r.profile_id)).out)) fail(409, 'conflict', { rule: 'requester_unavailable' });
    const [{ own }] = await q.query(
      `select exists (select 1 from feture.profile_member x join feture.profile_member y on x.account_id = y.account_id where x.profile_id = $1 and y.profile_id = $2) own`,
      [r.profile_id, acting.profileId]);
    if (own) fail(403, 'forbidden'); // hosts do not decide on their own requests
    await q.query(`update feture.community_request set state = $2, decided_by = $3, decided_at = now(), rev = rev + 1 where id = $1`,
      [r.id, input.approve ? 'approved' : 'declined', acting.accountId]);
    if (input.approve) await joinNow(q, r.community_id, r.profile_id, acting.accountId);
    await enqueue(q, input.approve ? 'community.approved' : 'community.declined', r.profile_id, { communityId: r.community_id });
    return { state: input.approve ? 'approved' : 'declined' };
  },

  async 'community.leave'(q, { acting: a, input }) {
    const acting = need(a);
    const m = await membership(q, input.communityId, acting.profileId);
    if (!m || m.state !== 'active') fail(404, 'not_found');
    if (m.role === 'owner') fail(422, 'rule_violation', { rule: 'owner_cannot_leave' });
    await q.query(`update feture.community_member set state = 'left', role = 'member' where community_id = $1 and profile_id = $2`, [input.communityId, acting.profileId]);
    return { state: 'left' };
  },

  async 'community.member'(q, { acting: a, input }) {
    const acting = need(a);
    const me = await requireHost(q, input.communityId, acting, input.change === 'host' || input.change === 'unhost' ? 'owner' : 'host');
    const t = await membership(q, input.communityId, input.profileId);
    if (!t || t.state !== 'active') fail(404, 'not_found');
    if (t.role === 'owner' || input.profileId === acting.profileId) fail(422, 'rule_violation', { rule: 'not_allowed' });
    if (t.role === 'host' && me.role !== 'owner') fail(403, 'forbidden'); // hosts manage members, the owner manages hosts
    const sets = { host: `role = 'host'`, unhost: `role = 'member'`, readOnly: `read_only = true`, canWrite: `read_only = false`, remove: `state = 'removed', role = 'member', removed_at = now()` };
    await q.query(`update feture.community_member set ${sets[/** @type {keyof typeof sets} */ (input.change)]} where community_id = $1 and profile_id = $2`, [input.communityId, input.profileId]);
    if (input.change === 'remove') {
      // Removed once and with a status: the approved request is marked removed, a return needs a new request.
      await q.query(`update feture.community_request set state = 'removed', rev = rev + 1 where community_id = $1 and profile_id = $2 and state = 'approved'`, [input.communityId, input.profileId]);
    }
    await enqueue(q, 'community.member', input.profileId, { communityId: input.communityId, change: input.change });
    return { change: input.change };
  },

  async 'community.self'(q, { acting: a, input }) {
    const acting = need(a);
    const rows = await q.query(
      `update feture.community_member set listed = coalesce($3, listed), muted = coalesce($4, muted) where community_id = $1 and profile_id = $2 and state = 'active' returning listed, muted`,
      [input.communityId, acting.profileId, input.listed ?? null, input.muted ?? null]);
    if (!rows[0]) fail(404, 'not_found');
    return rows[0];
  },

  async 'community.members'(q, { acting: a, input }) {
    const viewer = need(a);
    const c = await visible(q, input.communityId, viewer);
    const reader = c.privacy === 'open' || c.own || await isReader(q, c.id, viewer.profileId);
    const [{ n }] = await q.query(`select count(*)::int n from feture.community_member where community_id = $1 and state = 'active'`, [c.id]);
    if (!reader) return { count: n, items: null }; // closed: the list opens after joining
    const items = await q.query(
      `select p.id, p.kind, p.handle, p.name, cm.role, cm.read_only from feture.community_member cm join feture.profile p on p.id = cm.profile_id
       where cm.community_id = $1 and cm.state = 'active' and p.state = 'active' and not feture.blocked($2, p.id)
         and (cm.role <> 'member' or cm.listed or cm.profile_id = $2)
       order by (cm.role = 'owner') desc, (cm.role = 'host') desc, cm.joined_at limit 200`, [c.id, viewer.profileId]);
    return { count: n, items };
  },

  async 'community.invite'(q, { acting: a, input }) {
    const acting = need(a);
    await requireHost(q, input.communityId, acting, 'host');
    if (input.revokeAll) {
      await q.query(`update feture.community_invite set revoked_at = now() where community_id = $1 and revoked_at is null`, [input.communityId]);
      return { revoked: true };
    }
    // An unguessable link; it lets the holder see the community and ask to join, never admits by itself.
    const token = randomBytes(24).toString('base64url');
    const [inv] = await q.query(`insert into feture.community_invite (token_hash, community_id, created_by) values ($1, $2, $3) returning expires_at`, [sha256(token), input.communityId, acting.accountId]);
    return { token, expiresAt: inv.expires_at };
  },

  async 'community.discussions'(q, { acting: a, input }) {
    const viewer = need(a);
    const c = await visible(q, input.communityId, viewer);
    const rows = await q.query(
      `select p.id, p.title, left(p.body, 300) excerpt, p.pinned, p.published_at, p.owner_profile_id,
         (select count(*)::int from feture.reply r where r.post_id = p.id and r.state = 'published') replies
       from feture.post p where p.community_id = $1 and p.state = 'published' and feture.post_visible(p, $2, $3)
       order by p.pinned desc, p.published_at desc limit 50`, [c.id, viewer.profileId, viewer.accountId]);
    const locked = c.privacy !== 'open' && !c.own && !(await isReader(q, c.id, viewer.profileId));
    return { locked, items: locked ? [] : rows };
  },

  async 'discussion.host'(q, { acting: a, input }) {
    const acting = need(a);
    const [p] = await q.query(
      `select p.id, p.community_id, p.owner_profile_id, c.owner_profile_id community_owner from feture.post p join feture.community c on c.id = p.community_id
       where p.id = $1 and p.state = 'published' for update of p`, [input.postId]);
    if (!p) fail(404, 'not_found');
    const me = await requireHost(q, p.community_id, acting, 'host');
    if (input.change === 'remove' && p.owner_profile_id === p.community_owner && me.role !== 'owner') fail(403, 'forbidden');
    const sets = { pin: 'pinned = true', unpin: 'pinned = false', excludePopular: 'popular_excluded = true', includePopular: 'popular_excluded = false', remove: `state = 'removed', removed_reason = 'host'` };
    await q.query(`update feture.post set ${sets[/** @type {keyof typeof sets} */ (input.change)]}, updated_at = now() where id = $1`, [p.id]);
    if (input.change === 'remove') await enqueue(q, 'discussion.removed', p.owner_profile_id, { postId: p.id, communityId: p.community_id });
    return { change: input.change };
  },

  async 'staff.communityQueue'(q, { account, input }) {
    await requireStaff(q, account.id, ['owner', 'lead', 'moderator']);
    const items = await q.query(
      `select c.id, c.rev, c.name, c.description, c.topics, c.privacy, c.join_question, c.rules, c.cover_asset_id, c.place_id, c.state, c.pending_change, c.created_at
       from feture.community c
       where (c.state = 'in_review' or c.pending_change is not null)
         and not exists (select 1 from feture.profile_member m where m.profile_id = c.owner_profile_id and m.account_id = $1)
       order by c.created_at limit $2`, [account.id, input.limit]);
    return { items };
  },

  async 'staff.communityDecide'(q, { account, input }) {
    await requireStaff(q, account.id, ['owner', 'lead', 'moderator']);
    const [c] = await q.query(`select * from feture.community where id = $1 for update`, [input.communityId]);
    if (!c) fail(404, 'not_found');
    const [{ own }] = await q.query(`select exists (select 1 from feture.profile_member where profile_id = $1 and account_id = $2) own`, [c.owner_profile_id, account.id]);
    if (own) fail(403, 'forbidden');
    // Staff decide on exactly what they saw: any edit since bumps rev.
    if (c.rev !== input.rev) fail(409, 'conflict', { rev: c.rev });
    const next = { ...c, ...Object.fromEntries(Object.entries(c.pending_change ?? {}).filter(([k]) => Object.hasOwn(COLS, k)).map(([k, v]) => [COLS[/** @type {keyof typeof COLS} */ (k)], v])) };
    if (input.decision === 'approve' && next.cover_asset_id) {
      // A cover is public everywhere: it must have passed its checks and be safe.
      const [a] = await q.query(`select 1 from feture.media_asset where id = $1 and owner_profile_id = $2 and purpose = 'community' and state = 'approved' and explicitness = 'safe'`, [next.cover_asset_id, c.owner_profile_id]);
      if (!a) fail(422, 'rule_violation', { rule: 'cover_not_approved' });
    }
    if (c.state === 'in_review') {
      await q.query(
        input.decision === 'approve'
          ? `update feture.community set state = 'published', published_at = now(), reject_reason = null where id = $1`
          : `update feture.community set state = 'rejected', reject_reason = $2 where id = $1`,
        input.decision === 'approve' ? [c.id] : [c.id, input.reason]);
    } else if (c.pending_change) {
      if (input.decision === 'approve') {
        const keys = Object.keys(c.pending_change).filter(k => Object.hasOwn(COLS, k));
        if (keys.length) {
          await q.query(
            `update feture.community set ${keys.map((k, i) => `${COLS[/** @type {keyof typeof COLS} */ (k)]} = $${i + 2}`).join(', ')}, pending_change = null, updated_at = now() where id = $1`,
            [c.id, ...keys.map(k => c.pending_change[k])]);
        }
      } else {
        await q.query(`update feture.community set pending_change = null, reject_reason = $2 where id = $1`, [c.id, input.reason]);
      }
    } else fail(409, 'conflict', { state: c.state });
    await enqueue(q, input.decision === 'approve' ? 'community.published' : 'community.rejected', c.owner_profile_id, { communityId: c.id });
    await journal(q, account.id, 'community.' + input.decision, 'community', c.id, {
      rev: c.rev, reason: input.reason || null,
      decided: c.state === 'in_review' ? { name: c.name, description: c.description, privacy: c.privacy, rules: c.rules, cover: c.cover_asset_id } : c.pending_change,
    });
    return { decision: input.decision };
  },
};

/** @type {Record<string, Command>} */
export const communities = Object.fromEntries(
  Object.entries(communitiesCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
