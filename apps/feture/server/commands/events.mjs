// @ts-check
import { checkWords } from '../word-filter.mjs';
import { likePattern } from '../search.mjs';
import { eventsCommands } from '../../contracts/events.mjs';
import { requireUnrestricted } from '../profiles.mjs';
import { fail, isUniqueViolation } from '../errors.mjs';
import { enqueue } from '../outbox.mjs';
import { closeAppealOn } from '../reports.mjs';
import { closePending, needsPartner, partnerActed, registerApprovalKind, requestApproval } from '../approvals.mjs';
import { journal, requireStaff } from './staff.mjs';
import { mediaDto } from '../media/assets.mjs';
import { ageOn, withFaces } from './faces.mjs';
import { cancelledFor, listedEvent, staffOwn } from '../sql-rules.mjs';
import { CREATED_KEYS, pageInfo, plainRows, queuePageSql } from '../queue-page.mjs';
import { readAbout } from '../notify.mjs';

/** Slice D2: events (S1 §10, extract/communities-events.md §1.8–1.12).
 * An event belongs to the organizing profile (a couple can organize) and goes to staff before it is published; a couple
 * event first waits for the partner when they asked to approve. Major edits of a published event (title, description,
 * cover) wait for staff while the published version stays; a change of time or place applies at once and leaves an
 * automatic announcement. The exact address and the join link are for admitted people only: the organizer, an approved
 * application (events by application) or «иду» (open events). A pending application never counts as «идёт».
 * @typedef {import('../handler.mjs').Command} Command @typedef {import('../db.mjs').Q} Q
 * @typedef {import('../profiles.mjs').Acting} Acting
 */

// Checked by staff before they replace the published values: text, cover, the join link and ticket price/link.
const MAJOR = ['title', 'description', 'coverAssetId', 'joinUrl', 'price', 'requirements'];
const COLS = {
  title: 'title', kind: 'kind', description: 'description', format: 'format', placeId: 'place_id', area: 'area', exactAddress: 'exact_address',
  joinUrl: 'join_url', tz: 'tz', startsAt: 'starts_at', endsAt: 'ends_at', price: 'price', requiresApplication: 'requires_application',
  questions: 'questions', requirements: 'requirements', coverAssetId: 'cover_asset_id', plate: 'plate', seats: 'seats',
};
const LIVE = `state in ('uploaded', 'scanning', 'needs_review', 'approved')`;

/** @param {Acting | null} acting @returns {Acting} */
const need = acting => { if (!acting) throw new Error('acting profile missing'); return acting; };
/** Column values in COLS order (price as json). @param {any} f */
const values = f => Object.keys(COLS).map(k => k === 'price' ? JSON.stringify(f[k]) : f[k]);
/** @param {any} v */
const iso = v => v instanceof Date ? v.toISOString() : v;
/** Order-independent equality for form values (jsonb reorders object keys). @param {any} a @param {any} b */
const same = (a, b) => {
  const norm = (/** @type {any} */ v) => JSON.stringify(v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v ?? null);
  return norm(a) === norm(b);
};
const RANK = { not_going: 0, interested: 1, going: 2 };

/** The form of an event row (for drafts made from a withdrawn event). @param {any} e */
function formOf(e) {
  return {
    title: e.title, kind: e.kind, description: e.description, format: e.format, placeId: e.place_id, area: e.area, exactAddress: e.exact_address,
    joinUrl: e.join_url, tz: e.tz, startsAt: iso(e.starts_at), endsAt: iso(e.ends_at), price: e.price, requiresApplication: e.requires_application,
    questions: e.questions, requirements: e.requirements, coverAssetId: e.cover_asset_id, plate: e.plate, communityId: e.community_id, seats: e.seats ?? null,
  };
}

/** Time zones already confirmed by the database (see checkEventRefs). @type {Set<string>} */
const knownZones = new Set();

/** Place, cover and community of an event: an approved place or one the author submitted, the organizer's own event
 * cover, a published community the organizing profile owns or hosts (V21 EVT-038). @param {Q} q @param {Acting} acting @param {any} f */
async function checkEventRefs(q, acting, f) {
  if (!knownZones.has(f.tz)) {
    // pg_timezone_names reads the zone files on every query (≈0.45 s in pg_stat_statements): a zone found once is
    // remembered by this instance.
    const [zone] = await q.query('select 1 from pg_timezone_names where name = $1', [f.tz]);
    if (!zone) fail(400, 'invalid_input', { fields: ['tz'] });
    if (knownZones.size < 1000) knownZones.add(f.tz);
  }
  if (f.placeId) {
    const [pl] = await q.query(`select 1 from feture.place where id = $1 and (state = 'approved' or state = 'pending' and submitted_by = $2)`, [f.placeId, acting.accountId]);
    if (!pl) fail(400, 'invalid_input', { fields: ['placeId'] });
  }
  if (f.coverAssetId) {
    const [a] = await q.query(`select 1 from feture.media_asset where id = $1 and owner_profile_id = $2 and purpose = 'event' and ${LIVE}`, [f.coverAssetId, acting.profileId]);
    if (!a) fail(400, 'invalid_input', { fields: ['coverAssetId'] });
  }
  if (f.communityId) {
    const [c] = await q.query(
      `select 1 from feture.community c join feture.community_member m on m.community_id = c.id
       where c.id = $1 and c.state = 'published' and m.profile_id = $2 and m.state = 'active' and m.role in ('owner', 'host')`, [f.communityId, acting.profileId]);
    if (!c) fail(403, 'forbidden', { rule: 'community_hosts_only' });
  }
}

/** The organizer's event, locked. Partners of an organizing couple act as the couple. @param {Q} q @param {string} eventId @param {Acting} acting */
async function ownEvent(q, eventId, acting) {
  const [e] = await q.query(`select * from feture.event where id = $1 and organizer_profile_id = $2 for update`, [eventId, acting.profileId]);
  if (!e) fail(404, 'not_found');
  return e;
}

/** The event if the viewer may see it, with whether the viewer is in the organizing profile and admitted.
 * @param {Q} q @param {string} eventId @param {Acting} viewer */
async function visibleEvent(q, eventId, viewer) {
  const [e] = await q.query(
    `select e.*, feture.event_admitted(e, $2, $3) admitted, e.ends_at <= now() past,
       exists (select 1 from feture.profile_member m where m.profile_id = e.organizer_profile_id and m.account_id = $3 and m.state = 'active') own
     from feture.event e where e.id = $1 and feture.event_visible(e, $2, $3)`, [eventId, viewer.profileId, viewer.accountId]);
  if (!e) fail(404, 'not_found');
  return e;
}

/** The event open for an answer from `profileId` (acting through `accountId`): visible to them, published, not over,
 * and not their own nor their partner's or couple's. Locked against a concurrent cancel or hide; the same checks run when
 * a partner approves the answer later. @param {Q} q @param {string} eventId @param {string} profileId @param {string} accountId */
async function openFor(q, eventId, profileId, accountId) {
  const [e] = await q.query(
    `select e.*, e.ends_at <= now() past,
       exists (select 1 from feture.profile_member x join feture.profile_member y on x.account_id = y.account_id
               where x.profile_id = e.organizer_profile_id and y.profile_id = $2 and x.state = 'active' and y.state = 'active') related
     from feture.event e where e.id = $1 and feture.event_visible(e, $2, $3) for share of e`, [eventId, profileId, accountId]);
  if (!e) fail(404, 'not_found');
  if (e.related) fail(422, 'rule_violation', { rule: 'own_event' });
  if (e.state !== 'published' || e.past) fail(409, 'conflict', { state: e.past ? 'past' : e.state });
  return e;
}

/** @param {Q} q @param {any} e @param {string} profileId @param {any} c */
async function checkRsvp(q, e, profileId, c) {
  if (c.ticketMarked && e.price?.kind !== 'external') fail(400, 'invalid_input', { fields: ['ticketMarked'] });
  if (c.status === 'going' && e.requires_application) {
    const [ok] = await q.query(`select 1 from feture.event_application where event_id = $1 and profile_id = $2 and state = 'approved'`, [e.id, profileId]);
    if (!ok) fail(422, 'rule_violation', { rule: 'application_first' });
  }
  if (c.status === 'going' && !e.requires_application) {
    const [cur] = await q.query(`select status from feture.event_rsvp where event_id = $1 and profile_id = $2`, [e.id, profileId]);
    if (cur?.status !== 'going') await requireSeats(q, e, profileId);
  }
}

/** How many people come (audit item 53): the persons of the going profiles, each once — someone marked alone and with
 * the couple too is one. `viewer`: leave out profiles hidden from them by a block (the page and the list); seats count
 * everyone. @param {Q} q @param {string} eventId @param {string | null} [viewer] */
