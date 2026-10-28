// Slice D2 on PGlite as feture_api: events, drafts, staff review, RSVPs, applications, admission, announcements, attendees.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { staff } from '../server/commands/staff.mjs';
import { communities } from '../server/commands/communities.mjs';
import { events } from '../server/commands/events.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...posts, ...staff, ...communities, ...events } });
const day = 864e5;
const at = (/** @type {number} */ days, hours = 0) => new Date(Date.now() + days * day + hours * 36e5).toISOString();

async function world() {
  const env = await setup();
  const { db, call, person } = env;
  const boss = await person('uo', 'Boss');
  await person('um', 'Mira');
  await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
  await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Mira', role: 'moderator', grant: true });
  const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
  const [{ id: berlin }] = await db.query(`select id from feture.place where code = 'berlin'`);
  /** An offline event in Berlin, a week ahead. */
  const ev = (extra = {}) => ({
    title: 'Вечер знакомств', kind: 'meetup', description: 'Спокойный вечер для знакомства, без спешки и давления.',
    format: 'offline', placeId: berlin, area: 'Кройцберг', exactAddress: 'Oranienstr. 1, 2 этаж', tz: 'Europe/Berlin',
    startsAt: at(7), endsAt: at(7, 3), ...extra,
  });
  /** Staff decide on the version they saw in the queue. */
  const decide = async (/** @type {string} */ eventId, decision = 'approve') => {
    const item = (await call('um', null, { action: 'staff.eventQueue' })).items.find((/** @type {any} */ x) => x.id === eventId);
    return call('um', null, { action: 'staff.eventDecide', opId: op(), eventId, rev: item.rev, decision });
  };
  /** Submits and publishes an event organized by `profile`. */
  const publish = async (/** @type {string} */ user, /** @type {string} */ profile, extra = {}) => {
    const r = await call(user, profile, { action: 'event.submit', opId: op(), event: ev(extra) });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal((await decide(r.id)).decision, 'approve');
    return r.id;
  };
  return { ...env, a, b, c, berlin, ev, decide, publish };
}

test('drafts, submit, staff review on the seen version, withdraw back to a draft, catalog', async () => {
  const { pg, call, a, b, ev, decide } = await world();
  try {
    assert.equal((await call('ua', a, { action: 'event.draftSave', opId: op(), form: { title: ' ' } })).status, 400);
    const d = await call('ua', a, { action: 'event.draftSave', opId: op(), form: { title: 'Черновик вечера' }, step: 2 });
    assert.deepEqual((await call('ua', a, { action: 'event.mine' })).drafts.map((/** @type {any} */ x) => x.title), ['Черновик вечера']);
    assert.equal((await call('ub', b, { action: 'event.draftDelete', opId: op(), draftId: d.id })).status, 404);

    assert.deepEqual((await call('ua', a, { action: 'event.submit', opId: op(), event: ev({ startsAt: at(-1), endsAt: at(-1, 2) }) })).fields, ['startsAt']);
    assert.equal((await call('ua', a, { action: 'event.submit', opId: op(), event: ev({ exactAddress: null }) })).status, 400);
    const r = await call('ua', a, { action: 'event.submit', opId: op(), draftId: d.id, event: ev() });
    assert.equal(r.state, 'in_review');
    assert.deepEqual((await call('ua', a, { action: 'event.mine' })).drafts, []);
    assert.equal((await call('ub', b, { action: 'event.get', eventId: r.id })).status, 404);

    // An edit after staff opened the card needs a fresh look.
    const seen = (await call('um', null, { action: 'staff.eventQueue' })).items.find((/** @type {any} */ x) => x.id === r.id).rev;
    await call('ua', a, { action: 'event.update', opId: op(), eventId: r.id, rev: seen, event: ev({ title: 'Вечер знакомств и чай' }) });
    assert.equal((await call('um', null, { action: 'staff.eventDecide', opId: op(), eventId: r.id, rev: seen, decision: 'approve' })).status, 409);
    assert.equal((await decide(r.id, 'reject')).decision, 'reject');
    // Withdrawn before publication: back to a draft at the last step.
    const w = await call('ua', a, { action: 'event.withdraw', opId: op(), eventId: r.id });
    assert.equal((await call('ua', a, { action: 'event.mine' })).drafts[0].step, 4);
    assert.ok(w.draftId);
    assert.equal((await call('ua', a, { action: 'event.get', eventId: r.id })).status, 404);

    const r2 = await call('ua', a, { action: 'event.submit', opId: op(), event: ev() });
    await decide(r2.id);
    const cat = await call('ub', b, { action: 'event.catalog', format: 'offline' });
    assert.deepEqual(cat.items.map((/** @type {any} */ x) => x.title), ['Вечер знакомств']);
    assert.equal(cat.items[0].exact_address, undefined);
    assert.deepEqual((await call('ub', b, { action: 'event.catalog', format: 'online' })).items, []);
    assert.deepEqual((await call('ub', b, { action: 'event.catalog', openOnly: true, price: 'paid' })).items, []);
  } finally { await pg.close(); }
});

