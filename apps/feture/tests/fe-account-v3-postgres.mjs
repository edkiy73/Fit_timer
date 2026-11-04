// «Я» v3 (owner 05.11.2026) on PGlite as feture_api: interests and «Данные» always public, the relationship status as one
// of the account's decisions, the pair on both profiles, a couple's avatar halves and its own private text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { access } from '../server/commands/access.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { couples } from '../server/commands/couples.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...access, ...inbox, ...couples } });

test('interests are public whatever an older client asks, and others see them', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'alex'), b = await person('ub', 'kira');
    assert.equal((await call('ua', a, { action: 'interests.set', opId: op(), topicId: 'bondage', value: 7, vis: 'only' })).status, 200);
    assert.equal((await call('ua', a, { action: 'interests.set', opId: op(), topicId: 'wax', mark: 'discuss' })).status, 200); // no vis at all
    const rows = await db.query(`select topic_id, vis from feture.interest where profile_id = $1 order by topic_id`, [a]);
    assert.deepEqual(rows.map(r => [r.topic_id, r.vis]), [['bondage', 'public'], ['wax', 'public']]);
    const seen = await call('ub', b, { action: 'interests.list', profileId: a });
    assert.deepEqual(seen.items.map(i => i.topicId).sort(), ['bondage', 'wax']);
  } finally { await pg.close(); }
});

test('«Данные» are always public: a new profile, an older client asking «only»', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'alex');
    const [d] = await db.query('select details_vis from feture.profile_details where profile_id = $1', [a]);
    assert.equal(d.details_vis, 'all');
    const { profile } = await call('ua', a, { action: 'profile.get', profileId: a });
    assert.equal((await call('ua', a, { action: 'profile.update', opId: op(), rev: profile.rev, detailsVis: 'only' })).status, 200);
    const [after] = await db.query('select details_vis from feture.profile_details where profile_id = $1', [a]);
    assert.equal(after.details_vis, 'all');
  } finally { await pg.close(); }
});

test('the relationship status is a decision of the account until «Поменять» or «Оставить»', async () => {
  const { pg, call, person, coupleOf } = await setup();
  try {
    const a = await person('ua', 'alex'), b = await person('ub', 'kira');
    const before = await call('ua', null, { action: 'inbox.counts' });
    assert.equal(before.decide, 0); // no couple yet
    await coupleOf([a, b]);
    const counts = await call('ua', null, { action: 'inbox.counts' });
    assert.equal(counts.decide, 1);
    assert.equal(counts.bell, counts.notifications + 1);
    const items = (await call('ua', null, { action: 'decide.list' })).items;
    assert.deepEqual(items.map(i => [i.kind, i.addressee]), [['status', a]]);
    // «Оставить»: gone on every device, and the profile says so
    assert.equal((await call('ua', null, { action: 'profile.statusKeep', opId: op() })).status, 200);
    assert.equal((await call('ua', null, { action: 'inbox.counts' })).decide, 0);
    assert.equal((await call('ua', a, { action: 'profile.get', profileId: a })).profile.statusKept, true);
    // Kira sets «в отношениях»: hers goes too
    assert.equal((await call('ub', null, { action: 'inbox.counts' })).decide, 1);
    const { profile } = await call('ub', b, { action: 'profile.get', profileId: b });
    assert.equal((await call('ub', b, { action: 'profile.update', opId: op(), rev: profile.rev, status: 'partnered' })).status, 200);
    assert.equal((await call('ub', null, { action: 'inbox.counts' })).decide, 0);
  } finally { await pg.close(); }
});

test('the pair on both profiles, never across a block; the boot draws a couple as two halves', async () => {
  const { pg, db, call, person, coupleOf } = await setup();
  try {
    const a = await person('ua', 'alex'), b = await person('ub', 'kira'), c = await person('uc', 'noa');
    const pair = await coupleOf([a, b]);
    const seenPair = (await call('uc', c, { action: 'profile.get', profileId: pair })).profile;
    assert.deepEqual(seenPair.members.map(m => m.handle).sort(), ['alex', 'kira']);
    assert.deepEqual((await call('uc', c, { action: 'profile.get', profileId: a })).profile.couple?.id, pair);
    assert.equal((await call('uc', c, { action: 'profile.get', profileId: c })).profile.couple, null); // single
    // Kira blocks Noa: Noa no longer sees her in the pair
    await db.query(`insert into feture.block (blocker_profile_id, blocked_profile_id, acted_by)
      select $1, $2, id from feture.account where person_profile_id = $1`, [b, c]);
    assert.deepEqual((await call('uc', c, { action: 'profile.get', profileId: pair })).profile.members.map(m => m.handle), ['alex']);
    // own profiles: the other one is marked own (no like / follow / write on the page)
    assert.equal((await call('ua', pair, { action: 'profile.get', profileId: a })).profile.own, true);
    // The pair screen draws each partner's face (no photo here: the key is there, null).
    const own = (await call('ua', pair, { action: 'couple.get' })).couple;
    assert.deepEqual(own.members.map(m => [m.handle, m.avatar]), [['alex', null], ['kira', null]]);
    const boot = await call('ua', null, { action: 'session.bootstrap' });
    const card = boot.profiles.find(p => p.kind === 'couple');
    assert.deepEqual(card.halves.map(h => h.name).sort(), ['alex', 'kira']);
  } finally { await pg.close(); }
});

test('a couple writes its own private text and media; the partner hears of it', async () => {
  const { pg, db, call, person, coupleOf } = await setup();
  try {
    const a = await person('ua', 'alex'), b = await person('ub', 'kira');
    const pair = await coupleOf([a, b]);
    assert.equal((await call('ua', pair, { action: 'private.setText', opId: op(), text: 'Для своих.' })).status, 200);
    const [row] = await db.query('select text from feture.private_part where profile_id = $1', [pair]);
    assert.equal(row.text, 'Для своих.');
    assert.equal((await call('ua', pair, { action: 'private.setMedia', opId: op(), assetIds: [] })).status, 200);
    const told = await db.query(`select payload->>'what' what from feture.outbox where topic = 'couple.changed' and profile_id = $1`, [pair]);
    assert.ok(told.some(r => r.what === 'privateContent'));
  } finally { await pg.close(); }
});
