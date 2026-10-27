// Slice C2 on PGlite as feture_api: private part, access requests and grants, «Я/Мы» separation, couple approvals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { access } from '../server/commands/access.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const setup = () => baseSetup({ commands: { ...platform, ...me, ...access } });

test('requests and grants: age check, available scopes, nothing before access, «Описание» opens details and interests, terms', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
    const unverified = await person('uc', 'Noa', { verified: false });
    assert.equal((await call('uc', unverified, { action: 'access.request', opId: op(), profileId: a, scopes: ['info'] })).rule, 'age_check_required');
    assert.equal((await call('ub', b, { action: 'access.request', opId: op(), profileId: a, scopes: ['info'] })).rule, 'scope_not_available'); // empty part

    await call('ua', a, { action: 'private.setText', opId: op(), text: 'Перед встречей — звонок.' });
    await call('ua', a, { action: 'interests.set', opId: op(), topicId: 'bondage', value: 8, vis: 'granted' });
    await call('ua', a, { action: 'profile.update', opId: op(), rev: 1, detailsVis: 'granted', genders: ['woman'] });

    const veil = await call('ub', b, { action: 'private.get', profileId: a });
    assert.deepEqual([veil.exists, veil.available, veil.canRequest, veil.text], [true, ['info'], true, undefined]); // no real data before access
    assert.equal((await call('ub', b, { action: 'access.request', opId: op(), profileId: a, scopes: ['photos'] })).rule, 'scope_not_available');
    const req = await call('ub', b, { action: 'access.request', opId: op(), profileId: a, scopes: ['info'] });
    assert.equal(req.status, 200);
    assert.equal((await call('ub', b, { action: 'access.request', opId: op(), profileId: a, scopes: ['info'] })).rule, 'pending');
    assert.equal((await call('ub', b, { action: 'interests.list', profileId: a })).items.length, 0);

    const incoming = await call('ua', a, { action: 'access.lists', tab: 'incoming' });
    assert.deepEqual(incoming.items.map(i => i.profile.handle), ['Kira']);
    assert.equal((await call('ub', b, { action: 'access.grant', opId: op(), requestId: req.id, scopes: ['info'], term: '7d' })).status, 404); // only the owner
    const granted = await call('ua', a, { action: 'access.grant', opId: op(), requestId: req.id, scopes: ['info'], term: '1d' });
    assert.deepEqual([granted.status, granted.state], [200, 'granted']);

    const open = await call('ub', b, { action: 'private.get', profileId: a });
    assert.deepEqual([open.text, open.scopes], ['Перед встречей — звонок.', ['info']]);
    assert.ok(new Date(open.until) > new Date());
    assert.deepEqual((await call('ub', b, { action: 'interests.list', profileId: a })).items.map(i => i.topicId), ['bondage']);
    assert.deepEqual((await call('ub', b, { action: 'profile.get', profileId: a })).profile.details.genders, ['woman']);
    // Expired: nothing is open any more.
    await db.query(`update feture.access_grant set until = now() - interval '1 second'`);
    assert.equal((await call('ub', b, { action: 'private.get', profileId: a })).text, undefined);
    assert.deepEqual((await call('ub', b, { action: 'profile.get', profileId: a })).profile.details, {});
  } finally { await pg.close(); }
});

