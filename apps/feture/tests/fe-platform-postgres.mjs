// Stage 0 platform on PGlite, running as the restricted feture_api role:
// accounts, acting profile, idempotency, partner approvals, outbox, media lifecycle and jobs, /api/fe handler.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { fromPglite } from '../server/db.mjs';
import { resolveAccount, coreKeyHmac } from '../server/accounts.mjs';
import { actingProfile } from '../server/profiles.mjs';
import { once } from '../server/ops.mjs';
import { registerApprovalKind, requestApproval, decideApproval, cancelApproval, listApprovals, needsPartner, narrowCouple } from '../server/approvals.mjs';
import { enqueue, claim, complete, drain } from '../server/outbox.mjs';
import { platformCommands } from '../contracts/platform.mjs';
import { uploadIntent, commitUpload, removeAsset, mediaDto, videoTiming, ORIGINAL_KEY } from '../server/media/assets.mjs';
import { scanAsset, sniff } from '../server/media/scan.mjs';
import { verifyMediaToken, issueMediaToken } from '../server/media/token.mjs';
import { tokenDelivery, signedStorageDelivery } from '../server/media/delivery.mjs';
import { VARIANT_KEY } from '../server/media/supabase-storage.mjs';
import { presign } from '../server/media/sigv4.mjs';
import { mediaHandlers, runJobs } from '../server/jobs.mjs';
import { createFeHandler } from '../server/handler.mjs';
import { platform } from '../server/commands/platform.mjs';

const PEPPER = 'p'.repeat(40);
const SECRET = 's'.repeat(40);
const MIGRATION = readFileSync(new URL('../supabase/migrations/20261027120000_fe_platform.sql', import.meta.url), 'utf8');
const core = (hash, gen = 'g1') => ({ accountHash: hash, accountGeneration: gen });

async function setup() {
  const pg = new PGlite();
  await pg.exec('create role anon; create role authenticated;');
  await pg.exec(MIGRATION);
  // The partner approvals of approvals.mjs also store the note of a return (wave 6, 20261028180000_fe_waves67.sql).
  await pg.exec(readFileSync(new URL('../supabase/migrations/20261028180000_fe_waves67.sql', import.meta.url), 'utf8').split('\n').find(l => l.startsWith('alter table feture.partner_approval')));
  // Video and voice on media_asset (the media part of 20261028190000_fe_media_av.sql; the chat part needs the chat tables).
  await pg.exec(readFileSync(new URL('../supabase/migrations/20261028190000_fe_media_av.sql', import.meta.url), 'utf8').split('-- «Прослушано»')[0]);
  await pg.exec(readFileSync(new URL('../supabase/migrations/20261028231000_fe_video_edit.sql', import.meta.url), 'utf8'));
  await pg.exec('set role feture_api');
  return { pg, db: fromPglite(pg) };
}

/** Person profile for an account, the way onboarding will create it. */
async function person(db, accountId, handle) {
  const [p] = await db.query(`insert into feture.profile (kind, handle, name) values ('person', $1, $1) returning id`, [handle]);
  await db.query(`insert into feture.profile_member (profile_id, profile_kind, account_id, joined_at) values ($1, 'person', $2, now())`, [p.id, accountId]);
  await db.query('update feture.account set person_profile_id = $1 where id = $2', [p.id, accountId]);
  return p.id;
}
async function couple(db, a, b, { approves = true } = {}) {
  const [p] = await db.query(`insert into feture.profile (kind, name) values ('couple', 'A и B') returning id`);
  for (const acc of [a, b]) {
    await db.query(`insert into feture.profile_member (profile_id, profile_kind, account_id, joined_at, approves_partner) values ($1, 'couple', $2, now(), $3)`, [p.id, acc, approves]);
  }
  return p.id;
}
const reject = (p, code) => assert.rejects(p, e => e.code === code || (console.error(e), false));

/** Fake object storage with the interface of r2.mjs / supabase-storage.mjs. Tests decide what "was uploaded". */
function fakeStorage() {
  const objects = new Map();
  return {
    objects,
    putUrl: async (key, file) => ({ url: 'https://store.test/' + key, method: 'PUT', headers: { 'content-type': file.mime } }),
    head: async key => objects.has(key) ? { bytes: objects.get(key).bytes.length, mime: objects.get(key).mime } : null,
    get: async key => objects.get(key).bytes,
    put: async (key, bytes, mime) => { objects.set(key, { bytes, mime }); },
    remove: async key => { objects.delete(key); },
    signUrls: async (keys, ttl) => keys.map(k => `https://store.test/sign/${k}?ttl=${ttl}`),
  };
}
const fakeRenderer = { render: async () => ({ width: 800, height: 1000, variants: ['thumb', 'card', 'full', 'blur'].map(name => ({ name, bytes: Uint8Array.of(1) })) }) };
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

test('schema: uuid v7, nicknames unique across profiles, one couple per account, two members per couple, grants', async () => {
  const { pg, db } = await setup();
  try {
    const [{ u }] = await db.query('select feture.uuid_v7()::text u');
    assert.equal(u[14], '7');
    const [a, b, c] = await Promise.all(['core-a', 'core-b', 'core-c'].map(h => resolveAccount(db, PEPPER, core(h))));
    await person(db, a.id, 'Alex');
    await assert.rejects(person(db, b.id, 'alex'), /profile_handle_key/);
    await assert.rejects(db.query(`insert into feture.profile (kind, handle) values ('person', 'no spaces')`), /check/);
    const pc = await couple(db, a.id, b.id);
    await assert.rejects(couple(db, a.id, c.id), /profile_member_one_couple/);
    await assert.rejects(
      db.query(`insert into feture.profile_member (profile_id, profile_kind, account_id, joined_at) values ($1, 'couple', $2, now())`, [pc, c.id]),
      /feture_couple_full/);
    await assert.rejects(db.query(
      `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state)
       values ($1, $2, 'image', 'post', 'u/x', 'image/jpeg', 1, 'approved')`, [pc, a.id]), /check/); // approved needs a label
    await pg.exec('reset role; set role authenticated');
    await assert.rejects(pg.query('select * from feture.profile'), /permission denied/);
  } finally { await pg.close(); }
});

test('accounts: keyed core link with generation, created once under a race, re-registration gets a new account', async () => {
  const { pg, db } = await setup();
  try {
    const [x, y] = await Promise.all([resolveAccount(db, PEPPER, core('core-1')), resolveAccount(db, PEPPER, core('core-1'))]);
    assert.equal(x.id, y.id);
    assert.equal((await db.query('select count(*)::int n from feture.account'))[0].n, 1);
    const [link] = await db.query('select core_key_hmac from feture.account_link');
    assert.ok(Buffer.from(link.core_key_hmac).equals(coreKeyHmac(PEPPER, core('core-1'))));
    assert.ok(!Buffer.from(link.core_key_hmac).toString('latin1').includes('core-1'));
    // Same email deleted and registered again in Core → new generation → a fresh FetUre account.
    const reborn = await resolveAccount(db, PEPPER, core('core-1', 'g2'));
    assert.notEqual(reborn.id, x.id);
    assert.throws(() => coreKeyHmac(PEPPER, { accountHash: 'core-1' }), e => e.code === 'auth_required');
    assert.throws(() => coreKeyHmac('short', core('core-1')), e => e.code === 'unavailable');
    await db.query(`update feture.account set state = 'suspended' where id = $1`, [x.id]);
    await reject(resolveAccount(db, PEPPER, core('core-1')), 'account_unavailable');
  } finally { await pg.close(); }
});

