// Audit 04.11.2026, stage 8 on PGlite as feture_api: «Мест» on an event (a couple takes two, approval waits for a
// place), one number of people coming (a person once, alone and with the couple), the question «идём парой», and
// mentions that keep their person after a nickname change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { events } from '../server/commands/events.mjs';
import { couples } from '../server/commands/couples.mjs';
import { notifyHandlers } from '../server/notify.mjs';
import { drain } from '../server/outbox.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...posts, ...events, ...couples } });

async function world() {
  const env = await setup();
  const { db, call, person } = env;
  const org = await person('uo', 'Olga'), kira = await person('uk', 'Kira'), noa = await person('un', 'Noa'), lev = await person('ul', 'Lev');
  const inv = await call('uk', null, { action: 'couple.invite', opId: op(), handle: 'Noa' });
  const pair = (await call('un', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv.id, accept: true })).profileId;
  const at = (/** @type {number} */ d, h = 0) => new Date(Date.now() + d * 864e5 + h * 36e5).toISOString();
  /** @param {{seats?: number | null, apply?: boolean}} [o] */
  const event = async ({ seats = null, apply = false } = {}) => (await db.query(
    `insert into feture.event (organizer_profile_id, created_by, title, kind, description, format, join_url, tz, starts_at, ends_at, state, seats, requires_application, questions)
     select $1, account_id, 'Вечер', 'meetup', 'Спокойный вечер для знакомства, без спешки и давления.', 'online', 'https://meet.example/x', 'UTC', $2, $3, 'published', $4, $5, $6
     from feture.profile_member where profile_id = $1 limit 1 returning id`, [org, at(5), at(5, 3), seats, apply, apply ? ['Почему хочешь прийти?'] : []]))[0].id;
  const going = (/** @type {string} */ u, /** @type {string} */ p, /** @type {string} */ ev, extra = {}) => call(u, p, { action: 'event.rsvp', opId: op(), eventId: ev, status: 'going', ...extra });
  const page = async (/** @type {string} */ ev) => (await call('uo', org, { action: 'event.get', eventId: ev })).event;
  return { ...env, org, kira, noa, lev, pair, event, going, page };
}

test('item 36: «Мест» 3 — the couple takes two, one place is left, then «Мест нет»; the organizer sees 3 of 3', async () => {
  const { pg, call, lev, pair, event, going, page, person } = await world();
  try {
    const ev = await event({ seats: 3 });
    assert.equal((await going('uk', pair, ev)).status, 'going');
    assert.equal((await going('ul', lev, ev)).status, 'going');
    const mia = await person('um', 'Mia');
    assert.equal((await going('um', mia, ev)).rule, 'no_seats');
    const p = await page(ev);
    assert.deepEqual([p.seats, p.taken, p.full, p.going], [3, 3, true, 3]);
    // A place freed is a place again.
    await call('ul', lev, { action: 'event.rsvp', opId: op(), eventId: ev, status: null });
    assert.equal((await going('um', mia, ev)).status, 'going');
  } finally { await pg.close(); }
});

test('В13: an application may wait while there are no places; approving it waits for one', async () => {
  const { pg, db, call, org, lev, pair, event } = await world();
  try {
    const ev = await event({ seats: 2, apply: true });
    const a1 = await call('uk', pair, { action: 'event.apply', opId: op(), eventId: ev, answers: ['Хотим познакомиться'], requirementsAccepted: true });
    const a2 = await call('ul', lev, { action: 'event.apply', opId: op(), eventId: ev, answers: ['Интересно'], requirementsAccepted: true });
    const rev = async (/** @type {string} */ id) => (await db.query('select rev from feture.event_application where id = $1', [id]))[0].rev;
    assert.equal((await call('uo', org, { action: 'event.applicationDecide', opId: op(), applicationId: a1.id, rev: await rev(a1.id), approve: true })).state, 'approved');
    assert.equal((await call('uo', org, { action: 'event.applicationDecide', opId: op(), applicationId: a2.id, rev: await rev(a2.id), approve: true })).rule, 'no_seats');
  } finally { await pg.close(); }
});

test('items 53, 56: Kira goes alone, then marks the couple — she is asked; «Идём парой» takes her own mark off; the number is people, each once', async () => {
  const { pg, call, org, kira, pair, event, going, page } = await world();
  try {
    const ev = await event();
    await going('uk', kira, ev);
    assert.equal((await going('uk', pair, ev)).rule, 'going_alone');
    assert.equal((await going('uk', pair, ev, { together: true })).status, 'going');
    assert.equal((await call('uk', kira, { action: 'event.get', eventId: ev })).event.me.rsvp, null);
    assert.equal((await page(ev)).going, 2);
    // A person whose couple comes is asked too; «Отметиться всё равно» counts her once.
    assert.equal((await going('uk', kira, ev)).rule, 'going_as_couple');
    assert.equal((await going('uk', kira, ev, { alone: true })).status, 'going');
    assert.equal((await page(ev)).going, 2);
    assert.equal((await call('uo', org, { action: 'event.attendees', eventId: ev })).count, 2);
  } finally { await pg.close(); }
});

test('item 56, В11: Noa goes alone and Kira marks the couple — Kira is not asked (Noa’s mark is hers); Noa hears it on her own profile', async () => {
  const { pg, db, noa, pair, event, going } = await world();
  try {
    const ev = await event();
    await going('un', noa, ev);
    assert.equal((await going('uk', pair, ev)).status, 'going');
    await drain(db, notifyHandlers(db), { limit: 100 });
    const rows = await db.query(`select a.person_profile_id to_profile from feture.notification n join feture.account a on a.id = n.recipient_account_id where n.type = 'eventPairGoing'`);
    assert.deepEqual(rows.map(r => r.to_profile), [noa]);
  } finally { await pg.close(); }
});

test('item 43: a mention keeps its person — a new nickname shows, the old one taken by someone else is not linked on an edit', async () => {
  const { pg, db, call, kira, lev, person } = await world();
  try {
    const d = await call('uk', kira, { action: 'post.saveDraft', opId: op(), post: { type: 'post', body: 'Вечер с друзьями', audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [] } });
    await call('uk', kira, { action: 'post.publish', opId: op(), postId: d.id });
    const r = await call('uk', kira, { action: 'reply.create', opId: op(), postId: d.id, body: 'Привет, @lev' });
    await db.query(`update feture.profile set handle = 'lev_new' where id = $1`, [lev]);
    const taker = await person('ux', 'lev');
    const [{ rev }] = await db.query('select rev from feture.reply where id = $1', [r.id]);
    await call('uk', kira, { action: 'reply.edit', opId: op(), replyId: r.id, rev, body: 'Привет, @lev! Ждём' });
    const rows = await db.query(`select profile_id from feture.mention where source_type = 'reply' and source_id = $1`, [r.id]);
    assert.deepEqual(rows.map(x => x.profile_id), [lev]);
    assert.equal((await db.query(`select count(*)::int n from feture.outbox where topic = 'mention.created' and profile_id = $1`, [taker]))[0].n, 0);
    const item = (await call('uk', kira, { action: 'post.replies', postId: d.id })).items.find((/** @type {any} */ x) => x.id === r.id);
    assert.deepEqual(item.mentions, [{ id: lev, handle: 'lev_new', written: 'lev' }]);
  } finally { await pg.close(); }
});
