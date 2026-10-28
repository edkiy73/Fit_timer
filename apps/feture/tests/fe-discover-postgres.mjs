// Slice F on PGlite as feture_api: Discover pool and filter, decisions and undo, likes, matches, blocks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { photos } from '../server/commands/photos.mjs';
import { discover } from '../server/commands/discover.mjs';
import { people } from '../server/commands/people.mjs';
import { access } from '../server/commands/access.mjs';
import { posts } from '../server/commands/posts.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...photos, ...discover, ...people, ...access, ...posts } });

async function world() {
  const env = await setup();
  const { db, call, person } = env;
  /** A person with an approved, safe profile photo (so Discover may show them). */
  const member = async (/** @type {string} */ user, /** @type {string} */ handle, opts = {}) => {
    const id = await person(user, handle, opts);
    await withPhoto(id);
    return id;
  };
  const withPhoto = async (/** @type {string} */ id) => {
    const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [id]);
    const [a] = await db.query(
      `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
       values ($1, $2, 'image', 'avatar', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [id, account_id]);
    await db.query(`insert into feture.media_attachment (asset_id, target_type, target_id, position) values ($1, 'avatar', $2, 0)`, [a.id, id]);
    await db.query(`update feture.profile set avatar_asset_id = $1 where id = $2`, [a.id, id]);
  };
  const deck = async (/** @type {string} */ user, /** @type {string} */ prof) => (await call(user, prof, { action: 'discover.deck' })).items.map((/** @type {any} */ c) => c.handle);
  return { ...env, member, withPhoto, deck };
}

test('pool: visible with an approved photo, not self, not decided; filter by kind and age; off sees nothing', async () => {
  const { pg, call, person, member, deck } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira', { birthDate: '2000-05-01' });
    await member('uc', 'Noa', { birthDate: '1970-01-01' });
    await person('ud', 'Nophoto');
    assert.deepEqual((await deck('ua', a)).sort(), ['Kira', 'Noa']);
    const filter = { show: 'people', ageMin: 18, ageMax: 40, cityId: null, genders: [], orients: [], formats: [], seeks: [], roles: [], topics: [] };
    assert.equal((await call('ua', a, { action: 'discover.count', filter })).count, 1);
    await call('ua', a, { action: 'discover.setFilter', opId: op(), filter });
    assert.deepEqual(await deck('ua', a), ['Kira']);
    assert.deepEqual((await call('ua', a, { action: 'discover.setFilter', opId: op(), filter: { ...filter, topics: ['nolimit-xyz'] } })).fields, ['topics']);
    // Hidden from Discover: not shown to others; off: sees nothing either.
    await call('ub', b, { action: 'profile.setVisibility', opId: op(), setting: 'discoverMode', value: 'hidden' });
    assert.deepEqual(await deck('ua', a), []);
    await call('ua', a, { action: 'profile.setVisibility', opId: op(), setting: 'discoverMode', value: 'off' });
    assert.equal((await call('ua', a, { action: 'discover.deck' })).off, true);
  } finally { await pg.close(); }
});

test('likes: mutual makes a match, withdraw and dismiss stay private, undo once a day (Premium more), restore a pass', async () => {
  const { pg, db, call, member, deck } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira'), c = await member('uc', 'Noa');
    assert.equal((await call('ua', a, { action: 'discover.decide', opId: op(), profileId: b, decision: 'like' })).state, 'liked');
    assert.equal((await call('ua', a, { action: 'discover.decide', opId: op(), profileId: b, decision: 'pass' })).rule, 'already_decided');
    const inc = (await call('ub', b, { action: 'likes.incoming' })).items;
    assert.deepEqual(inc.map((/** @type {any} */ i) => i.profile.handle), ['Alex']);
    assert.equal((await call('ub', b, { action: 'discover.deck' })).items.find((/** @type {any} */ x) => x.handle === 'Alex').likedMe, true);
    const m = await call('ub', b, { action: 'like.send', opId: op(), profileId: a, source: 'likes' });
    assert.equal(m.state, 'matched');
    assert.deepEqual((await call('ua', a, { action: 'matches.list' })).items.map((/** @type {any} */ i) => i.profile.handle), ['Kira']);
    assert.equal((await call('ua', a, { action: 'like.send', opId: op(), profileId: b, source: 'profile' })).rule, 'already_matched');
    assert.equal((await call('ub', b, { action: 'discover.undo', opId: op() })).rule, 'already_mutual');

    // Ending the conversation: the match goes, the other side is not told, the grant may go too.
    assert.equal((await call('ua', a, { action: 'match.end', opId: op(), profileId: b })).ended, true);
    assert.deepEqual((await call('ub', b, { action: 'matches.list' })).items, []);

    // Pass, undo (once free), restore.
    await call('uc', c, { action: 'discover.decide', opId: op(), profileId: a, decision: 'pass' });
    assert.ok(!(await deck('uc', c)).includes('Alex'));
    assert.equal((await call('uc', c, { action: 'discover.undo', opId: op() })).decision, 'pass');
    assert.ok((await deck('uc', c)).includes('Alex'));
    await call('uc', c, { action: 'discover.decide', opId: op(), profileId: a, decision: 'pass' });
    assert.equal((await call('uc', c, { action: 'discover.undo', opId: op() })).error, 'premium_required');
    assert.equal((await call('uc', c, { action: 'discover.history' })).items.length, 1);
    // «Вернуть» from the history shares the daily allowance.
    assert.equal((await call('uc', c, { action: 'discover.restore', opId: op(), profileId: a })).error, 'premium_required');
    await db.query(`update feture.account set premium_until = now() + interval '1 month' where person_profile_id = $1`, [c]);
    await call('uc', c, { action: 'discover.restore', opId: op(), profileId: a });
    assert.ok((await deck('uc', c)).includes('Alex'));
    await call('uc', c, { action: 'discover.decide', opId: op(), profileId: a, decision: 'like' });
    assert.equal((await call('uc', c, { action: 'discover.undo', opId: op() })).decision, 'like');
    assert.deepEqual((await call('ua', a, { action: 'likes.incoming' })).items, []); // the withdrawn like is gone

    // Dismissing a like: the sender is never told — their like still looks sent, liking again changes nothing,
    // withdrawing answers the same.
    await call('uc', c, { action: 'discover.decide', opId: op(), profileId: a, decision: 'like' });
    await call('ua', a, { action: 'like.dismiss', opId: op(), profileId: c });
    assert.deepEqual((await call('ua', a, { action: 'likes.incoming' })).items, []);
    assert.equal((await call('uc', c, { action: 'likes.outgoing' })).items.length, 1);
    assert.equal((await call('uc', c, { action: 'like.send', opId: op(), profileId: a, source: 'profile' })).state, 'liked');
    assert.deepEqual((await call('ua', a, { action: 'likes.incoming' })).items, []);
    assert.equal((await call('uc', c, { action: 'like.withdraw', opId: op(), profileId: a })).withdrawn, true);
  } finally { await pg.close(); }
});

test('rules: likes from the profile page need consent, couples only through Discover, related never meet, blocks cut likes and matches', async () => {
  const { pg, call, coupleOf, member, withPhoto, deck } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira'), c = await member('uc', 'Noa');
    await call('ub', b, { action: 'profile.setVisibility', opId: op(), setting: 'acceptProfileLikes', value: false });
    assert.equal((await call('ua', a, { action: 'like.send', opId: op(), profileId: b, source: 'profile' })).rule, 'likes_not_accepted');
    const pair = await coupleOf([b, c]);
    await withPhoto(pair);
    // Partners and their own couple never appear to each other.
    assert.ok(!(await deck('ub', b)).includes('Noa'));
    assert.ok(!(await deck('ub', pair)).length || !(await deck('ub', pair)).includes('Kira'));
    assert.equal((await call('ub', b, { action: 'like.send', opId: op(), profileId: c, source: 'profile' })).rule, 'related');
    await call('ub', pair, { action: 'profile.setVisibility', opId: op(), setting: 'discoverMode', value: 'off' });
    assert.equal((await call('ua', a, { action: 'like.send', opId: op(), profileId: pair, source: 'profile' })).rule, 'couples_via_discover_only');

    // A block ends likes and the match both ways.
    await call('ua', a, { action: 'discover.decide', opId: op(), profileId: c, decision: 'like' });
    await call('uc', c, { action: 'like.send', opId: op(), profileId: a, source: 'likes' });
    assert.equal((await call('ua', a, { action: 'matches.list' })).items.length, 1);
    await call('uc', c, { action: 'block.set', opId: op(), profileId: a, on: true });
    assert.deepEqual((await call('ua', a, { action: 'matches.list' })).items, []);
    assert.equal((await call('ua', a, { action: 'like.send', opId: op(), profileId: c, source: 'profile' })).status, 404);
  } finally { await pg.close(); }
});

test('a couple is visible in Discover only when both partners confirmed their age', async () => {
  const { pg, db, call, coupleOf, member } = await world();
  try {
    const b = await member('ub', 'Kira'), c = await member('uc', 'Noa', { verified: false });
    const pair = await coupleOf([b, c]);
    await db.query(`update feture.profile_settings set discover_mode = 'off' where profile_id = $1`, [pair]);
    assert.equal((await call('ub', pair, { action: 'profile.setVisibility', opId: op(), setting: 'discoverMode', value: 'visible' })).rule, 'age_not_verified');
  } finally { await pg.close(); }
});

test('review fixes: couples need both ages confirmed, filters see only public details and shown ages, count needs Discover on, a like back after a stuck pair still matches', async () => {
  const { pg, db, call, coupleOf, member, withPhoto, deck } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira', { birthDate: '2000-05-01' }), c = await member('uc', 'Noa', { verified: false });
    const pair = await coupleOf([b, c]);
    await withPhoto(pair);
    assert.ok(!(await deck('ua', a)).includes('Пара')); // visible by default, but not until both confirmed their age
    await db.query(`update feture.account set age_verified_until = now() + interval '1 year' where person_profile_id = $1`, [c]);
    assert.equal((await call('ua', a, { action: 'discover.deck' })).items.filter((/** @type {any} */ x) => x.kind === 'couple').length, 1);

    // Hidden details and a hidden age never filter.
    await db.query(`update feture.profile_details set genders = '{woman}', details_vis = 'only', show_age = false where profile_id = $1`, [b]);
    const f = { show: 'people', ageMin: 18, ageMax: 99, cityId: null, genders: ['woman'], orients: [], formats: [], seeks: [], roles: [], topics: [] };
    const count = async (/** @type {any} */ x) => (await call('ua', a, { action: 'discover.count', filter: x })).count;
    assert.equal(await count(f), 0);
    assert.equal(await count({ ...f, genders: [], ageMin: 24, ageMax: 27 }), 0);
    await db.query(`update feture.profile_details set details_vis = 'all', show_age = true where profile_id = $1`, [b]);
    assert.equal(await count(f), 1);
    assert.equal(await count({ ...f, genders: [], ageMin: 24, ageMax: 27 }), 1);
    await call('ua', a, { action: 'profile.setVisibility', opId: op(), setting: 'discoverMode', value: 'off' });
    assert.equal((await call('ua', a, { action: 'discover.count', filter: f })).rule, 'own_discover_off');
    await call('ua', a, { action: 'profile.setVisibility', opId: op(), setting: 'discoverMode', value: 'visible' });

    // Two likes that crossed (both active, no match): the next like still makes the match.
    const [{ id: accA }] = await db.query('select id from feture.account where person_profile_id = $1', [a]);
    const [{ id: accB }] = await db.query('select id from feture.account where person_profile_id = $1', [b]);
    await db.query(`insert into feture.profile_like (from_profile_id, to_profile_id, source, initiator_account_id) values ($1, $2, 'discover', $3), ($2, $1, 'discover', $4)`, [a, b, accA, accB]);
    assert.equal((await call('ua', a, { action: 'like.send', opId: op(), profileId: b, source: 'likes' })).state, 'matched');
  } finally { await pg.close(); }
});

test('discover.filter: defaults until saved, the saved one after, per profile; a refused filter is not stored; nobody reads another’s', async () => {
  const { pg, call, member, coupleOf } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira'), c = await member('uc', 'Noa');
    const defaults = { show: 'all', ageMin: 18, ageMax: 99, cityId: null, placeMode: 'city', radiusKm: 25, genders: [], orients: [], formats: [], seeks: [], roles: [], topics: [] };
    assert.deepEqual((await call('ua', a, { action: 'discover.filter' })).filter, defaults);
    const filter = { ...defaults, show: 'people', ageMin: 25, ageMax: 40, topics: ['shibari'] };
    await call('ua', a, { action: 'discover.setFilter', opId: op(), filter });
    assert.deepEqual((await call('ua', a, { action: 'discover.filter' })).filter, filter);
    assert.deepEqual((await call('ua', a, { action: 'discover.setFilter', opId: op(), filter: { ...filter, ageMin: 30, topics: ['nolimit-xyz'] } })).fields, ['topics']);
    assert.deepEqual((await call('ua', a, { action: 'discover.filter' })).filter, filter); // unchanged
    // Kira's own filter is the default; asking with Alex's profile header is refused; Alex's couple has its own.
    assert.deepEqual((await call('ub', b, { action: 'discover.filter' })).filter, defaults);
    assert.equal((await call('ub', a, { action: 'discover.filter' })).status, 403);
    assert.equal((await call('ub', null, { action: 'discover.filter' })).status, 400);
    const pair = await coupleOf([a, c]);
    assert.deepEqual((await call('ua', pair, { action: 'discover.filter' })).filter, defaults);
  } finally { await pg.close(); }
});

test('deck cards carry what the top card shows (photos, follower counts, follow, private part); passes and likes have their own daily limits', async () => {
  const { pg, db, call, member } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira'), c = await member('uc', 'Noa');
    await call('uc', c, { action: 'follow.set', opId: op(), profileId: b, on: true });
    await call('ua', a, { action: 'follow.set', opId: op(), profileId: b, on: true });
    const items = (await call('ua', a, { action: 'discover.deck' })).items;
    const kira = items.find((/** @type {any} */ x) => x.id === b);
    assert.equal(kira.photos.length, 1);
    assert.equal(kira.followers, 2);
    assert.equal(kira.following, 0);
    assert.equal(kira.iFollow, true);
    assert.deepEqual(kira.private, { exists: false, open: false });
    const noa = items.find((/** @type {any} */ x) => x.id === c);
    assert.equal(noa.following, 1);
    assert.equal(noa.iFollow, false);
    // A pass is counted apart from likes: a day of likes used up still lets the person skip.
    const [acc] = await db.query('select account_id from feture.profile_member where profile_id = $1', [a]);
    await db.query(`insert into feture.rate_event (account_id, kind) select $1, 'discover.decide' from generate_series(1, 1000)`, [acc.account_id]);
    assert.equal((await call('ua', a, { action: 'discover.decide', opId: op(), profileId: b, decision: 'like' })).error, 'rate_limited');
    assert.equal((await call('ua', a, { action: 'discover.decide', opId: op(), profileId: b, decision: 'pass' })).decision, 'pass');
    // A passed person does not come back in the deck.
    assert.deepEqual((await call('ua', a, { action: 'discover.deck' })).items.map((/** @type {any} */ x) => x.id), [c]);
  } finally { await pg.close(); }
});

test('e2e persona accounts (qa-… logins) stay out of everyone else’s Discover and last in search; they still meet each other', async () => {
  const { pg, db, call, member, deck } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira');
    const qa1 = await member('qa-1', 'qa_l_full'), qa2 = await member('qa-2', 'qa_l_mate');
    assert.deepEqual((await db.query('select qa from feture.account where person_profile_id = any($1) order by qa', [[a, qa1]])).map(r => r.qa), [false, true]);
    assert.deepEqual((await deck('ua', a)).sort(), ['Kira']);
    assert.equal((await call('ua', a, { action: 'discover.count', filter: { show: 'all', ageMin: 18, ageMax: 99, cityId: null, genders: [], orients: [], formats: [], seeks: [], roles: [], topics: [] } })).count, 1);
    assert.equal((await call('ua', a, { action: 'discover.decide', opId: op(), profileId: qa1, decision: 'like' })).error, 'not_found');
    assert.deepEqual((await deck('qa-1', qa1)).sort(), ['Alex', 'Kira', 'qa_l_mate']);
    assert.ok(b && qa2);
  } finally { await pg.close(); }
});

test('discover.card: everything under a card in one read — each part as its own command answers it; a blocked or missing profile is not found', async () => {
  const { pg, call, member } = await world();
  try {
    const a = await member('ua', 'Alex'), b = await member('ub', 'Kira'), c = await member('uc', 'Noa');
    const r = await call('ua', a, { action: 'discover.card', profileId: b });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal(r.profile.ok, true);
    assert.equal(r.profile.profile.id, b);
    assert.equal(r.profile.profile.handle, 'Kira');
    // The same answers the profile page reads one by one.
    for (const [k, action] of [['compat', 'profile.compat'], ['links', 'links.ofProfile'], ['interests', 'interests.list'], ['private', 'private.get'], ['posts', 'profile.posts'], ['activity', 'profile.activity']]) {
      const { status: _s, requestId: _r, ...alone } = await call('ua', a, { action, profileId: b });
      assert.deepEqual(r[k], alone, k);
    }
    // Blocked either way, or no such profile: not found, nothing of it.
    await call('uc', c, { action: 'block.set', opId: op(), profileId: a, on: true });
    const blocked = await call('ua', a, { action: 'discover.card', profileId: c });
    assert.equal(blocked.status, 404);
    assert.equal(blocked.profile, undefined);
    assert.equal((await call('ua', a, { action: 'discover.card', profileId: '00000000-0000-4000-8000-000000000000' })).status, 404);
  } finally { await pg.close(); }
});