test('decline cooldown, daily budget across «Я» and «Мы», related profiles, requests closed by setting', async () => {
  const { pg, db, call, person, coupleOf } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    await call('ua', a, { action: 'private.setText', opId: op(), text: 'Текст' });
    const r1 = await call('ub', b, { action: 'access.request', opId: op(), profileId: a, scopes: ['info'] });
    assert.equal((await call('ua', a, { action: 'access.decline', opId: op(), requestId: r1.id })).reaskDays, 30);
    // Inside the undo window the decline is not visible to the requester yet.
    assert.equal((await call('ub', b, { action: 'access.request', opId: op(), profileId: a, scopes: ['info'] })).rule, 'pending');
    await db.query(`update feture.access_request set decided_at = decided_at - interval '11 seconds' where id = $1`, [r1.id]);
    assert.equal((await call('ub', b, { action: 'access.request', opId: op(), profileId: a, scopes: ['info'] })).rule, 'cooldown');

    // My own couple is related: no requests between them.
    const pair = await coupleOf([b, c]);
    await call('uc', c, { action: 'private.setText', opId: op(), text: 'Мой текст' });
    assert.equal((await call('ub', pair, { action: 'access.request', opId: op(), profileId: c, scopes: ['info'] })).rule, 'related');

    // «Не принимать запросы».
    await call('ua', a, { action: 'profile.setVisibility', opId: op(), setting: 'requestsFrom', value: 'none' });
    await db.query(`update feture.access_request set decided_at = now() - interval '31 days'`);
    assert.equal((await call('ub', b, { action: 'access.request', opId: op(), profileId: a, scopes: ['info'] })).rule, 'not_accepting');

    // Ten requests a day per account, personal and couple together; cancelling does not refund.
    const owners = [];
    for (let i = 0; i < 11; i++) {
      const o = await person('owner' + i, 'owner' + i);
      await call('owner' + i, o, { action: 'private.setText', opId: op(), text: 'x' });
      owners.push(o);
    }
    for (let i = 0; i < 6; i++) assert.equal((await call('ub', b, { action: 'access.request', opId: op(), profileId: owners[i], scopes: ['info'] })).status, 200);
    const last = await call('ub', pair, { action: 'access.request', opId: op(), profileId: owners[6], scopes: ['info'] });
    assert.equal(last.status, 200);
    await call('ub', pair, { action: 'access.cancel', opId: op(), requestId: last.id });
    for (let i = 7; i < 9; i++) assert.equal((await call('ub', b, { action: 'access.request', opId: op(), profileId: owners[i], scopes: ['info'] })).status, 200);
    // 1 (declined) + 6 + 1 couple (cancelled) + 2 = 10 in the last day.
    const over = await call('ub', b, { action: 'access.request', opId: op(), profileId: owners[9], scopes: ['info'] });
    assert.deepEqual([over.status, over.rule], [429, 'request_quota']);
    assert.equal((await call('ub', b, { action: 'access.lists', tab: 'out' })).quotaLeft, 0);
  } finally { await pg.close(); }
});

test('grants are per acting profile and per account; narrow, revoke, switch off with counts', async () => {
  const { pg, call, person, coupleOf } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    await call('ua', a, { action: 'private.setText', opId: op(), text: 'Текст' });
    const pair = await coupleOf([b, c]);
    const r = await call('ub', b, { action: 'access.request', opId: op(), profileId: a, scopes: ['info'] });
    await call('ua', a, { action: 'access.grant', opId: op(), requestId: r.id, scopes: ['info'], term: 'none' });
    assert.equal((await call('ub', b, { action: 'private.get', profileId: a })).text, 'Текст');
    // Granted to Kira's personal profile: acting as the couple opens nothing, and the partner sees nothing.
    assert.equal((await call('ub', pair, { action: 'private.get', profileId: a })).text, undefined);
    assert.equal((await call('uc', c, { action: 'private.get', profileId: a })).text, undefined);

    assert.deepEqual((await call('ua', a, { action: 'access.narrow', opId: op(), profileId: b, scopes: [] })).scopes, []);
    assert.equal((await call('ub', b, { action: 'private.get', profileId: a })).text, undefined);
    assert.equal((await call('ua', a, { action: 'access.revoke', opId: op(), profileId: b })).status, 404);

    const r2 = await call('uc', c, { action: 'access.request', opId: op(), profileId: a, scopes: ['info'] });
    await call('ua', a, { action: 'access.grant', opId: op(), requestId: r2.id, scopes: ['info'], term: '7d' });
    await call('ub', pair, { action: 'access.request', opId: op(), profileId: a, scopes: ['info'] });
    const ask = await call('ua', a, { action: 'private.setOn', opId: op(), on: false });
    assert.deepEqual([ask.confirmRequired, ask.grants, ask.requests], [true, 1, 1]);
    const off = await call('ua', a, { action: 'private.setOn', opId: op(), on: false, confirm: true });
    assert.deepEqual([off.on, off.grants, off.requests], [false, 1, 1]);
    assert.equal((await call('uc', c, { action: 'private.get', profileId: a })).exists, false);
    assert.equal((await call('ub', b, { action: 'access.request', opId: op(), profileId: a, scopes: ['info'] })).rule, 'private_off');
  } finally { await pg.close(); }
});