test('open events: «иду» admits to the exact address; organizers cannot answer; ticket marks only for external tickets', async () => {
  const { pg, call, a, b, c, publish } = await world();
  try {
    const id = await publish('ua', a);
    let got = (await call('ub', b, { action: 'event.get', eventId: id })).event;
    assert.deepEqual([got.exactAddress, got.locked, got.area], [null, true, 'Кройцберг']);
    assert.equal((await call('ua', a, { action: 'event.rsvp', opId: op(), eventId: id, status: 'going' })).rule, 'own_event');
    assert.equal((await call('ub', b, { action: 'event.rsvp', opId: op(), eventId: id, status: 'going', ticketMarked: true })).status, 400);
    await call('ub', b, { action: 'event.rsvp', opId: op(), eventId: id, status: 'going' });
    got = (await call('ub', b, { action: 'event.get', eventId: id })).event;
    assert.deepEqual([got.exactAddress, got.going, got.me.rsvp.status], ['Oranienstr. 1, 2 этаж', 1, 'going']);
    // Hidden from the list by default; the organizer sees everyone.
    await call('uc', c, { action: 'event.rsvp', opId: op(), eventId: id, status: 'going', showInList: true });
    const guest = await call('ub', b, { action: 'event.attendees', eventId: id });
    assert.deepEqual([guest.count, guest.hidden, guest.items.map((/** @type {any} */ x) => x.handle)], [2, 1, ['Noa']]);
    assert.equal((await call('ua', a, { action: 'event.attendees', eventId: id })).items.length, 2);
    // Clearing the answer takes the address away again.
    await call('ub', b, { action: 'event.rsvp', opId: op(), eventId: id, status: null });
    assert.equal((await call('ub', b, { action: 'event.get', eventId: id })).event.exactAddress, null);

    // Blocking the organizer hides the event both ways.
    await call('ua', a, { action: 'block.set', opId: op(), profileId: c, on: true });
    assert.equal((await call('uc', c, { action: 'event.get', eventId: id })).status, 404);
  } finally { await pg.close(); }
});

test('events by application: pending never counts as «идёт», approval admits, revoke takes it back, cancel closes pending', async () => {
  const { pg, call, a, b, c, publish } = await world();
  try {
    const id = await publish('ua', a, { requiresApplication: true, questions: ['Был ли опыт?'], format: 'online', placeId: null, area: null, exactAddress: null, joinUrl: 'https://meet.example/x' });
    assert.equal((await call('ub', b, { action: 'event.rsvp', opId: op(), eventId: id, status: 'going' })).rule, 'application_first');
    assert.deepEqual((await call('ub', b, { action: 'event.apply', opId: op(), eventId: id, answers: ['Да, было', 'Лишний ответ'], requirementsAccepted: true })).fields, ['answers']);
    const app = await call('ub', b, { action: 'event.apply', opId: op(), eventId: id, answers: ['Да, два раза'], requirementsAccepted: true });
    assert.equal(app.state, 'pending');
    assert.equal((await call('ub', b, { action: 'event.apply', opId: op(), eventId: id, answers: ['Ещё раз'], requirementsAccepted: true })).rule, 'already_applied');
    let got = (await call('ub', b, { action: 'event.get', eventId: id })).event;
    assert.deepEqual([got.going, got.joinUrl], [0, null]); // pending is not «идёт»

    const list = (await call('ua', a, { action: 'event.applications', eventId: id })).items;
    assert.deepEqual([list[0].profile.handle, list[0].answers, list[0].people[0].handle], ['Kira', ['Да, два раза'], 'Kira']);
    assert.equal((await call('ub', b, { action: 'event.applications', eventId: id })).status, 404);
    const ok = await call('ua', a, { action: 'event.applicationDecide', opId: op(), applicationId: app.id, rev: list[0].rev, approve: true });
    got = (await call('ub', b, { action: 'event.get', eventId: id })).event;
    assert.deepEqual([got.going, got.joinUrl], [1, 'https://meet.example/x']);
    // Revoked: the link is gone.
    await call('ua', a, { action: 'event.applicationDecide', opId: op(), applicationId: app.id, rev: ok.rev, approve: false });
    assert.equal((await call('ub', b, { action: 'event.get', eventId: id })).event.joinUrl, null);

    // Cancel: pending applications close, the page stays with the reason, no more answers.
    const app2 = await call('uc', c, { action: 'event.apply', opId: op(), eventId: id, answers: ['Нет, впервые'], requirementsAccepted: true });
    await call('ua', a, { action: 'event.cancel', opId: op(), eventId: id, reason: 'Ведущий заболел' });
    got = (await call('uc', c, { action: 'event.get', eventId: id })).event;
    assert.deepEqual([got.state, got.cancelReason, got.me.application.state, got.me.application.id], ['cancelled', 'Ведущий заболел', 'closed', app2.id]);
    assert.equal((await call('uc', c, { action: 'event.rsvp', opId: op(), eventId: id, status: 'interested' })).status, 409);
  } finally { await pg.close(); }
});