test('acting profile: header required, membership checked, paused couple is read-only', async () => {
  const { pg, db } = await setup();
  try {
    const [a, b, c] = await Promise.all(['a', 'b', 'c'].map(h => resolveAccount(db, PEPPER, core(h))));
    const pa = await person(db, a.id, 'alex'), pc = await couple(db, a.id, b.id);
    await reject(actingProfile(db, a.id, '', { write: false }), 'profile_required');
    await reject(actingProfile(db, c.id, pa, { write: false }), 'profile_forbidden');
    const acting = await actingProfile(db, a.id, pc, { write: true });
    assert.deepEqual([acting.kind, acting.partnerAccountId, acting.partnerApproves], ['couple', b.id, true]);
    await db.query(`update feture.profile set state = 'paused' where id = $1`, [pc]);
    assert.equal((await actingProfile(db, a.id, pc, { write: false })).writable, false);
    await reject(actingProfile(db, a.id, pc, { write: true }), 'profile_read_only');
    await db.query(`update feture.profile_member set state = 'left', left_at = now() where profile_id = $1 and account_id = $2`, [pc, b.id]);
    await reject(actingProfile(db, b.id, pc, { write: false }), 'profile_forbidden');
  } finally { await pg.close(); }
});

test('idempotency: replay, conflicting reuse, the unique-violation retry path', async () => {
  const { pg, db } = await setup();
  try {
    const a = await resolveAccount(db, PEPPER, core('a'));
    let runs = 0;
    const op = { opId: '018f0000-0000-7000-8000-000000000001', action: 'x.do', input: { n: 1 } };
    const work = async () => { runs++; return { value: runs }; };
    const first = await once(db, a.id, op, work);
    const again = await once(db, a.id, op, work);
    assert.deepEqual([first.value, again.value, again.replayed, runs], [1, 1, true, 1]);
    await reject(once(db, a.id, { ...op, input: { n: 2 } }, work), 'op_conflict');
    // PGlite serialises transactions, so the race is staged: the first transaction loses on the unique key
    // (another request stored the same opId), the retry must replay the winner's result, not run again.
    let txs = 0;
    const racing = {
      query: db.query,
      tx: async fn => {
        txs++;
        if (txs === 1) throw Object.assign(new Error('duplicate key'), { code: '23505' });
        return db.tx(fn);
      },
    };
    const op2 = { ...op, opId: '018f0000-0000-7000-8000-000000000002' };
    await once(db, a.id, op2, async () => ({ value: 'winner' }));
    const before = runs;
    const raced = await once(racing, a.id, op2, work);
    assert.deepEqual([raced.value, raced.replayed, runs, txs], ['winner', true, before, 2]);
  } finally { await pg.close(); }
});

test('/api/fe media.commit, media.remove and decide.cancel: the owner only, idempotent, a stranger learns nothing', async () => {
  const { pg, db } = await setup();
  try {
    const storage = fakeStorage();
    const handler = createFeHandler({
      db, pepper: PEPPER, commands: platform,
      cfg: { media: { storage, delivery: tokenDelivery(SECRET, 'https://media.test') } },
      authenticate: async req => core(String(req.headers['x-test-user'])),
      quota: async () => true, cors: () => false, log: () => {},
    });
    let n = 0;
    const opId = () => `018f0000-0000-7000-8000-0000000c${String(++n).padStart(4, '0')}`;
    /** @param {string} user @param {string | null} profile @param {Record<string, unknown>} body */
    const call = async (user, profile, body) => {
      const res = { statusCode: 0, setHeader() {}, end(s) { this.body = JSON.parse(s); } };
      await handler({ method: 'POST', headers: { 'x-test-user': user, ...(profile ? { 'x-fe-profile': profile } : {}) }, body }, res);
      return { status: res.statusCode, ...res.body };
    };
    const account = async (/** @type {string} */ u) => (await call(u, null, { action: 'session.bootstrap' })).account.id;
    const [accA, accB, accC] = [await account('core-a'), await account('core-b'), await account('core-c')];
    const pa = await person(db, accA, 'alex'), pb = await person(db, accB, 'kira');
    await person(db, accC, 'noa');

    // media.commit: only after the file is there, only by the owner, again returns the same state.
    const up = await call('core-a', pa, { action: 'media.uploadIntent', opId: opId(), purpose: 'post', kind: 'image', mime: 'image/jpeg', bytes: JPEG.length });
    assert.equal(up.status, 200);
    const early = await call('core-a', pa, { action: 'media.commit', assetId: up.assetId });
    assert.deepEqual([early.status, early.state], [409, 'not_uploaded']);
    storage.objects.set(`u/${up.assetId}`, { bytes: JPEG, mime: 'image/jpeg' });
    const stranger = await call('core-b', pb, { action: 'media.commit', assetId: up.assetId });
    assert.deepEqual([stranger.status, stranger.error, stranger.state], [404, 'not_found', undefined]); // not even whether it exists
    assert.equal((await call('core-b', pa, { action: 'media.commit', assetId: up.assetId })).status, 403); // someone else's profile header
    assert.equal((await call('core-a', pa, { action: 'media.commit', assetId: up.assetId })).state, 'uploaded');
    assert.equal((await call('core-a', pa, { action: 'media.commit', assetId: up.assetId })).state, 'uploaded');
    assert.equal((await db.query(`select count(*)::int n from feture.outbox where topic = 'media.scan'`))[0].n, 1); // scanned once
    // A file that is not what was declared is refused.
    const bad = await call('core-a', pa, { action: 'media.uploadIntent', opId: opId(), purpose: 'post', kind: 'image', mime: 'image/jpeg', bytes: JPEG.length });
    storage.objects.set(`u/${bad.assetId}`, { bytes: Uint8Array.of(1, 2), mime: 'image/jpeg' });
    assert.equal((await call('core-a', pa, { action: 'media.commit', assetId: bad.assetId })).rule, 'upload_mismatch');

    // media.remove: never by someone else; the owner's removal hides at once and purges later; a replay is a replay.
    assert.equal((await call('core-b', pb, { action: 'media.remove', opId: opId(), assetId: up.assetId })).status, 404);
    const removeOp = opId();
    assert.equal((await call('core-a', pa, { action: 'media.remove', opId: removeOp, assetId: up.assetId })).state, 'removed');
    assert.equal((await call('core-a', pa, { action: 'media.remove', opId: removeOp, assetId: up.assetId })).replayed, true);
    assert.equal((await call('core-a', pa, { action: 'media.remove', opId: opId(), assetId: up.assetId })).state, 'removed');
    const [{ state }] = await db.query('select state from feture.media_asset where id = $1', [up.assetId]);
    assert.equal(state, 'removed');
    assert.deepEqual((await db.query(`select topic from feture.outbox where topic in ('media.hide', 'media.purge') order by topic`)).map(r => r.topic), ['media.hide', 'media.purge']);

    // decide.cancel: only the partner who asked, only while pending; the other partner hears it was cancelled.
    registerApprovalKind('test.cancelViaApi', { apply: async () => {} });
    const pc = await couple(db, accA, accB);
    const asA = await actingProfile(db, accA, pc, { write: true });
    const { approvalId } = await db.tx(q => requestApproval(q, asA, { kind: 'test.cancelViaApi', targetType: 'post', targetId: up.assetId, change: {}, summary: ['x'] }));
    assert.equal((await call('core-c', pa, { action: 'decide.cancel', opId: opId(), approvalId })).status, 403);
    assert.equal((await call('core-a', pa, { action: 'decide.cancel', opId: opId(), approvalId })).status, 404); // not this profile's
    assert.equal((await call('core-b', pc, { action: 'decide.cancel', opId: opId(), approvalId })).status, 404); // the partner decides, not cancels
    assert.equal((await call('core-a', pc, { action: 'decide.cancel', opId: opId(), approvalId })).state, 'cancelled');
    assert.equal((await call('core-a', pc, { action: 'decide.cancel', opId: opId(), approvalId })).status, 404);
    assert.equal((await call('core-b', pc, { action: 'decide.approval', opId: opId(), approvalId, choice: 'approve' })).status, 409);
    assert.deepEqual((await call('core-b', pc, { action: 'decide.approvals' })).items, []);
    const [told] = await db.query(`select payload from feture.outbox where topic = 'decide.resolved'`);
    assert.deepEqual([told.payload.state, told.payload.for], ['cancelled', accB]);
  } finally { await pg.close(); }
});

