// Audit 04.11.2026, stage 6 on PGlite as feture_api: communities and events — one way to close a community (events
// cancelled or back to drafts), ownership handed over, a deleted or paused couple leaves nothing behind, a hidden event
// tells its guests, only people who see an event hear about it, rules changes are told, edits need write rights,
// offline → online waits for staff as one change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { staff } from '../server/commands/staff.mjs';
import { moderation } from '../server/commands/moderation.mjs';
import { communities } from '../server/commands/communities.mjs';
import { events } from '../server/commands/events.mjs';
import { couples } from '../server/commands/couples.mjs';
import { accounts } from '../server/commands/account.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...posts, ...staff, ...moderation, ...communities, ...events, ...couples, ...accounts } });
const at = (/** @type {number} */ d, h = 0) => new Date(Date.now() + d * 864e5 + h * 36e5).toISOString();
const topics = async (/** @type {any} */ db, /** @type {string} */ topic) => (await db.query('select payload from feture.outbox where topic = $1', [topic])).map((/** @type {any} */ r) => r.payload);

async function world() {
  const env = await setup();
  const { db, call, person } = env;
  const boss = await person('uo', 'Boss');
  await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
  const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
  const [{ id: berlin }] = await db.query(`select id from feture.place where code = 'berlin'`);
  const ev = (/** @type {any} */ extra = {}) => ({ title: 'Вечер знакомств', kind: 'meetup', description: 'Спокойный вечер для знакомства, без спешки и давления.',
    format: 'offline', placeId: berlin, area: 'Кройцберг', exactAddress: 'Oranienstr. 1, 2 этаж', tz: 'Europe/Berlin', startsAt: at(7), endsAt: at(7, 3), ...extra });
  /** A published community of `owner` with `others` as members. */
  const community = async (/** @type {string} */ user, /** @type {string} */ owner, /** @type {string[]} */ others = [], name = 'Клуб Алекса') => {
    const r = await call(user, owner, { action: 'community.create', opId: op(), name, privacy: 'open', description: 'Встречи и разговоры о верёвке для новичков', topics: ['shibari'], rules: ['Уважать границы'], plate: 'rose' });
    const item = (await call('uo', null, { action: 'staff.communityQueue' })).items.find((/** @type {any} */ x) => x.id === r.id);
    await call('uo', null, { action: 'staff.communityDecide', opId: op(), communityId: r.id, rev: item.rev, decision: 'approve' });
    for (const p of others) await db.query(`insert into feture.community_member (community_id, profile_id) values ($1, $2)`, [r.id, p]);
    return /** @type {string} */ (r.id);
  };
  /** A published event of `organizer` (in a community when given). */
  const event = async (/** @type {string} */ user, /** @type {string} */ organizer, /** @type {any} */ extra = {}) => {
    const r = await call(user, organizer, { action: 'event.submit', opId: op(), event: ev(extra) });
    assert.equal(r.status, 200, JSON.stringify(r));
    const item = (await call('uo', null, { action: 'staff.eventQueue' })).items.find((/** @type {any} */ x) => x.id === r.id);
    await call('uo', null, { action: 'staff.eventDecide', opId: op(), eventId: r.id, rev: item.rev, decision: 'approve' });
    return /** @type {string} */ (r.id);
  };
  return { ...env, a, b, c, ev, community, event };
}

test('items 15, 14: the owner closes a community — its events by anyone are cancelled («сообщество закрыто»), unpublished ones go to drafts, the cancelled card still opens', async () => {
  const { pg, db, call, a, b, c, ev, community, event } = await world();
  try {
    const cm = await community('ua', a, [b, c]);
    await call('ua', a, { action: 'community.member', opId: op(), communityId: cm, profileId: b, change: 'host' });
    const theirs = await event('ub', b, { communityId: cm });
    await call('uc', c, { action: 'event.rsvp', opId: op(), eventId: theirs, status: 'going' });
    const waiting = await call('ub', b, { action: 'event.submit', opId: op(), event: ev({ communityId: cm, title: 'Ещё вечер' }) });
    assert.equal((await call('ua', a, { action: 'community.close', opId: op(), communityId: cm })).state, 'closed');
    assert.equal((await db.query('select state from feture.event where id = $1', [theirs]))[0].state, 'cancelled');
    assert.ok((await topics(db, 'event.cancelled')).some((/** @type {any} */ p) => p.eventId === theirs && p.why === 'community_closed'));
    assert.equal((await db.query('select count(*)::int n from feture.event where id = $1', [waiting.id]))[0].n, 0);
    assert.equal((await db.query(`select form->>'communityId' cid from feture.event_draft where owner_profile_id = $1`, [b]))[0].cid, null);
    assert.equal((await call('uc', c, { action: 'event.get', eventId: theirs })).event.state, 'cancelled');
    assert.ok((await topics(db, 'community.closed')).some((/** @type {any} */ p) => p.communityId === cm && p.why === 'owner'));
  } finally { await pg.close(); }
});

