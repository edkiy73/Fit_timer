// Slice C1 «Я» on PGlite as the restricted feture_api role: registration, onboarding, profile views,
// settings and interests through the real /api/fe handler.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me, ageOn } from '../server/commands/me.mjs';
import { access } from '../server/commands/access.mjs';
import { setup as baseSetup, ACCEPT, DOCS, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...access } });
const isoDaysFromNow = (years, days = 0) => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - years); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const register = (call, user, handle, extra = {}, headers = {}) =>
  call(user, null, { action: 'account.create', opId: op(), handle, birthDate: isoDaysFromNow(30), locale: 'ru', documents: ACCEPT, newsOptIn: false, ...extra }, headers);

test('age is full years on the UTC date', () => {
  assert.equal(ageOn('2000-10-28', new Date('2026-10-27T12:00:00Z')), 25);
  assert.equal(ageOn('2000-10-27', new Date('2026-10-27T12:00:00Z')), 26);
  assert.equal(ageOn('2008-02-29', new Date('2026-02-28T12:00:00Z')), 17);
});

test('registration: catalog, nickname rules, under-18 keeps only a marker, documents fail closed, one person profile', async () => {
  const { pg, db, call } = await setup();
  try {
    const cat = await call('u1', null, { action: 'catalog.get' });
    assert.equal(cat.status, 200);
    assert.ok(cat.topics.length >= 70 && !cat.topics.some(t => ['blood', 'knife', 'needles', 'cnc'].includes(t.id))); // admin-hidden
    assert.ok(cat.options.some(o => o.kind === 'gender' && o.code === 'woman'));

    for (const h of ['Admin', 'support_team', 'adm1n', 'Feture.help', 'm0derator']) {
      assert.deepEqual(await call('u1', null, { action: 'nick.check', handle: h }).then(r => [h, r.available, r.reason]), [h, false, 'reserved']);
    }
    assert.deepEqual(await call('u1', null, { action: 'nick.check', handle: 'a..b' }).then(r => [r.available, r.reason]), [false, 'format']);
    assert.equal((await call('u1', null, { action: 'nick.check', handle: 'Alex' })).available, true);

    // A future date is a typo: refused without a marker.
    assert.equal((await register(call, 'u1', 'Alex', { birthDate: '2099-01-01' })).status, 400);
    assert.equal((await db.query('select count(*)::int n from feture.u18_event'))[0].n, 0);
    // 18 today somewhere on Earth counts as 18.
    const birthday = new Date(Date.now() + 14 * 3600e3); birthday.setUTCFullYear(birthday.getUTCFullYear() - 18);
    assert.equal((await register(call, 'u9', 'Birthday', { birthDate: birthday.toISOString().slice(0, 10) })).ok, true);

    // Under 18: refused, nothing about the person is stored — not even in the idempotency ledger.
    const young = await register(call, 'u1', 'Alex', { birthDate: isoDaysFromNow(17, 30) });
    assert.deepEqual([young.status, young.ok, young.rule], [200, false, 'under_18']);
    const [acc] = await db.query(`select a.birth_date, a.person_profile_id from feture.account a join feture.account_link l on l.account_id = a.id
      order by a.created_at limit 1`);
    assert.deepEqual([acc.birth_date, acc.person_profile_id], [null, null]);
    assert.equal((await db.query(`select count(*)::int n from feture.op_ledger where action = 'account.create'`))[0].n, 0);
    assert.equal((await db.query('select count(*)::int n from feture.u18_event'))[0].n, 1);
    assert.equal((await register(call, 'u1', 'Alex')).rule, 'age_check_required');
    // Re-creating the Core login (new generation) does not erase the marker.
    assert.equal((await register(call, 'u1', 'Alex', {}, { 'x-test-gen': 'g2' })).rule, 'age_check_required');

    const noDocs = await register(call, 'u2', 'Bobby', { documents: ACCEPT.slice(0, 3) });
    assert.deepEqual([noDocs.status, noDocs.rule, noDocs.documents], [422, 'documents_required', ['adult-content']]);
    const stale = await register(call, 'u2', 'Bobby', { documents: [...ACCEPT.slice(0, 3), { id: ACCEPT[3].id, contentHash: 'f'.repeat(64) }] });
    assert.equal(stale.rule, 'documents_required'); // accepted an older text than the one in force
    assert.equal((await register(call, 'u2', 'Bobby', { locale: 'en' })).status, 503); // nothing published in English: fail closed

    const ok = await register(call, 'u2', 'Bobby');
    assert.deepEqual([ok.status, ok.ok], [200, true]);
    const consents = await db.query('select document_key, locale from feture.consent order by document_key');
    assert.deepEqual(consents.filter(c => c.locale === 'ru').length >= 4, true);
    assert.ok(!consents.some(c => c.document_key === 'cookies')); // optional document is not forced
    assert.deepEqual([(await register(call, 'u2', 'Bobby2')).status], [409]);
    const taken = await register(call, 'u3', 'BOBBY');
    assert.deepEqual([taken.status, taken.field], [409, 'handle']);

    const [s] = await db.query('select * from feture.profile_settings where profile_id = $1', [ok.profileId]);
    assert.deepEqual([s.discover_mode, s.private_on, s.requests_from], ['visible', true, 'all']); // AUTH-019 defaults
    const [d] = await db.query('select details_vis from feture.profile_details where profile_id = $1', [ok.profileId]);
    assert.equal(d.details_vis, 'only'); // AUTH-016: «О тебе» starts private

    // A mandatory document unpublished → registration closes.
    await pg.exec(`reset role; delete from public.feture_document_versions where document_key = 'community'; set role feture_api`);
    assert.equal((await register(call, 'u4', 'Noa')).status, 503);
    assert.ok(DOCS.length === 5);
  } finally { await pg.close(); }
});

