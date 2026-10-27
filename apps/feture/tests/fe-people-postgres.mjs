// Slice F2 on PGlite as feture_api: people search, links between profiles, «Что у вас общего».
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { people } from '../server/commands/people.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...inbox, ...people } });

test('search: start of a nickname or name, not oneself, not anyone blocked; exact nickname lookup', async () => {
  const { pg, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Kirill');
    assert.deepEqual((await call('ua', a, { action: 'people.search', q: 'kir' })).items.map((/** @type {any} */ x) => x.handle).sort(), ['Kira', 'Kirill']);
    assert.deepEqual((await call('ua', a, { action: 'people.search', q: 'ra' })).items, []); // start only
    assert.deepEqual((await call('ua', a, { action: 'people.search', q: 'k%' })).items, []); // wildcards are text
    await call('uc', c, { action: 'block.set', opId: op(), profileId: a, on: true });
    assert.deepEqual((await call('ua', a, { action: 'people.search', q: 'kir' })).items.map((/** @type {any} */ x) => x.handle), ['Kira']);
    assert.equal((await call('ua', a, { action: 'people.byNick', handle: 'kira' })).profile.id, b);
    assert.equal((await call('ua', a, { action: 'people.byNick', handle: 'Kirill' })).status, 404);
  } finally { await pg.close(); }
});

test('links: propose, settings gate, answer in «Нужно решить», the more private choice wins, change of kind, block removes', async () => {
  const { pg, call, person, coupleOf, db } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    assert.deepEqual((await call('ua', a, { action: 'link.propose', opId: op(), profileId: b, kind: 'ds' })).fields, ['mySide']);
    const l = await call('ua', a, { action: 'link.propose', opId: op(), profileId: b, kind: 'ds', mySide: 'dom' });
    assert.equal(l.state, 'pending');
    assert.equal((await call('ua', a, { action: 'link.propose', opId: op(), profileId: b, kind: 'friend' })).rule, 'link_exists');
    assert.ok((await call('ub', null, { action: 'decide.list' })).items.some((/** @type {any} */ x) => x.kind === 'link' && x.actor.handle === 'Alex'));
    assert.equal((await call('ua', a, { action: 'link.answer', opId: op(), linkId: l.id, accept: true })).rule, 'not_pending');
    await call('ub', b, { action: 'link.answer', opId: op(), linkId: l.id, accept: true, vis: 'us' });
    // The more private choice of the two: only the two of them see it.
    assert.deepEqual((await call('uc', c, { action: 'links.ofProfile', profileId: a })).items, []);
    assert.equal((await call('ub', b, { action: 'links.ofProfile', profileId: a })).items[0].side, 'dom');
    await call('ub', b, { action: 'link.setVisibility', opId: op(), linkId: l.id, vis: 'all' });
    assert.equal((await call('uc', c, { action: 'links.ofProfile', profileId: a })).items.length, 1);

    // A change of kind waits for the other side.
    await call('ub', b, { action: 'link.proposeChange', opId: op(), linkId: l.id, kind: 'friend' });
    assert.ok((await call('ua', null, { action: 'decide.list' })).items.some((/** @type {any} */ x) => x.kind === 'linkChange'));
    await call('ua', a, { action: 'link.answerChange', opId: op(), linkId: l.id, accept: true });
    assert.equal((await call('uc', c, { action: 'links.ofProfile', profileId: a })).items[0].kind, 'friend');

    // Settings: closed, or only from people one follows. Never with one's own partner.
    await call('uc', c, { action: 'profile.setVisibility', opId: op(), setting: 'linksFrom', value: 'none' });
    assert.equal((await call('ua', a, { action: 'link.propose', opId: op(), profileId: c, kind: 'friend' })).rule, 'links_closed');
    await call('uc', c, { action: 'profile.setVisibility', opId: op(), setting: 'linksFrom', value: 'follow' });
    assert.equal((await call('ua', a, { action: 'link.propose', opId: op(), profileId: c, kind: 'friend' })).rule, 'follow_only');
    await coupleOf([a, c]);
    await call('uc', c, { action: 'profile.setVisibility', opId: op(), setting: 'linksFrom', value: 'all' });
    assert.equal((await call('ua', a, { action: 'link.propose', opId: op(), profileId: c, kind: 'partner' })).rule, 'own_partner');

    await call('ub', b, { action: 'block.set', opId: op(), profileId: a, on: true });
    const [{ n }] = await db.query('select count(*)::int n from feture.profile_link');
    assert.equal(n, 0);
  } finally { await pg.close(); }
});