test('edits of a published event: answers stay, time change announces itself, major text waits for staff; announcements for participants', async () => {
  const { pg, call, a, b, c, ev, publish, decide } = await world();
  try {
    const id = await publish('ua', a);
    await call('ub', b, { action: 'event.rsvp', opId: op(), eventId: id, status: 'going' });
    const rev = (await call('ua', a, { action: 'event.get', eventId: id })).event.rev;
    const up = await call('ua', a, { action: 'event.update', opId: op(), eventId: id, rev, event: ev({ title: 'Новый заголовок вечера', startsAt: at(8), endsAt: at(8, 3) }) });
    assert.deepEqual(up.review, ['title']);
    const got = (await call('ub', b, { action: 'event.get', eventId: id })).event;
    assert.equal(got.title, 'Вечер знакомств'); // the published title stays until staff look
    assert.equal(got.me.rsvp.status, 'going');
    assert.deepEqual(got.announcements.map((/** @type {any} */ n) => n.changes), [['time']]);
    await decide(id);
    assert.equal((await call('ub', b, { action: 'event.get', eventId: id })).event.title, 'Новый заголовок вечера');

    await call('ua', a, { action: 'event.announce', opId: op(), eventId: id, body: 'Возьмите сменную обувь' });
    assert.equal((await call('ub', b, { action: 'event.get', eventId: id })).event.announcements[0].body, 'Возьмите сменную обувь');
    assert.deepEqual((await call('uc', c, { action: 'event.get', eventId: id })).event.announcements, []); // not a participant
    assert.equal((await call('ub', b, { action: 'event.announce', opId: op(), eventId: id, body: 'Чужое объявление' })).status, 404);
  } finally { await pg.close(); }
});

