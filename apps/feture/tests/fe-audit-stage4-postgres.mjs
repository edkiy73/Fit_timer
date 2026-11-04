// Audit 04.11.2026, stage 4 on PGlite as feture_api: sanctions — a restriction names what it limits (presets), access
// is frozen not revoked, a suspended account sees its decision and appeals it, a CSAM suspension never runs out, deleting
// an account under a sanction carries it to the next account of the login, a suspended author's replies are hidden.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { staff } from '../server/commands/staff.mjs';
import { moderation } from '../server/commands/moderation.mjs';
import { communities } from '../server/commands/communities.mjs';
import { access } from '../server/commands/access.mjs';
import { accounts } from '../server/commands/account.mjs';
import { support } from '../server/commands/support.mjs';
import { grantedScopes } from '../server/access.mjs';
import { RESTRICT_PRESETS } from '../contracts/_restrict.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...posts, ...staff, ...moderation, ...communities, ...access, ...accounts, ...support } });
const draft = (body) => ({ type: 'post', body, audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [] });
const COMMUNITY = { privacy: 'open', description: 'Встречи и разговоры о верёвке для новичков', topics: ['shibari'], rules: ['Уважать границы'], plate: 'rose' };

async function world() {
  const env = await setup();
  const { db, call, person } = env;
  const boss = await person('uo', 'Boss');
  await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
  const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
  const restrict = (/** @type {string} */ profileId, /** @type {any} */ extra = {}) =>
    call('uo', null, { action: 'staff.restrict', opId: op(), profileId, on: true, rule: 'spam', ...extra });
  const lift = (/** @type {string} */ profileId) => call('uo', null, { action: 'staff.restrict', opId: op(), profileId, on: false, rule: 'spam' });
  return { ...env, a, b, restrict, lift };
}

test('items 6, 37: a preset limits exactly its points; «Мягкое» lets a community be made, «Стандартное» not; the refusal says until when', async () => {
  const { pg, call, a, b, restrict, lift } = await world();
  try {
    assert.deepEqual((await restrict(a, { scope: RESTRICT_PRESETS.soft, days: 7 })).scope, RESTRICT_PRESETS.soft);
    const made = await call('ua', a, { action: 'community.create', opId: op(), name: 'Клуб', ...COMMUNITY });
    assert.equal(made.status, 200, JSON.stringify(made));
    assert.equal((await call('ua', a, { action: 'follow.set', opId: op(), profileId: b, on: true })).status, 200);
    const refused = await call('ua', a, { action: 'access.request', opId: op(), profileId: b, scopes: ['info'] });
    assert.deepEqual([refused.status, refused.rule, typeof refused.until], [403, 'restricted', 'string']);
    await lift(a);
    await restrict(a); // none given: «Стандартное»
    assert.equal((await call('ua', a, { action: 'community.create', opId: op(), name: 'Другой клуб', ...COMMUNITY })).rule, 'restricted');
    assert.equal((await call('ua', a, { action: 'follow.set', opId: op(), profileId: b, on: false })).status, 200); // undoing is always possible
    assert.equal((await call('ua', a, { action: 'follow.set', opId: op(), profileId: b, on: true })).rule, 'restricted');
    // Posts stay possible under «Стандартное», not under «Строгое».
    const d = await call('ua', a, { action: 'post.saveDraft', opId: op(), post: draft('Обычный пост для проверки') });
    const pubd = await call('ua', a, { action: 'post.publish', opId: op(), postId: d.id });
    assert.equal(pubd.status, 200, JSON.stringify([d, pubd]));
    await lift(a);
    await restrict(a, { scope: RESTRICT_PRESETS.strict });
    const d2 = await call('ua', a, { action: 'post.saveDraft', opId: op(), post: draft('Ещё один пост для проверки') });
    assert.equal((await call('ua', a, { action: 'post.publish', opId: op(), postId: d2.id })).rule, 'restricted');
    // The app learns what is limited (the notice on «Лента» and «Я»).
    assert.deepEqual((await call('ua', null, { action: 'session.bootstrap' })).restriction.scope, RESTRICT_PRESETS.strict);
  } finally { await pg.close(); }
});