test('nick.check is rate limited per account', async () => {
  const { pg, call } = await setup();
  try {
    for (let i = 0; i < 30; i++) assert.equal((await call('u1', null, { action: 'nick.check', handle: 'Name' + i })).status, 200);
    assert.equal((await call('u1', null, { action: 'nick.check', handle: 'Name31' })).status, 429);
    assert.equal((await call('u2', null, { action: 'nick.check', handle: 'Name31' })).status, 200);
  } finally { await pg.close(); }
});

test('onboarding and profile views: own vs others, details visibility, age, nickname hold, single-line names', async () => {
  const { pg, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
    const bad = await call('ua', a, { action: 'onboarding.complete', opId: op(), detailsVis: 'all', genders: ['robot'], orients: [], roles: [], formats: [], seeks: [], status: null, discover: 'visible' });
    assert.deepEqual([bad.status, bad.fields], [400, ['genders']]);
    const done = await call('ua', a, { action: 'onboarding.complete', opId: op(), detailsVis: 'only', genders: ['woman'], orients: ['bi'], roles: ['switch'], formats: ['open'], seeks: ['chat'], status: 'single', discover: 'visible' });
    assert.deepEqual([done.status, done.discoverVisible, done.photoNeeded], [200, false, true]);

    const own = (await call('ua', a, { action: 'profile.get', profileId: a })).profile;
    assert.deepEqual([own.own, own.handle, own.details.genders, own.detailsVis], [true, 'Alex', ['woman'], 'only']);
    const seen = (await call('ub', b, { action: 'profile.get', profileId: a })).profile;
    assert.deepEqual([seen.own, seen.details, seen.rev], [false, {}, undefined]); // details «Только ты»
    assert.equal((await call('ub', a, { action: 'profile.get', profileId: a })).status, 403); // not my profile to act as

    const upd = await call('ua', a, { action: 'profile.update', opId: op(), rev: own.rev, bio: '  Пишу медленно.́  ', detailsVis: 'all', showAge: false });
    assert.equal(upd.status, 200);
    const stale = await call('ua', a, { action: 'profile.update', opId: op(), rev: own.rev, bio: 'x' });
    assert.deepEqual([stale.status, stale.rev], [409, upd.rev]);
    const after = (await call('ub', b, { action: 'profile.get', profileId: a })).profile;
    assert.deepEqual([after.bio, after.age, after.details.genders, after.details.status], ['Пишу медленно.́'.normalize('NFC'), null, ['woman'], 'single']);
    assert.deepEqual((await call('ua', a, { action: 'profile.update', opId: op(), rev: upd.rev, bio: 'evil‮text' })).fields, ['bio']);
    assert.deepEqual((await call('ua', a, { action: 'profile.update', opId: op(), rev: upd.rev, name: 'A\tB' })).fields, ['name']);
    assert.deepEqual((await call('ua', a, { action: 'profile.update', opId: op(), rev: upd.rev, name: 'ㅤ' })).fields, ['name']);

    // Nickname: case-only change is free; a new nickname at most once per 30 days; the old one is held.
    const r1 = await call('ua', a, { action: 'profile.update', opId: op(), rev: upd.rev, handle: 'alex' });
    assert.equal(r1.status, 200);
    const r2 = await call('ua', a, { action: 'profile.update', opId: op(), rev: r1.rev, handle: 'alex_new' });
    assert.equal(r2.status, 200);
    assert.equal((await call('ua', a, { action: 'profile.update', opId: op(), rev: r2.rev, handle: 'alex_again' })).rule, 'handle_change_cooldown');
    assert.equal((await call('ub', b, { action: 'profile.update', opId: op(), rev: 1, handle: 'ALEX' })).field, 'handle'); // held
    assert.equal((await call('ub', b, { action: 'nick.check', handle: 'alex' })).available, false);

    // Own submitted city is usable at once; others do not see it until approved.
    const place = await call('ua', null, { action: 'place.submit', opId: op(), country: 'DE', name: 'Leipzig' });
    assert.equal((await call('ua', a, { action: 'profile.update', opId: op(), rev: r2.rev, cityId: place.id ?? place.placeId })).status, 200);
    assert.equal((await call('ua', a, { action: 'profile.get', profileId: a })).profile.city.pending, true);
    assert.equal((await call('ub', b, { action: 'profile.get', profileId: a })).profile.city, null);
    assert.equal((await call('ub', b, { action: 'profile.update', opId: op(), rev: 1, cityId: place.placeId })).status, 400);
  } finally { await pg.close(); }
});