test('couples: submit waits for the partner, «идём» waits for the partner, community events only by its hosts and only for members of a closed one', async () => {
  const { pg, db, call, coupleOf, a, b, c, ev, decide, publish } = await world();
  try {
    const pair = await coupleOf([a, b]);
    await db.query(`update feture.profile_member set approves_partner = true where profile_id = $1`, [pair]);
    const r = await call('ua', pair, { action: 'event.submit', opId: op(), event: ev({ title: 'Вечер от пары' }) });
    assert.equal(r.state, 'pending_partner');
    assert.ok(!(await call('um', null, { action: 'staff.eventQueue' })).items.some((/** @type {any} */ x) => x.id === r.id));
    await call('ub', pair, { action: 'decide.approval', opId: op(), approvalId: r.pending.approvalId, choice: 'approve' });
    assert.equal((await decide(r.id)).decision, 'approve');

    const other = await publish('uc', c);
    const ans = await call('ua', pair, { action: 'event.rsvp', opId: op(), eventId: other, status: 'going' });
    assert.ok(ans.pending);
    assert.equal((await call('ua', pair, { action: 'event.get', eventId: other })).event.me.waiting.kind, 'event.rsvp');
    await call('ub', pair, { action: 'decide.approval', opId: op(), approvalId: ans.pending.approvalId, choice: 'approve' });
    const got = (await call('ua', pair, { action: 'event.get', eventId: other })).event;
    assert.deepEqual([got.me.rsvp.status, got.going], ['going', 2]); // a couple counts as two
    // «Не идём» needs nobody.
    assert.equal((await call('ua', pair, { action: 'event.rsvp', opId: op(), eventId: other, status: 'not_going' })).status, 'not_going');

    // Community events: only the community's hosts organize; a closed community's events are for its members (Q30).
    const cr = await call('uc', c, { action: 'community.create', opId: op(), name: 'Закрытый круг', privacy: 'closed', joinQuestion: 'Кто вы?', description: 'Встречи и разговоры о верёвке для новичков', topics: ['shibari'], rules: ['Уважать границы'] });
    const q = (await call('um', null, { action: 'staff.communityQueue' })).items.find((/** @type {any} */ x) => x.id === cr.id);
    await call('um', null, { action: 'staff.communityDecide', opId: op(), communityId: cr.id, rev: q.rev, decision: 'approve' });
    assert.equal((await call('ua', a, { action: 'event.submit', opId: op(), event: ev({ communityId: cr.id }) })).rule, 'community_hosts_only');
    const inside = await publish('uc', c, { communityId: cr.id, title: 'Встреча круга' });
    assert.equal((await call('ua', a, { action: 'event.get', eventId: inside })).status, 404);
    assert.ok(!(await call('ua', a, { action: 'event.catalog' })).items.some((/** @type {any} */ x) => x.id === inside));
    assert.equal((await call('uc', c, { action: 'event.get', eventId: inside })).event.communityId, cr.id);
  } finally { await pg.close(); }
});

test('review fixes: announcements for admitted people, real zones only, admission frozen, narrowing at once, closed community events stay closed', async () => {
  const { pg, db, call, coupleOf, a, b, c, ev, publish, decide } = await world();
  try {
    assert.deepEqual((await call('ua', a, { action: 'event.submit', opId: op(), event: ev({ tz: '+01:00' }) })).fields, ['event.tz']);
    const id = await publish('ua', a);
    await call('ua', a, { action: 'event.announce', opId: op(), eventId: id, body: 'Код двери 4711' });
    // «Не иду» is not a way to read the organizer's words; «интересно» sees only that something changed.
    await call('uc', c, { action: 'event.rsvp', opId: op(), eventId: id, status: 'not_going' });
    assert.deepEqual((await call('uc', c, { action: 'event.get', eventId: id })).event.announcements, []);
    await call('uc', c, { action: 'event.rsvp', opId: op(), eventId: id, status: 'interested' });
    const rev = (await call('ua', a, { action: 'event.get', eventId: id })).event.rev;
    await call('ua', a, { action: 'event.update', opId: op(), eventId: id, rev, event: ev({ startsAt: at(9), endsAt: at(9, 2) }) });
    assert.deepEqual((await call('uc', c, { action: 'event.get', eventId: id })).event.announcements.map((/** @type {any} */ n) => [n.body, n.changes]), [[null, ['time']]]);
    // Who is admitted does not change under people's feet.
    const rev2 = (await call('ua', a, { action: 'event.get', eventId: id })).event.rev;
    assert.equal((await call('ua', a, { action: 'event.update', opId: op(), eventId: id, rev: rev2, event: ev({ startsAt: at(9), endsAt: at(9, 2), requiresApplication: true, questions: ['Зачем?'] }) })).rule, 'admission_frozen');
    // A new link waits for staff; the major change can be taken back by sending the old value.
    const up = await call('ua', a, { action: 'event.update', opId: op(), eventId: id, rev: rev2, event: ev({ startsAt: at(9), endsAt: at(9, 2), title: 'Другой заголовок' }) });
    assert.deepEqual(up.review, ['title']);
    await call('ua', a, { action: 'event.update', opId: op(), eventId: id, rev: up.rev, event: ev({ startsAt: at(9), endsAt: at(9, 2) }) });
    assert.equal((await call('ua', a, { action: 'event.get', eventId: id })).event.pendingChange, null);

    // A couple hiding from the list or stepping down does not wait for the partner.
    const pair = await coupleOf([b, c]);
    await db.query(`update feture.profile_member set approves_partner = true where profile_id = $1`, [pair]);
    await db.query(`insert into feture.event_rsvp (event_id, profile_id, status, show_in_list, acted_by) select $1, $2, 'going', true, id from feture.account where person_profile_id = $3`, [id, pair, b]);
    assert.equal((await call('ub', pair, { action: 'event.rsvp', opId: op(), eventId: id, status: 'going', showInList: false })).status, 'going');
    assert.equal((await call('ub', pair, { action: 'event.rsvp', opId: op(), eventId: id, status: 'interested' })).status, 'interested');
    assert.ok((await call('ub', pair, { action: 'event.rsvp', opId: op(), eventId: id, status: 'going' })).pending);
    // Nor may a partner's couple answer the partner's own event.
    const mine = await publish('ub', b, { title: 'Вечер от Киры' });
    assert.equal((await call('uc', pair, { action: 'event.rsvp', opId: op(), eventId: mine, status: 'not_going' })).rule, 'own_event');

    // An event made for a closed community stays for its members after the community opens.
    const cr = await call('uc', c, { action: 'community.create', opId: op(), name: 'Был закрытым', privacy: 'closed', joinQuestion: 'Кто вы?', description: 'Встречи и разговоры о верёвке для новичков', topics: ['shibari'], rules: ['Уважать границы'] });
    const qrev = async () => (await call('um', null, { action: 'staff.communityQueue' })).items.find((/** @type {any} */ x) => x.id === cr.id).rev;
    await call('um', null, { action: 'staff.communityDecide', opId: op(), communityId: cr.id, rev: await qrev(), decision: 'approve' });
    const inside = await publish('uc', c, { communityId: cr.id, title: 'Встреча своих' });
    const crev = (await call('uc', c, { action: 'community.get', communityId: cr.id })).community.rev;
    await call('uc', c, { action: 'community.update', opId: op(), communityId: cr.id, rev: crev, privacy: 'open' });
    await call('um', null, { action: 'staff.communityDecide', opId: op(), communityId: cr.id, rev: await qrev(), decision: 'approve' });
    assert.equal((await call('ua', a, { action: 'community.get', communityId: cr.id })).community.privacy, 'open');
    assert.equal((await call('ua', a, { action: 'event.get', eventId: inside })).status, 404);
    void decide;
  } finally { await pg.close(); }
});