test('a couple opens its private part only with both partners; closing everything is immediate and voids pending', async () => {
  const { pg, db, call, person, coupleOf } = await setup();
  try {
    const b = await person('ub', 'Kira'), c = await person('uc', 'Noa'), d = await person('ud', 'Mia');
    const pair = await coupleOf([b, c]);
    await db.query(`insert into feture.private_part (profile_id, text) values ($1, 'Текст пары')`, [pair]);
    const r = await call('ud', d, { action: 'access.request', opId: op(), profileId: pair, scopes: ['info'] });
    assert.equal(r.status, 200);
    // Partners do not ask to approve each other's changes, yet a grant still waits for the other partner.
    const g = await call('ub', pair, { action: 'access.grant', opId: op(), requestId: r.id, scopes: ['info'], term: '7d' });
    assert.ok(g.pending?.approvalId);
    assert.equal((await call('ud', d, { action: 'private.get', profileId: pair })).text, undefined);
    assert.equal((await call('ub', pair, { action: 'decide.approval', opId: op(), approvalId: g.pending.approvalId, choice: 'approve' })).status, 403);
    const ok = await call('uc', pair, { action: 'decide.approval', opId: op(), approvalId: g.pending.approvalId, choice: 'approve' });
    assert.deepEqual([ok.state, ok.applied], ['approved', true]);
    assert.equal((await call('ud', d, { action: 'private.get', profileId: pair })).text, 'Текст пары');

    // Another pending grant is voided when a partner closes everything.
    const e = await person('ue', 'Lev');
    const r2 = await call('ue', e, { action: 'access.request', opId: op(), profileId: pair, scopes: ['info'] });
    const g2 = await call('ub', pair, { action: 'access.grant', opId: op(), requestId: r2.id, scopes: ['info'], term: 'none' });
    const closed = await call('uc', pair, { action: 'access.revokeAll', opId: op(), confirm: true });
    assert.deepEqual([closed.grants, closed.requests], [1, 1]);
    const late = await call('uc', pair, { action: 'decide.approval', opId: op(), approvalId: g2.pending.approvalId, choice: 'approve' });
    assert.equal(late.status, 409); // already cancelled by the safety action
    assert.equal((await call('ud', d, { action: 'private.get', profileId: pair })).text, undefined);
    assert.equal((await call('ue', e, { action: 'access.request', opId: op(), profileId: pair, scopes: ['info'] })).rule, 'not_accepting');
  } finally { await pg.close(); }
});