async function goingCount(q, eventId, viewer = null) {
  const [{ n }] = await q.query(
    `select count(distinct g.account_id)::int n from feture.event_going($1) g where $2::uuid is null or not feture.blocked($2, g.profile_id)`, [eventId, viewer]);
  return n;
}

/** «Мест» (audit item 36): the places `profileId` would take (a couple two, minus anyone already coming) must be free.
 * One answer at a time per event, so two people never take the last place together. @param {Q} q @param {any} e @param {string} profileId */
async function requireSeats(q, e, profileId) {
  if (e.seats == null) return;
  await q.query(`select pg_advisory_xact_lock(hashtextextended('fe-seats:' || $1, 0))`, [e.id]);
  const [{ taken, needed }] = await q.query(
    `select (select count(distinct account_id) from feture.event_going($1))::int taken,
       (select count(*) from feture.profile_member m where m.profile_id = $2 and m.state = 'active'
          and m.account_id not in (select account_id from feture.event_going($1)))::int needed`, [e.id, profileId]);
  if (taken + needed > e.seats) fail(422, 'rule_violation', { rule: 'no_seats' });
}

/** Who of a couple is already coming alone, or which of a person's couples comes (audit item 56): the personal
 * «иду» or an open application. `mine`: the acting person's own personal profile (or, for a person, a couple of
 * theirs); `partner`: the partner's personal profile when they are marked alone; `me`: the acting person's own. @param {Q} q @param {string} eventId @param {Acting} acting */
async function comingApart(q, eventId, acting) {
  const marked = `(exists (select 1 from feture.event_rsvp r where r.event_id = $1 and r.profile_id = %s and r.status = 'going')
     or exists (select 1 from feture.event_application x where x.event_id = $1 and x.profile_id = %s and x.state in ('pending', 'approved')))`;
  if (acting.kind === 'couple') {
    const rows = await q.query(
      `select m.account_id, a.person_profile_id, ${marked.replaceAll('%s', 'a.person_profile_id')} marked
       from feture.profile_member m join feture.account a on a.id = m.account_id where m.profile_id = $2 and m.state = 'active'`, [eventId, acting.profileId]);
    const mine = rows.find(r => r.account_id === acting.accountId);
    const partner = rows.find(r => r.account_id !== acting.accountId && r.marked);
    return { mine: mine?.marked ? mine.person_profile_id : null, partner: partner ? partner.person_profile_id : null, me: mine?.person_profile_id ?? null };
  }
  const [c] = await q.query(
    `select m.profile_id from feture.profile_member m join feture.profile p on p.id = m.profile_id and p.kind = 'couple' and p.state = 'active'
     where m.account_id = $2 and m.state = 'active' and ${marked.replaceAll('%s', 'm.profile_id')} limit 1`, [eventId, acting.accountId]);
  return { mine: c?.profile_id ?? null, partner: null, me: null };
}

/** A couple coming together (audit item 56): «Идём парой» takes the acting person's own mark off — the answer that
 * came with an application too. @param {Q} q @param {string} eventId @param {string} personProfileId */
async function dropAlone(q, eventId, personProfileId) {
  await q.query(`delete from feture.event_rsvp where event_id = $1 and profile_id = $2 and status = 'going'`, [eventId, personProfileId]);
  await q.query(`update feture.event_application set state = 'withdrawn', decided_at = now(), rev = rev + 1
    where event_id = $1 and profile_id = $2 and state in ('pending', 'approved')`, [eventId, personProfileId]);
}

/** Asks before a double mark (audit item 56): a couple whose acting partner is coming alone answers «Идём парой»
 * (`together`) or keeps it apart (no mark); a person whose couple comes answers «Отметиться всё равно» (`alone`).
 * The partner coming alone is asked themselves (В11: nobody sees the other's personal mark). @param {Q} q @param {any} e
 * @param {Acting} acting @param {{together?: boolean, alone?: boolean}} input */
async function askApart(q, e, acting, input) {
  const apart = await comingApart(q, e.id, acting);
  if (acting.kind === 'couple') {
    if (apart.mine && !input.together) fail(409, 'conflict', { rule: 'going_alone' });
  } else if (apart.mine && !input.alone) fail(409, 'conflict', { rule: 'going_as_couple' });
  return apart;
}

/** After a couple's mark: the person of it themselves marked alone hears that the couple comes, and decides
 * (audit item 56), on their personal profile, from the partner who marked. @param {Q} q @param {any} e @param {Acting} acting
 * @param {{mine: string | null, partner: string | null, me: string | null}} apart @param {boolean} together */
async function afterCoupleMark(q, e, acting, apart, together) {
  if (together && apart.mine) await dropAlone(q, e.id, apart.mine);
  if (apart.partner) await enqueue(q, 'event.pairGoing', apart.partner, { eventId: e.id, from: apart.me });
}

/** @param {any} e @param {any} c */
function checkApplication(e, c) {
  if (!e.requires_application) fail(422, 'rule_violation', { rule: 'no_application' });
  if (c.answers.length !== e.questions.length) fail(400, 'invalid_input', { fields: ['answers'] });
}

/** A declined application is the organizer's answer: no new one (the organizer may still approve it after all, and a
 * second open row next to it would break that). A withdrawn one may be sent again. @param {Q} q @param {string} eventId @param {string} profileId */
async function notDeclined(q, eventId, profileId) {
  const [x] = await q.query(`select state from feture.event_application where event_id = $1 and profile_id = $2 order by created_at desc limit 1`, [eventId, profileId]);
  if (x?.state === 'declined') fail(422, 'rule_violation', { rule: 'application_declined' });
}

/** Cancels the profile's pending partner approvals of one kind for a target (a replaced or withdrawn answer).
 * @param {Q} q @param {string} profileId @param {string} kind @param {string} targetId */
async function dropPending(q, profileId, kind, targetId) {
  await closePending(q, `a.profile_id = $1 and a.kind = $2 and a.target_id = $3`, [profileId, kind, targetId], 'cancelled', { hooks: false, silent: true });
}

/** @param {Q} q @param {string} eventId @param {string} ownerProfileId */
async function toStaff(q, eventId, ownerProfileId) {
  await q.query(`update feture.event set state = 'in_review', reject_reason = null, updated_at = now() where id = $1`, [eventId]);
  await enqueue(q, 'moderation.event', ownerProfileId, { eventId });
}

/** @param {Q} q @param {string} eventId @param {string} profileId @param {string} accountId @param {any} c */
async function writeRsvp(q, eventId, profileId, accountId, c) {
  if (c.status === null) {
    await q.query('delete from feture.event_rsvp where event_id = $1 and profile_id = $2', [eventId, profileId]);
    return;
  }
  await q.query(
    `insert into feture.event_rsvp (event_id, profile_id, status, show_in_list, ticket_marked, acted_by) values ($1, $2, $3, coalesce($4, false), coalesce($5, false), $6)
     on conflict (event_id, profile_id) do update set status = $3, show_in_list = coalesce($4, event_rsvp.show_in_list),
       ticket_marked = coalesce($5, event_rsvp.ticket_marked), acted_by = $6, updated_at = now()`,
    [eventId, profileId, c.status, c.showInList ?? null, c.ticketMarked ?? null, accountId]);
}

/** @param {Q} q @param {any} e @param {string} profileId @param {string} accountId @param {any} c */
async function writeApplication(q, e, profileId, accountId, c) {
  try {
    const [a] = await q.query(`insert into feture.event_application (event_id, profile_id, answers, note, acted_by) values ($1, $2, $3, $4, $5) returning id`,
      [e.id, profileId, c.answers, c.note, accountId]);
    await enqueue(q, 'event.applied', e.organizer_profile_id, { eventId: e.id, applicationId: a.id });
    return a.id;
  } catch (error) {
    if (isUniqueViolation(error)) fail(409, 'conflict', { rule: 'already_applied' });
    throw error;
  }
}

/** Applies an edit by the organizer. Before publication everything applies (a rejected event goes back to review);
 * a published one keeps its title, description and cover until staff check the new ones.
 * @param {Q} q @param {Acting} acting @param {string} eventId @param {number} rev @param {any} f */