test('event.applicationWithdraw: the applicant only, pending or approved; admission and the link go, applying again works', async () => {
  const { pg, call, a, b, c, publish } = await world();
  try {
    const id = await publish('ua', a, { requiresApplication: true, questions: ['Был ли опыт?'], format: 'online', placeId: null, area: null, exactAddress: null, joinUrl: 'https://meet.example/x' });
    const app = await call('ub', b, { action: 'event.apply', opId: op(), eventId: id, answers: ['Да, два раза'], requirementsAccepted: true });
    // Not mine: the organizer, a stranger, an unknown id — all «not found».
    assert.equal((await call('ua', a, { action: 'event.applicationWithdraw', opId: op(), applicationId: app.id })).status, 404);
    assert.equal((await call('uc', c, { action: 'event.applicationWithdraw', opId: op(), applicationId: app.id })).status, 404);
    assert.equal((await call('ub', b, { action: 'event.applicationWithdraw', opId: op(), applicationId: '018f0000-0000-7000-8000-00000000dead' })).status, 404);
    // Pending: withdrawn, gone from the organizer's list, a second withdraw finds nothing.
    assert.equal((await call('ub', b, { action: 'event.applicationWithdraw', opId: op(), applicationId: app.id })).state, 'withdrawn');
    assert.equal((await call('ub', b, { action: 'event.applicationWithdraw', opId: op(), applicationId: app.id })).status, 404);
    assert.ok(!(await call('ua', a, { action: 'event.applications', eventId: id })).items.some((/** @type {any} */ x) => x.id === app.id && x.state === 'pending'));
    // Approved: leaving takes the admission and the join link away.
    const app2 = await call('ub', b, { action: 'event.apply', opId: op(), eventId: id, answers: ['Да, снова'], requirementsAccepted: true });
    assert.equal(app2.state, 'pending');
    const item = (await call('ua', a, { action: 'event.applications', eventId: id })).items.find((/** @type {any} */ x) => x.id === app2.id);
    await call('ua', a, { action: 'event.applicationDecide', opId: op(), applicationId: app2.id, rev: item.rev, approve: true });
    let got = (await call('ub', b, { action: 'event.get', eventId: id })).event;
    assert.deepEqual([got.going, got.joinUrl], [1, 'https://meet.example/x']);
    assert.equal((await call('ub', b, { action: 'event.applicationWithdraw', opId: op(), applicationId: app2.id })).state, 'withdrawn');
    got = (await call('ub', b, { action: 'event.get', eventId: id })).event;
    assert.deepEqual([got.going, got.joinUrl], [0, null]);
    assert.equal((await call('uc', c, { action: 'event.get', eventId: id })).event.going, 0); // a stranger's count drops too
    // A declined application is the organizer's decision and stays.
    const app3 = await call('ub', b, { action: 'event.apply', opId: op(), eventId: id, answers: ['Третий раз'], requirementsAccepted: true });
    const it3 = (await call('ua', a, { action: 'event.applications', eventId: id })).items.find((/** @type {any} */ x) => x.id === app3.id);
    await call('ua', a, { action: 'event.applicationDecide', opId: op(), applicationId: app3.id, rev: it3.rev, approve: false });
    assert.equal((await call('ub', b, { action: 'event.applicationWithdraw', opId: op(), applicationId: app3.id })).status, 404);
  } finally { await pg.close(); }
});