test('private.setMedia: own live private uploads only, in order, within limits; viewers see only the granted kinds', async () => {
  const { pg, db, call, person, coupleOf } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    /** A media asset of a profile, as the scan pipeline would leave it. */
    const asset = async (/** @type {string} */ owner, { kind = 'image', purpose = 'private', state = 'approved' } = {}) => {
      const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [owner]);
      const [m] = await db.query(
        `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
         values ($1, $2, $3, $4, 'u/' || gen_random_uuid(), $5, 10, $6, $7, now()) returning id`,
        [owner, account_id, kind, purpose, kind === 'image' ? 'image/jpeg' : 'video/mp4', state, state === 'approved' ? 'safe' : 'unknown']);
      return m.id;
    };
    const set = (/** @type {string} */ u, /** @type {string} */ p, /** @type {string[]} */ assetIds) => call(u, p, { action: 'private.setMedia', opId: op(), assetIds });
    const [p1, p2, v1] = [await asset(a), await asset(a), await asset(a, { kind: 'video' })];
    assert.equal((await set('ua', a, [p2, v1, p1])).count, 3);
    const own = await call('ua', a, { action: 'private.get', profileId: a });
    assert.deepEqual([own.media.map((/** @type {any} */ m) => m.id), own.available], [[p2, v1, p1], ['photos', 'video']]);

    // Refused, nothing changed: someone else's file, a file for another place, a removed one, duplicates, over the limit.
    const fields = async (/** @type {string[]} */ ids) => (await set('ua', a, ids)).fields;
    assert.deepEqual(await fields([p1, await asset(b)]), ['assetIds']);
    assert.deepEqual(await fields([await asset(a, { purpose: 'post' })]), ['assetIds']);
    assert.deepEqual(await fields([await asset(a, { state: 'removed' })]), ['assetIds']);
    assert.deepEqual(await fields([p1, p1]), ['assetIds']);
    const many = [];
    for (let i = 0; i < 13; i++) many.push(await asset(a));
    assert.equal((await set('ua', a, many)).rule, 'private_media_limit');
    assert.equal((await call('ua', a, { action: 'private.get', profileId: a })).media.length, 3);
    // Someone else cannot fill Alex's private part, even with Alex's files; a couple has no media of its own here.
    assert.equal((await call('ub', a, { action: 'private.setMedia', opId: op(), assetIds: [p1] })).status, 403);
    assert.deepEqual((await set('ub', b, [p1])).fields, ['assetIds']);
    const pair = await coupleOf([b, c]);
    assert.equal((await set('ub', pair, [])).rule, 'couple_changes_not_available');

    // Before access a viewer gets no media at all; with «Фото» only the photos, never the video.
    const veil = await call('ub', b, { action: 'private.get', profileId: a });
    assert.deepEqual([veil.media, veil.available], [undefined, ['photos', 'video']]);
    const r = await call('ub', b, { action: 'access.request', opId: op(), profileId: a, scopes: ['photos'] });
    await call('ua', a, { action: 'access.grant', opId: op(), requestId: r.id, scopes: ['photos'], term: '1d' });
    const seen = await call('ub', b, { action: 'private.get', profileId: a });
    assert.deepEqual(seen.media.map((/** @type {any} */ m) => m.id), [p2, p1]);
    assert.ok(!JSON.stringify(seen).includes('u/')); // no storage paths
    assert.equal((await call('uc', c, { action: 'private.get', profileId: a })).media, undefined);
    // Clearing: nothing left to show or ask for.
    assert.equal((await set('ua', a, [])).count, 0);
    assert.deepEqual((await call('ub', b, { action: 'private.get', profileId: a })).media, []);
    assert.deepEqual((await call('ua', a, { action: 'private.get', profileId: a })).available, []);
  } finally { await pg.close(); }
});

