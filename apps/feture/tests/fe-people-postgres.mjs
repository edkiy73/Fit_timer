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
