// Slice C «Я» on PGlite as the restricted feture_api role: registration, onboarding, profile views,
// settings and interests through the real /api/fe handler.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { fromPglite } from '../server/db.mjs';
import { createFeHandler } from '../server/handler.mjs';
import { platform } from '../server/commands/platform.mjs';
import { me, ageOn } from '../server/commands/me.mjs';
import { tokenDelivery } from '../server/media/delivery.mjs';

const PEPPER = 'p'.repeat(40);
const mig = name => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
const TERMS = { id: '018f0000-0000-4000-8000-0000000000d1', hash: 'a'.repeat(64) };
const PRIVACY = { id: '018f0000-0000-4000-8000-0000000000d2', hash: 'b'.repeat(64) };
let ops = 0;
const op = () => `018f0000-0000-7000-8000-${String(++ops).padStart(12, '0')}`;
const yearsAgo = (n, days = 0) => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - n); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

async function setup() {
  const pg = new PGlite();
  await pg.exec('create role anon; create role authenticated;');
  // Stand-in for the admin-published legal documents (public.feture_document_current in production).
  await pg.exec(`create table public.feture_document_current (id uuid, document_key text, locale text, content_hash text, requires_accept boolean);
    insert into public.feture_document_current values
      ('${TERMS.id}', 'terms', 'ru', '${TERMS.hash}', true), ('${PRIVACY.id}', 'privacy', 'ru', '${PRIVACY.hash}', true),
      ('018f0000-0000-4000-8000-0000000000d3', 'cookies', 'ru', '${'c'.repeat(64)}', false);`);
  for (const f of ['20261027120000_fe_platform.sql', '20261027120100_fe_media_bucket.sql', '20261027125900_fe_me.sql', '20261027130000_fe_catalog.sql']) await pg.exec(mig(f));
  await pg.exec('set role feture_api');
  const db = fromPglite(pg);
  const handler = createFeHandler({
    db, pepper: PEPPER, commands: { ...platform, ...me },
    cfg: { media: { storage: null, delivery: tokenDelivery('s'.repeat(40), 'https://media.test') } },
    authenticate: async req => ({ accountHash: String(req.headers['x-test-user']), accountGeneration: 'g1' }),
    quota: async () => true, cors: () => false, log: () => {},
  });
  const call = async (user, body, profile) => {
    const res = { statusCode: 0, setHeader() {}, end(s) { this.body = JSON.parse(s); } };
    await handler({ method: 'POST', headers: { 'x-test-user': user, ...(profile ? { 'x-fe-profile': profile } : {}) }, body }, res);
    return { status: res.statusCode, ...res.body };
  };
  return { pg, db, call };
}
const docs = [{ id: TERMS.id, contentHash: TERMS.hash }, { id: PRIVACY.id, contentHash: PRIVACY.hash }];
const register = (call, user, handle, extra = {}) =>
  call(user, { action: 'account.create', opId: op(), handle, birthDate: yearsAgo(30), locale: 'ru', documents: docs, newsOptIn: false, ...extra });

test('age is full years on the UTC date', () => {
  assert.equal(ageOn('2000-10-28', new Date('2026-10-27T12:00:00Z')), 25);
  assert.equal(ageOn('2000-10-27', new Date('2026-10-27T12:00:00Z')), 26);
  assert.equal(ageOn('2008-02-29', new Date('2026-02-28T12:00:00Z')), 17);
});

test('registration: catalog, nickname rules, under-18 keeps nothing, documents required, one person profile', async () => {
  const { pg, db, call } = await setup();
  try {
    const cat = await call('u1', { action: 'catalog.get' });
    assert.equal(cat.status, 200);
    assert.ok(cat.topics.length >= 70 && !cat.topics.some(t => ['blood', 'knife', 'needles', 'cnc'].includes(t.id))); // admin-hidden
    assert.ok(cat.options.some(o => o.kind === 'gender' && o.code === 'woman'));

    assert.deepEqual(await call('u1', { action: 'nick.check', handle: 'Admin' }).then(r => [r.available, r.reason]), [false, 'reserved']);
    assert.deepEqual(await call('u1', { action: 'nick.check', handle: 'a..b' }).then(r => [r.available, r.reason]), [false, 'format']);
    assert.equal((await call('u1', { action: 'nick.check', handle: 'Alex' })).available, true);

    // Under 18: refused, nothing about the person is stored; a second attempt with an older date is not enough.
    const young = await register(call, 'u1', 'Alex', { birthDate: yearsAgo(17, 30) });
    assert.deepEqual([young.status, young.ok, young.rule], [200, false, 'under_18']);
    const [acc] = await db.query('select birth_date, person_profile_id from feture.account');
    assert.deepEqual([acc.birth_date, acc.person_profile_id], [null, null]);
    assert.equal((await db.query('select count(*)::int n from feture.u18_event'))[0].n, 1);
    const retry = await register(call, 'u1', 'Alex');
    assert.deepEqual([retry.status, retry.rule], [422, 'age_check_required']);

    const noDocs = await register(call, 'u2', 'Bobby', { documents: [docs[0]] });
    assert.deepEqual([noDocs.status, noDocs.rule, noDocs.documents], [422, 'documents_required', ['privacy']]);
    const stale = await register(call, 'u2', 'Bobby', { documents: [docs[0], { id: PRIVACY.id, contentHash: 'f'.repeat(64) }] });
    assert.equal(stale.rule, 'documents_required'); // accepted an older text than the one in force

    const ok = await register(call, 'u2', 'Bobby');
    assert.deepEqual([ok.status, ok.ok], [200, true]);
    assert.equal((await db.query('select count(*)::int n from feture.consent'))[0].n, 2); // optional cookies doc not forced
    const again = await register(call, 'u2', 'Bobby2');
    assert.deepEqual([again.status, again.state], [409, 'registered']);
    const taken = await register(call, 'u3', 'BOBBY');
    assert.deepEqual([taken.status, taken.field], [409, 'handle']);

    const [s] = await db.query('select * from feture.profile_settings where profile_id = $1', [ok.profileId]);
    assert.deepEqual([s.discover_mode, s.private_on, s.requests_from], ['visible', true, 'all']); // AUTH-019 defaults
    const [d] = await db.query('select details_vis from feture.profile_details where profile_id = $1', [ok.profileId]);
    assert.equal(d.details_vis, 'only'); // AUTH-016: «О тебе» starts private
  } finally { await pg.close(); }
});

