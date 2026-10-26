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
import { uploadIntent, commitUpload, removeAsset, mediaDto, ORIGINAL_KEY } from '../server/media/assets.mjs';
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

test('outbox: delays, non-overlapping claims, fencing, backoff, parking of unknown topics and lost workers', async () => {
  const { pg, db } = await setup();
  try {
    await enqueue(db, 'push.send', null, { n: 1 });
    await enqueue(db, 'push.send', null, { n: 2 });
    await enqueue(db, 'media.purge', null, { n: 3 }, { delaySeconds: 3600 });
    await enqueue(db, 'mystery.topic', null, { n: 4 });
    const [first, second] = await Promise.all([claim(db, { limit: 1 }), claim(db, { limit: 5 })]);
    assert.equal(first.length + second.length, 3);
    // A stale worker whose claim was taken over cannot mark the item done.
    const stale = first[0] ?? second[0];
    await db.query(`update feture.outbox set lock_token = gen_random_uuid() where id = $1`, [stale.id]);
    assert.equal(await complete(db, stale), false);
    await db.query('update feture.outbox set locked_until = null');
    const seen = [];
    await drain(db, { 'push.send': async item => { seen.push(item.payload.n); if (item.payload.n === 2) throw new Error('Provider said: bad token for alex@example.com'); } });
    assert.deepEqual(seen.sort(), [1, 2]);
    const rows = await db.query(`select payload->>'n' n, done_at is not null done, last_error, available_at = 'infinity' parked, available_at > now() later from feture.outbox order by id`);
    assert.deepEqual(rows.map(r => [r.n, r.done, r.last_error, r.parked]), [['1', true, null, false], ['2', false, 'error', false], ['3', false, null, false], ['4', false, 'no_handler', true]]);
    assert.equal(rows[1].later, true);
    // A worker that died mid-item never reported back: after the last attempt the item is parked.
    await db.query(`update feture.outbox set attempts = 10, available_at = now(), locked_until = now() - interval '1 second' where payload->>'n' = '2'`);
    assert.equal((await claim(db)).length, 0);
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
    await reject(intent({ purpose: 'post', kind: 'video', mime: 'video/mp4' }), 'rule_violation');

    const up = await intent({ purpose: 'post' });
    assert.match(up.upload.url, new RegExp(`/u/${up.assetId}$`)); // clients only ever get the quarantine key
    await reject(db.tx(q => commitUpload(q, asA, cfg, up.assetId)), 'conflict'); // nothing uploaded yet
    storage.objects.set(`u/${up.assetId}`, { bytes: PNG, mime: 'image/jpeg' }); // claims JPEG, is PNG
    await reject(db.tx(q => commitUpload(q, asB, cfg, up.assetId)), 'not_found'); // not the owner
    assert.deepEqual(await db.tx(q => commitUpload(q, asA, cfg, up.assetId)), { state: 'uploaded' });
    assert.deepEqual(await db.tx(q => commitUpload(q, asA, cfg, up.assetId)), { state: 'uploaded' });
    assert.equal(await scanAsset(db, deps(null, null), up.assetId), 'rejected'); // signature mismatch
    assert.equal(storage.objects.has(ORIGINAL_KEY(up.assetId)), false);

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
    await assert.rejects(purge({ payload: { assetId: dodge } }), /not_scanned/);
    assert.equal(await scanAsset(db, deps(scanner('match'), null), dodge), 'blocked');
    await purge({ payload: { assetId: dodge } }); // blocked: nothing deleted
    assert.ok(storage.objects.has(`u/${dodge}`));
    const harmless = await upload('post');
    await db.tx(q => removeAsset(q, asA, harmless));
    assert.equal(await scanAsset(db, deps(scanner('pass'), classifier('safe')), harmless), 'removed');
    assert.equal(storage.objects.has(ORIGINAL_KEY(harmless)), false); // a removed file is never published
    await purge({ payload: { assetId: harmless } });
    assert.equal(storage.objects.has(`u/${harmless}`), false);

    const rows = Object.fromEntries((await db.query('select * from feture.media_asset')).map(r => [r.id, r]));
    const view = (id, ctx) => mediaDto(cfg, rows[id], { viewerProfileId: pb, place: 'public', showExplicit: false, ...ctx });
    assert.equal(await view(noProvider, {}), null); // waiting for review: only the author sees it
    assert.equal((await view(noProvider, { viewerProfileId: pa })).pending, true);
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
    assert.equal(await verifyMediaToken(SECRET, token.replace(/.$/, c => c === 'A' ? 'B' : 'A'), { assetId: safePost, variant: 'card' }), null);
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
    const tick = await runJobs(db, { scan: deps(null, null) });
    assert.deepEqual([tick.expired, tick.ledger], [1, 1]);
    assert.equal(storage.objects.has(`u/${stale.assetId}`), false);
    assert.equal((await row(stale.assetId)).state, 'removed');
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
    assert.ok(log.every(e => Object.keys(e).sort().join() === 'action,outcome,requestId'));
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
  assert.equal((await call({ url: '/api/fe?jobs=1', headers: { authorization: 'Bearer ' } })).statusCode, 401);
});