test('«Скоро» in the feed: only events that concern the viewer, strongest reason first; «Скрыть» keeps them out', async () => {
  const { pg, db, call, a, b, c, berlin, publish } = await world();
  try {
    const online = { format: 'online', placeId: null, area: null, exactAddress: null, joinUrl: 'https://meet.example/soon' };
    const soon = async (/** @type {string} */ user, /** @type {string} */ profile) => (await call(user, profile, { action: 'event.soon' })).items.map((/** @type {any} */ x) => [x.id, x.why]);
    const near = await publish('ua', a, { startsAt: at(5), endsAt: at(5, 3) });                  // offline, Berlin
    const web = await publish('ua', a, { ...online, title: 'Онлайн-разговор', startsAt: at(2), endsAt: at(2, 2) });
    await publish('ua', a, { ...online, title: 'Через три недели', startsAt: at(21), endsAt: at(21, 2) }); // too far ahead
    // No city, nothing followed: only the online one concerns Kira; the organizer never sees their own here.
    assert.deepEqual(await soon('ub', b), [[web, 'online']]);
    assert.deepEqual(await soon('ua', a), []);
    await db.query(`update feture.profile_details set city_id = $2 where profile_id = $1`, [b, berlin]);
    assert.deepEqual(await soon('ub', b), [[web, 'online'], [near, 'city']]);
    // Following the organizer, then answering «иду», moves an event up.
    await call('ub', b, { action: 'follow.set', opId: op(), profileId: a, on: true });
    assert.deepEqual(await soon('ub', b), [[web, 'follow'], [near, 'follow']]);
    await call('ub', b, { action: 'event.rsvp', opId: op(), eventId: near, status: 'going' });
    assert.deepEqual(await soon('ub', b), [[near, 'mine'], [web, 'follow']]);
    // «Не иду» takes it out of «Скоро».
    await call('ub', b, { action: 'event.rsvp', opId: op(), eventId: near, status: 'not_going' });
    assert.deepEqual(await soon('ub', b), [[web, 'follow']]);
    // «Скрыть»: gone for this profile only, listed in «Скрытое» with its title; «Вернуть» brings it back.
    assert.equal((await call('ub', b, { action: 'feedHide.set', opId: op(), kind: 'event', targetId: web, on: true })).status, 200);
    assert.deepEqual(await soon('ub', b), []);
    const hidden = (await call('ub', b, { action: 'feedHide.list' })).items.find((/** @type {any} */ x) => x.kind === 'event');
    assert.deepEqual(hidden.target, { id: web, title: 'Онлайн-разговор' });
    assert.deepEqual(await soon('uc', c), [[web, 'online']]);
    await call('ub', b, { action: 'feedHide.set', opId: op(), kind: 'event', targetId: web, on: false });
    assert.deepEqual(await soon('ub', b), [[web, 'follow']]);
    // Blocked: the organizer's events are not offered and cannot be «hidden» either (no probing).
    await call('ua', a, { action: 'block.set', opId: op(), profileId: c, on: true });
    assert.deepEqual(await soon('uc', c), []);
    assert.equal((await call('uc', c, { action: 'feedHide.set', opId: op(), kind: 'event', targetId: web, on: true })).status, 404);
    assert.equal((await call('ub', b, { action: 'feedHide.set', opId: op(), kind: 'event', targetId: '00000000-0000-7000-8000-000000000000', on: true })).status, 404);
  } finally { await pg.close(); }
});