test('onboarding and profile views: own vs others, details visibility, age, photo needed for Discover', async () => {
  const { pg, call } = await setup();
  try {
    const a = (await register(call, 'ua', 'Alex')).profileId;
    const b = (await register(call, 'ub', 'Kira')).profileId;
    const bad = await call('ua', { action: 'onboarding.complete', opId: op(), detailsVis: 'all', genders: ['robot'], orients: [], roles: [], formats: [], seeks: [], status: null, discover: 'visible' }, a);
    assert.deepEqual([bad.status, bad.fields], [400, ['genders']]);
    const done = await call('ua', { action: 'onboarding.complete', opId: op(), detailsVis: 'only', genders: ['woman'], orients: ['bi'], roles: ['switch'], formats: ['open'], seeks: ['chat'], status: 'single', discover: 'visible' }, a);
    assert.deepEqual([done.status, done.discoverVisible, done.photoNeeded], [200, false, true]);

    const own = (await call('ua', { action: 'profile.get', profileId: a }, a)).profile;
    assert.deepEqual([own.own, own.handle, own.age, own.details.genders, own.detailsVis], [true, 'Alex', 30, ['woman'], 'only']);
    const seen = (await call('ub', { action: 'profile.get', profileId: a }, b)).profile;
    assert.deepEqual([seen.own, seen.age, seen.details, seen.rev], [false, 30, {}, undefined]); // details «Только ты»
    assert.equal((await call('ub', { action: 'profile.get', profileId: a }, a)).status, 403); // not my profile to act as

    const upd = await call('ua', { action: 'profile.update', opId: op(), rev: own.rev, bio: '  Пишу медленно.́  ', detailsVis: 'all', showAge: false }, a);
    assert.equal(upd.status, 200);
    const stale = await call('ua', { action: 'profile.update', opId: op(), rev: own.rev, bio: 'x' }, a);
    assert.deepEqual([stale.status, stale.rev], [409, upd.rev]);
    const after = (await call('ub', { action: 'profile.get', profileId: a }, b)).profile;
    assert.deepEqual([after.bio, after.age, after.details.genders, after.details.status], ['Пишу медленно.́'.normalize('NFC'), null, ['woman'], 'single']);
    const bidi = await call('ua', { action: 'profile.update', opId: op(), rev: upd.rev, bio: 'evil‮text' }, a);
    assert.deepEqual([bidi.status, bidi.fields], [400, ['bio']]);

    // Nickname: case-only change is free, a new nickname at most once per 30 days.
    const r1 = await call('ua', { action: 'profile.update', opId: op(), rev: upd.rev, handle: 'alex' }, a);
    assert.equal(r1.status, 200);
    const r2 = await call('ua', { action: 'profile.update', opId: op(), rev: r1.rev, handle: 'alex_new' }, a);
    assert.equal(r2.status, 200);
    const r3 = await call('ua', { action: 'profile.update', opId: op(), rev: r2.rev, handle: 'alex_again' }, a);
    assert.deepEqual([r3.status, r3.rule], [422, 'handle_change_cooldown']);
    const r4 = await call('ub', { action: 'profile.update', opId: op(), rev: 1, handle: 'ALEX_NEW' }, b);
    assert.deepEqual([r4.status, r4.field], [409, 'handle']);

    // Own submitted city is usable at once and others do not see it until approved.
    const place = await call('ua', { action: 'place.submit', opId: op(), country: 'DE', name: 'Leipzig' });
    const withCity = await call('ua', { action: 'profile.update', opId: op(), rev: r2.rev, cityId: place.placeId }, a);
    assert.equal(withCity.status, 200);
    assert.deepEqual((await call('ua', { action: 'profile.get', profileId: a }, a)).profile.city.pending, true);
    assert.equal((await call('ub', { action: 'profile.get', profileId: a }, b)).profile.city, null);
    assert.equal((await call('ub', { action: 'profile.update', opId: op(), rev: 1, cityId: place.placeId }, b)).status, 400);
  } finally { await pg.close(); }
});