test('«Что у вас общего»: only public interests, groups without a score, few when either side has under two', async () => {
  const { pg, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
    const set = (/** @type {string} */ u, /** @type {string} */ p, /** @type {any} */ x) => call(u, p, { action: 'interests.set', opId: op(), ...x });
    await set('ua', a, { topicId: 'shibari', value: 8, vis: 'public' });
    await set('ub', b, { topicId: 'shibari', value: 7, vis: 'public' });
    assert.equal((await call('ua', a, { action: 'profile.compat', profileId: b })).few, true);
    await set('ua', a, { topicId: 'filming', mark: 'hard', vis: 'public' });
    await set('ub', b, { topicId: 'filming', value: 5, vis: 'public' });
    await set('ub', b, { topicId: 'substances', value: 9, vis: 'only' }); // private: never compared
    await set('ua', a, { topicId: 'substances', value: 9, vis: 'public' });
    const r = await call('ua', a, { action: 'profile.compat', profileId: b });
    assert.deepEqual([r.few, r.count, r.items.map((/** @type {any} */ i) => [i.topicId, i.group])], [false, 1, [['filming', 'bound'], ['shibari', 'match']]]);
    assert.equal(r.score, undefined);
  } finally { await pg.close(); }
});

test('every rate limit kind fits the rate_event column (a mismatch fails every call with 503)', async () => {
  const { readdir } = await import('node:fs/promises');
  const dir = new URL('../contracts/', import.meta.url);
  for (const f of await readdir(dir)) {
    const mod = await import(new URL(f, dir).href);
    for (const set of Object.values(mod).filter(v => v && typeof v === 'object')) {
      for (const [action, def] of Object.entries(set)) {
        const kind = /** @type {any} */ (def)?.rate?.kind;
        if (kind) assert.match(kind, /^[a-z][a-z_.]{1,31}$/, `${f} ${action}`);
      }
    }
  }
});

test('review fix: each endpoint’s «followers» choice holds on both pages', async () => {
  const { pg, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    const l = await call('ua', a, { action: 'link.propose', opId: op(), profileId: b, kind: 'friend', vis: 'followers' });
    await call('ub', b, { action: 'link.answer', opId: op(), linkId: l.id, accept: true, vis: 'all' });
    await call('uc', c, { action: 'follow.set', opId: op(), profileId: b, on: true });
    assert.deepEqual((await call('uc', c, { action: 'links.ofProfile', profileId: b })).items, []); // Alex chose followers of Alex
    await call('uc', c, { action: 'follow.set', opId: op(), profileId: a, on: true });
    assert.equal((await call('uc', c, { action: 'links.ofProfile', profileId: b })).items.length, 1);
  } finally { await pg.close(); }
});

test('faces in lists: photo, age only when shown (own always), badges; nothing for blocked or inactive profiles', async () => {
  const { pg, call, person, coupleOf, db } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa'), d = await person('ud', 'Dan');
    const acc = async (/** @type {string} */ p) => (await db.query('select id from feture.account where person_profile_id = $1', [p]))[0].id;
    const [accA, accB, accC] = [await acc(a), await acc(b), await acc(c)];
    const [av] = await db.query(
      `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
       values ($1, $2, 'image', 'avatar', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [b, accB]);
    await db.query('update feture.profile set avatar_asset_id = $1 where id = $2', [av.id, b]);
    await db.query(`update feture.profile_details set show_age = true where profile_id = $1`, [b]);
    await db.query(`update feture.profile_details set show_age = false where profile_id = $1`, [c]);
    await db.query(`update feture.account set premium_until = now() + interval '1 month' where person_profile_id = $1`, [c]);
    for (const [u, p] of [['ub', b], ['uc', c], ['ud', d]]) await call(u, p, { action: 'follow.set', opId: op(), profileId: a, on: true });
    const list = async () => Object.fromEntries((await call('ua', a, { action: 'profile.followers', profileId: a })).items.map((/** @type {any} */ x) => [x.handle, x]));
    const f = await list();
    assert.ok(typeof f.Kira.avatar === 'string' && f.Kira.avatar.startsWith('https://media.test'));
    assert.equal(typeof f.Kira.age, 'number');
    assert.deepEqual([f.Noa.age, f.Noa.premium, f.Noa.avatar, f.Kira.premium], [null, true, null, false]);
    // The same as profile.get shows the same viewer.
    const kira = (await call('ua', a, { action: 'profile.get', profileId: b })).profile, noa = (await call('ua', a, { action: 'profile.get', profileId: c })).profile;
    assert.deepEqual([kira.age, kira.premium, noa.age, noa.premium], [f.Kira.age, false, null, true]);

    // Own profile: the age even when hidden. A couple: no age, Premium when a partner has it.
    const { facesOf } = await import('../server/commands/faces.mjs');
    const media = { storage: null, delivery: null };
    assert.equal(typeof (await facesOf(db, media, { profileId: c, accountId: accC }, [c])).get(c)?.age, 'number');
    const pair = await coupleOf([c, d]);
    assert.deepEqual((await facesOf(db, media, { profileId: a, accountId: accA }, [pair])).get(pair), { avatar: null, age: null, photoVerified: false, premium: true });

    // Blocked either way, or not active: nothing at all.
    await call('ub', b, { action: 'block.set', opId: op(), profileId: a, on: true });
    assert.equal((await facesOf(db, media, { profileId: a, accountId: accA }, [b])).get(b), undefined);
    await db.query(`update feture.profile set state = 'paused', restore_until = now() + interval '30 days' where id = $1`, [c]);
    assert.equal((await facesOf(db, media, { profileId: a, accountId: accA }, [c])).get(c), undefined);
    assert.deepEqual(Object.keys(await list()), ['Dan']);
  } finally { await pg.close(); }
});