test('a cancelled event (owner 28.10.2026): only people it concerns see it in lists until its start, and they are notified', async () => {
  const { pg, db, call, person, a, b, c, publish } = await world();
  try {
    const d = await person('ud', 'Dana'), e = await person('ue', 'Emil'), f = await person('uf', 'Fox');
    const online = { format: 'online', placeId: null, area: null, exactAddress: null, joinUrl: 'https://meet.example/c' };
    const id = await publish('ua', a, { ...online, title: 'Отменят', startsAt: at(3), endsAt: at(3, 2) });
    const app = await publish('ua', a, { ...online, title: 'По заявке', requiresApplication: true, questions: ['Был ли опыт?'], startsAt: at(4), endsAt: at(4, 2) });
    await call('ub', b, { action: 'event.rsvp', opId: op(), eventId: id, status: 'interested' });          // interested
    await call('uc', c, { action: 'saved.set', opId: op(), kind: 'event', targetId: id, on: true });         // saved
    await call('ud', d, { action: 'saved.set', opId: op(), kind: 'event', targetId: id, on: true });         // saved, then «Не иду»
    await call('ud', d, { action: 'event.rsvp', opId: op(), eventId: id, status: 'not_going' });
    assert.equal((await call('uf', f, { action: 'event.apply', opId: op(), eventId: app, answers: ['Да, было'], requirementsAccepted: true })).state, 'pending'); // applied
    await call('ua', a, { action: 'event.cancel', opId: op(), eventId: id, reason: 'Ведущий заболел' });
    await call('ua', a, { action: 'event.cancel', opId: op(), eventId: app, reason: '' });
    const inCatalog = async (/** @type {string} */ u, /** @type {string} */ p, /** @type {string} */ ev) => (await call(u, p, { action: 'event.catalog' })).items.find((/** @type {any} */ x) => x.id === ev);
    // Related: interested, saved, applied (closed by the cancel), the organizer — with «Отменено» and the reason.
    for (const [u, p] of [['ub', b], ['uc', c], ['ua', a]]) {
      const x = await inCatalog(u, p, id);
      assert.deepEqual([x?.state, x?.cancel_reason], ['cancelled', 'Ведущий заболел'], u);
    }
    assert.equal((await inCatalog('uf', f, app))?.state, 'cancelled');
    // «Не иду» and strangers: not in the catalogue, «Скоро» or «Мои события»; a direct link still opens the cancelled page.
    for (const [u, p] of [['ud', d], ['ue', e]]) {
      assert.equal(await inCatalog(u, p, id), undefined, u);
      assert.ok(!(await call(u, p, { action: 'event.soon' })).items.some((/** @type {any} */ x) => x.id === id), u);
      assert.deepEqual((await call(u, p, { action: 'event.mine' })).cancelled, [], u);
      const got = (await call(u, p, { action: 'event.get', eventId: id })).event;
      assert.deepEqual([got.state, got.cancelReason], ['cancelled', 'Ведущий заболел']);
    }
    assert.equal(await inCatalog('uf', f, id), undefined);
    // «Скоро» and «Мои события» for the related ones (the organizer keeps it under «Организую»).
    const soonB = (await call('ub', b, { action: 'event.soon' })).items.find((/** @type {any} */ x) => x.id === id);
    assert.deepEqual([soonB?.why, soonB?.state, soonB?.cancel_reason], ['cancelled', 'cancelled', 'Ведущий заболел']);
    assert.ok((await call('uc', c, { action: 'event.soon' })).items.some((/** @type {any} */ x) => x.id === id));
    const mineB = await call('ub', b, { action: 'event.mine' });
    assert.deepEqual([mineB.cancelled.map((/** @type {any} */ x) => x.id), mineB.interested], [[id], []]);
    assert.deepEqual((await call('uf', f, { action: 'event.mine' })).cancelled.map((/** @type {any} */ x) => x.id), [app]);
    assert.deepEqual((await call('ua', a, { action: 'event.mine' })).cancelled, []);
    // Notified on cancel: interested, saved and applied — not «Не иду», not strangers.
    const { notifyHandlers } = await import('../server/notify.mjs');
    const { drain } = await import('../server/outbox.mjs');
    while ((await drain(db, notifyHandlers(db), { limit: 50 })) > 0) { /* until empty */ }
    const told = (await db.query(`select addressee_profile_id p, object_id o from feture.notification where type = 'eventCancelled'`))
      .map((/** @type {any} */ r) => [r.p, r.o]);
    for (const [p, ev] of [[b, id], [c, id], [f, app]]) assert.ok(told.some(([x, y]) => x === p && y === ev), String(p));
    assert.ok(!told.some(([x]) => x === d || x === e || x === a));
    // After its original start it is simply past: out of every list, even for those it concerned.
    await db.query(`update feture.event set starts_at = now() - interval '1 hour', ends_at = now() + interval '1 hour' where id = $1`, [id]);
    assert.equal(await inCatalog('ub', b, id), undefined);
    assert.deepEqual((await call('ub', b, { action: 'event.mine' })).cancelled, []);
    assert.ok(!(await call('ub', b, { action: 'event.soon' })).items.some((/** @type {any} */ x) => x.id === id));
  } finally { await pg.close(); }
});