async function doUpdate(q, acting, eventId, rev, f) {
  const e = await ownEvent(q, eventId, acting);
  if (e.rev !== rev) fail(409, 'conflict', { rev: e.rev });
  if (!['pending_partner', 'in_review', 'rejected', 'published'].includes(e.state)) fail(409, 'conflict', { state: e.state });
  if ((f.communityId ?? null) !== e.community_id) fail(400, 'invalid_input', { fields: ['communityId'] }); // the community link stays
  if (e.state === 'rejected') await closeAppealOn(q, 'event', e.id); // edited after the rejection: the appeal no longer applies
  // Who is admitted depends on these: once published they stay, so nobody's «иду» or approval silently stops counting.
  if (e.state === 'published' && (f.requiresApplication !== e.requires_application || !same(f.questions, e.questions))) {
    fail(422, 'rule_violation', { rule: 'admission_frozen' });
  }
  await checkEventRefs(q, acting, { ...f, communityId: null });
  // «Мест» never below the people already coming (В13).
  if (e.state === 'published' && f.seats != null && f.seats < await goingCount(q, e.id)) fail(422, 'rule_violation', { rule: 'seats_below_going' });
  const timeChanged = Date.parse(f.startsAt) !== new Date(e.starts_at).getTime() || Date.parse(f.endsAt) !== new Date(e.ends_at).getTime();
  if (timeChanged && Date.parse(f.startsAt) <= Date.now()) fail(400, 'invalid_input', { fields: ['startsAt'] });
  // Offline → online on a published event (audit item 17): the format, the link and dropping the place wait for staff
  // together and apply at once; online → offline applies now, as before.
  const toOnline = e.state === 'published' && e.format === 'offline' && f.format === 'online';
  const major = toOnline ? [...MAJOR, 'format', 'placeId', 'area', 'exactAddress'] : MAJOR;
  const keys = Object.keys(COLS).filter(k => e.state !== 'published' || !major.includes(k));
  const later = e.state === 'published'
    ? Object.fromEntries(major.filter(k => !same(f[k], formOf(e)[/** @type {keyof ReturnType<typeof formOf>} */ (k)])).map(k => [k, f[k] ?? null]))
    : {};
  const all = values(f), cols = Object.keys(COLS);
  await q.query(
    `update feture.event set ${keys.map((k, i) => `${COLS[/** @type {keyof typeof COLS} */ (k)]} = $${i + 2}`).join(', ')},
       pending_change = nullif($${keys.length + 2}::jsonb, '{}'::jsonb),
       rev = rev + 1, updated_at = now() where id = $1`,
    [e.id, ...keys.map(k => all[cols.indexOf(k)]), JSON.stringify(later)]);
  if (Object.keys(later).length) await enqueue(q, 'moderation.event', e.organizer_profile_id, { eventId: e.id, change: true });
  if (e.state === 'published') {
    // People who answered learn about a new time or place at once; their answers stay. A new link waits for staff.
    const changes = [
      ...(timeChanged ? ['time'] : []),
      ...(!toOnline && (f.placeId !== e.place_id || f.area !== e.area || f.exactAddress !== e.exact_address) ? ['place'] : []),
    ];
    if (timeChanged) await q.query('update feture.event set reminded_at = null where id = $1', [e.id]); // a new time, a new reminder
    if (changes.length) {
      await q.query(`insert into feture.event_announcement (event_id, automatic, changes) values ($1, true, $2)`, [e.id, changes]);
      await enqueue(q, 'event.changed', e.organizer_profile_id, { eventId: e.id, changes });
    }
  } else if (needsPartner(acting, 'event.submit')) {
    // Before publication a couple event changes only with the partner: they see and approve the new version.
    // A newer version replaces the waiting one («заменено новым», approvals.mjs).
    await q.query(`update feture.event set state = 'pending_partner' where id = $1`, [e.id]);
    await requestApproval(q, acting, { kind: 'event.submit', targetType: 'event', targetId: e.id, change: { rev: e.rev + 1 }, summary: [f.title] });
  } else if (e.state !== 'in_review') {
    await toStaff(q, e.id, e.organizer_profile_id); // a rejected event goes back to review
  }
  return { rev: e.rev + 1, review: Object.keys(later) };
}

/** The event card a partner decides on (V21 jointReview: «Открыть событие»); for an edit, the proposed fields over the
 * stored ones, with what changes. The couple's own event, or someone else's event it answers while it may still see it.
 * Never the exact address (admitted people only) — an edit that moves it says only that it moves.
 * @param {Q} q @param {import('../approvals.mjs').ApprovalRow} row */
async function approvalEventCard(q, row) {
  const [x] = await q.query(
    `select e.id, e.title, e.kind, e.format, e.area, e.tz, e.starts_at, e.ends_at, e.state, e.rev, e.price, e.requires_application, e.questions,
       e.organizer_profile_id, e.description, e.exact_address, pl.name_ru city_ru, pl.name_en city_en, o.handle org_handle, o.name org_name, o.kind org_kind,
       e.organizer_profile_id = $2 own
     from feture.event e left join feture.place pl on pl.id = e.place_id join feture.profile o on o.id = e.organizer_profile_id
     where e.id = $1 and (e.organizer_profile_id = $2 or feture.event_visible(e, $2, $3))`, [row.target_id, row.profile_id, row.requested_by]);
  if (!x) {
    const [gone] = await q.query(`select 1 from feture.event where id = $1`, [row.target_id]);
    const draftId = row.outcome?.eventDraftId;
    const [draft] = draftId ? await q.query(`select form->>'title' title from feture.event_draft where id = $1 and owner_profile_id = $2`, [draftId, row.profile_id]) : [];
    return { object: { type: 'event', id: row.target_id, title: draft?.title ?? (row.summary?.[0] ? String(row.summary[0]) : null), state: gone ? 'unavailable' : 'deleted' } };
  }
  const c = /** @type {any} */ (row.change);
  const f = row.kind === 'event.update' ? c.event : {};
  const event = {
    id: x.id, title: f.title ?? x.title, kind: f.kind ?? x.kind, format: f.format ?? x.format, area: f.area !== undefined ? f.area : x.area, tz: f.tz ?? x.tz,
    startsAt: f.startsAt ?? x.starts_at, endsAt: f.endsAt ?? x.ends_at, state: x.state, rev: row.kind === 'event.update' ? c.rev : x.rev,
    city: x.city_ru ? { ru: x.city_ru, en: x.city_en } : null, price: f.price !== undefined ? f.price : x.price,
    requiresApplication: f.requiresApplication ?? x.requires_application, description: f.description ?? x.description,
  };
  /** @type {{field: string, before: unknown, after: unknown}[]} */
  const rows = [];
  if (row.kind === 'event.update') {
    const was = /** @type {Record<string, unknown>} */ ({ title: x.title, description: x.description, startsAt: iso(x.starts_at), endsAt: iso(x.ends_at), format: x.format, area: x.area, price: x.price, requiresApplication: x.requires_application });
    for (const [k, v] of Object.entries(was)) if (f[k] !== undefined && JSON.stringify(f[k]) !== JSON.stringify(v)) rows.push({ field: k, before: v, after: f[k] });
    if (f.exactAddress !== undefined && f.exactAddress !== x.exact_address) rows.push({ field: 'exactAddress', before: null, after: null });
  }
  const subject = x.own ? null : { id: x.organizer_profile_id, kind: x.org_kind, handle: x.org_handle, name: x.org_name };
  const out = /** @type {Record<string, unknown>} */ ({ object: { type: 'event', id: x.id, title: event.title, state: x.state === 'cancelled' || x.state === 'hidden' ? 'unavailable' : 'ok' }, subject, event, rows });
  if (row.kind === 'event.rsvp') {
    const [cur] = await q.query(`select status, show_in_list from feture.event_rsvp where event_id = $1 and profile_id = $2`, [x.id, row.profile_id]);
    out.rsvp = c.status ?? null;
    rows.push({ field: 'rsvp', before: cur?.status ?? null, after: c.status ?? null });
    if (c.showInList !== undefined && c.showInList !== null && c.showInList !== !!cur?.show_in_list) rows.push({ field: 'showInList', before: !!cur?.show_in_list, after: c.showInList });
  }
  // What goes to the organizer: each question with the answer, and the note.
  if (row.kind === 'event.apply') {
    out.application = { answers: (x.questions ?? []).map((/** @type {string} */ question, /** @type {number} */ i) => ({ question, answer: c.answers?.[i] ?? '' })), note: c.note ?? '' };
  }
  return out;
}

/** The state of an event a proposal's version names. @param {Q} q @param {import('../approvals.mjs').ApprovalRow} row */
async function eventVersion(q, row) {
  const [e] = await q.query(`select rev, state from feture.event where id = $1`, [row.target_id]);
  return e ? `${e.state}:${e.rev}` : 'gone';
}

/** An event still waiting for the partner goes back to its author's drafts when the partner refuses, the author
 * withdraws or the time runs out (nobody saw it). @param {Q} q @param {import('../approvals.mjs').ApprovalRow} row */