test('partner approvals: partner decides, stored states, stale and expired never apply nor block, narrowing voids', async () => {
  const { pg, db } = await setup();
  try {
    const applied = [];
    registerApprovalKind('test.publish', { apply: async (q, row) => { applied.push(row.change); } });
    registerApprovalKind('test.openPrivate', { apply: async () => {}, always: true });
    const [a, b] = await Promise.all(['a', 'b'].map(h => resolveAccount(db, PEPPER, core(h))));
    const pc = await couple(db, a.id, b.id);
    const asA = await actingProfile(db, a.id, pc, { write: true }), asB = await actingProfile(db, b.id, pc, { write: true });
    const target = '018f0000-0000-7000-8000-0000000000aa';
    const req = { kind: 'test.publish', targetType: 'post', targetId: target, change: { aud: 'all' }, summary: ['Видят все'] };
    const state = async id => (await db.query('select state from feture.partner_approval where id = $1', [id]))[0].state;

    const { approvalId } = await db.tx(q => requestApproval(q, asA, req));
    await reject(db.tx(q => requestApproval(q, asA, req)), 'approval_pending');
    assert.deepEqual((await listApprovals(db, asB)).map(x => [x.id, x.mine]), [[approvalId, false]]);
    await reject(db.tx(q => decideApproval(q, asA, { approvalId, choice: 'approve' })), 'forbidden');
    assert.deepEqual(await db.tx(q => decideApproval(q, asB, { approvalId, choice: 'approve' })), { state: 'approved', applied: true });
    assert.deepEqual(applied, [{ aud: 'all' }]);
    await reject(db.tx(q => decideApproval(q, asB, { approvalId, choice: 'approve' })), 'conflict');

    const second = await db.tx(q => requestApproval(q, asA, req));
    await reject(db.tx(q => cancelApproval(q, asB, second.approvalId)), 'not_found');
    assert.deepEqual(await db.tx(q => cancelApproval(q, asA, second.approvalId)), { state: 'cancelled' });

    // Expired: closed for real (stored), not applied, and the slot is free again.
    const exp = await db.tx(q => requestApproval(q, asA, req));
    await db.query(`update feture.partner_approval set expires_at = now() - interval '1 minute' where id = $1`, [exp.approvalId]);
    assert.deepEqual(await db.tx(q => decideApproval(q, asB, { approvalId: exp.approvalId, choice: 'approve' })), { state: 'expired', applied: false });
    assert.equal(await state(exp.approvalId), 'expired');
    // An expired row nobody decided is swept by the next request for the same target.
    const exp2 = await db.tx(q => requestApproval(q, asA, req));
    await db.query(`update feture.partner_approval set expires_at = now() - interval '1 minute' where id = $1`, [exp2.approvalId]);
    const fresh = await db.tx(q => requestApproval(q, asA, req));
    assert.equal(await state(exp2.approvalId), 'expired');

    // Narrowing by either partner voids everything pending; a stale approval is closed, not applied.
    const other = await db.tx(q => requestApproval(q, asA, { ...req, kind: 'test.openPrivate', targetType: 'private' }));
    assert.deepEqual(await db.tx(q => narrowCouple(q, asB, 'discover_hidden')), { cancelled: 2 });
    assert.deepEqual([await state(fresh.approvalId), await state(other.approvalId)], ['cancelled', 'cancelled']);
    const late = await db.tx(q => requestApproval(q, asA, req));
    await db.query('update feture.profile set safety_epoch = safety_epoch + 1 where id = $1', [pc]);
    assert.deepEqual(await db.tx(q => decideApproval(q, asB, { approvalId: late.approvalId, choice: 'approve' })), { state: 'cancelled', applied: false });
    assert.equal(await state(late.approvalId), 'cancelled');
    assert.equal(applied.length, 1);

    // The partner does not ask to approve: ordinary widenings apply at once, opening the private part still needs both.
    const [c, d] = await Promise.all(['c', 'd'].map(h => resolveAccount(db, PEPPER, core(h))));
    const asC = await actingProfile(db, c.id, await couple(db, c.id, d.id, { approves: false }), { write: true });
    assert.deepEqual([needsPartner(asC, 'test.publish'), needsPartner(asC, 'test.openPrivate')], [false, true]);
    await reject(db.tx(q => requestApproval(q, asC, req)), 'approval_not_needed');
  } finally { await pg.close(); }
});

test('outbox: delays, non-overlapping claims, fencing, backoff, unhandled topics untouched, lost workers parked', async () => {
  const { pg, db } = await setup();
  try {
    await enqueue(db, 'push.send', null, { n: 1 });
    await enqueue(db, 'push.send', null, { n: 2 });
    await enqueue(db, 'media.purge', null, { n: 3 }, { delaySeconds: 3600 });
    await enqueue(db, 'mystery.topic', null, { n: 4 });
    const topics = ['push.send', 'media.purge'];
    const [first, second] = await Promise.all([claim(db, { topics, limit: 1 }), claim(db, { topics, limit: 5 })]);
    assert.equal(first.length + second.length, 2); // the delayed one waits, the unhandled topic is never claimed
    // A stale worker whose claim was taken over cannot mark the item done.
    const stale = first[0] ?? second[0];
    await db.query(`update feture.outbox set lock_token = gen_random_uuid() where id = $1`, [stale.id]);
    assert.equal(await complete(db, stale), false);
    await db.query('update feture.outbox set locked_until = null');
    const seen = [];
    await drain(db, { 'push.send': async item => { seen.push(item.payload.n); if (item.payload.n === 2) throw new Error('Provider said: bad token for alex@example.com'); } });
    assert.deepEqual(seen.sort(), [1, 2]);
    const rows = await db.query(`select payload->>'n' n, done_at is not null done, last_error, available_at = 'infinity' parked, available_at > now() later from feture.outbox order by id`);
    // A topic without a handler yet is left alone (not parked), so it is delivered once its handler ships.
    assert.deepEqual(rows.map(r => [r.n, r.done, r.last_error, r.parked]), [['1', true, null, false], ['2', false, 'error', false], ['3', false, null, false], ['4', false, null, false]]);
    assert.equal(rows[1].later, true);
    // A worker that died mid-item never reported back: after the last attempt the item is parked.
    await db.query(`update feture.outbox set attempts = 10, available_at = now(), locked_until = now() - interval '1 second' where payload->>'n' = '2'`);
    assert.equal((await claim(db, { topics })).length, 0);
    const [lost] = await db.query(`select available_at = 'infinity' parked, last_error from feture.outbox where payload->>'n' = '2'`);
    assert.deepEqual([lost.parked, lost.last_error], [true, 'error']);
  } finally { await pg.close(); }
});