test('item 14: ownership goes to a host (with the cover), not while hidden; a deleted owner hands it to the longest host or it closes', async () => {
  const { pg, db, call, a, b, c, community } = await world();
  try {
    const cm = await community('ua', a, [b, c]);
    assert.equal((await call('ua', a, { action: 'community.transfer', opId: op(), communityId: cm, profileId: b })).rule, 'not_a_host');
    await call('ua', a, { action: 'community.member', opId: op(), communityId: cm, profileId: b, change: 'host' });
    const [{ account_id: acc }] = await db.query('select account_id from feture.profile_member where profile_id = $1', [a]);
    const [{ id: cover }] = await db.query(`insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
      values ($1, $2, 'image', 'community', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [a, acc]);
    await db.query('update feture.community set cover_asset_id = $2 where id = $1', [cm, cover]);
    assert.equal((await call('ua', a, { action: 'community.transfer', opId: op(), communityId: cm, profileId: b })).owner, b);
    assert.deepEqual((await db.query('select owner_profile_id from feture.community where id = $1', [cm]))[0].owner_profile_id, b);
    assert.equal((await db.query('select owner_profile_id from feture.media_asset where id = $1', [cover]))[0].owner_profile_id, b);
    assert.equal((await db.query('select role from feture.community_member where community_id = $1 and profile_id = $2', [cm, a]))[0].role, 'host');
    assert.ok((await topics(db, 'community.ownerChanged')).some((/** @type {any} */ p) => p.communityId === cm));
    // Kira deletes her account: the longest host (Alex) gets it.
    assert.equal((await call('ub', null, { action: 'account.delete', opId: op(), confirmHandle: 'Kira' })).deleted, true);
    assert.equal((await db.query('select owner_profile_id, state from feture.community where id = $1', [cm]))[0].owner_profile_id, a);
    // No host left: it closes with its owner.
    const solo = await community('uc', c, [], 'Клуб Ноа');
    await call('uc', null, { action: 'account.delete', opId: op(), confirmHandle: 'Noa' });
    assert.equal((await db.query('select state from feture.community where id = $1', [solo]))[0].state, 'deleted');
  } finally { await pg.close(); }
});

test('item 13: a paused couple’s future events are cancelled and its community stays visible; a deleted couple leaves nothing live', async () => {
  const { pg, db, call, person, b, community, event } = await world();
  try {
    await person('uv', 'Vesta'); await person('up', 'Petya');
    const inv = await call('uv', null, { action: 'couple.invite', opId: op(), handle: 'Petya' });
    const pair = (await call('up', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv.id, accept: true })).profileId;
    const cm = await community('uv', pair, [b], 'Клуб пары');
    const e1 = await event('uv', pair);
    await call('uv', pair, { action: 'couple.stop', opId: op(), confirm: true });
    assert.equal((await db.query('select state from feture.event where id = $1', [e1]))[0].state, 'cancelled');
    const seen = (await call('ub', b, { action: 'community.get', communityId: cm })).community;
    assert.equal(seen.ownerPaused, true);
    // «Не восстанавливать» keeps an archive for 30 days; deleting it now takes both ex-partners.
    assert.equal((await call('up', pair, { action: 'couple.decline', opId: op() })).state, 'ended');
    await call('up', pair, { action: 'couple.purge', opId: op() });
    assert.equal((await call('uv', pair, { action: 'couple.purge', opId: op() })).state, 'deleted');
    assert.equal((await db.query('select state from feture.community where id = $1', [cm]))[0].state, 'deleted');
  } finally { await pg.close(); }
});

test('items 33, 35: staff hiding an event tells its guests «недоступно»; a member removed from the community stops hearing about its event', async () => {
  const { pg, db, call, a, b, c, community, event } = await world();
  try {
    const plain = await event('ua', a);
    await call('ub', b, { action: 'event.rsvp', opId: op(), eventId: plain, status: 'going' });
    const [{ rev }] = await db.query('select rev from feture.event where id = $1', [plain]);
    await call('uo', null, { action: 'staff.eventDecide', opId: op(), eventId: plain, rev, decision: 'hide', reason: 'Спам' });
    assert.ok((await topics(db, 'event.unavailable')).some((/** @type {any} */ p) => p.eventId === plain));
    // Members-only event: a removed member is no longer told about changes.
    const cm = await community('ua', a, [c]);
    const inner = await event('ua', a, { communityId: cm });
    await call('uc', c, { action: 'event.rsvp', opId: op(), eventId: inner, status: 'going' });
    await call('ua', a, { action: 'community.member', opId: op(), communityId: cm, profileId: c, change: 'remove' });
    await db.query(`update feture.event set members_only = true where id = $1`, [inner]);
    const { notifyHandlers } = await import('../server/notify.mjs');
    const { enqueue } = await import('../server/outbox.mjs');
    await db.tx((/** @type {any} */ q) => enqueue(q, 'event.changed', a, { eventId: inner, changes: ['time'] }));
    const { drain } = await import('../server/outbox.mjs');
    await drain(db, notifyHandlers(db), { limit: 100 });
    const [{ id: accC }] = await db.query('select id from feture.account where person_profile_id = $1', [c]);
    assert.equal((await db.query(`select count(*)::int n from feture.notification where recipient_account_id = $1 and type = 'eventChanged'`, [accC]))[0].n, 0);
  } finally { await pg.close(); }
});

test('items 39, 12, 17: a rules change is told; a read-only member cannot edit an old discussion; offline → online waits for staff as one change', async () => {
  const { pg, db, call, a, b, community, event } = await world();
  try {
    const cm = await community('ua', a, [b]);
    const g = (await call('ua', a, { action: 'community.get', communityId: cm })).community;
    await call('ua', a, { action: 'community.update', opId: op(), communityId: cm, rev: g.rev, rules: ['Уважать границы', 'Без фото без согласия'] });
    assert.ok((await topics(db, 'community.rulesChanged')).some((/** @type {any} */ p) => p.communityId === cm));
    // A discussion, then read-only: no edits.
    const d = await call('ub', b, { action: 'post.saveDraft', opId: op(), post: { type: 'post', body: 'Тема для обсуждения', audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [], communityId: cm } });
    await call('ub', b, { action: 'post.publish', opId: op(), postId: d.id });
    await call('ua', a, { action: 'community.member', opId: op(), communityId: cm, profileId: b, change: 'readOnly' });
    const p = (await call('ub', b, { action: 'post.get', postId: d.id })).post;
    const r = await call('ub', b, { action: 'post.edit', opId: op(), postId: d.id, rev: p.rev, post: { type: 'post', body: 'Тема для обсуждения, правка', audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [], communityId: cm } });
    assert.equal(r.rule, 'community_write_closed');
    // Offline → online: format, link and place wait together.
    const e = await event('ua', a);
    const cur = (await call('ua', a, { action: 'event.get', eventId: e })).event;
    const u = await call('ua', a, { action: 'event.update', opId: op(), eventId: e, rev: cur.rev, event: {
      title: cur.title, kind: cur.kind, description: cur.description, format: 'online', joinUrl: 'https://meet.example/new', tz: cur.tz, startsAt: cur.startsAt, endsAt: cur.endsAt } });
    assert.equal(u.status, 200, JSON.stringify(u));
    const [row] = await db.query('select format, pending_change from feture.event where id = $1', [e]);
    assert.equal(row.format, 'offline');
    assert.equal(row.pending_change.format, 'online');
  } finally { await pg.close(); }
});