async function eventBack(q, row) {
  const [e] = await q.query(`select * from feture.event where id = $1 and state = 'pending_partner' for update`, [row.target_id]);
  if (!e) return;
  return { eventDraftId: await toEventDraft(q, e) };
}

/** @param {Q} q @param {any} e an event row */
async function toEventDraft(q, e) {
  const [d] = await q.query(`insert into feture.event_draft (owner_profile_id, created_by, form, step) values ($1, $2, $3, 4) returning id`,
    [e.organizer_profile_id, e.created_by, JSON.stringify(formOf(e))]);
  await q.query('delete from feture.event where id = $1', [e.id]);
  return /** @type {string} */ (d.id);
}

/** Events whose start passed while they waited for staff go back to drafts and the organizer is told; a change of a
 * published event waiting for staff is dropped once the event is over (audit item 32; jobs.mjs). @param {Q} q */
export async function releaseLateEvents(q) {
  const late = await q.query(`select e.* from feture.event e where e.state = 'in_review' and e.starts_at <= now() order by e.starts_at limit 50 for update skip locked`);
  for (const e of late) {
    const draftId = await toEventDraft(q, e);
    await enqueue(q, 'event.lateDraft', e.organizer_profile_id, { draftId });
  }
  await q.query(`update feture.event set pending_change = null where state = 'published' and pending_change is not null and ends_at <= now()`);
  return late.length;
}

/** Cancels a published event that is not over (audit items 13, 15, 33 — one path for the organizer, a closed community,
 * a deleted account or couple, a paused couple): pending applications and waiting approvals close, everyone following it
 * hears «Событие отменено» (`why` says why, when it was not the organizer's choice).
 * @param {Q} q @param {any} e an event row @param {{reason?: string | null, by?: string | null, why?: 'community_closed' | 'organizer_gone' | null}} [o] */
export async function cancelEvent(q, e, { reason = null, by = null, why = null } = {}) {
  const rows = await q.query(
    `update feture.event set state = 'cancelled', cancel_reason = nullif($2, ''), cancelled_at = now(), rev = rev + 1, updated_at = now()
     where id = $1 and state = 'published' and ends_at > now() returning id`, [e.id, reason ?? '']);
  if (!rows[0]) return false;
  await q.query(`update feture.event_application set state = 'closed', decided_at = now(), rev = rev + 1 where event_id = $1 and state = 'pending'`, [e.id]);
  await closePending(q, `a.kind in ('event.rsvp', 'event.apply', 'event.update') and a.target_id = $1`, [e.id], 'stale', { by, hooks: false });
  await enqueue(q, 'event.cancelled', e.organizer_profile_id, { eventId: e.id, ...(why ? { why } : {}), ...(why === 'organizer_gone' ? { organizerGone: true } : {}) });
  return true;
}

/** Hides an event by a staff decision (a report or the event queue — one path, audit item 33): applications and waiting
 * approvals close, the people following it hear «Событие больше недоступно» — no reason, no staff name.
 * @param {Q} q @param {string} eventId @param {string | null} reason */
export async function hideEvent(q, eventId, reason) {
  const [e] = await q.query(`update feture.event set state = 'hidden', reject_reason = $2, rev = rev + 1, updated_at = now() where id = $1 returning organizer_profile_id`, [eventId, reason]);
  if (!e) return;
  await q.query(`update feture.event_application set state = 'closed', decided_at = now(), rev = rev + 1 where event_id = $1 and state = 'pending'`, [eventId]);
  await closePending(q, `a.kind in ('event.rsvp', 'event.apply', 'event.update') and a.target_id = $1`, [eventId], 'stale', { hooks: false });
  await enqueue(q, 'event.unavailable', e.organizer_profile_id, { eventId });
}

/** A couple paused (audit item 13, В7): its future events are cancelled (guests told, the paused couple not named) and
 * events still waiting for staff or the partner go back to drafts, so staff never publish an event of a couple that is
 * not there. Restoring the couple brings none of them back. @param {Q} q @param {string} profileId */
export async function pauseOrganizer(q, profileId) {
  for (const e of await q.query(`select * from feture.event where organizer_profile_id = $1 and state = 'published' and ends_at > now() for update`, [profileId])) {
    await cancelEvent(q, e, { why: 'organizer_gone' });
  }
  for (const e of await q.query(`select * from feture.event where organizer_profile_id = $1 and state in ('pending_partner', 'in_review') for update`, [profileId])) {
    await closePending(q, `a.kind = 'event.submit' and a.target_id = $1`, [e.id], 'stale', { hooks: false });
    await toEventDraft(q, e);
  }
}

/** Unpublished events of a community that closes go back to their organizers' drafts, without the community (audit
 * item 15). @param {Q} q @param {string} communityId */
export async function releaseCommunityEvents(q, communityId) {
  const rows = await q.query(`select * from feture.event where community_id = $1 and state in ('pending_partner', 'in_review', 'rejected') for update`, [communityId]);
  for (const e of rows) {
    await closePending(q, `a.kind = 'event.submit' and a.target_id = $1`, [e.id], 'stale', { hooks: false });
    await toEventDraft(q, { ...e, community_id: null });
  }
}

/** Events left in `pending_partner` with nothing waiting (closed before stage 3, or a race) go back to drafts (jobs.mjs).
 * @param {Q} q */
export async function releaseWaitingEvents(q) {
  const rows = await q.query(
    `select e.* from feture.event e where e.state = 'pending_partner'
       and not exists (select 1 from feture.partner_approval a where a.target_id = e.id and a.kind = 'event.submit' and a.state = 'pending')
     order by e.updated_at limit 50 for update skip locked`);
  for (const e of rows) await toEventDraft(q, e);
  return rows.length;
}

registerApprovalKind('event.submit', {
  apply: async (q, row) => {
    // The partner approved exactly this version: if it changed since, it waits for a new approval.
    const [e] = await q.query(`select state, rev, starts_at <= now() started, community_id from feture.event where id = $1 for update`, [row.target_id]);
    if (!e || e.state !== 'pending_partner' || e.rev !== /** @type {any} */ (row.change).rev) fail(409, 'conflict', { rule: 'changed_since_approval' });
    if (e.started) fail(409, 'conflict', { rule: 'started' });
    if (e.community_id) {
      const [h] = await q.query(
        `select 1 from feture.community c join feture.community_member m on m.community_id = c.id
         where c.id = $1 and c.state = 'published' and m.profile_id = $2 and m.state = 'active' and m.role in ('owner', 'host')`, [e.community_id, row.profile_id]);
      if (!h) fail(409, 'conflict', { rule: 'community_hosts_only' });
    }
    await toStaff(q, String(row.target_id), row.profile_id);
  },
  version: eventVersion, preview: approvalEventCard, onReject: eventBack, onCancel: eventBack, onExpire: eventBack,
});
registerApprovalKind('event.update', {
  apply: async (q, row) => {
    const c = /** @type {any} */ (row.change);
    const [p] = await q.query(`select kind from feture.profile where id = $1`, [row.profile_id]);
    await doUpdate(q, /** @type {Acting} */ ({ profileId: row.profile_id, accountId: row.requested_by, kind: p.kind }), String(row.target_id), c.rev, c.event);
  },
  version: eventVersion, preview: approvalEventCard,
});
registerApprovalKind('event.rsvp', {
  apply: async (q, row) => {
    const c = /** @type {any} */ (row.change);
    const e = await openFor(q, String(row.target_id), row.profile_id, row.requested_by);
    await checkRsvp(q, e, row.profile_id, c);
    const acting = /** @type {Acting} */ ({ kind: 'couple', profileId: row.profile_id, accountId: row.requested_by });
    // The partner said yes to coming as a couple: the personal marks as they are now (audit item 56).
    const apart = c.status === 'going' ? await comingApart(q, e.id, acting) : null;
    if (apart?.mine && !c.together) fail(409, 'conflict', { rule: 'going_alone' });
    await writeRsvp(q, e.id, row.profile_id, row.requested_by, c);
    if (apart) await afterCoupleMark(q, e, acting, apart, c.together === true);
  },
  version: async (q, row) => {
    const [r] = await q.query(
      `select coalesce((select status || ':' || show_in_list from feture.event_rsvp where event_id = $1 and profile_id = $2), 'none')
         || '/' || coalesce((select state from feture.event where id = $1), 'gone') v`, [row.target_id, row.profile_id]);
    return r.v;
  },
  preview: approvalEventCard,
});
registerApprovalKind('event.apply', {
  apply: async (q, row) => {
    const e = await openFor(q, String(row.target_id), row.profile_id, row.requested_by);
    checkApplication(e, row.change);
    await notDeclined(q, e.id, row.profile_id);
    const acting = /** @type {Acting} */ ({ kind: 'couple', profileId: row.profile_id, accountId: row.requested_by });
    const apart = await comingApart(q, e.id, acting);
    if (apart.mine && !row.change.together) fail(409, 'conflict', { rule: 'going_alone' });
    await writeApplication(q, e, row.profile_id, row.requested_by, row.change);
    await afterCoupleMark(q, e, acting, apart, row.change.together === true);
  },
  version: async (q, row) => {
    const [r] = await q.query(
      `select coalesce((select state from feture.event_application where event_id = $1 and profile_id = $2 order by created_at desc limit 1), 'none')
         || '/' || coalesce((select state || ':' || array_to_string(questions, '|') from feture.event where id = $1), 'gone') v`, [row.target_id, row.profile_id]);
    return r.v;
  },
  preview: approvalEventCard,
});

