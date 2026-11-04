// Audit 04.11.2026, stage 5 on PGlite as feture_api: a block closes everything — a personal block covers the person's
// couples (lifted together, inherited by a new couple), each other's event answers and applications go, and the blocked
// side leaves the blocker's communities (and the other way round).
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { staff } from '../server/commands/staff.mjs';
import { communities } from '../server/commands/communities.mjs';
import { events } from '../server/commands/events.mjs';
import { couples } from '../server/commands/couples.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...posts, ...staff, ...communities, ...events, ...couples } });

async function world() {
  const env = await setup();
  const { call, person } = env;
  const vesta = await person('uv', 'Vesta'), petya = await person('up', 'Petya'), kira = await person('uk', 'Kira');
  const inv = await call('uv', null, { action: 'couple.invite', opId: op(), handle: 'Petya' });
  const pair = (await call('up', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv.id, accept: true })).profileId;
  const block = (/** @type {any} */ extra = {}) => call('uv', vesta, { action: 'block.set', opId: op(), profileId: kira, on: true, ...extra });
  return { ...env, vesta, petya, kira, pair, block };
}

test('item 19: Vesta blocks Kira from her personal profile — the couple is covered too; «Оставить пару открытой» keeps it out; unblocking lifts both', async () => {
  const { pg, call, vesta, kira, pair, block } = await world();
  try {
    await call('uk', kira, { action: 'follow.set', opId: op(), profileId: pair, on: true });
    assert.equal((await block()).profiles, 2);
    assert.equal((await call('uk', kira, { action: 'profile.get', profileId: pair })).status, 404);
    assert.equal((await call('uk', kira, { action: 'follow.set', opId: op(), profileId: pair, on: true })).status, 404);
    // Unblocking where it was set lifts the couple's too.
    await call('uv', vesta, { action: 'block.set', opId: op(), profileId: kira, on: false });
    assert.equal((await call('uk', kira, { action: 'profile.get', profileId: pair })).status, 200);
    // Keep the couple open: only the personal profile blocks.
    assert.equal((await block({ keepCouple: true })).profiles, 1);
    assert.equal((await call('uk', kira, { action: 'profile.get', profileId: pair })).status, 200);
  } finally { await pg.close(); }
});

test('В4: a couple formed later inherits its partners’ blocks', async () => {
  const { pg, db, call, person, kira } = await world();
  try {
    const lev = await person('ul', 'Lev');
    await person('um', 'Mia');
    await call('ul', lev, { action: 'block.set', opId: op(), profileId: kira, on: true });
    const inv = await call('ul', null, { action: 'couple.invite', opId: op(), handle: 'Mia' });
    const pair2 = (await call('um', null, { action: 'couple.inviteAnswer', opId: op(), inviteId: inv.id, accept: true })).profileId;
    assert.equal((await db.query('select via_profile_id from feture.block where blocker_profile_id = $1 and blocked_profile_id = $2', [pair2, kira]))[0].via_profile_id, lev);
    assert.equal((await call('uk', kira, { action: 'profile.get', profileId: pair2 })).status, 404);
  } finally { await pg.close(); }
});

test('items 54, 11: a block takes each other’s event answers and applications off, and the blocked member out of the owner’s community', async () => {
  const { pg, db, call, vesta, kira, block } = await world();
  try {
    const at = (/** @type {number} */ d, h = 0) => new Date(Date.now() + d * 864e5 + h * 36e5).toISOString();
    const [{ id: ev }] = await db.query(
      `insert into feture.event (organizer_profile_id, created_by, title, kind, description, format, join_url, tz, starts_at, ends_at, state)
       select $1, account_id, 'Вечер', 'meetup', 'Спокойный вечер для знакомства, без спешки и давления.', 'online', 'https://meet.example/x', 'UTC', $2, $3, 'published'
       from feture.profile_member where profile_id = $1 limit 1 returning id`, [vesta, at(5), at(5, 3)]);
    assert.equal((await call('uk', kira, { action: 'event.rsvp', opId: op(), eventId: ev, status: 'going' })).status, 'going');
    const [{ id: cm }] = await db.query(`insert into feture.community (owner_profile_id, created_by, name, description, topics, privacy, rules, plate, state, published_at)
      select $1, account_id, 'Клуб Весты', 'Встречи и разговоры о верёвке для новичков', '{shibari}', 'open', '{"Уважать границы"}', 'rose', 'published', now()
      from feture.profile_member where profile_id = $1 limit 1 returning id`, [vesta]);
    await db.query(`insert into feture.community_member (community_id, profile_id, role) values ($1, $2, 'owner'), ($1, $3, 'member')`, [cm, vesta, kira]);
    await block();
    assert.equal((await db.query('select count(*)::int n from feture.event_rsvp where event_id = $1', [ev]))[0].n, 0);
    assert.equal((await db.query('select state from feture.community_member where community_id = $1 and profile_id = $2', [cm, kira]))[0].state, 'left');
  } finally { await pg.close(); }
});