test('item 27: access given to a restricted person is frozen, not revoked: back without a new grant once lifted', async () => {
  const { pg, db, a, b, restrict, lift } = await world();
  try {
    const [{ id: accA }] = await db.query('select id from feture.account where person_profile_id = $1', [a]);
    const [{ id: accB }] = await db.query('select id from feture.account where person_profile_id = $1', [b]);
    await db.query(`update feture.profile_settings set private_on = true where profile_id = $1`, [b]);
    await db.query(`insert into feture.access_grant (owner_profile_id, viewer_profile_id, viewer_account_ids, scopes, granted_by) values ($1, $2, $3, '{info}', $4)`, [b, a, [accA], accB]);
    const viewer = /** @type {any} */ ({ profileId: a, accountId: accA });
    const seen = () => db.tx((/** @type {any} */ q) => grantedScopes(q, b, viewer));
    assert.deepEqual(await seen(), ['info']);
    await restrict(a);
    assert.deepEqual(await seen(), []);
    assert.equal((await db.query('select count(*)::int n from feture.access_grant where revoked_at is null'))[0].n, 1);
    await lift(a);
    assert.deepEqual(await seen(), ['info']);
  } finally { await pg.close(); }
});

test('item 2: a suspended account sees its decision and appeals it; nothing else passes; a granted appeal lifts it', async () => {
  const { pg, db, call, person, a } = await world();
  try {
    await person('ul', 'Lena');
    await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Lena', role: 'lead', grant: true });
    await call('uo', null, { action: 'staff.sanction', opId: op(), profileId: a, decision: 'suspend', rule: 'threats', days: 7 });
    assert.equal((await call('ua', a, { action: 'profile.settings' })).error, 'account_suspended');
    assert.equal((await call('ua', null, { action: 'session.bootstrap' })).error, 'account_suspended');
    const s = await call('ua', null, { action: 'account.suspension' });
    assert.deepEqual([s.suspended, s.rule, typeof s.until, s.appeal], [true, 'threats', 'string', 'available']);
    assert.equal((await call('ua', null, { action: 'support.create', opId: op(), topic: 'account', body: 'Прошу проверить блокировку, это ошибка.' })).status, 200);
    const ap = await call('ua', null, { action: 'appeal.suspension', opId: op(), body: 'Это ошибка, я никому не угрожал.' });
    assert.equal(ap.state, 'open', JSON.stringify(ap));
    assert.equal((await call('ua', null, { action: 'account.suspension' })).appeal, 'open');
    assert.equal((await call('ul', null, { action: 'staff.appealDecide', opId: op(), appealId: ap.id, grant: true, note: '' })).status, 200);
    assert.equal((await db.query('select state from feture.account where person_profile_id = $1', [a]))[0].state, 'active');
    assert.equal((await call('ua', a, { action: 'profile.settings' })).status, 200);
  } finally { await pg.close(); }
});

test('item 8, В1: a CSAM match makes a timed suspension permanent, stops the couple, shows «нарушение закона» without an appeal', async () => {
  const { pg, db, call, a, b, coupleOf } = await world();
  try {
    const pair = await coupleOf([a, b]);
    await call('uo', null, { action: 'staff.sanction', opId: op(), profileId: a, decision: 'suspend', rule: 'spam', days: 1 });
    const [{ id: acc }] = await db.query('select id from feture.account where person_profile_id = $1', [a]);
    const [{ id: asset }] = await db.query(`insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state)
      values ($1, $2, 'image', 'post', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'blocked') returning id`, [a, acc]);
    const { mediaHandlers } = await import('../server/jobs.mjs');
    await mediaHandlers(db, { scan: null })['safety.csamMatch']({ payload: { assetId: asset } });
    const [p] = await db.query('select suspended_until from feture.profile where id = $1', [a]);
    assert.equal(p.suspended_until, null);
    assert.equal((await db.query('select state from feture.profile where id = $1', [pair]))[0].state, 'suspended');
    const s = await call('ua', null, { action: 'account.suspension' });
    assert.deepEqual([s.rule, s.until, s.appeal], ['law', null, 'none']);
    assert.equal((await call('ua', null, { action: 'appeal.suspension', opId: op(), body: 'Прошу проверить ещё раз.' })).rule, 'nothing_to_appeal');
  } finally { await pg.close(); }
});