/** @type {Record<keyof typeof eventsCommands, Command['run']>} */
const run = {
  async 'event.draftSave'(q, { acting: a, input }) {
    const acting = need(a);
    if (input.draftId) {
      const rows = await q.query(`update feture.event_draft set form = $3, step = $4, updated_at = now() where id = $1 and owner_profile_id = $2 returning id`,
        [input.draftId, acting.profileId, JSON.stringify(input.form), input.step]);
      if (!rows[0]) fail(404, 'not_found');
      return { id: input.draftId };
    }
    const [{ n }] = await q.query('select count(*)::int n from feture.event_draft where owner_profile_id = $1', [acting.profileId]);
    if (n >= 20) fail(422, 'rule_violation', { rule: 'too_many_drafts' });
    const [d] = await q.query(`insert into feture.event_draft (owner_profile_id, created_by, form, step) values ($1, $2, $3, $4) returning id`,
      [acting.profileId, acting.accountId, JSON.stringify(input.form), input.step]);
    return { id: d.id };
  },

  async 'event.draftGet'(q, { acting: a, input, cfg }) {
    const acting = need(a);
    const [d] = await q.query('select id, form, step, updated_at from feture.event_draft where id = $1 and owner_profile_id = $2', [input.draftId, acting.profileId]);
    if (!d) fail(404, 'not_found');
    // The cover as a picture only while it is still the profile's own event cover (the editor shows it again).
    let cover = null;
    const coverId = typeof d.form?.coverAssetId === 'string' ? d.form.coverAssetId : null;
    if (coverId) {
      const [asset] = await q.query(`select * from feture.media_asset where id = $1 and owner_profile_id = $2 and purpose = 'event' and ${LIVE}`, [coverId, acting.profileId]);
      if (asset) cover = await mediaDto(cfg.media, asset, { viewerProfileId: acting.profileId, place: 'public', showExplicit: false, staff: false }).catch(() => null);
    }
    return { draft: { id: d.id, form: d.form, step: d.step, updatedAt: d.updated_at, cover } };
  },

  async 'event.draftDelete'(q, { acting: a, input }) {
    const acting = need(a);
    const rows = await q.query('delete from feture.event_draft where id = $1 and owner_profile_id = $2 returning id', [input.draftId, acting.profileId]);
    if (!rows[0]) fail(404, 'not_found');
    return { deleted: true };
  },

  async 'event.submit'(q, { acting: a, input }) {
    const acting = need(a);
    await requireUnrestricted(q, acting, 'events');
    const f = input.event;
    if (Date.parse(f.startsAt) <= Date.now()) fail(400, 'invalid_input', { fields: ['startsAt'] });
    // A cover photo is required (owner 06.11.2026): no colour stand-ins.
    if (!f.coverAssetId) fail(400, 'invalid_input', { fields: ['coverAssetId'] });
    await checkEventRefs(q, acting, f);
    const partner = needsPartner(acting, 'event.submit');
    const [e] = await q.query(
      `insert into feture.event (organizer_profile_id, created_by, community_id, state, ${Object.values(COLS).join(', ')})
       values ($1, $2, $3, $4, ${Object.keys(COLS).map((_, i) => `$${i + 5}`).join(', ')}) returning id`,
      [acting.profileId, acting.accountId, f.communityId, partner ? 'pending_partner' : 'in_review', ...values(f)]);
    if (input.draftId) await q.query('delete from feture.event_draft where id = $1 and owner_profile_id = $2', [input.draftId, acting.profileId]);
    if (partner) {
      return { id: e.id, state: 'pending_partner', pending: await requestApproval(q, acting, { kind: 'event.submit', targetType: 'event', targetId: e.id, change: { rev: 1 }, summary: [f.title] }) };
    }
    await enqueue(q, 'moderation.event', acting.profileId, { eventId: e.id });
    return { id: e.id, state: 'in_review' };
  },

  async 'event.withdraw'(q, { acting: a, input }) {
    // Before publication the event goes back to a draft at the last step (V21 L9117); nobody saw it.
    const acting = need(a);
    const e = await ownEvent(q, input.eventId, acting);
    if (!['pending_partner', 'in_review', 'rejected'].includes(e.state)) fail(409, 'conflict', { state: e.state });
    await dropPending(q, acting.profileId, 'event.submit', e.id);
    await closeAppealOn(q, 'event', e.id);
    return { draftId: await toEventDraft(q, { ...e, created_by: acting.accountId }) };
  },

  async 'event.update'(q, { acting: a, input }) {
    const acting = need(a);
    await requireUnrestricted(q, acting, 'events');
    const e = await ownEvent(q, input.eventId, acting);
    if (!input.event.coverAssetId) fail(400, 'invalid_input', { fields: ['coverAssetId'] });
    // A published couple event changes when the partner agrees (if they asked to); before that the submit approval covers it.
    if (e.state === 'published' && needsPartner(acting, 'event.update')) {
      if (e.rev !== input.rev) fail(409, 'conflict', { rev: e.rev });
      return { pending: await requestApproval(q, acting, { kind: 'event.update', targetType: 'event', targetId: e.id, change: { rev: input.rev, event: input.event }, summary: [input.event.title] }) };
    }
    return doUpdate(q, acting, e.id, input.rev, input.event);
  },

  async 'event.cancel'(q, { acting: a, input }) {
    // Cancelling is a narrowing: never waits for the partner. The page stays with «Отменено» and the reason.
    const acting = need(a);
    const e = await ownEvent(q, input.eventId, acting);
    if (e.state !== 'published') fail(409, 'conflict', { state: e.state });
    // A past event is not cancelled: nobody is to be told «отменено» about something that already happened.
    if (new Date(e.ends_at).getTime() <= Date.now()) fail(409, 'conflict', { rule: 'event_over' });
    await cancelEvent(q, e, { reason: input.reason, by: acting.accountId });
    return { state: 'cancelled' };
  },

  async 'event.get'(q, { acting: a, input, cfg }) {
    const viewer = need(a);
    const e = await visibleEvent(q, input.eventId, viewer);
    const [mine] = await q.query(
      `select (select json_build_object('status', r.status, 'showInList', r.show_in_list, 'ticketMarked', r.ticket_marked) from feture.event_rsvp r where r.event_id = $1 and r.profile_id = $2) rsvp,
              (select json_build_object('id', x.id, 'state', x.state, 'rev', x.rev) from feture.event_application x where x.event_id = $1 and x.profile_id = $2 order by x.created_at desc limit 1) application,
              (select json_build_object('id', p.id, 'kind', p.kind, 'change', p.change) from feture.partner_approval p where p.profile_id = $2 and p.target_id = $1 and p.state = 'pending' and p.kind in ('event.rsvp', 'event.apply') limit 1) waiting`,
      [e.id, viewer.profileId]);
    const counts = await crowd(q, e, viewer.profileId);
    const org = await withFaces(q, cfg.media, viewer, await q.query(`select p.id, p.kind, p.handle, p.name from feture.profile p where p.id = $1`, [e.organizer_profile_id]), r => r);
    // The organizer's words are for admitted people (they may name the place); people who are interested or still
    // waiting for an answer learn only that the time or place changed.
    const follows = ['going', 'interested'].includes(mine.rsvp?.status) || ['pending', 'approved'].includes(mine.application?.state);
    const announcements = e.own || e.admitted || follows
      ? await q.query(
        `select id, body, automatic, changes, created_at from feture.event_announcement where event_id = $1 and ($2 or automatic) and removed_at is null order by created_at desc limit 50`,
        [e.id, e.own || e.admitted])
      : [];
    let cover = null;
    if (e.cover_asset_id) {
      const [asset] = await q.query('select * from feture.media_asset where id = $1', [e.cover_asset_id]);
      if (asset) cover = await mediaDto(cfg.media, asset, { viewerProfileId: viewer.profileId, place: 'public', showExplicit: false, staff: false }).catch(() => null);
    }
    return {
      event: {
        id: e.id, title: e.title, kind: e.kind, description: e.description, format: e.format, placeId: e.place_id, area: e.area, tz: e.tz,
        startsAt: iso(e.starts_at), endsAt: iso(e.ends_at), price: e.price, requiresApplication: e.requires_application, questions: e.questions,
        requirements: e.requirements, plate: e.plate, cover, communityId: e.community_id, state: e.state, past: e.past,
        cancelReason: e.state === 'cancelled' ? e.cancel_reason : null, organizer: org[0], going: counts.going, interested: counts.interested,
        // «Мест» (audit item 36): the limit and whether a place is free; the organizer sees «12 из 20» (taken).
        seats: e.seats ?? null, full: e.seats != null && counts.taken >= e.seats, ...(e.own && e.seats != null ? { taken: counts.taken } : {}),
        // Only admitted people get the exact place; everyone else gets a hint while the event is open.
        exactAddress: e.admitted ? e.exact_address : null, joinUrl: e.admitted ? e.join_url : null,
        locked: !e.admitted && e.state === 'published' && !e.past,
        me: { rsvp: mine.rsvp, application: mine.application, waiting: mine.waiting },
        announcements,
        ...(e.own ? { rev: e.rev, pendingChange: e.pending_change, rejectReason: e.reject_reason, pendingApplications: counts.pending } : {}),
      },
    };
  },

  async 'event.catalog'(q, { acting: a, input }) {
    const viewer = need(a);
    let cur = null;
    if (input.cursor) {
      try { cur = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')); } catch { /* checked below */ }
      if (!Array.isArray(cur) || typeof cur[0] !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(cur[1]) || Number.isNaN(Date.parse(cur[0]))) {
        fail(400, 'invalid_input', { fields: ['cursor'] });
      }
    }
    // Offline events are those of the viewer's city unless another city is asked for (V21 L6325).
    let placeId = input.placeId ?? null;
    if (!placeId && input.format === 'offline') {
      const [d] = await q.query('select city_id from feture.profile_details where profile_id = $1', [viewer.profileId]);
      placeId = d?.city_id ?? null;
    }
    const rows = await q.query(
      `select e.id, e.title, e.kind, e.format, e.place_id, e.area, e.tz, e.starts_at, e.ends_at, e.price, e.requires_application, e.plate, e.state, e.community_id,
              case when e.state = 'cancelled' then e.cancel_reason end cancel_reason
       from feture.event e
       where ${listedEvent('e', '$1')} and feture.event_visible(e, $1, $2)
         and ($3 = 'all' or e.format = $3) and ($4::uuid is null or e.format = 'online' or e.place_id = $4)
         and ($5 = 'any' or $5 = 'week' and e.starts_at < now() + interval '7 days' or $5 = 'month' and e.starts_at < now() + interval '30 days'
              or $5 = 'weekend' and e.starts_at < now() + interval '7 days' and extract(isodow from e.starts_at at time zone e.tz) in (6, 7))
         and ($6::text[] is null or e.kind = any($6)) and ($7 = 'any' or ($7 = 'free') = (e.price->>'kind' = 'free'))
         and (not $8 or not e.requires_application) and ($9::uuid is null or e.community_id = $9)
         and ($10::timestamptz is null or (e.starts_at, e.id) > ($10::timestamptz, $11::uuid))
         and ($12::text is null or e.title ilike $12 or e.description ilike $12)
         and ($13::timestamptz is null or e.starts_at >= $13) and ($14::timestamptz is null or e.starts_at < $14)
       order by e.starts_at, e.id limit 21`,
      [viewer.profileId, viewer.accountId, input.format, placeId, input.when, input.kinds?.length ? input.kinds : null, input.price, input.openOnly,
        input.communityId ?? null, cur?.[0] ?? null, cur?.[1] ?? null, likePattern(input.q), input.from ?? null, input.to ?? null]);
    const page = rows.slice(0, 20);
    const last = page[page.length - 1];
    return {
      items: page.map(r => ({ ...r, starts_at: iso(r.starts_at), ends_at: iso(r.ends_at) })),
      next: rows.length > 20 ? Buffer.from(JSON.stringify([iso(last.starts_at), last.id])).toString('base64url') : null,
    };
  },

  async 'event.mine'(q, { acting: a }) {
    const viewer = need(a);
    const pick = `e.id, e.title, e.format, e.tz, e.area, e.place_id, e.starts_at, e.ends_at, e.state, e.plate`;
    const organizing = await q.query(`select ${pick} from feture.event e where e.organizer_profile_id = $1 order by e.starts_at desc limit 100`, [viewer.profileId]);
    const answered = await q.query(
      `select ${pick}, r.status, e.ends_at <= now() past from feture.event_rsvp r join feture.event e on e.id = r.event_id
       where r.profile_id = $1 and feture.event_visible(e, $1, $2) order by e.starts_at limit 100`, [viewer.profileId, viewer.accountId]);
    const applications = await q.query(
      `select ${pick}, x.id application_id, x.state application_state from feture.event_application x join feture.event e on e.id = x.event_id
       where x.profile_id = $1 and x.state in ('pending', 'approved') and feture.event_visible(e, $1, $2) order by e.starts_at limit 100`, [viewer.profileId, viewer.accountId]);
    const waiting = await q.query(
      `select ${pick}, p.kind approval from feture.partner_approval p join feture.event e on e.id = p.target_id
       where p.profile_id = $1 and p.state = 'pending' and p.kind in ('event.rsvp', 'event.apply') and feture.event_visible(e, $1, $2)`, [viewer.profileId, viewer.accountId]);
    // Cancelled events the viewer had a relation to, until their original start (then they are simply past).
    const cancelled = await q.query(
      `select ${pick}, e.cancel_reason from feture.event e
       where e.state = 'cancelled' and e.starts_at > now() and e.organizer_profile_id <> $1 and ${cancelledFor('e', '$1')} and feture.event_visible(e, $1, $2)
       order by e.starts_at limit 100`, [viewer.profileId, viewer.accountId]);
    const drafts = await q.query(`select id, form->>'title' title, step, updated_at from feture.event_draft where owner_profile_id = $1 order by updated_at desc`, [viewer.profileId]);
    const going = [...applications.filter(r => r.application_state === 'approved' && r.state === 'published'), ...answered.filter(r => r.status === 'going' && !r.past && r.state === 'published')];
    return {
      going: [...new Map(going.map(r => [r.id, r])).values()],
      waiting, applications: applications.filter(r => r.application_state === 'pending'),
      interested: answered.filter(r => r.status === 'interested' && !r.past && r.state === 'published'),
      cancelled,
      past: answered.filter(r => r.past && r.status === 'going'),
      organizing, drafts,
    };
  },

  async 'event.soon'(q, { acting: a }) {
    const viewer = need(a);
    // Why each event concerns the viewer, strongest first; an event with no reason is not offered. Interests are the
    // viewer's levels only — «обсудить» and hard limits never pull an event in.
    const rows = await q.query(
      `select * from (
         select e.id, e.title, e.kind, e.format, e.place_id, e.area, e.tz, e.starts_at, e.ends_at, e.price, e.requires_application, e.plate, e.state, e.community_id,
           case when e.state = 'cancelled' then e.cancel_reason end cancel_reason,
           case when e.state = 'cancelled' then 'cancelled'
                when exists (select 1 from feture.event_rsvp r where r.event_id = e.id and r.profile_id = $1 and r.status in ('interested', 'going'))
                  or exists (select 1 from feture.event_application x where x.event_id = e.id and x.profile_id = $1 and x.state in ('pending', 'approved')) then 'mine'
                when exists (select 1 from feture.follow f where f.follower_profile_id = $1 and f.target_profile_id = e.organizer_profile_id) then 'follow'
                when exists (select 1 from feture.community_member m where m.community_id = e.community_id and m.profile_id = $1 and m.state = 'active') then 'community'
                when exists (select 1 from feture.community c where c.id = e.community_id
                               and c.topics && array(select i.topic_id from feture.interest i where i.profile_id = $1 and i.value is not null)) then 'interests'
                when e.format = 'online' then 'online'
                when e.place_id = (select d.city_id from feture.profile_details d where d.profile_id = $1) then 'city'
           end why
         from feture.event e
         where ${listedEvent('e', '$1')} and e.starts_at < now() + interval '14 days'
           and e.organizer_profile_id <> $1 and feture.event_visible(e, $1, $2)
           and not exists (select 1 from feture.feed_hide h where h.profile_id = $1 and h.kind = 'event' and h.target_id = e.id)
           and not exists (select 1 from feture.event_rsvp r where r.event_id = e.id and r.profile_id = $1 and r.status = 'not_going')
       ) x where why is not null
       order by case why when 'cancelled' then 0 when 'mine' then 0 when 'follow' then 1 when 'community' then 2 when 'interests' then 3 else 4 end, starts_at, id
       limit 3`,
      [viewer.profileId, viewer.accountId]);
    return { items: rows.map(r => ({ ...r, starts_at: iso(r.starts_at), ends_at: iso(r.ends_at) })) };
  },

  async 'event.rsvp'(q, { acting: a, input }) {
    const acting = need(a);
    if (input.status === 'going' || input.status === 'interested') await requireUnrestricted(q, acting, 'events');
    const e = await openFor(q, input.eventId, acting.profileId, acting.accountId);
    // Clearing the answer clears the ticket mark too (EVT-028).
    const c = { status: input.status, showInList: input.status === null ? null : input.showInList, ticketMarked: input.status === null ? null : input.ticketMarked };
    await checkRsvp(q, e, acting.profileId, c);
    const apart = input.status === 'going' ? await askApart(q, e, acting, input) : null;
    // A couple moving up (to «интересно» or «идём») or showing itself in the list widens what others see: the partner
    // decides on that. Going down or hiding from the list applies at once.
    const [cur] = await q.query('select status, show_in_list from feture.event_rsvp where event_id = $1 and profile_id = $2', [e.id, acting.profileId]);
    const rank = (/** @type {string | null | undefined} */ v) => v ? RANK[/** @type {keyof typeof RANK} */ (v)] : 0;
    const up = rank(input.status) > rank(cur?.status) || (input.showInList === true && !cur?.show_in_list);
    if (up && needsPartner(acting, 'event.rsvp')) {
      return { pending: await requestApproval(q, acting, { kind: 'event.rsvp', targetType: 'event', targetId: e.id,
        change: { ...c, ...(input.together ? { together: true } : {}) }, summary: [e.title, input.status] }) };
    }
    await dropPending(q, acting.profileId, 'event.rsvp', e.id);
    await writeRsvp(q, e.id, acting.profileId, acting.accountId, c);
    if (apart && acting.kind === 'couple') await afterCoupleMark(q, e, acting, apart, input.together === true);
    // A couple's answer moving up in trust mode goes into the partner's couple history (with a push: participation).
    if (up) await partnerActed(q, acting, 'event', { eventId: e.id });
    return { status: input.status };
  },

  async 'event.apply'(q, { acting: a, input }) {
    const acting = need(a);
    await requireUnrestricted(q, acting, 'events');
    const e = await openFor(q, input.eventId, acting.profileId, acting.accountId);
    const c = { answers: input.answers, note: input.note };
    checkApplication(e, c);
    await notDeclined(q, e.id, acting.profileId);
    const apart = await askApart(q, e, acting, input);
    if (needsPartner(acting, 'event.apply')) {
      return { pending: await requestApproval(q, acting, { kind: 'event.apply', targetType: 'event', targetId: e.id,
        change: { ...c, ...(input.together ? { together: true } : {}) }, summary: [e.title] }) };
    }
    const id = await writeApplication(q, e, acting.profileId, acting.accountId, c);
    if (acting.kind === 'couple') await afterCoupleMark(q, e, acting, apart, input.together === true);
    await partnerActed(q, acting, 'eventApply', { eventId: e.id });
    return { id, state: 'pending' };
  },

  async 'event.applicationWithdraw'(q, { acting: a, input }) {
    const acting = need(a);
    const rows = await q.query(
      `update feture.event_application set state = 'withdrawn', decided_at = now(), rev = rev + 1
       where id = $1 and profile_id = $2 and state in ('pending', 'approved') returning event_id`, [input.applicationId, acting.profileId]);
    if (!rows[0]) fail(404, 'not_found');
    // Leaving an event by application also drops the answer that came with the admission.
    await q.query(`delete from feture.event_rsvp where event_id = $1 and profile_id = $2 and status = 'going'`, [rows[0].event_id, acting.profileId]);
    return { state: 'withdrawn' };
  },

  async 'event.applications'(q, { acting: a, input, cfg }) {
    const acting = need(a);
    const [e] = await q.query('select id from feture.event where id = $1 and organizer_profile_id = $2', [input.eventId, acting.profileId]);
    if (!e) fail(404, 'not_found');
    const rows = await q.query(
      `select x.id, x.state, x.answers, x.note, x.rev, x.created_at, x.decided_at, p.id profile_id, p.kind, p.handle, p.name
       from feture.event_application x join feture.profile p on p.id = x.profile_id
       where x.event_id = $1 and x.state = $2 and p.state = 'active' and not feture.blocked($3, p.id)
       order by x.created_at limit 100`, [e.id, input.state, acting.profileId]);
    // Nickname and age (both partners for a couple), never the private part or interests (V21 E06).
    const people = rows.length ? await q.query(
      `select pm.profile_id, pp.handle, a.birth_date, coalesce(d.show_age, false) show_age
       from feture.profile_member pm join feture.account a on a.id = pm.account_id join feture.profile pp on pp.id = a.person_profile_id
       left join feture.profile_details d on d.profile_id = pp.id
       where pm.profile_id = any($1) and pm.state = 'active'`, [rows.map(r => r.profile_id)]) : [];
    const items = await withFaces(q, cfg.media, acting, rows.map(({ profile_id, kind, handle, name, ...r }) => ({ ...r, profile: { id: profile_id, kind, handle, name } })), r => r.profile);
    return {
      items: items.map(({ ...r }) => ({
        ...r,
        people: people.filter(p => p.profile_id === r.profile.id).map(p => ({
          handle: p.handle, age: p.show_age && p.birth_date ? ageOn(String(p.birth_date instanceof Date ? p.birth_date.toISOString().slice(0, 10) : p.birth_date)) : null,
        })),
      })),
    };
  },

  async 'event.applicationDecide'(q, { acting: a, input }) {
    const acting = need(a);
    // The event first, then the application: the same order as cancel and hide, so they never deadlock.
    const [ref] = await q.query('select event_id from feture.event_application where id = $1', [input.applicationId]);
    if (!ref) fail(404, 'not_found');
    const e = await ownEvent(q, ref.event_id, acting);
    const [x] = await q.query('select * from feture.event_application where id = $1 for update', [input.applicationId]);
    if (e.state !== 'published' || new Date(e.ends_at).getTime() <= Date.now()) fail(409, 'conflict', { state: e.state });
    if (x.rev !== input.rev) fail(409, 'conflict', { rev: x.rev });
    // pending → approved | declined; approved ⇄ declined (revoke, or «всё-таки одобрить», EVT-018).
    const to = input.approve ? 'approved' : 'declined';
    if (!['pending', 'approved', 'declined'].includes(x.state) || x.state === to) fail(409, 'conflict', { state: x.state });
    if (to === 'approved') {
      const [{ ok }] = await q.query(`select p.state = 'active' and not feture.blocked(p.id, $2) ok from feture.profile p where p.id = $1`, [x.profile_id, e.organizer_profile_id]);
      if (!ok) fail(409, 'conflict', { rule: 'applicant_unavailable' });
      // An application may wait while there are no places; it is approved once one is free (В13).
      await requireSeats(q, e, x.profile_id);
    }
    await q.query(`update feture.event_application set state = $2, decided_by = $3, decided_at = now(), rev = rev + 1 where id = $1`, [x.id, to, acting.accountId]);
    // A decided task reads its own inbox row (docs/notifications.md «Счётчики»).
    await readAbout(q, { profile: acting.profileId, kind: 'task', objectType: 'request', objectId: x.id });
    // A revoked admission takes the exact place with it, and the «иду» that came with it.
    if (to === 'declined') await q.query(`delete from feture.event_rsvp where event_id = $1 and profile_id = $2 and status = 'going'`, [e.id, x.profile_id]);
    await enqueue(q, to === 'approved' ? 'event.applicationApproved' : 'event.applicationDeclined', x.profile_id, { eventId: e.id });
    return { state: to, rev: x.rev + 1 };
  },

  async 'event.announce'(q, { acting: a, input }) {
    // One-way: people cannot answer an announcement (V21 «это не чат»).
    const acting = need(a);
    const e = await ownEvent(q, input.eventId, acting);
    if (e.state !== 'published' || new Date(e.ends_at).getTime() <= Date.now()) fail(409, 'conflict', { state: e.state });
    const [n] = await q.query(`insert into feture.event_announcement (event_id, body, created_by) values ($1, $2, $3) returning id`, [e.id, input.body, acting.accountId]);
    await checkWords(q, 'announcement', n.id, input.body, e.organizer_profile_id);
    await enqueue(q, 'event.announcement', e.organizer_profile_id, { eventId: e.id, announcementId: n.id });
    return { id: n.id };
  },

  async 'event.attendees'(q, { acting: a, input, cfg }) {
    const viewer = need(a);
    const e = await visibleEvent(q, input.eventId, viewer);
    // «Идут»: approved applications (events by application) or «иду»; a couple is one row counted as two (EVT-003).
    const rows = await q.query(
      input.kind === 'going' && e.requires_application
        ? `select p.id, p.kind, p.handle, p.name, coalesce(r.show_in_list, false) shown from feture.event_application x
             join feture.profile p on p.id = x.profile_id left join feture.event_rsvp r on r.event_id = x.event_id and r.profile_id = x.profile_id
           where x.event_id = $1 and x.state = 'approved' and p.state = 'active' and not feture.blocked($2, p.id)`
        : `select p.id, p.kind, p.handle, p.name, r.show_in_list shown from feture.event_rsvp r join feture.profile p on p.id = r.profile_id
           where r.event_id = $1 and r.status = $3 and p.state = 'active' and not feture.blocked($2, p.id)`,
      input.kind === 'going' && e.requires_application ? [e.id, viewer.profileId] : [e.id, viewer.profileId, input.kind]);
    // «Идут»: persons, each once (audit item 53, the same number as the page); «интересно»: a couple counts as two.
    const going = input.kind === 'going' ? await q.query(`select profile_id, account_id from feture.event_going($1)`, [e.id]) : [];
    const people = (/** @type {any[]} */ list) => input.kind === 'going'
      ? new Set(going.filter(g => list.some(r => r.id === g.profile_id)).map(g => g.account_id)).size
      : list.reduce((n, r) => n + (r.kind === 'couple' ? 2 : 1), 0);
    await withFaces(q, cfg.media, viewer, e.own ? rows : rows.filter(r => r.shown), r => r);
    if (e.own) return { count: people(rows), hidden: 0, items: rows.map(({ shown: _, ...r }) => r) };
    const shown = rows.filter(r => r.shown);
    return { count: people(rows), hidden: people(rows) - people(shown), items: shown.map(({ shown: _, ...r }) => r) };
  },

  async 'staff.eventQueue'(q, { account, input }) {
    await requireStaff(q, account, ['owner', 'lead', 'moderator']);
    const { sql, params } = queuePageSql(input, CREATED_KEYS,
      `select e.id, e.rev, e.title, e.kind, e.description, e.format, e.area, e.exact_address, e.join_url, e.tz, e.starts_at, e.ends_at, e.price,
         e.requirements, e.questions, e.cover_asset_id, e.community_id, e.state, e.pending_change, e.created_at,
         json_build_object('id', o.id, 'kind', o.kind, 'handle', o.handle) organizer
       from feture.event e join feture.profile o on o.id = e.organizer_profile_id
       -- not one whose start already passed (it goes back to drafts) nor a change of an event that is over (audit item 32)
       where (e.state = 'in_review' and e.starts_at > now() or e.state = 'published' and e.pending_change is not null and e.ends_at > now())
         and not ${staffOwn('e.organizer_profile_id', '$1::uuid')}`, [account.id]);
    const rows = await q.query(sql, params);
    return { items: plainRows(rows), ...pageInfo(rows, CREATED_KEYS, input.limit) };
  },

  async 'staff.eventDecide'(q, { account, input }) {
    await requireStaff(q, account, ['owner', 'lead', 'moderator']);
    const [e] = await q.query('select * from feture.event where id = $1 for update', [input.eventId]);
    if (!e) fail(404, 'not_found');
    const [{ own }] = await q.query(`select ${staffOwn('$1::uuid', '$2::uuid')} own`, [e.organizer_profile_id, account.id]);
    if (own) fail(403, 'forbidden');
    if (e.rev !== input.rev) fail(409, 'conflict', { rev: e.rev }); // staff decide on exactly what they saw
    const change = Object.fromEntries(Object.entries(e.pending_change ?? {}).filter(([k]) => Object.hasOwn(COLS, k)));
    if (input.decision === 'hide') {
      if (!['published', 'cancelled'].includes(e.state)) fail(409, 'conflict', { state: e.state });
      await hideEvent(q, e.id, input.reason || null);
    } else if (input.decision === 'approve') {
      const cover = Object.hasOwn(change, 'coverAssetId') ? change.coverAssetId : e.cover_asset_id;
      if (cover) {
        // A cover is public everywhere: it must have passed its checks and be safe.
        const [m] = await q.query(`select 1 from feture.media_asset where id = $1 and owner_profile_id = $2 and purpose = 'event' and state = 'approved' and explicitness = 'safe'`, [cover, e.organizer_profile_id]);
        if (!m) fail(422, 'rule_violation', { rule: 'cover_not_approved' });
      }
      if (e.state === 'in_review') {
        if (new Date(e.starts_at).getTime() <= Date.now()) fail(409, 'conflict', { rule: 'started' });
        // Not into a community that is no longer published (audit item 15): the organizer re-submits without it.
        if (e.community_id && !(await q.query(`select 1 from feture.community where id = $1 and state = 'published'`, [e.community_id]))[0]) {
          fail(409, 'conflict', { rule: 'community_closed' });
        }
        await q.query(`update feture.event set state = 'published', published_at = now(), reject_reason = null, rev = rev + 1, updated_at = now() where id = $1`, [e.id]);
      } else if (e.state === 'published' && e.pending_change) {
        const keys = Object.keys(change);
        await q.query(
          `update feture.event set ${keys.map((k, i) => `${COLS[/** @type {keyof typeof COLS} */ (k)]} = $${i + 2}`).join(', ')}${keys.length ? ',' : ''}
             pending_change = null, rev = rev + 1, updated_at = now() where id = $1`, [e.id, ...keys.map(k => k === 'price' ? JSON.stringify(change[k]) : change[k])]);
        if (Object.hasOwn(change, 'joinUrl') && change.joinUrl !== e.join_url) {
          // Admitted people learn that the link changed once staff let it through.
          await q.query(`insert into feture.event_announcement (event_id, automatic, changes) values ($1, true, '{link}')`, [e.id]);
          await enqueue(q, 'event.changed', e.organizer_profile_id, { eventId: e.id, changes: ['link'] });
        }
      } else fail(409, 'conflict', { state: e.state });
    } else if (e.state === 'in_review') {
      await q.query(`update feture.event set state = 'rejected', reject_reason = $2, rev = rev + 1, updated_at = now() where id = $1`, [e.id, input.reason || null]);
    } else if (e.state === 'published' && e.pending_change) {
      await q.query(`update feture.event set pending_change = null, reject_reason = $2, rev = rev + 1, updated_at = now() where id = $1`, [e.id, input.reason || null]);
    } else fail(409, 'conflict', { state: e.state });
    await enqueue(q, 'event.' + input.decision, e.organizer_profile_id, { eventId: e.id, ...(input.decision !== 'hide' && e.state === 'published' ? { what: 'change' } : {}) });
    await journal(q, account.id, 'event.' + input.decision, 'event', e.id, {
      from: e.state, rev: e.rev, reason: input.reason || null, decided: e.state === 'in_review' ? { title: e.title, description: e.description, cover: e.cover_asset_id } : e.pending_change,
    });
    return { decision: input.decision };
  },
};

/** Counts for the event page: «идут» never includes pending applications; people hidden by a block are not counted
 * (as in event.attendees), a person coming alone and with the couple once (audit item 53). `taken`: places taken. @param {Q} q @param {any} e @param {string} viewer */
async function crowd(q, e, viewer) {
  const [c] = await q.query(
    `select (select count(distinct account_id) from feture.event_going($1))::int taken,
       (select count(distinct g.account_id) from feture.event_going($1) g where not feture.blocked($2, g.profile_id))::int going,
       (select coalesce(sum(case when p.kind = 'couple' then 2 else 1 end), 0) from feture.event_rsvp r join feture.profile p on p.id = r.profile_id where r.event_id = $1 and r.status = 'interested' and p.state = 'active' and not feture.blocked($2, p.id))::int interested,
       (select count(*) from feture.event_application x where x.event_id = $1 and x.state = 'pending')::int pending`, [e.id, viewer]);
  return c;
}

/** @type {Record<string, Command>} */
export const events = Object.fromEntries(
  Object.entries(eventsCommands).map(([action, def]) => [action, { ...def, run: run[/** @type {keyof typeof run} */ (action)] }]));