test('settings and visibility: per profile, per account, notification defaults and validation', async () => {
  const { pg, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex');
    assert.equal((await call('ua', a, { action: 'profile.settings' })).settings.discoverMode, 'visible');
    assert.equal((await call('ua', a, { action: 'profile.setVisibility', opId: op(), setting: 'discoverMode', value: 'hidden' })).status, 200);
    assert.equal((await call('ua', a, { action: 'profile.setVisibility', opId: op(), setting: 'discoverMode', value: 'loud' })).status, 400);
    assert.equal((await call('ua', a, { action: 'profile.settings' })).settings.discoverMode, 'hidden');
    assert.equal((await call('ua', null, { action: 'settings.update', opId: op(), chatBlur: false, locale: 'en' })).status, 200);
    const s = (await call('ua', null, { action: 'settings.get' })).settings;
    assert.deepEqual([s.chatBlur, s.locale, s.showExplicit], [false, 'en', false]); // explicit can only be switched on from the website
    assert.equal((await call('ua', null, { action: 'settings.update', opId: op(), showExplicit: true })).status, 400);
    const n = (await call('ua', null, { action: 'notifications.settings.get' })).settings;
    assert.deepEqual([n.mode, n.quiet.from], ['safe', '23:00']);
    assert.equal((await call('ua', null, { action: 'notifications.settings.update', opId: op(), settings: { ...n, quiet: { ...n.quiet, from: '23:15' } } })).status, 400);
    assert.equal((await call('ua', null, { action: 'notifications.settings.update', opId: op(), settings: { ...n, mode: 'normal' } })).status, 200);
    assert.equal((await call('ua', null, { action: 'notifications.settings.get' })).settings.mode, 'normal');
  } finally { await pg.close(); }
});