/** A private photo of a profile as the scan pipeline leaves it, attached to its private part. */
async function privatePhoto(/** @type {any} */ db, /** @type {string} */ owner) {
  const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [owner]);
  const [m] = await db.query(
    `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
     values ($1, $2, 'image', 'private', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [owner, account_id]);
  await db.query(`insert into feture.media_attachment (asset_id, target_type, target_id, position) values ($1, 'private', $2, 0)`, [m.id, owner]);
  return m.id;
}

test('wave 4: request chosen parts, quota left and when it comes back, cancel keeps the attempt spent', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
    await call('ua', a, { action: 'private.setText', opId: op(), text: 'Текст' });
    await privatePhoto(db, a);
    const fresh = await call('ub', b, { action: 'access.quota' });
    assert.deepEqual([fresh.left, fresh.max, fresh.resetsAt], [10, 10, null]);
    const veil = await call('ub', b, { action: 'private.get', profileId: a });
    assert.equal(veil.quota.left, 10);

    const r = await call('ub', b, { action: 'access.request', opId: op(), profileId: a, scopes: ['info', 'photos'] });
    assert.deepEqual([r.status, r.state, r.scopes, r.quota.left, r.quotaLeft], [200, 'pending', ['info', 'photos'], 9, 9]);
    const back = new Date(r.quota.resetsAt).getTime() - Date.now();
    assert.ok(back > 23.9 * 3600e3 && back <= 24 * 3600e3, 'the attempt comes back a day after it was used');
    assert.equal((await call('ub', b, { action: 'access.request', opId: op(), profileId: a, scopes: ['info', 'info'] })).status, 400);

    const inc = await call('ua', a, { action: 'access.lists', tab: 'incoming' });
    assert.deepEqual([inc.items[0].requested, inc.items[0].alreadyOpen, inc.available], [['info', 'photos'], null, ['info', 'photos']]);
    assert.equal(inc.items[0].profile.handle, 'Kira');

    // Someone else cannot cancel it; the requester can, and the attempt stays spent.
    const c = await person('uc', 'Noa');
    assert.equal((await call('uc', c, { action: 'access.cancel', opId: op(), requestId: r.id })).status, 404);
    const cancelled = await call('ub', b, { action: 'access.cancel', opId: op(), requestId: r.id });
    assert.deepEqual([cancelled.state, cancelled.quota.left], ['cancelled', 9]);
    assert.equal((await call('ub', b, { action: 'access.quota' })).left, 9);
    const out = await call('ub', b, { action: 'access.lists', tab: 'out' });
    assert.deepEqual([out.items[0].state, out.items[0].requested, out.quota.left], ['cancelled', ['info', 'photos'], 9]);
    assert.deepEqual((await call('ub', b, { action: 'access.lists', tab: 'out', filter: 'pending' })).items, []);
    assert.equal((await call('ua', a, { action: 'access.lists', tab: 'incoming' })).items.length, 0);
  } finally { await pg.close(); }
});

test('wave 4: grant more than asked, alreadyOpen on a repeat, the three access-center tabs, watermark, narrow to nothing revokes', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    await call('ua', a, { action: 'private.setText', opId: op(), text: 'Текст' });
    const photo = await privatePhoto(db, a);
    const r1 = await call('ub', b, { action: 'access.request', opId: op(), profileId: a, scopes: ['info'] });
    const g1 = await call('ua', a, { action: 'access.grant', opId: op(), requestId: r1.id, scopes: ['info', 'photos'], term: '7d' });
    assert.deepEqual([g1.state, g1.scopes], ['granted', ['info', 'photos']]); // a part that was not asked for, opened too
    assert.ok(new Date(g1.until) > new Date());

    // «Мои запросы», «Мне открыли», «Открыто мной».
    const out = await call('ub', b, { action: 'access.lists', tab: 'out' });
    assert.deepEqual([out.items[0].state, out.items[0].requested, out.items[0].granted.scopes], ['granted', ['info'], ['info', 'photos']]);
    const withme = await call('ub', b, { action: 'access.lists', tab: 'withme' });
    assert.deepEqual([withme.items.length, withme.items[0].scopes, withme.items[0].profile.handle, withme.next], [1, ['info', 'photos'], 'Alex', null]);
    const byme = await call('ua', a, { action: 'access.lists', tab: 'byme' });
    assert.deepEqual([byme.items[0].scopes, byme.items[0].profile.handle], [['info', 'photos'], 'Kira']);
    assert.equal(byme.items[0].cursor_id, undefined);
    // Nobody else sees these lists' contents.
    assert.deepEqual((await call('uc', c, { action: 'access.lists', tab: 'withme' })).items, []);
    assert.deepEqual((await call('uc', c, { action: 'access.lists', tab: 'byme' })).items, []);

    // The viewer's private photos carry the viewer's own handle; the owner's own view has none.
    const seen = await call('ub', b, { action: 'private.get', profileId: a });
    assert.deepEqual(seen.media.map((/** @type {any} */ m) => [m.id, m.watermark]), [[photo, '@Kira']]);
    assert.equal(seen.quota.left, 9);
    assert.equal((await call('ua', a, { action: 'private.get', profileId: a })).media[0].watermark, undefined);

    // A repeat request: the owner sees what is already open; the new answer replaces it.
    const r2 = await call('ub', b, { action: 'access.request', opId: op(), profileId: a, scopes: ['photos'] });
    const inc = await call('ua', a, { action: 'access.lists', tab: 'incoming' });
    assert.deepEqual([inc.items[0].requested, inc.items[0].alreadyOpen.scopes], [['photos'], ['info', 'photos']]);
    assert.equal((await call('ua', a, { action: 'access.grant', opId: op(), requestId: r2.id, scopes: ['photos'], term: 'none' })).until, null);
    const out2 = await call('ub', b, { action: 'access.lists', tab: 'out' });
    assert.deepEqual(out2.items.map((/** @type {any} */ i) => i.state), ['granted', 'replaced']);

    // Narrow cannot widen or repeat; an empty selection is a revoke with its notice.
    assert.equal((await call('ua', a, { action: 'access.narrow', opId: op(), profileId: b, scopes: ['info'] })).rule, 'widen_needs_request');
    assert.equal((await call('ua', a, { action: 'access.narrow', opId: op(), profileId: b, scopes: ['photos', 'photos'] })).status, 400);
    assert.equal((await call('uc', c, { action: 'access.narrow', opId: op(), profileId: b, scopes: [] })).status, 404);
    assert.deepEqual((await call('ua', a, { action: 'access.narrow', opId: op(), profileId: b, scopes: [] })).scopes, []);
    const [{ n }] = await db.query(`select count(*)::int n from feture.outbox where topic = 'access.revoked' and profile_id = $1`, [b]);
    assert.equal(n, 1);
    assert.deepEqual((await call('ua', a, { action: 'access.lists', tab: 'byme' })).items, []);
    assert.deepEqual((await call('ub', b, { action: 'access.lists', tab: 'withme' })).items, []);
    assert.equal((await call('ub', b, { action: 'access.lists', tab: 'out' })).items[0].state, 'revoked');
    assert.equal((await call('ub', b, { action: 'private.get', profileId: a })).media, undefined);
    assert.equal((await call('ua', a, { action: 'access.narrow', opId: op(), profileId: b, scopes: [] })).status, 404);

    // Paging and filter: 31 old cancelled requests on top of the two answered ones.
    const [{ id: kira }] = await db.query(`select id from feture.account where person_profile_id = $1`, [b]);
    for (let i = 0; i < 31; i++) {
      await db.query(
        `insert into feture.access_request (requester_profile_id, owner_profile_id, viewer_account_ids, scopes, state, acted_by, created_at, decided_at)
         values ($1, $2, $3, '{info}', 'cancelled', $4, now() - make_interval(days => 2 + $5), now())`, [b, a, [kira], kira, i]);
    }
    const p1 = await call('ub', b, { action: 'access.lists', tab: 'out' });
    assert.equal(p1.items.length, 30);
    const p2 = await call('ub', b, { action: 'access.lists', tab: 'out', cursor: p1.next });
    assert.deepEqual([p2.items.length, p2.next], [3, null]);
    assert.equal(new Set([...p1.items, ...p2.items].map((/** @type {any} */ i) => i.id)).size, 33);
    assert.deepEqual((await call('ub', b, { action: 'access.lists', tab: 'out', filter: 'pending' })).items, []);
    assert.equal((await call('ub', b, { action: 'access.lists', tab: 'out', cursor: 'bm9wZQ' })).status, 400);
    assert.equal((await call('ub', b, { action: 'access.lists', tab: 'byme', filter: 'pending' })).status, 400);
  } finally { await pg.close(); }
});

test('wave 4: a decline can be undone within the window and the requester never learns of it', async () => {
  const { pg, db, call, person } = await setup();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    await call('ua', a, { action: 'private.setText', opId: op(), text: 'Текст' });
    const r = await call('ub', b, { action: 'access.request', opId: op(), profileId: a, scopes: ['info'] });
    const d = await call('ua', a, { action: 'access.decline', opId: op(), requestId: r.id });
    assert.equal(d.state, 'declined');
    assert.ok(new Date(d.undoUntil).getTime() - Date.now() <= 10e3);
    // The requester sees a waiting request: no state, time or cooldown leaks; the notice waits out the window.
    const seen = (await call('ub', b, { action: 'access.lists', tab: 'out' })).items[0];
    assert.deepEqual([seen.state, seen.decidedAt, seen.reaskAt], ['pending', null, null]);
    assert.equal((await call('ub', b, { action: 'access.lists', tab: 'out', filter: 'pending' })).items.length, 1);
    assert.equal((await call('ub', b, { action: 'private.get', profileId: a })).reason, 'pending');
    const [notice] = await db.query(`select available_at > now() + interval '9 seconds' later from feture.outbox where topic = 'access.declined'`);
    assert.equal(notice.later, true);
    assert.equal((await call('ua', a, { action: 'access.lists', tab: 'incoming' })).items.length, 0);

    // Only the owner who declined can undo; then it is pending again and the notice is gone.
    assert.equal((await call('uc', c, { action: 'access.undoDecline', opId: op(), requestId: r.id })).status, 404);
    assert.equal((await call('ub', b, { action: 'access.undoDecline', opId: op(), requestId: r.id })).status, 404);
    assert.equal((await call('ua', a, { action: 'access.undoDecline', opId: op(), requestId: r.id })).state, 'pending');
    assert.equal((await db.query(`select 1 from feture.outbox where topic = 'access.declined'`)).length, 0);
    assert.equal((await call('ua', a, { action: 'access.lists', tab: 'incoming' })).items[0].id, r.id);
    assert.equal((await call('ua', a, { action: 'access.undoDecline', opId: op(), requestId: r.id })).status, 409); // not declined

    // After the window it stands and the requester sees it with the cooldown.
    await call('ua', a, { action: 'access.decline', opId: op(), requestId: r.id });
    await db.query(`update feture.access_request set decided_at = decided_at - interval '11 seconds' where id = $1`, [r.id]);
    assert.equal((await call('ua', a, { action: 'access.undoDecline', opId: op(), requestId: r.id })).rule, 'undo_expired');
    const late = (await call('ub', b, { action: 'access.lists', tab: 'out' })).items[0];
    assert.equal(late.state, 'declined');
    assert.ok(late.reaskAt && late.decidedAt);
    assert.equal((await call('ub', b, { action: 'access.cancel', opId: op(), requestId: r.id })).status, 404);

    // Cancelled by the requester inside the window: the decline never reaches them and cannot be undone.
    const r2 = await call('uc', c, { action: 'access.request', opId: op(), profileId: a, scopes: ['info'] });
    await call('ua', a, { action: 'access.decline', opId: op(), requestId: r2.id });
    assert.equal((await call('uc', c, { action: 'access.cancel', opId: op(), requestId: r2.id })).state, 'cancelled');
    assert.equal((await db.query(`select 1 from feture.outbox where topic = 'access.declined' and profile_id = $1`, [c])).length, 0);
    assert.equal((await call('ua', a, { action: 'access.undoDecline', opId: op(), requestId: r2.id })).status, 409);
    assert.equal((await call('uc', c, { action: 'access.lists', tab: 'out' })).items[0].state, 'cancelled');

    // Undo cannot revive a request once the private part was switched off in between.
    const e = await person('ue', 'Lev');
    const r3 = await call('ue', e, { action: 'access.request', opId: op(), profileId: a, scopes: ['info'] });
    await call('ua', a, { action: 'access.decline', opId: op(), requestId: r3.id });
    await call('ua', a, { action: 'private.setOn', opId: op(), on: false, confirm: true });
    assert.equal((await call('ua', a, { action: 'access.undoDecline', opId: op(), requestId: r3.id })).rule, 'request_closed');
  } finally { await pg.close(); }
});