test('media: intent limits, quarantine upload, commit, scan decisions, swap after approval, remove vs scan, DTO, jobs', async () => {
  const { pg, db } = await setup();
  try {
    const storage = fakeStorage();
    const cfg = { storage, delivery: tokenDelivery(SECRET, 'https://media.test') };
    const [a, b] = await Promise.all(['a', 'b'].map(h => resolveAccount(db, PEPPER, core(h))));
    const pa = await person(db, a.id, 'alex'), pb = await person(db, b.id, 'bobby');
    const asA = await actingProfile(db, a.id, pa, { write: true }), asB = await actingProfile(db, b.id, pb, { write: true });
    const intent = input => db.tx(q => uploadIntent(q, asA, cfg, { kind: 'image', mime: 'image/jpeg', bytes: JPEG.length, ...input }));
    const deps = (scanner, classifier) => ({ storage, scanner, classifier, renderer: fakeRenderer });
    const scanner = verdict => ({ name: 'fake-csam', check: async () => ({ result: verdict }) });
    const classifier = label => ({ name: 'fake-nsfw', classify: async () => ({ label, score: 0.9 }) });
    const row = async id => (await db.query('select * from feture.media_asset where id = $1', [id]))[0];

    await reject(intent({ purpose: 'post', mime: 'image/gif' }), 'rule_violation');
    await reject(intent({ purpose: 'post', mime: 'image/heic' }), 'rule_violation'); // converted on the device
    await reject(intent({ purpose: 'post', bytes: 21 * 1024 * 1024 }), 'too_large');
    await reject(intent({ purpose: 'avatar', explicit: true }), 'rule_violation');
    await reject(intent({ purpose: 'post', viewRule: 'once' }), 'rule_violation');
    await reject(intent({ purpose: 'post', kind: 'video', mime: 'video/mp4' }), 'invalid_input'); // no length

    const up = await intent({ purpose: 'post' });
    assert.match(up.upload.url, new RegExp(`/u/${up.assetId}$`)); // clients only ever get the quarantine key
    await reject(db.tx(q => commitUpload(q, asA, cfg, up.assetId)), 'conflict'); // nothing uploaded yet
    storage.objects.set(`u/${up.assetId}`, { bytes: PNG, mime: 'image/jpeg' }); // claims JPEG, is PNG
    await reject(db.tx(q => commitUpload(q, asB, cfg, up.assetId)), 'not_found'); // not the owner
    assert.deepEqual(await db.tx(q => commitUpload(q, asA, cfg, up.assetId)), { state: 'uploaded' });
    assert.deepEqual(await db.tx(q => commitUpload(q, asA, cfg, up.assetId)), { state: 'uploaded' });
    assert.equal(await scanAsset(db, deps(null, null), up.assetId), 'rejected'); // signature mismatch
    assert.equal(storage.objects.has(ORIGINAL_KEY(up.assetId)), false);
    // Rejected without any CSAM check: the upload is kept (and re-checked later), never purged unchecked.
    const purgeNoScanner = mediaHandlers(db, { scan: deps(null, null) })['media.purge'];
    await purgeNoScanner({ payload: { assetId: up.assetId }, profile_id: pa });
    assert.ok(storage.objects.has(`u/${up.assetId}`));
    assert.equal(await scanAsset(db, deps(scanner('pass'), null), up.assetId), 'rejected'); // checked later, stays rejected
    assert.equal((await row(up.assetId)).reject_reason, 'invalid_file');
    await purgeNoScanner({ payload: { assetId: up.assetId }, profile_id: pa });
    assert.equal(storage.objects.has(`u/${up.assetId}`), false); // now it may go
    // A wrong declared type does not skip the CSAM check.
    const typed = await intent({ purpose: 'post' });
    storage.objects.set(`u/${typed.assetId}`, { bytes: PNG, mime: 'image/jpeg' });
    await db.tx(q => commitUpload(q, asA, cfg, typed.assetId));
    assert.equal(await scanAsset(db, deps(scanner('match'), null), typed.assetId), 'blocked');

    const upload = async (purpose, explicit) => {
      const r = await intent({ purpose, explicit });
      storage.objects.set(`u/${r.assetId}`, { bytes: JPEG, mime: 'image/jpeg' });
      await db.tx(q => commitUpload(q, asA, cfg, r.assetId));
      return r.assetId;
    };

    const noProvider = await upload('post');
    assert.equal(await scanAsset(db, deps(null, null), noProvider), 'needs_review');
    assert.ok(storage.objects.has(VARIANT_KEY(noProvider, 'card'))); // author/staff preview only
    const csam = await upload('post');
    assert.equal(await scanAsset(db, deps(scanner('match'), classifier('safe')), csam), 'blocked');
    assert.equal(storage.objects.has(ORIGINAL_KEY(csam)), false); // never published, not even variants
    assert.equal(storage.objects.has(VARIANT_KEY(csam, 'thumb')), false);
    await reject(db.tx(q => removeAsset(q, asA, csam)), 'not_found'); // evidence cannot be deleted by the author
    const explicitAvatar = await upload('avatar');
    assert.equal(await scanAsset(db, deps(scanner('pass'), classifier('explicit')), explicitAvatar), 'rejected');
    assert.equal(storage.objects.has(ORIGINAL_KEY(explicitAvatar)), false);
    const explicitPost = await upload('post');
    assert.equal(await scanAsset(db, deps(scanner('pass'), classifier('explicit')), explicitPost), 'approved');
    const authorExplicit = await upload('private', true);
    assert.equal(await scanAsset(db, deps(scanner('pass'), classifier('safe')), authorExplicit), 'approved');
    const safePost = await upload('post');
    assert.equal(await scanAsset(db, deps(scanner('pass'), classifier('safe')), safePost), 'approved');
    assert.equal(await scanAsset(db, deps(scanner('pass'), classifier('safe')), safePost), 'skipped');
    const safeRow = await row(safePost);
    assert.deepEqual([safeRow.width, safeRow.height, Buffer.from(safeRow.sha256).length], [800, 1000, 32]);
    assert.equal((await row(authorExplicit)).explicitness_source, 'author');
    assert.equal((await row(explicitPost)).explicitness_source, 'classifier');

    // Swapping the quarantined upload after approval changes nothing anyone is served.
    const served = storage.objects.get(ORIGINAL_KEY(safePost)).bytes;
    storage.objects.set(`u/${safePost}`, { bytes: PNG, mime: 'image/jpeg' });
    assert.equal(storage.objects.get(ORIGINAL_KEY(safePost)).bytes, served);

    // Removing before the scan does not dodge the CSAM check, and the purge waits for it.
    const dodge = await upload('post');
    assert.deepEqual(await db.tx(q => removeAsset(q, asA, dodge)), { state: 'removed' });
    const purge = mediaHandlers(db, { scan: deps(scanner('match'), null) })['media.purge'];
    await purge({ payload: { assetId: dodge }, profile_id: pa }); // unchecked: kept, scan and a later purge queued
    assert.ok(storage.objects.has(`u/${dodge}`));
    const requeued = await db.query(`select topic, available_at > now() + interval '23 hours' later from feture.outbox where payload->>'assetId' = $1 and topic in ('media.scan', 'media.purge') order by id desc limit 2`, [dodge]);
    assert.deepEqual(requeued.map(r => [r.topic, r.later]).sort(), [['media.purge', true], ['media.scan', false]]);
    // Without a scanner a removed upload stays unchecked and is never purged.
    assert.equal(await scanAsset(db, deps(null, null), dodge), 'removed');
    await purge({ payload: { assetId: dodge }, profile_id: pa });
    assert.ok(storage.objects.has(`u/${dodge}`));
    assert.equal(await scanAsset(db, deps(scanner('match'), null), dodge), 'blocked');
    await purge({ payload: { assetId: dodge } }); // blocked: nothing deleted
    assert.ok(storage.objects.has(`u/${dodge}`));
    const harmless = await upload('post');
    await db.tx(q => removeAsset(q, asA, harmless));
    assert.equal(await scanAsset(db, deps(scanner('pass'), classifier('safe')), harmless), 'removed');
    assert.equal(storage.objects.has(ORIGINAL_KEY(harmless)), false); // a removed file is never published
    await purge({ payload: { assetId: harmless }, profile_id: pa });
    assert.equal(storage.objects.has(`u/${harmless}`), false);

    const rows = Object.fromEntries((await db.query('select * from feture.media_asset')).map(r => [r.id, r]));
    const view = (id, ctx) => mediaDto(cfg, rows[id], { viewerProfileId: pb, place: 'public', showExplicit: false, ...ctx });
    assert.equal(await view(noProvider, {}), null); // waiting for review: only the author sees it
    assert.equal((await view(noProvider, { viewerProfileId: pa })).pending, true);
    const fresh = await upload('post'); // committed, not scanned yet: no copies, so no links (not a 503)
    const freshDto = await mediaDto(cfg, await row(fresh), { viewerProfileId: pa, place: 'own', showExplicit: false });
    assert.deepEqual([freshDto.pending, freshDto.src], [true, null]);
    assert.equal(await view(csam, {}), null);
    assert.equal(await view(explicitPost, {}), null); // explicit never in public places
    assert.equal((await view(safePost, {})).explicit, false);
    assert.equal(await mediaDto(cfg, { ...rows[safePost], explicitness: 'unknown' }, { viewerProfileId: pb, place: 'public', showExplicit: true }), null); // unlabelled = not safe
    assert.equal(await mediaDto(cfg, { ...rows[safePost], purpose: 'verification' }, { viewerProfileId: pb, place: 'private', showExplicit: true }), null);
    const blurred = await view(authorExplicit, { place: 'private' });
    assert.deepEqual([blurred.blurred, Object.keys(blurred.src)], [true, ['blur']]);
    const shown = await view(authorExplicit, { place: 'private', showExplicit: true });
    assert.deepEqual([shown.blurred, Object.keys(shown.src)], [false, ['thumb', 'card', 'full']]);
    const card = await view(safePost, {});
    const url = new URL(card.src.card);
    assert.equal(url.pathname, `/v/${safePost}/card`);
    const token = url.searchParams.get('t');
    assert.equal((await verifyMediaToken(SECRET, token, { assetId: safePost, variant: 'card' })).viewerProfileId, pb);
    assert.equal(await verifyMediaToken(SECRET, token, { assetId: safePost, variant: 'full' }), null);
    assert.equal(await verifyMediaToken(SECRET, token, { assetId: explicitPost, variant: 'card' }), null);
    assert.equal(await verifyMediaToken('x'.repeat(40), token, { assetId: safePost, variant: 'card' }), null);
    assert.equal(await verifyMediaToken(SECRET, token, { assetId: safePost, variant: 'card', now: Date.now() + 3600e3 }), null);
    // Tamper inside the signature (the last base64url character carries two unused bits, so changing it can be a no-op).
    const at = token.length - 10;
    const forged = token.slice(0, at) + (token[at] === 'A' ? 'B' : 'A') + token.slice(at + 1);
    assert.equal(await verifyMediaToken(SECRET, forged, { assetId: safePost, variant: 'card' }), null);
    const signed = await mediaDto({ storage, delivery: signedStorageDelivery(storage) }, rows[safePost], { viewerProfileId: pb, place: 'public', showExplicit: false });
    assert.equal(signed.src.card, `https://store.test/sign/v/${safePost}/card.webp?ttl=600`);

    // Removal hides served copies at once (media.hide) and purges the upload later.
    assert.deepEqual(await db.tx(q => removeAsset(q, asA, safePost)), { state: 'removed' });
    const topics = (await db.query(`select topic, available_at > now() + interval '23 hours' later from feture.outbox where payload->>'assetId' = $1`, [safePost])).map(r => [r.topic, r.later]);
    assert.deepEqual(topics.filter(([t]) => t !== 'media.scan' && t !== 'media.approved'), [['media.hide', false], ['media.purge', true]]);
    await mediaHandlers(db, { scan: deps(null, null) })['media.hide']({ payload: { assetId: safePost } });
    assert.equal(storage.objects.has(ORIGINAL_KEY(safePost)), false);
    assert.equal(storage.objects.has(VARIANT_KEY(safePost, 'card')), false);
    assert.equal(sniff(Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])), 'image/heic');

    // Worker tick: expired intents are closed and their quarantine key deleted; old ledger rows go.
    const stale = await intent({ purpose: 'post' });
    storage.objects.set(`u/${stale.assetId}`, { bytes: JPEG, mime: 'image/jpeg' });
    await db.query(`update feture.media_asset set upload_expires_at = now() - interval '1 minute' where id = $1`, [stale.assetId]);
    await db.query(`insert into feture.op_ledger (account_id, op_id, action, request_hash, result, created_at) values ($1, gen_random_uuid(), 'x', '\\x00', '{}', now() - interval '8 days')`, [a.id]);
    const tick = await runJobs(db, { scan: deps(scanner('pass'), null) });
    assert.deepEqual([tick.expired, tick.ledger], [1, 1]);
    assert.equal((await row(stale.assetId)).state, 'removed');
    // Three hours later the purge finds bytes that arrived anyway: they are scanned before deletion.
    await mediaHandlers(db, { scan: deps(scanner('pass'), null) })['media.purge']({ payload: { assetId: stale.assetId }, profile_id: pa });
    assert.ok(storage.objects.has(`u/${stale.assetId}`));
    assert.equal(await scanAsset(db, deps(scanner('pass'), null), stale.assetId), 'removed');
    assert.ok((await row(stale.assetId)).csam_checked_at);
    await mediaHandlers(db, { scan: deps(scanner('pass'), null) })['media.purge']({ payload: { assetId: stale.assetId }, profile_id: pa });
    assert.equal(storage.objects.has(`u/${stale.assetId}`), false);

    // Two scans never overlap: the second one sees the lease and retries later.
    const leased = await upload('post');
    await db.query(`update feture.media_asset set scan_lock_until = now() + interval '5 minutes', scan_token = gen_random_uuid() where id = $1`, [leased]);
    await assert.rejects(scanAsset(db, deps(scanner('pass'), classifier('safe')), leased), /scan_busy/);
    await db.query(`update feture.media_asset set scan_lock_until = now() - interval '1 second' where id = $1`, [leased]);
    assert.equal(await scanAsset(db, deps(scanner('pass'), classifier('safe')), leased), 'approved');
  } finally { await pg.close(); }
});