test('settings and visibility: per profile, per account, notification defaults and validation', async () => {
  const { pg, call } = await setup();
  try {
    const a = (await register(call, 'ua', 'Alex')).profileId;
    assert.equal((await call('ua', { action: 'profile.settings' }, a)).settings.discoverMode, 'visible');
    assert.equal((await call('ua', { action: 'profile.setVisibility', opId: op(), setting: 'discoverMode', value: 'hidden' }, a)).status, 200);
    assert.equal((await call('ua', { action: 'profile.setVisibility', opId: op(), setting: 'discoverMode', value: 'loud' }, a)).status, 400);
    assert.equal((await call('ua', { action: 'profile.settings' }, a)).settings.discoverMode, 'hidden');
    assert.equal((await call('ua', { action: 'settings.update', opId: op(), chatBlur: false, locale: 'en' })).status, 200);
    const s = (await call('ua', { action: 'settings.get' })).settings;
    assert.deepEqual([s.chatBlur, s.locale, s.showExplicit], [false, 'en', false]); // explicit can only be switched on from the website
    assert.equal((await call('ua', { action: 'settings.update', opId: op(), showExplicit: true })).status, 400);
    const n = (await call('ua', { action: 'notifications.settings.get' })).settings;
    assert.deepEqual([n.mode, n.quiet.from], ['safe', '23:00']);
    assert.equal((await call('ua', { action: 'notifications.settings.update', opId: op(), settings: { ...n, quiet: { ...n.quiet, from: '23:15' } } })).status, 400);
    assert.equal((await call('ua', { action: 'notifications.settings.update', opId: op(), settings: { ...n, mode: 'normal' } })).status, 200);
    assert.equal((await call('ua', { action: 'notifications.settings.get' })).settings.mode, 'normal');
  } finally { await pg.close(); }
});

test('interests: scale or mark, direction rules, visibility for others, history only for the owner', async () => {
  const { pg, db, call } = await setup();
  try {
    const a = (await register(call, 'ua', 'Alex')).profileId;
    const b = (await register(call, 'ub', 'Kira')).profileId;
    const set = (topicId, extra) => call('ua', { action: 'interests.set', opId: op(), topicId, vis: 'public', ...extra }, a);
    assert.equal((await set('bondage', { value: 8, dir: ['get'] })).status, 200);
    assert.equal((await set('shibari', { value: 6, vis: 'only' })).status, 200);
    assert.equal((await set('filming', { mark: 'hard' })).status, 200);
    assert.equal((await set('substances', { value: 3, dir: ['give'] })).fields?.[0], 'dir'); // no direction for limits
    assert.equal((await set('bondage', { value: 5, mark: 'hard' })).status, 400);
    assert.equal((await set('blood', { value: 5 })).fields?.[0], 'topicId'); // admin-hidden topic
    assert.equal((await set('bondage', { value: 9, dir: ['get', 'watch'], vis: 'granted' })).status, 200);

    const mine = (await call('ua', { action: 'interests.list', profileId: a }, a)).items;
    assert.equal(mine.length, 3);
    const theirs = (await call('ub', { action: 'interests.list', profileId: a }, b)).items;
    assert.deepEqual(theirs, [{ topicId: 'filming', mark: 'hard' }]); // granted/only stay hidden; a public limit shows only that it is one

    assert.equal((await call('ua', { action: 'interests.remove', opId: op(), topicId: 'shibari' }, a)).removed, true);
    const hist = (await call('ua', { action: 'interests.history' }, a)).items;
    assert.ok(hist.some(h => h.topicId === 'bondage' && h.kind === 'vis' && h.to.vis === 'granted'));
    assert.ok(hist.some(h => h.topicId === 'shibari' && h.to === null));
    assert.equal((await call('ub', { action: 'interests.history' }, a)).status, 403);

    // Couple profiles are read-only here until slice E brings partner approvals.
    const [ka] = await db.query(`select id from feture.account where person_profile_id = $1`, [a]);
    const [kb] = await db.query(`select id from feture.account where person_profile_id = $1`, [b]);
    const [{ id: pc }] = await db.query(`insert into feture.profile (kind, name) values ('couple', 'Alex и Kira') returning id`);
    for (const acc of [ka.id, kb.id]) await db.query(`insert into feture.profile_member (profile_id, profile_kind, account_id, joined_at) values ($1, 'couple', $2, now())`, [pc, acc]);
    const coupleWrite = await call('ua', { action: 'interests.set', opId: op(), topicId: 'bondage', value: 5, vis: 'public' }, pc);
    assert.deepEqual([coupleWrite.status, coupleWrite.rule], [422, 'couple_changes_not_available']);
  } finally { await pg.close(); }
});
