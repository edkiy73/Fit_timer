// Slice F on PGlite as feture_api: Discover pool and filter, decisions and undo, likes, matches, blocks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { photos } from '../server/commands/photos.mjs';
import { discover } from '../server/commands/discover.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...photos, ...discover } });

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
    await call('uc', c, { action: 'discover.restore', opId: op(), profileId: a });
    assert.ok((await deck('uc', c)).includes('Alex'));
    await db.query(`update feture.account set premium_until = now() + interval '1 month' where person_profile_id = $1`, [c]);
    await call('uc', c, { action: 'discover.decide', opId: op(), profileId: a, decision: 'like' });
    assert.equal((await call('uc', c, { action: 'discover.undo', opId: op() })).decision, 'like');
    assert.deepEqual((await call('ua', a, { action: 'likes.incoming' })).items, []); // the withdrawn like is gone

    // Dismissing a like: the sender is not told; their like is no longer listed.
    await call('uc', c, { action: 'discover.decide', opId: op(), profileId: a, decision: 'like' });
    await call('ua', a, { action: 'like.dismiss', opId: op(), profileId: c });
    assert.deepEqual((await call('ua', a, { action: 'likes.incoming' })).items, []);
    assert.equal((await call('uc', c, { action: 'likes.outgoing' })).items.length, 0);
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