test('«Скоро» by interests and communities: a level on the community’s topic counts, a hard limit does not', async () => {
  const { pg, call, a, b, c, publish } = await world();
  try {
    const cr = await call('ua', a, { action: 'community.create', opId: op(), name: 'Верёвочный клуб', privacy: 'open', description: 'Встречи и разговоры о верёвке для новичков', topics: ['shibari'], rules: ['Уважать границы'] });
    const q = (await call('um', null, { action: 'staff.communityQueue' })).items.find((/** @type {any} */ x) => x.id === cr.id);
    await call('um', null, { action: 'staff.communityDecide', opId: op(), communityId: cr.id, rev: q.rev, decision: 'approve' });
    const id = await publish('ua', a, { communityId: cr.id, title: 'Встреча клуба', startsAt: at(4), endsAt: at(4, 2) });
    const why = async (/** @type {string} */ user, /** @type {string} */ profile) => (await call(user, profile, { action: 'event.soon' })).items.map((/** @type {any} */ x) => [x.id, x.why]);
    assert.deepEqual(await why('ub', b), []);
    await call('ub', b, { action: 'interests.set', opId: op(), topicId: 'shibari', mark: 'hard', vis: 'only' });
    assert.deepEqual(await why('ub', b), []);
    await call('ub', b, { action: 'interests.set', opId: op(), topicId: 'shibari', value: 7, dir: ['give'], vis: 'only' });
    assert.deepEqual(await why('ub', b), [[id, 'interests']]);
    assert.equal((await call('uc', c, { action: 'community.join', opId: op(), communityId: cr.id, rulesAccepted: true })).state, 'member');
    assert.deepEqual(await why('uc', c), [[id, 'community']]);
  } finally { await pg.close(); }
});

test('applications (owner check 28.10.2026): a declined one cannot be sent again, the organizer may still approve it; a withdrawn one can', async () => {
  const { pg, call, a, b, publish } = await world();
  try {
    const id = await publish('ua', a, { requiresApplication: true, questions: ['Был ли опыт?'] });
    const apply = () => call('ub', b, { action: 'event.apply', opId: op(), eventId: id, answers: ['Да, был'], requirementsAccepted: true });
    const app = await apply();
    const [x] = (await call('ua', a, { action: 'event.applications', eventId: id, state: 'pending' })).items;
    const no = await call('ua', a, { action: 'event.applicationDecide', opId: op(), applicationId: app.id, rev: x.rev, approve: false });
    const again = await apply();
    assert.deepEqual([again.status, again.rule], [422, 'application_declined']);
    // «Всё-таки одобрить» still works on the same application (a second open row would have broken it).
    assert.equal((await call('ua', a, { action: 'event.applicationDecide', opId: op(), applicationId: app.id, rev: no.rev, approve: true })).state, 'approved');
    assert.ok((await call('ub', b, { action: 'event.get', eventId: id })).event.exactAddress);
    await call('ub', b, { action: 'event.applicationWithdraw', opId: op(), applicationId: app.id });
    assert.equal((await apply()).state, 'pending');
  } finally { await pg.close(); }
});