test('item 28: deleting under a restriction is possible; the next account of the login gets it until the same end', async () => {
  const { pg, db, call, a, b, restrict } = await world();
  try {
    await call('ub', b, { action: 'report.create', opId: op(), targetType: 'profile', targetId: a, reason: 'spam', details: 'Подробности для модератора' });
    await restrict(a, { days: 7 });
    const [{ restricted_until: until }] = await db.query('select restricted_until from feture.profile where id = $1', [a]);
    assert.equal((await call('ua', null, { action: 'account.delete', opId: op(), confirmHandle: 'Alex' })).deleted, true);
    assert.deepEqual((await db.query(`select resolution from feture.report where target_id = $1`, [a])).map(r => r.resolution), ['unavailable']);
    // The same login signs up again (a new Core generation).
    const r = await call('ua', null, { action: 'account.create', opId: op(), handle: 'Alex2', birthDate: '1990-01-01', locale: 'ru',
      documents: (await import('./fe-helpers.mjs')).ACCEPT, newsOptIn: false }, { 'x-test-gen': 'g2' });
    assert.equal(r.status, 200, JSON.stringify(r));
    const [n] = await db.query('select restricted_at, restricted_until from feture.profile where id = $1', [r.profileId]);
    assert.ok(n.restricted_at);
    assert.equal(new Date(n.restricted_until).getTime(), new Date(until).getTime());
  } finally { await pg.close(); }
});

test('item 5: a suspended author’s reply is hidden (a stub above answers), their likes do not count; all back once lifted', async () => {
  const { pg, call, a, b } = await world();
  try {
    const d = await call('ub', b, { action: 'post.saveDraft', opId: op(), post: draft('Пост Киры') });
    await call('ub', b, { action: 'post.publish', opId: op(), postId: d.id });
    const r1 = (await call('ua', a, { action: 'reply.create', opId: op(), postId: d.id, body: 'Ответ Алекса без ответов' })).id;
    const r2 = (await call('ua', a, { action: 'reply.create', opId: op(), postId: d.id, body: 'Ответ Алекса с ответом' })).id;
    await call('ub', b, { action: 'reply.create', opId: op(), postId: d.id, parentId: r2, body: 'Ответ Киры' });
    await call('ua', a, { action: 'reaction.set', opId: op(), targetType: 'post', targetId: d.id, on: true });
    const likes = async () => (await call('ub', b, { action: 'post.get', postId: d.id })).post.likes;
    assert.equal(await likes(), 1);
    await call('uo', null, { action: 'staff.sanction', opId: op(), profileId: a, decision: 'suspend', rule: 'spam', days: 7 });
    let items = (await call('ub', b, { action: 'post.replies', postId: d.id })).items;
    assert.ok(!items.some((/** @type {any} */ x) => x.id === r1));
    const stub = items.find((/** @type {any} */ x) => x.id === r2);
    assert.deepEqual([stub.unavailable, stub.body, stub.author], [true, undefined, undefined]);
    assert.equal(await likes(), 0);
    await call('uo', null, { action: 'staff.sanction', opId: op(), profileId: a, decision: 'lift', rule: 'spam' });
    items = (await call('ub', b, { action: 'post.replies', postId: d.id })).items;
    assert.ok(items.some((/** @type {any} */ x) => x.id === r1 && x.body));
    assert.equal(await likes(), 1);
  } finally { await pg.close(); }
});

test('item 9: a rejected file can be appealed; granted, it goes back to review; it is not purged while the appeal waits', async () => {
  const { pg, db, call, person, a } = await world();
  try {
    await person('ul', 'Lena');
    await call('uo', null, { action: 'staff.grant', opId: op(), handle: 'Lena', role: 'lead', grant: true });
    const [{ id: acc }] = await db.query('select id from feture.account where person_profile_id = $1', [a]);
    const [{ id: asset }] = await db.query(`insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, copies_at, reject_reason)
      values ($1, $2, 'image', 'post', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'needs_review', now(), 'scanner_not_configured') returning id`, [a, acc]);
    await db.query(`insert into feture.media_attachment (asset_id, target_type, target_id) values ($1, 'avatar', $2)`, [asset, a]);
    await call('uo', null, { action: 'staff.mediaDecide', opId: op(), assetId: asset, decision: 'reject', reason: 'spam' });
    const ap = await call('ua', a, { action: 'appeal.create', opId: op(), targetType: 'media', targetId: asset, body: 'Это обычное фото, прошу проверить ещё раз.' });
    assert.equal(ap.state, 'open', JSON.stringify(ap));
    const { mediaHandlers } = await import('../server/jobs.mjs');
    await mediaHandlers(db, { scan: null })['media.purge']({ payload: { assetId: asset }, profile_id: a });
    assert.equal((await db.query('select state from feture.media_asset where id = $1', [asset]))[0].state, 'rejected');
    assert.equal((await call('ul', null, { action: 'staff.appealDecide', opId: op(), appealId: ap.id, grant: true, note: '' })).status, 200);
    assert.equal((await db.query('select state from feture.media_asset where id = $1', [asset]))[0].state, 'needs_review');
  } finally { await pg.close(); }
});
