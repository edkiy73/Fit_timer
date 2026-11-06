// @ts-check
import { limit } from '../limits.mjs';
import { peopleCommands } from '../../contracts/people.mjs';
import { fail, isUniqueViolation } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { needsPartner, partnerActed, registerApprovalKind, requestApproval } from '../approvals.mjs';
import { cards } from './discover.mjs';
import { acceptsMention } from '../sql-rules.mjs';
import { qaProfile, requireUnrestricted } from '../profiles.mjs';
import { withFaces } from './faces.mjs';
import { otherProfile } from './access.mjs';
import { readAbout } from '../notify.mjs';

/** Slice F2: people search, links between profiles, «Что у вас общего» (S1 §11, extract/people-discover-chats.md).
 * Search matches the start of a nickname or name, from two characters, never anyone hidden by a block (Q8). A link is
 * shared by its endpoints and shows only as far as the more private of their choices allows; proposing or accepting it
 * from a couple is a widening the partner decides on when they asked to (Q16). «Что у вас общего» uses only public
 * interests of both profiles, never granted or private ones, and gives no score.
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q
 * @typedef {import('../profiles.mjs').Acting} Acting
 */

const MAX_LINKS = 30;
// Unconfirmed proposals one profile may be waiting on (audit item 45): beyond that, a neutral refusal.
const MAX_INCOMING = 50;
/** Confirmed links with live profiles count towards the 30 (audit item 45), not proposals or dead ones.
 * @param {Q} q @param {string} p */
const confirmedLinks = async (q, p) => (await q.query(
  `select count(*)::int n from feture.profile_link l join feture.profile x on x.id = case when l.a_profile_id = $1 then l.b_profile_id else l.a_profile_id end
   where $1 in (l.a_profile_id, l.b_profile_id) and l.state = 'ok' and x.state in ('active', 'paused')`, [p]))[0].n;
const OPPOSITE = { dom: 'sub', sub: 'dom', mentor: 'mentee', mentee: 'mentor' };
const VIS = ['us', 'followers', 'all'];

/** @param {Acting | null} acting @returns {Acting} */
const need = acting => { if (!acting) throw new Error('acting profile missing'); return acting; };

/** The link if the acting profile is one of its endpoints; `me` says which. @param {Q} q @param {string} linkId @param {Acting} acting */
async function endpoint(q, linkId, acting) {
  const [l] = await q.query(`select * from feture.profile_link where id = $1 and $2 in (a_profile_id, b_profile_id) for update`, [linkId, acting.profileId]);
  if (!l) fail(404, 'not_found');
  const me = l.a_profile_id === acting.profileId ? 'a' : 'b';
  const other = me === 'a' ? l.b_profile_id : l.a_profile_id;
  if ((await q.query('select feture.blocked($1, $2) b', [acting.profileId, other]))[0].b) fail(404, 'not_found');
  return { ...l, me, other };
}