test('sigv4: AWS presign test vector; a presigned upload is bound to its key, type and size', () => {
  const creds = { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1' };
  const now = new Date('2013-05-24T00:00:00Z');
  const vector = presign(creds, { method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt', expiresSeconds: 86400, now });
  assert.ok(vector.endsWith('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404'));
  const sig = (key, headers) => presign(creds, { method: 'PUT', url: `https://r2.test/b/${key}`, headers, expiresSeconds: 900, now }).split('X-Amz-Signature=')[1];
  const base = sig('u/1', { 'content-type': 'image/jpeg', 'content-length': '10' });
  assert.notEqual(base, sig('u/2', { 'content-type': 'image/jpeg', 'content-length': '10' }));
  assert.notEqual(base, sig('u/1', { 'content-type': 'image/png', 'content-length': '10' }));
  assert.notEqual(base, sig('u/1', { 'content-type': 'image/jpeg', 'content-length': '11' }));
});

/** A minimal MP4: ftyp + a movie header saying `ms` long (timescale 1000). */
const mp4 = (/** @type {number} */ ms, brand = 'isom') => {
  const b = new Uint8Array(16 + 108);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, 16); b.set([...'ftyp', ...brand].map(c => c.charCodeAt(0)), 4);
  dv.setUint32(16, 108); b.set([...'mvhd'].map(c => c.charCodeAt(0)), 20);
  dv.setUint32(16 + 20, 1000); dv.setUint32(16 + 24, ms); // version 0: ctime, mtime, timescale, duration
  return b;
};
const EBML = [0x1a, 0x45, 0xdf, 0xa3];
const webmSound = Uint8Array.from([...EBML, 0x83, 0x81, 0x02, 0x1f, 0x43, 0xb6, 0x75, 0x83, 0x81, 0x01, 9, 9]); // audio track; the pattern after Cluster is data
const webmVideo = Uint8Array.from([...EBML, 0x83, 0x81, 0x01, 0x1f, 0x43, 0xb6, 0x75, 9, 9]);

test('media av: video and voice limits, poster upload, scan (length, sound only, staff for clips), DTO links', async () => {
  const { pg, db } = await setup();
  try {
    const storage = fakeStorage();
    const cfg = { storage, delivery: tokenDelivery(SECRET, 'https://media.test') };
    const [a, b] = await Promise.all(['a', 'b'].map(h => resolveAccount(db, PEPPER, core(h))));
    const pa = await person(db, a.id, 'alex'), pb = await person(db, b.id, 'bobby');
    const asA = await actingProfile(db, a.id, pa, { write: true });
    const deps = (scanner) => ({ storage, scanner, classifier: null, renderer: fakeRenderer });
    const pass = { name: 'fake-csam', check: async () => ({ result: /** @type {const} */ ('pass') }) };
    const row = async id => (await db.query('select * from feture.media_asset where id = $1', [id]))[0];
    const poster = { mime: 'image/jpeg', bytes: JPEG.length };
    const video = input => db.tx(q => uploadIntent(q, asA, cfg, { purpose: 'post', kind: 'video', mime: 'video/mp4', bytes: 1000, durationMs: 20000, poster, ...input }));
    const voice = input => db.tx(q => uploadIntent(q, asA, cfg, { purpose: 'voice', kind: 'audio', mime: 'audio/webm', bytes: webmSound.length, durationMs: 4000, ...input }));

    // Places, types, sizes and lengths.
    await reject(video({ purpose: 'community' }), 'rule_violation');
    await reject(video({ purpose: 'voice' }), 'rule_violation');
    await reject(voice({ purpose: 'chat' }), 'rule_violation');
    await reject(db.tx(q => uploadIntent(q, asA, cfg, { purpose: 'voice', kind: 'image', mime: 'image/jpeg', bytes: 10 })), 'rule_violation');
    await reject(video({ bytes: 101 * 1024 * 1024 }), 'too_large');
    await reject(video({ durationMs: 62000 }), 'rule_violation');
    await reject(video({ poster: undefined }), 'rule_violation');
    await reject(video({ poster: { mime: 'image/jpeg', bytes: 3 * 1024 * 1024 } }), 'rule_violation');
    await reject(voice({ durationMs: 302000 }), 'rule_violation');
    await reject(voice({ mime: 'audio/mpeg' }), 'rule_violation');
    await reject(voice({ bytes: 9 * 1024 * 1024 }), 'too_large');
    await reject(voice({ viewRule: 'once' }), 'rule_violation'); // view rules are for chat photos and clips only

    // A clip: the poster goes to its own quarantine key and must be there, with the declared size, before commit.
    const clip = mp4(20000);
    const v = await video({ bytes: clip.length });
    assert.match(v.posterUpload.url, new RegExp(`/u/${v.assetId}\\.poster$`));
    storage.objects.set(`u/${v.assetId}`, { bytes: clip, mime: 'video/mp4' });
    await reject(db.tx(q => commitUpload(q, asA, cfg, v.assetId)), 'conflict');
    storage.objects.set(`u/${v.assetId}.poster`, { bytes: PNG, mime: 'image/png' });
    await reject(db.tx(q => commitUpload(q, asA, cfg, v.assetId)), 'rule_violation');
    storage.objects.set(`u/${v.assetId}.poster`, { bytes: JPEG, mime: 'image/jpeg' });
    assert.deepEqual(await db.tx(q => commitUpload(q, asA, cfg, v.assetId)), { state: 'uploaded' });
    // Even with a scanner that passes it, a clip waits for staff; the poster becomes the picture variants.
    assert.equal(await scanAsset(db, deps(pass), v.assetId), 'needs_review');
    const vr = await row(v.assetId);
    assert.deepEqual([vr.reject_reason, vr.duration_ms, vr.width], ['video', 20000, 800]);
    assert.ok(storage.objects.has(ORIGINAL_KEY(v.assetId)) && storage.objects.has(VARIANT_KEY(v.assetId, 'card')));
    // Nobody else sees it before staff; the author does, with the clip link.
    assert.equal(await mediaDto(cfg, vr, { viewerProfileId: pb, place: 'chat', showExplicit: true }), null);
    const own = await mediaDto(cfg, vr, { viewerProfileId: pa, place: 'own', showExplicit: false });
    assert.deepEqual([own.kind, own.durationMs, !!own.src.file, !!own.src.card], ['video', 20000, true, true]);
    await db.query(`update feture.media_asset set state = 'approved', explicitness = 'explicit' where id = $1`, [v.assetId]);
    const approved = await row(v.assetId);
    assert.equal(await mediaDto(cfg, approved, { viewerProfileId: pb, place: 'public', showExplicit: true }), null); // explicit: never public
    const covered = await mediaDto(cfg, approved, { viewerProfileId: pb, place: 'chat', showExplicit: false });
    assert.deepEqual([covered.blurred, Object.keys(covered.src)], [true, ['blur']]); // covered: no clip link at all
    const shown = await mediaDto(cfg, approved, { viewerProfileId: pb, place: 'chat', showExplicit: true });
    const tok = new URL(shown.src.file).searchParams.get('t');
    assert.ok(await verifyMediaToken(SECRET, tok, { assetId: v.assetId, variant: 'file' }));

    // A clip longer than its declared minute (read from the MP4 header) is refused and never published.
    const long = mp4(90000);
    const l = await video({ bytes: long.length });
    storage.objects.set(`u/${l.assetId}`, { bytes: long, mime: 'video/mp4' });
    storage.objects.set(`u/${l.assetId}.poster`, { bytes: JPEG, mime: 'image/jpeg' });
    await db.tx(q => commitUpload(q, asA, cfg, l.assetId));
    assert.equal(await scanAsset(db, deps(pass), l.assetId), 'rejected');
    assert.equal((await row(l.assetId)).reject_reason, 'too_long');
    assert.equal(storage.objects.has(ORIGINAL_KEY(l.assetId)), false);
    // The removal job also deletes the poster upload.
    const purge = mediaHandlers(db, { scan: deps(pass) })['media.purge'];
    await purge({ payload: { assetId: l.assetId }, profile_id: pa });
    assert.equal(storage.objects.has(`u/${l.assetId}.poster`), false);

    // Trim and crop (owner, 28.10): stored on the asset, never cut from the file. 1–60 s inside the declared length.
    const crop = { aspect: '1:1', x: 0.1, y: -0.2, z: 1.5 };
    await reject(video({ edit: { trim: { startMs: 0, endMs: 800 } } }), 'rule_violation'); // under a second
    await reject(video({ edit: { trim: { startMs: 5000, endMs: 25000 } } }), 'rule_violation'); // past the 20 s clip
    await reject(video({ edit: { trim: { startMs: 9000, endMs: 8000 } } }), 'rule_violation'); // backwards
    await reject(db.tx(q => uploadIntent(q, asA, cfg, { purpose: 'post', kind: 'image', mime: 'image/jpeg', bytes: 10, edit: { crop } })), 'rule_violation');
    await assert.rejects(db.query(`update feture.media_asset set frame = '{"aspect":"3:2","x":0,"y":0,"z":1}' where id = $1`, [v.assetId]), /media_asset_frame/);
    const e = await video({ bytes: clip.length, edit: { trim: { startMs: 2500, endMs: 12500 }, crop } });
    storage.objects.set(`u/${e.assetId}`, { bytes: clip, mime: 'video/mp4' });
    storage.objects.set(`u/${e.assetId}.poster`, { bytes: JPEG, mime: 'image/jpeg' });
    await db.tx(q => commitUpload(q, asA, cfg, e.assetId));
    assert.equal(await scanAsset(db, deps(pass), e.assetId), 'needs_review');
    const er = await row(e.assetId);
    assert.deepEqual([er.trim_start_ms, er.trim_end_ms, er.frame], [2500, 12500, crop]);
    const ed = await mediaDto(cfg, er, { viewerProfileId: pa, place: 'own', showExplicit: false });
    assert.deepEqual([ed.durationMs, ed.clip], [10000, { startMs: 2500, endMs: 12500, crop }]);
    // A trim declared past the real (scanned) length ends at the real end; a crop alone keeps the whole length.
    assert.deepEqual(videoTiming({ duration_ms: 9000, trim_start_ms: 2500, trim_end_ms: 12500, frame: null }), { durationMs: 6500, clip: { startMs: 2500, endMs: 9000 } });
    assert.deepEqual(videoTiming({ duration_ms: 9000, trim_start_ms: null, trim_end_ms: null, frame: crop }), { durationMs: 9000, clip: { crop } });
    assert.deepEqual(videoTiming({ duration_ms: 9000 }), { durationMs: 9000 });
    // Through the API contract: unknown keys and out-of-range crops are refused before the handler.
    assert.equal(platformCommands['media.uploadIntent'].input.safeParse({ opId: '018f0000-0000-7000-8000-0000000000e1', purpose: 'post', kind: 'video', mime: 'video/mp4', bytes: 10, durationMs: 5000, poster, edit: { crop: { ...crop, z: 4 } } }).success, false);
    assert.equal(platformCommands['media.uploadIntent'].input.safeParse({ opId: '018f0000-0000-7000-8000-0000000000e1', purpose: 'post', kind: 'video', mime: 'video/mp4', bytes: 10, durationMs: 5000, poster, edit: { trim: { startMs: 0, endMs: 3000 }, crop } }).success, true);

    // Voice: sound only → approved without an image scanner (nothing visual to check), with its length and waveform.
    const s = await voice({ peaks: [1, 5, 31, 0] });
    storage.objects.set(`u/${s.assetId}`, { bytes: webmSound, mime: 'audio/webm' });
    await db.tx(q => commitUpload(q, asA, cfg, s.assetId));
    assert.equal(await scanAsset(db, deps(null), s.assetId), 'approved');
    const sr = await row(s.assetId);
    assert.ok(sr.csam_checked_at);
    const heard = await mediaDto(cfg, sr, { viewerProfileId: pb, place: 'chat', showExplicit: false, blurAll: true });
    assert.deepEqual([heard.kind, heard.durationMs, heard.peaks, heard.blurred, Object.keys(heard.src)], ['audio', 4000, [1, 5, 31, 0], false, ['file']]);
    // A «voice» file with a picture track is not a voice message.
    const pic = await voice({ bytes: webmVideo.length });
    storage.objects.set(`u/${pic.assetId}`, { bytes: webmVideo, mime: 'audio/webm' });
    await db.tx(q => commitUpload(q, asA, cfg, pic.assetId));
    assert.equal(await scanAsset(db, deps(null), pic.assetId), 'rejected');
    assert.equal(storage.objects.has(ORIGINAL_KEY(pic.assetId)), false);
    // Ogg/Opus and Safari's MP4/AAC are sound too; a JPEG claiming to be sound is not.
    assert.equal(sniff(Uint8Array.from([...'OggS'].map(c => c.charCodeAt(0)))), 'audio/ogg');
    const aac = mp4(4000, 'M4A ');
    const m = await voice({ mime: 'audio/mp4', bytes: aac.length });
    storage.objects.set(`u/${m.assetId}`, { bytes: aac, mime: 'audio/mp4' });
    await db.tx(q => commitUpload(q, asA, cfg, m.assetId));
    assert.equal(await scanAsset(db, deps(null), m.assetId), 'approved');
    const fake = await voice({ bytes: JPEG.length });
    storage.objects.set(`u/${fake.assetId}`, { bytes: JPEG, mime: 'audio/webm' });
    await db.tx(q => commitUpload(q, asA, cfg, fake.assetId));
    assert.equal(await scanAsset(db, deps(null), fake.assetId), 'rejected');
    // The schema keeps sound in voice messages only.
    await assert.rejects(db.query(`update feture.media_asset set purpose = 'chat' where id = $1`, [s.assetId]), /media_asset_audio_voice/);
  } finally { await pg.close(); }
});

test('/api/fe handler: auth, schema, acting profile, idempotent writes bound to the profile, no internal errors leak', async () => {
  const { pg, db } = await setup();
  try {
    const log = [];
    const handler = createFeHandler({
      db, pepper: PEPPER, commands: platform,
      cfg: { media: { storage: fakeStorage(), delivery: tokenDelivery(SECRET, 'https://media.test') } },
      authenticate: async req => { if (req.headers['x-test-user']) return core(String(req.headers['x-test-user'])); throw Object.assign(new Error('x'), { status: 401 }); },
      quota: async () => true, cors: () => false, log: e => log.push(e),
    });
    const call = async (body, headers = {}) => {
      const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { this.body = JSON.parse(s); } };
      await handler({ method: 'POST', headers: { 'x-test-user': 'core-a', ...headers }, body }, res);
      return res;
    };
    assert.equal((await call({ action: 'session.bootstrap' }, { 'x-test-user': '' })).statusCode, 401);
    const boot = await call({ action: 'session.bootstrap' });
    assert.equal(boot.statusCode, 200);
    assert.deepEqual([boot.body.account.onboarded, boot.body.profiles], [false, []]);
    assert.equal(boot.headers['Cache-Control'], 'no-store');
    const unknown = await call({ action: 'admin.everything' });
    assert.deepEqual([unknown.statusCode, unknown.body.error], [400, 'invalid_input']);
    const extra = await call({ action: 'profile.mine', owner: 'someone' });
    assert.deepEqual([extra.statusCode, extra.body.fields], [400, ['(root)']]);
    const accountId = boot.body.account.id;
    const pa = await person(db, accountId, 'alex');
    const intent = { action: 'media.uploadIntent', opId: '018f0000-0000-7000-8000-0000000000b1', purpose: 'post', kind: 'image', mime: 'image/jpeg', bytes: 10 };
    assert.equal((await call(intent)).body.error, 'profile_required');
    const other = await call(intent, { 'x-test-user': 'core-b', 'x-fe-profile': pa });
    assert.deepEqual([other.statusCode, other.body.error], [403, 'profile_forbidden']);
    const ok = await call(intent, { 'x-fe-profile': pa });
    const replay = await call(intent, { 'x-fe-profile': pa });
    assert.deepEqual([ok.statusCode, replay.body.assetId, replay.body.replayed], [200, ok.body.assetId, true]);
    assert.equal((await db.query('select count(*)::int n from feture.media_asset'))[0].n, 1);
    // The same opId under another of my profiles is a conflict, not a replay of the first profile's result.
    const [{ id: pc }] = await db.query(`insert into feture.profile (kind, name) values ('couple', 'A и B') returning id`);
    await db.query(`insert into feture.profile_member (profile_id, profile_kind, account_id, joined_at) values ($1, 'couple', $2, now())`, [pc, accountId]);
    const crossProfile = await call(intent, { 'x-fe-profile': pc });
    assert.deepEqual([crossProfile.statusCode, crossProfile.body.error], [409, 'op_conflict']);
    // A former member gets 403, not the stored result.
    await db.query(`update feture.profile_member set state = 'left', left_at = now() where profile_id = $1`, [pc]);
    const former = await call(intent, { 'x-fe-profile': pc });
    assert.deepEqual([former.statusCode, former.body.error], [403, 'profile_forbidden']);
    const mine = await call({ action: 'profile.mine' });
    assert.deepEqual(mine.body.profiles.map(p => p.handle), ['alex']);
    await pg.exec('reset role; revoke all on feture.op_ledger from feture_api; set role feture_api');
    const broken = await call({ ...intent, opId: '018f0000-0000-7000-8000-0000000000b2' }, { 'x-fe-profile': pa });
    assert.deepEqual([broken.statusCode, broken.body.error, Object.keys(broken.body).sort()], [503, 'unavailable', ['error', 'ok', 'requestId']]);
    assert.ok(log.every(e => Object.keys(e).sort().join() === 'action,ms,outcome,requestId,stages' && typeof e.ms === 'number' && Object.values(e.stages).every(v => typeof v === 'number')));
    assert.ok(!JSON.stringify(log).includes('core-a'));
  } finally { await pg.close(); }
});

test('media Worker: token gate, variant/path binding, never the upload, private cache bounded by the token', async () => {
  const { handleMedia } = await import('../workers/media/index.mjs');
  const asset = '018f0000-0000-7000-8000-0000000000c1', viewer = '018f0000-0000-7000-8000-0000000000c2';
  const transforms = [];
  const env = {
    MEDIA_TOKEN_SECRET: SECRET,
    ORIGINALS: { get: async key => key === `o/${asset}` ? { body: new Blob([JPEG]).stream() } : null },
    IMAGES: { input: () => ({ transform(t) { transforms.push(t); return this; }, output: () => ({ response: () => new Response('webp') }) }) },
  };
  const token = await issueMediaToken(SECRET, { assetId: asset, variant: 'card', viewerProfileId: viewer, ttlSeconds: 600 });
  const get = (path, t = token, method = 'GET') => handleMedia(new Request(`https://media.test${path}?t=${t}`, { method }), env);
  const ok = await get(`/v/${asset}/card`);
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), 'webp');
  assert.match(ok.headers.get('cache-control'), /^private, max-age=(59\d|600)$/);
  assert.deepEqual(transforms, [{ width: 720, fit: 'scale-down' }]);
  assert.equal((await get(`/v/${asset}/full`)).status, 403);
  assert.equal((await get(`/v/${asset}/original`)).status, 404);
  assert.equal((await get(`/v/${asset}/card`, 'v1.x.y')).status, 403);
  assert.equal((await get(`/v/${asset}/card`, token, 'POST')).status, 405);
  const other = '018f0000-0000-7000-8000-0000000000c3';
  const otherToken = await issueMediaToken(SECRET, { assetId: other, variant: 'blur', viewerProfileId: viewer, ttlSeconds: 60 });
  assert.equal((await get(`/v/${other}/blur`, otherToken)).status, 404); // nothing published for it
  assert.equal((await get(`/v/${asset}/blur`, otherToken)).status, 403); // token for another asset
});

test('/api/fe stays off without its environment; jobs need the secret', async () => {
  const fe = (await import('../api/fe.mjs')).default;
  const call = async req => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { this.body = JSON.parse(s); } };
    await fe({ method: 'POST', headers: {}, ...req }, res);
    return res;
  };
  const off = await call({});
  assert.deepEqual([off.statusCode, off.body.error, off.headers['Cache-Control']], [503, 'unavailable', 'no-store']);
  assert.equal((await call({ url: '/api/fe?jobs=1' })).statusCode, 401);
  const { cors } = await import('../api/fe.mjs');
  const pre = { statusCode: 0, headers: {}, ended: false, setHeader(k, v) { if (this.ended) throw new Error('headers sent'); this.headers[k] = v; }, end() { this.ended = true; } };
  assert.equal(cors({ method: 'OPTIONS', headers: {} }, pre), true);
  assert.equal(pre.statusCode, 204);
  assert.match(pre.headers['Access-Control-Allow-Headers'], /X-Fe-Profile/);
  assert.equal((await call({ url: '/api/fe?jobs=1', headers: { authorization: 'Bearer ' } })).statusCode, 401);
});