test('interests: scale or mark, direction rules, visibility for others, owner-only history with a lossless cursor', async () => {
  const { pg, db, call, person, coupleOf } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
    const set = (topicId, extra) => call('ua', a, { action: 'interests.set', opId: op(), topicId, vis: 'public', ...extra });
    assert.equal((await set('bondage', { value: 8, dir: ['get'] })).status, 200);
    assert.equal((await set('shibari', { value: 6, vis: 'only' })).status, 200);
    assert.equal((await set('filming', { mark: 'hard' })).status, 200);
    assert.equal((await set('substances', { value: 3, dir: ['give'] })).fields?.[0], 'dir'); // no direction for limits
    assert.equal((await set('bondage', { value: 5, mark: 'hard' })).status, 400);
    assert.equal((await set('blood', { value: 5 })).fields?.[0], 'topicId'); // admin-hidden topic
    assert.equal((await set('bondage', { value: 9, dir: ['get', 'watch'], vis: 'granted' })).status, 200);

    assert.equal((await call('ua', a, { action: 'interests.list', profileId: a })).items.length, 3);
    assert.deepEqual((await call('ub', b, { action: 'interests.list', profileId: a })).items, [{ topicId: 'filming', mark: 'hard' }]);

    assert.equal((await call('ua', a, { action: 'interests.remove', opId: op(), topicId: 'shibari' })).removed, true);
    // Page through the whole history one row at a time: every row comes exactly once.
    const all = [];
    let cursor;
    do {
      const page = await call('ua', a, { action: 'interests.history', limit: 1, ...(cursor ? { cursor } : {}) });
      all.push(...page.items);
      cursor = page.next;
    } while (cursor);
    const [{ n }] = await db.query('select count(*)::int n from feture.interest_history where profile_id = $1', [a]);
    assert.equal(all.length, n);
    assert.equal(new Set(all.map(h => h.id)).size, n);
    assert.ok(all.some(h => h.topicId === 'bondage' && h.kind === 'vis' && h.to.vis === 'granted'));
    assert.equal((await call('ua', a, { action: 'interests.history', cursor: 'not-a-cursor' })).status, 400);
    assert.equal((await call('ub', a, { action: 'interests.history' })).status, 403);

    // As a couple: applies at once while the partner does not ask to approve; waits for the partner once they do.
    const pc = await coupleOf([a, b]);
    const direct = await call('ua', pc, { action: 'interests.set', opId: op(), topicId: 'bondage', value: 5, vis: 'public' });
    assert.deepEqual([direct.status, direct.value], [200, 5]);
    const [{ id: kiraAccount }] = await db.query('select id from feture.account where person_profile_id = $1', [b]);
    await db.query('update feture.profile_member set approves_partner = true where profile_id = $1 and account_id = $2', [pc, kiraAccount]);
    const waits = await call('ua', pc, { action: 'interests.set', opId: op(), topicId: 'shibari', value: 7, vis: 'public' });
    assert.ok(waits.pending?.approvalId);
    assert.equal((await call('ub', pc, { action: 'interests.list', profileId: pc })).items.length, 1);
    const ok = await call('ub', pc, { action: 'decide.approval', opId: op(), approvalId: waits.pending.approvalId, choice: 'approve' });
    assert.equal(ok.applied, true);
    assert.equal((await call('ub', pc, { action: 'interests.list', profileId: pc })).items.length, 2);
    // Narrowing (removing) never waits.
    assert.equal((await call('ua', pc, { action: 'interests.remove', opId: op(), topicId: 'shibari' })).removed, true);
    // Person-only fields are refused for a couple; a widening setting waits, a narrowing one does not.
    assert.deepEqual((await call('ua', pc, { action: 'profile.update', opId: op(), rev: 1, genders: ['woman'] })).fields, ['genders']);
    assert.ok((await call('ua', pc, { action: 'profile.update', opId: op(), rev: 1, bio: 'Мы' })).pending?.approvalId);
    assert.equal((await call('ua', pc, { action: 'profile.setVisibility', opId: op(), setting: 'discoverMode', value: 'off' })).value, 'off');
    assert.ok((await call('ua', pc, { action: 'profile.setVisibility', opId: op(), setting: 'discoverMode', value: 'visible' })).pending?.approvalId);
  } finally { await pg.close(); }
});