/** Proposes a link (also the apply of an approved couple proposal). @param {Q} q @param {Acting} acting @param {any} c */
async function doPropose(q, acting, c) {
  await requireUnrestricted(q, acting, 'links');
  const t = await otherProfile(q, acting, c.profileId);
  if ((await q.query(`select feture.restricted_in($1, 'links') r`, [t.id]))[0].r) fail(404, 'not_found');
  // Counting and inserting under a lock per profile, so parallel proposals cannot pass the limit of 30.
  for (const p of [acting.profileId, t.id].sort()) await q.query(`select pg_advisory_xact_lock(hashtextextended('fe-links:' || $1, 0))`, [p]);
  if (t.related) fail(422, 'rule_violation', { rule: 'own_partner' });
  const [s] = await q.query('select links_from from feture.profile_settings where profile_id = $1', [t.id]);
  if (!s || s.links_from === 'none') fail(422, 'rule_violation', { rule: 'links_closed' });
  if (s.links_from === 'follow') {
    // «Только от тех, на кого я подписан».
    const [f] = await q.query('select 1 from feture.follow where follower_profile_id = $1 and target_profile_id = $2', [t.id, acting.profileId]);
    if (!f) fail(422, 'rule_violation', { rule: 'follow_only' });
  }
  for (const p of [acting.profileId, t.id]) if (await confirmedLinks(q, p) >= MAX_LINKS) fail(422, 'rule_violation', { rule: 'limit_30' });
  const [{ n: waiting }] = await q.query(`select count(*)::int n from feture.profile_link where b_profile_id = $1 and state = 'pending'`, [t.id]);
  if (waiting >= MAX_INCOMING) fail(422, 'rule_violation', { rule: 'links_busy' });
  try {
    const [l] = await q.query(
      `insert into feture.profile_link (a_profile_id, b_profile_id, kind, a_side, b_side, a_vis, acted_by) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [acting.profileId, t.id, c.kind, c.mySide ?? null, c.mySide ? OPPOSITE[/** @type {keyof typeof OPPOSITE} */ (c.mySide)] : null, c.vis, acting.accountId]);
    if (acting.kind === 'couple') await enqueue(q, 'couple.changed', acting.profileId, { for: acting.partnerAccountId, what: 'link' });
    // The other side finds it in «Нужно решить»: a push and a live signal there.
    await enqueue(q, 'link.proposed', t.id, { linkId: l.id, from: acting.profileId });
    return { id: l.id, state: 'pending' };
  } catch (error) {
    if (isUniqueViolation(error)) fail(409, 'conflict', { rule: 'link_exists' });
    throw error;
  }
}

/** Accepts a pending link (also the apply of an approved couple acceptance). @param {Q} q @param {Acting} acting @param {string} linkId @param {string} vis */
async function doAccept(q, acting, linkId, vis) {
  await requireUnrestricted(q, acting, 'links');
  const l = await endpoint(q, linkId, acting);
  if ((await q.query(`select feture.restricted_in($1, 'links') r`, [l.other]))[0].r) fail(409, 'conflict', { rule: 'unavailable' });
  if (l.me !== 'b' || l.state !== 'pending') fail(409, 'conflict', { rule: 'not_pending' });
  // The 30 are checked again when a proposal is accepted: both sides may have filled up since.
  for (const p of [acting.profileId, l.other]) if (await confirmedLinks(q, p) >= MAX_LINKS) fail(422, 'rule_violation', { rule: 'limit_30' });
  await q.query(`update feture.profile_link set state = 'ok', b_vis = $2, confirmed_at = now(), updated_at = now() where id = $1`, [l.id, vis]);
  await readAbout(q, { profile: acting.profileId, kind: 'task', objectType: 'link', objectId: l.id });
  await enqueue(q, 'link.accepted', l.a_profile_id, { linkId: l.id, from: acting.profileId });
  return { state: 'ok' };
}

/** The other side of a link as the couple may see it: active and not blocked either way, else nobody.
 * @param {Q} q @param {string} coupleId @param {string | null} otherId */
async function linkSide(q, coupleId, otherId) {
  const [p] = await q.query(`select id, kind, handle, name from feture.profile where id = $1 and state = 'active' and not feture.blocked($2, id)`, [otherId, coupleId]);
  return p ?? null;
}
/** @param {Q} q @param {string} linkId @param {string} coupleId */
async function linkRow(q, linkId, coupleId) {
  const [l] = await q.query(`select * from feture.profile_link where id = $1 and $2 in (a_profile_id, b_profile_id)`, [linkId, coupleId]);
  return l ?? null;
}
/** @param {any} p */
const sideObject = p => ({ type: 'profile', id: p?.id ?? null, title: p ? p.name || '@' + p.handle : null, state: p ? 'ok' : 'unavailable' });

registerApprovalKind('link.propose', {
  apply: async (q, row) => { await doPropose(q, await actingOf(q, row), row.change); },
  version: async (q, row) => {
    const [l] = await q.query(`select state from feture.profile_link where (a_profile_id = $1 and b_profile_id = $2) or (a_profile_id = $2 and b_profile_id = $1)`, [row.profile_id, row.change.profileId]);
    return l?.state ?? 'none';
  },
  // To whom, which link, which side the couple takes, who will see it.
  preview: async (q, row) => {
    const c = /** @type {any} */ (row.change);
    const p = await linkSide(q, row.profile_id, c.profileId);
    return { object: sideObject(p), subject: p, link: { kind: c.kind, side: c.mySide ?? null, vis: c.vis ?? 'all' }, rows: [] };
  },
});
registerApprovalKind('link.accept', {
  apply: async (q, row) => { const c = /** @type {any} */ (row.change); await doAccept(q, await actingOf(q, row), c.linkId, c.vis); },
  version: async (q, row) => { const l = await linkRow(q, row.change.linkId, row.profile_id); return l ? `${l.state}:${l.kind}` : 'gone'; },
  preview: async (q, row) => {
    const c = /** @type {any} */ (row.change);
    const l = await linkRow(q, c.linkId, row.profile_id);
    const p = l ? await linkSide(q, row.profile_id, l.a_profile_id === row.profile_id ? l.b_profile_id : l.a_profile_id) : null;
    return { object: { ...sideObject(p), state: !l ? 'deleted' : p ? 'ok' : 'unavailable' }, subject: p,
      link: l ? { kind: l.kind, side: l.a_profile_id === row.profile_id ? l.a_side : l.b_side, vis: c.vis ?? 'all' } : null, rows: [] };
  },
});
registerApprovalKind('link.visibility', {
  apply: async (q, row) => {
    const c = /** @type {any} */ (row.change);
    const l = await endpoint(q, c.linkId, await actingOf(q, row));
    await q.query(`update feture.profile_link set ${l.me}_vis = $2, updated_at = now() where id = $1`, [l.id, c.vis]);
  },
  version: async (q, row) => {
    const l = await linkRow(q, row.change.linkId, row.profile_id);
    return l ? String(l.a_profile_id === row.profile_id ? l.a_vis : l.b_vis) : 'gone';
  },
  preview: async (q, row) => {
    const c = /** @type {any} */ (row.change);
    const l = await linkRow(q, c.linkId, row.profile_id);
    const p = l ? await linkSide(q, row.profile_id, l.a_profile_id === row.profile_id ? l.b_profile_id : l.a_profile_id) : null;
    return { object: { ...sideObject(p), state: !l ? 'deleted' : p ? 'ok' : 'unavailable' }, subject: p, link: l ? { kind: l.kind, vis: c.vis } : null,
      rows: [{ field: 'linkVis', before: l ? (l.a_profile_id === row.profile_id ? l.a_vis : l.b_vis) : null, after: c.vis }] };
  },
});

/** The acting profile an approved change runs as. @param {Q} q @param {any} row @returns {Promise<Acting>} */
async function actingOf(q, row) {
  const [p] = await q.query(
    `select p.kind, (select account_id from feture.profile_member where profile_id = p.id and account_id <> $2 and state = 'active' limit 1) partner
     from feture.profile p where p.id = $1`, [row.profile_id, row.requested_by]);
  return /** @type {Acting} */ ({ profileId: row.profile_id, accountId: row.requested_by, kind: p.kind, partnerAccountId: p.partner ?? null });
}

/** «Что у вас общего» rows for one shared public topic (V21 compatBlock): a public hard limit is a boundary, a
 * «discuss» mark or a gap of 4+ is something to discuss, give↔receive is a fit, both 6+ a match, otherwise to try.
 * @param {any} r */
function group(r) {
  if (r.mm === 'hard' || r.tm === 'hard') return 'bound';
  if (r.mm === 'discuss' || r.tm === 'discuss') return 'discuss';
  const md = r.md ?? [], td = r.td ?? [];
  if ((md.includes('give') && td.includes('get')) || (md.includes('get') && td.includes('give'))) return 'complement';
  if (r.mv == null || r.tv == null) return 'discuss';
  if (Math.abs(r.mv - r.tv) >= 4) return 'discuss';
  return r.mv >= 6 && r.tv >= 6 ? 'match' : 'try';
}

/** @param {Q} q @param {any} l the link as `endpoint` reads it @param {any} change */
async function proposeChange(q, l, change) {
  await q.query(`update feture.profile_link set change = $2, updated_at = now() where id = $1`, [l.id, JSON.stringify(change)]);
  await enqueue(q, 'link.changeProposed', l.other, { linkId: l.id, from: change.by });
}

/** @param {Q} q @param {any} l the link as `endpoint` reads it @param {Acting} acting @param {boolean} accept */
async function answerChange(q, l, acting, accept) {
  if (accept) {
    await q.query(`update feture.profile_link set kind = $2, a_side = $3, b_side = $4, change = null, updated_at = now() where id = $1`,
      [l.id, l.change.kind, l.change.aSide, l.change.bSide]);
  } else {
    await q.query(`update feture.profile_link set change = null, updated_at = now() where id = $1`, [l.id]);
  }
  await readAbout(q, { profile: acting.profileId, kind: 'task', objectType: 'link', objectId: l.id });
  await enqueue(q, 'link.changed', l.change.by, { linkId: l.id, from: acting.profileId, answer: accept ? 'yes' : 'no' });
}

/** The link as the couple sees it now (for an approval applied later). @param {Q} q @param {any} row */
const coupleEndpoint = (q, row) => endpoint(q, /** @type {string} */ (row.target_id),
  /** @type {Acting} */ (Object.freeze({ profileId: row.profile_id, accountId: row.requested_by, kind: 'couple', state: 'active', partnerAccountId: null, partnerApproves: false, writable: true })));
/** A link's state as a version: a new proposal (or a confirmed change) makes a waiting approval stale. @param {Q} q @param {any} row */
const linkVersion = async (q, row) => JSON.stringify((await q.query(`select kind, change, state from feture.profile_link where id = $1`, [row.target_id]))[0] ?? null);
/** @param {Q} q @param {any} row */
const linkPreview = async (q, row) => {
  const [l] = await q.query(`select kind from feture.profile_link where id = $1`, [row.target_id]);
  return { object: { type: 'link', id: row.target_id, title: null, state: l ? 'ok' : 'deleted' }, rows: [{ field: 'kind', before: l?.kind ?? null, after: /** @type {any} */ (row.change).kind }] };
};

registerApprovalKind('link.change', {
  apply: async (q, row) => {
    const l = await coupleEndpoint(q, row);
    if (l.state !== 'ok' || (l.change && l.change.by !== row.profile_id)) fail(409, 'conflict', { rule: 'change_pending' });
    await proposeChange(q, l, row.change);
  },
  version: linkVersion, preview: linkPreview,
});
registerApprovalKind('link.changeAnswer', {
  apply: async (q, row) => {
    const l = await coupleEndpoint(q, row);
    if (!l.change || l.change.kind !== /** @type {any} */ (row.change).kind) fail(409, 'conflict', { rule: 'change_changed' });
    await answerChange(q, l, /** @type {any} */ ({ profileId: row.profile_id }), true);
  },
  version: linkVersion, preview: linkPreview,
});

/** @type {Record<keyof typeof peopleCommands, Command['run']>} */
const run = {
  async 'people.search'(q, { acting: a, input, cfg }) {
    const viewer = need(a);
    await requireUnrestricted(q, viewer, 'search');
    // A day-old account may look people up only a little: fresh accounts made in bulk cannot walk the directory (security audit 06.11.2026).
    const [age] = await q.query(`select created_at > now() - interval '1 day' fresh from feture.account where id = $1`, [viewer.accountId]);
    if (age?.fresh) await limit(q, viewer.accountId, 'people.search_new', 50, '1 day');
    const prefix = input.q.toLowerCase().replace(/[\\%_]/g, (/** @type {string} */ m) => '\\' + m);
    const rows = await q.query(
      `select p.id, ${acceptsMention('p', '$1')} mentionable from feture.profile p
       where p.state = 'active' and p.id <> $1 and (lower(p.handle) like $2 || '%' or lower(p.name) like $2 || '%') and not feture.blocked($1, p.id)
         and not feture.restricted_in(p.id, 'search')
       order by (lower(p.handle) = $3) desc, (${qaProfile('p.id')} and not ${qaProfile('$1')}), lower(p.handle) limit 20`, [viewer.profileId, prefix, input.q.toLowerCase()]);
    // `mentionable`: whether an @mention by the acting profile reaches the person (their «Кто может упоминать»), so the
    // mention picker can say «без уведомления» before the post goes out.
    const can = new Map(rows.map(r => [r.id, !!r.mentionable]));
    return { items: (await cards(q, viewer, rows.map(r => r.id), cfg.media)).map((/** @type {any} */ c) => ({ ...c, mentionable: can.get(c.id) ?? false })) };
  },

  async 'people.byNick'(q, { acting: a, input }) {
    // Exact nickname only (couple invitations, gifts, mentions); someone hidden by a block is simply not found.
    const viewer = need(a);
    const [p] = await q.query(
      `select p.id, p.kind, p.handle from feture.profile p where lower(p.handle) = lower($2) and p.state = 'active' and p.id <> $1 and not feture.blocked($1, p.id)`,
      [viewer.profileId, input.handle]);
    if (!p) fail(404, 'not_found');
    return { profile: p };
  },

  async 'profile.compat'(q, { acting: a, input }) {
    const viewer = need(a);
    await otherProfile(q, viewer, input.profileId);
    const counts = await q.query(
      `select profile_id, count(*)::int n from feture.interest where profile_id in ($1, $2) and vis = 'public' group by profile_id`, [viewer.profileId, input.profileId]);
    const few = [viewer.profileId, input.profileId].some(id => (counts.find(c => c.profile_id === id)?.n ?? 0) < 2);
    const rows = await q.query(
      `select i.topic_id, i.value mv, i.mark mm, i.dir md, j.value tv, j.mark tm, j.dir td
       from feture.interest i join feture.interest j on j.topic_id = i.topic_id and j.profile_id = $2 and j.vis = 'public'
       where i.profile_id = $1 and i.vis = 'public' order by i.topic_id`, [viewer.profileId, input.profileId]);
    if (few) return { few: true, topics: rows.map(r => r.topic_id) };
    const items = rows.map(r => ({ topicId: r.topic_id, group: group(r), mine: { value: r.mv, mark: r.mm, dir: r.md }, theirs: { value: r.tv, mark: r.tm, dir: r.td } }));
    // A head count of fits and matches; no overall score (V21: «Совпадение — не согласие»).
    return { few: false, count: items.filter(i => i.group === 'complement' || i.group === 'match').length, items };
  },

  async 'link.propose'(q, { acting: a, input }) {
    const acting = need(a);
    await requireUnrestricted(q, acting, 'links');
    const { opId: _, ...c } = input;
    if (needsPartner(acting, 'link.propose')) {
      await otherProfile(q, acting, c.profileId);
      return { pending: await requestApproval(q, acting, { kind: 'link.propose', targetType: 'profile', targetId: c.profileId, change: c, summary: [c.kind] }) };
    }
    return doPropose(q, acting, c);
  },

  async 'link.answer'(q, { acting: a, input }) {
    const acting = need(a);
    if (!input.accept) {
      // Declining needs nobody; the proposer is told.
      const l = await endpoint(q, input.linkId, acting);
      if (l.me !== 'b' || l.state !== 'pending') fail(409, 'conflict', { rule: 'not_pending' });
      await q.query('delete from feture.profile_link where id = $1', [l.id]);
      await readAbout(q, { profile: acting.profileId, kind: 'task', objectType: 'link', objectId: l.id });
      await enqueue(q, 'link.declined', l.a_profile_id, { linkId: l.id, from: acting.profileId });
      return { state: 'declined' };
    }
    if (needsPartner(acting, 'link.accept')) {
      const l = await endpoint(q, input.linkId, acting);
      if (l.me !== 'b' || l.state !== 'pending') fail(409, 'conflict', { rule: 'not_pending' });
      return { pending: await requestApproval(q, acting, { kind: 'link.accept', targetType: 'link', targetId: l.id, change: { linkId: l.id, vis: input.vis }, summary: [l.kind] }) };
    }
    const done = await doAccept(q, acting, input.linkId, input.vis);
    await partnerActed(q, acting, 'link');
    return done;
  },

  async 'link.proposeChange'(q, { acting: a, input }) {
    // The current link stays until the other side confirms the new kind.
    const acting = need(a);
    await requireUnrestricted(q, acting, 'links');
    const l = await endpoint(q, input.linkId, acting);
    if (l.state !== 'ok') fail(409, 'conflict', { rule: 'not_confirmed' });
    if (l.change && l.change.by !== acting.profileId) fail(409, 'conflict', { rule: 'change_pending' }); // answer theirs first
    const mine = input.mySide ?? null, theirs = input.mySide ? OPPOSITE[/** @type {keyof typeof OPPOSITE} */ (input.mySide)] : null;
    const change = { kind: input.kind, aSide: l.me === 'a' ? mine : theirs, bSide: l.me === 'a' ? theirs : mine, by: acting.profileId };
    // A couple's new kind may wait for the partner («Связи», audit item 21).
    if (needsPartner(acting, 'link.change')) {
      return { pending: await requestApproval(q, acting, { kind: 'link.change', targetType: 'link', targetId: l.id, change, summary: [input.kind] }) };
    }
    await proposeChange(q, l, change);
    return { change: { kind: change.kind } };
  },

  async 'link.answerChange'(q, { acting: a, input }) {
    const acting = need(a);
    const l = await endpoint(q, input.linkId, acting);
    if (!l.change || l.change.by === acting.profileId) fail(409, 'conflict', { rule: 'no_change' });
    // The answer is to the kind the person saw: changed since, they look again (audit item 21).
    if (l.change.kind !== input.kind) fail(409, 'conflict', { rule: 'change_changed' });
    if (input.accept && needsPartner(acting, 'link.changeAnswer')) {
      return { pending: await requestApproval(q, acting, { kind: 'link.changeAnswer', targetType: 'link', targetId: l.id, change: { kind: input.kind }, summary: [input.kind] }) };
    }
    await answerChange(q, l, acting, input.accept);
    return { accepted: input.accept };
  },

  async 'link.setVisibility'(q, { acting: a, input }) {
    const acting = need(a);
    const l = await endpoint(q, input.linkId, acting);
    const widening = VIS.indexOf(input.vis) > VIS.indexOf(l[`${l.me}_vis`]);
    if (widening && needsPartner(acting, 'link.visibility')) {
      return { pending: await requestApproval(q, acting, { kind: 'link.visibility', targetType: 'link', targetId: l.id, change: { linkId: l.id, vis: input.vis }, summary: [input.vis] }) };
    }
    await q.query(`update feture.profile_link set ${l.me}_vis = $2, updated_at = now() where id = $1`, [l.id, input.vis]);
    if (widening) await partnerActed(q, acting, 'linkShown');
    return { vis: input.vis };
  },

  async 'link.remove'(q, { acting: a, input }) {
    // Either side, at once; the other side hears about a confirmed link going, not about a cancelled proposal.
    const acting = need(a);
    const l = await endpoint(q, input.linkId, acting);
    await q.query('delete from feture.profile_link where id = $1', [l.id]);
    if (l.state === 'ok') await enqueue(q, 'link.removed', l.other, { linkId: l.id, from: acting.profileId });
    return { removed: true };
  },

  async 'links.ofProfile'(q, { acting: a, input, cfg }) {
    // Confirmed links only, as far as the more private choice of the two endpoints allows.
    const viewer = need(a);
    if (input.profileId !== viewer.profileId) await otherProfile(q, viewer, input.profileId);
    const rows = await q.query(
      `select l.id, l.kind, case when l.a_profile_id = $1 then l.a_side else l.b_side end side,
         o.id other_id, o.kind other_kind, o.handle other_handle, o.name other_name,
         case when l.a_profile_id = $1 then l.a_vis else l.b_vis end my_vis, case when l.a_profile_id = $1 then l.b_vis else l.a_vis end other_vis
       from feture.profile_link l join feture.profile o on o.id = case when l.a_profile_id = $1 then l.b_profile_id else l.a_profile_id end
       where $1 in (l.a_profile_id, l.b_profile_id) and l.state = 'ok' and o.state = 'active' and not feture.blocked($2, o.id)`,
      [input.profileId, viewer.profileId]);
    const [{ inside }] = await q.query(
      `select exists (select 1 from feture.profile_member where profile_id = $1 and account_id = $2 and state = 'active') inside`, [input.profileId, viewer.accountId]);
    const follows = async (/** @type {string} */ p) => (await q.query(`select exists (select 1 from feture.follow where follower_profile_id = $1 and target_profile_id = $2) f`, [viewer.profileId, p]))[0].f;
    const shown = [];
    for (const r of rows) {
      const [{ otherSide }] = await q.query(`select exists (select 1 from feture.profile_member where profile_id = $1 and account_id = $2 and state = 'active') "otherSide"`, [r.other_id, viewer.accountId]);
      // Each endpoint's own choice holds: «us» — only the two of them; «followers» — followers of that endpoint.
      const fits = async (/** @type {string} */ vis, /** @type {string} */ owner) => vis === 'all' || (vis === 'followers' && await follows(owner));
      if (inside || otherSide || (await fits(r.my_vis, input.profileId) && await fits(r.other_vis, r.other_id))) {
        shown.push({ id: r.id, kind: r.kind, side: r.side, other: { id: r.other_id, kind: r.other_kind, handle: r.other_handle, name: r.other_name || r.other_handle } });
      }
    }
    return { items: await withFaces(q, cfg.media, viewer, shown, r => r.other) };
  },

  async 'links.mine'(q, { acting: a, cfg }) {
    const viewer = need(a);
    const rows = await q.query(
      `select l.id, l.kind, l.state, l.change, l.a_profile_id = $1 proposed_by_me, case when l.a_profile_id = $1 then l.a_side else l.b_side end side,
         case when l.a_profile_id = $1 then l.a_vis else l.b_vis end vis,
         json_build_object('id', o.id, 'kind', o.kind, 'handle', o.handle, 'name', o.name) other
       from feture.profile_link l join feture.profile o on o.id = case when l.a_profile_id = $1 then l.b_profile_id else l.a_profile_id end
       where $1 in (l.a_profile_id, l.b_profile_id) and o.state = 'active' and not feture.blocked($1, o.id)
       order by l.updated_at desc`, [viewer.profileId]);
    await withFaces(q, cfg.media, viewer, rows, r => r.other);
    const view = (/** @type {any} */ r) => ({ id: r.id, kind: r.kind, side: r.side, vis: r.vis, other: r.other, change: r.change ? { kind: r.change.kind, mine: r.change.by === viewer.profileId } : null });
    return {
      incoming: rows.filter(r => r.state === 'pending' && !r.proposed_by_me).map(view),
      sent: rows.filter(r => r.state === 'pending' && r.proposed_by_me).map(view),
      confirmed: rows.filter(r => r.state === 'ok').map(view),
    };
  },
};

/** @type {Record<string, Command>} */
export const people = Object.fromEntries(
  Object.entries(peopleCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
