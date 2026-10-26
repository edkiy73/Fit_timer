// Stage 0 platform on PGlite, running as the restricted feture_api role:
// accounts, acting profile, idempotency, partner approvals, outbox, media lifecycle, /api/fe handler.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { fromPglite } from '../server/db.mjs';
import { resolveAccount, coreKeyHmac } from '../server/accounts.mjs';
import { actingProfile } from '../server/profiles.mjs';
import { once } from '../server/ops.mjs';
import { registerApprovalKind, requestApproval, decideApproval, cancelApproval, listApprovals, needsPartner, narrowCouple } from '../server/approvals.mjs';
import { enqueue, claim, drain } from '../server/outbox.mjs';
import { uploadIntent, commitUpload, removeAsset, mediaDto } from '../server/media/assets.mjs';
import { scanAsset, sniff } from '../server/media/scan.mjs';
import { verifyMediaToken } from '../server/media/token.mjs';
import { createFeHandler } from '../server/handler.mjs';
import { platform } from '../server/commands/platform.mjs';

const PEPPER = 'p'.repeat(40);
const SECRET = 's'.repeat(40);
const MIGRATION = readFileSync(new URL('../supabase/migrations/20261027120000_fe_platform.sql', import.meta.url), 'utf8');

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

/** Fake object storage: records puts; tests decide what "was uploaded". */
function fakeStorage() {
  const objects = new Map();
  return {
    objects,
    putUrl: (key, file) => ({ url: 'https://r2.test/' + key, method: 'PUT', headers: { 'content-type': file.mime, 'content-length': String(file.bytes) } }),
    head: async key => objects.has(key) ? { bytes: objects.get(key).bytes.length, mime: objects.get(key).mime } : null,
    get: async key => objects.get(key).bytes,
    remove: async key => { objects.delete(key); },
  };
}
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

test('schema: uuid v7, nickname uniqueness across profiles, one active couple per account, grants only for feture_api', async () => {
  const { pg, db } = await setup();
  try {
    const [{ u }] = await db.query('select feture.uuid_v7()::text u');
    assert.equal(u[14], '7');
    const a = await resolveAccount(db, PEPPER, 'core-a'), b = await resolveAccount(db, PEPPER, 'core-b'), c = await resolveAccount(db, PEPPER, 'core-c');
    await person(db, a.id, 'Alex');
    await assert.rejects(person(db, b.id, 'alex'), /profile_handle_key/);
    await assert.rejects(db.query(`insert into feture.profile (kind, handle) values ('person', 'no spaces')`), /check/);
    await couple(db, a.id, b.id);
    await assert.rejects(couple(db, a.id, c.id), /profile_member_one_couple/);
    await pg.exec('reset role; set role authenticated');
    await assert.rejects(pg.query('select * from feture.profile'), /permission denied/);
  } finally { await pg.close(); }
});

test('accounts: keyed core link, created once even under a race, short pepper refused', async () => {
  const { pg, db } = await setup();
  try {
    const [x, y] = await Promise.all([resolveAccount(db, PEPPER, 'core-1'), resolveAccount(db, PEPPER, 'core-1')]);
    assert.equal(x.id, y.id);
    assert.equal((await db.query('select count(*)::int n from feture.account'))[0].n, 1);
    const [link] = await db.query('select core_key_hmac from feture.account_link');
    assert.ok(Buffer.from(link.core_key_hmac).equals(coreKeyHmac(PEPPER, 'core-1')));
    assert.ok(!Buffer.from(link.core_key_hmac).toString('latin1').includes('core-1'));
    assert.throws(() => coreKeyHmac('short', 'core-1'), e => e.code === 'unavailable');
    await db.query(`update feture.account set state = 'suspended' where id = $1`, [x.id]);
    await reject(resolveAccount(db, PEPPER, 'core-1'), 'account_unavailable');
  } finally { await pg.close(); }
});

test('acting profile: header required, membership checked, paused couple is read-only', async () => {
  const { pg, db } = await setup();
  try {
    const a = await resolveAccount(db, PEPPER, 'a'), b = await resolveAccount(db, PEPPER, 'b'), c = await resolveAccount(db, PEPPER, 'c');
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

test('idempotency: replay, conflicting reuse, concurrent duplicates run once', async () => {
  const { pg, db } = await setup();
  try {
    const a = await resolveAccount(db, PEPPER, 'a');
    let runs = 0;
    const op = { opId: '018f0000-0000-7000-8000-000000000001', action: 'x.do', input: { n: 1 } };
    const work = async () => { runs++; return { value: runs }; };
    const first = await once(db, a.id, op, work);
    const again = await once(db, a.id, op, work);
    assert.deepEqual([first.value, again.value, again.replayed, runs], [1, 1, true, 1]);
    await reject(once(db, a.id, { ...op, input: { n: 2 } }, work), 'op_conflict');
    const op2 = { ...op, opId: '018f0000-0000-7000-8000-000000000002' };
    const both = await Promise.all([once(db, a.id, op2, work), once(db, a.id, op2, work)]);
    assert.equal(runs, 2);
    assert.equal(both[0].value, both[1].value);
  } finally { await pg.close(); }
});

test('partner approvals: partner decides, requester cannot, one pending per target, applied in the same transaction', async () => {
  const { pg, db } = await setup();
  try {
    const applied = [];
    registerApprovalKind('test.publish', { apply: async (q, row) => { applied.push(row.change); } });
    registerApprovalKind('test.openPrivate', { apply: async () => {}, always: true });
    const a = await resolveAccount(db, PEPPER, 'a'), b = await resolveAccount(db, PEPPER, 'b');
    const pc = await couple(db, a.id, b.id);
    const asA = await actingProfile(db, a.id, pc, { write: true }), asB = await actingProfile(db, b.id, pc, { write: true });
    const target = '018f0000-0000-7000-8000-0000000000aa';
    const req = { kind: 'test.publish', targetType: 'post', targetId: target, change: { aud: 'all' }, summary: ['Видят все'] };
    const { approvalId } = await db.tx(q => requestApproval(q, asA, req));
    await reject(db.tx(q => requestApproval(q, asA, req)), 'approval_pending');
    const seen = await listApprovals(db, asB);
    assert.deepEqual(seen.map(x => [x.id, x.mine]), [[approvalId, false]]);
    assert.equal((await listApprovals(db, asA))[0].mine, true);
    await reject(db.tx(q => decideApproval(q, asA, { approvalId, choice: 'approve' })), 'forbidden');
    assert.deepEqual(await db.tx(q => decideApproval(q, asB, { approvalId, choice: 'approve' })), { state: 'approved' });
    assert.deepEqual(applied, [{ aud: 'all' }]);
    await reject(db.tx(q => decideApproval(q, asB, { approvalId, choice: 'approve' })), 'conflict');
    const second = await db.tx(q => requestApproval(q, asA, req));
    await reject(db.tx(q => cancelApproval(q, asB, second.approvalId)), 'not_found');
    assert.deepEqual(await db.tx(q => cancelApproval(q, asA, second.approvalId)), { state: 'cancelled' });
    const topics = (await db.query('select topic from feture.outbox order by id')).map(r => r.topic);
    assert.deepEqual(topics, ['decide.created', 'decide.resolved', 'decide.created', 'decide.resolved']);
    // The partner does not ask to approve: ordinary widenings apply at once, opening the private part still needs both.
    const c = await resolveAccount(db, PEPPER, 'c'), d = await resolveAccount(db, PEPPER, 'd');
    const trusting = await couple(db, c.id, d.id, { approves: false });
    const asC = await actingProfile(db, c.id, trusting, { write: true });
    assert.deepEqual([needsPartner(asC, 'test.publish'), needsPartner(asC, 'test.openPrivate')], [false, true]);
    await reject(db.tx(q => requestApproval(q, asC, req)), 'approval_not_needed');
    // An immediate narrowing by either partner voids everything pending.
    const third = await db.tx(q => requestApproval(q, asA, req));
    const other = await db.tx(q => requestApproval(q, asA, { ...req, kind: 'test.openPrivate', targetType: 'private' }));
    assert.deepEqual(await db.tx(q => narrowCouple(q, asB, 'discover_hidden')), { cancelled: 2 });
    await reject(db.tx(q => decideApproval(q, asB, { approvalId: third.approvalId, choice: 'approve' })), 'conflict');
    const late = await db.tx(q => requestApproval(q, asA, req));
    await db.query('update feture.profile set safety_epoch = safety_epoch + 1 where id = $1', [pc]);
    await assert.rejects(db.tx(q => decideApproval(q, asB, { approvalId: late.approvalId, choice: 'approve' })), e => e.code === 'conflict' && e.extra.state === 'cancelled');
    assert.equal(applied.length, 1);
    assert.ok(other.approvalId);
  } finally { await pg.close(); }
});

test('outbox: delayed items wait, claims do not overlap, failures back off and park', async () => {
  const { pg, db } = await setup();
  try {
    await enqueue(db, 'push.send', null, { n: 1 });
    await enqueue(db, 'push.send', null, { n: 2 });
    await enqueue(db, 'media.purge', null, { n: 3 }, { delaySeconds: 3600 });
    const [first, second] = await Promise.all([claim(db, { limit: 1 }), claim(db, { limit: 5 })]);
    assert.equal(first.length + second.length, 2);
    await db.query('update feture.outbox set locked_until = null');
    const seen = [];
    const n = await drain(db, { 'push.send': async item => { seen.push(item.payload.n); if (item.payload.n === 2) throw new Error('provider_down'); } });
    assert.equal(n, 2);
    assert.deepEqual(seen.sort(), [1, 2]);
    const rows = await db.query(`select payload->>'n' n, done_at is not null done, last_error, available_at > now() later from feture.outbox order by id`);
    assert.deepEqual(rows.map(r => [r.n, r.done, r.last_error, r.later]), [['1', true, null, false], ['2', false, 'provider_down', true], ['3', false, null, true]]);
    await db.query(`update feture.outbox set attempts = 9, available_at = now() where payload->>'n' = '2'`);
    await drain(db, { 'push.send': async () => { throw new Error('provider_down'); } });
    const [parked] = await db.query(`select available_at = 'infinity'::timestamptz parked from feture.outbox where payload->>'n' = '2'`);
    assert.equal(parked.parked, true);
  } finally { await pg.close(); }
});

test('media: upload intent limits, commit checks storage, scan decisions, removal, DTO visibility and tokens', async () => {
  const { pg, db } = await setup();
  try {
    const storage = fakeStorage();
    const cfg = { storage, tokenSecret: SECRET, mediaOrigin: 'https://media.test' };
    const a = await resolveAccount(db, PEPPER, 'a'), b = await resolveAccount(db, PEPPER, 'b');
    const pa = await person(db, a.id, 'alex'), pb = await person(db, b.id, 'bobby');
    const asA = await actingProfile(db, a.id, pa, { write: true }), asB = await actingProfile(db, b.id, pb, { write: true });
    const intent = input => db.tx(q => uploadIntent(q, asA, cfg, { kind: 'image', mime: 'image/jpeg', bytes: JPEG.length, ...input }));

    await reject(intent({ purpose: 'post', mime: 'image/gif' }), 'rule_violation');
    await reject(intent({ purpose: 'post', bytes: 21 * 1024 * 1024 }), 'too_large');
    await reject(intent({ purpose: 'avatar', explicit: true }), 'rule_violation');
    await reject(intent({ purpose: 'post', viewRule: 'once' }), 'rule_violation');
    await reject(intent({ purpose: 'post', kind: 'video', mime: 'video/mp4' }), 'rule_violation');

    const up = await intent({ purpose: 'post' });
    assert.equal(up.upload.method, 'PUT');
    const [{ storage_key: key }] = await db.query('select storage_key from feture.media_asset where id = $1', [up.assetId]);
    await reject(db.tx(q => commitUpload(q, asA, cfg, up.assetId)), 'conflict'); // nothing uploaded yet
    storage.objects.set(key, { bytes: PNG, mime: 'image/jpeg' }); // claims JPEG, is PNG
    await reject(db.tx(q => commitUpload(q, asB, cfg, up.assetId)), 'not_found'); // not the owner
    assert.deepEqual(await db.tx(q => commitUpload(q, asA, cfg, up.assetId)), { state: 'uploaded' });
    assert.deepEqual(await db.tx(q => commitUpload(q, asA, cfg, up.assetId)), { state: 'uploaded' }); // repeat is harmless
    assert.equal(await scanAsset(db, { storage, scanner: null, classifier: null }, up.assetId), 'rejected'); // sniff mismatch

    const upload = async (purpose, explicit) => {
      const r = await intent({ purpose, explicit });
      const [{ storage_key }] = await db.query('select storage_key from feture.media_asset where id = $1', [r.assetId]);
      storage.objects.set(storage_key, { bytes: JPEG, mime: 'image/jpeg' });
      await db.tx(q => commitUpload(q, asA, cfg, r.assetId));
      return r.assetId;
    };
    const scanner = verdict => ({ name: 'fake-csam', check: async () => ({ result: verdict }) });
    const classifier = label => ({ name: 'fake-nsfw', classify: async () => ({ label, score: 0.9 }) });

    const noProvider = await upload('post');
    assert.equal(await scanAsset(db, { storage, scanner: null, classifier: null }, noProvider), 'needs_review');
    const csam = await upload('post');
    assert.equal(await scanAsset(db, { storage, scanner: scanner('match'), classifier: classifier('safe') }, csam), 'blocked');
    await reject(db.tx(q => removeAsset(q, asA, csam)), 'not_found'); // evidence cannot be deleted by the author
    const explicitAvatar = await upload('avatar');
    assert.equal(await scanAsset(db, { storage, scanner: scanner('pass'), classifier: classifier('explicit') }, explicitAvatar), 'rejected');
    const explicitPost = await upload('post');
    assert.equal(await scanAsset(db, { storage, scanner: scanner('pass'), classifier: classifier('explicit') }, explicitPost), 'approved');
    const authorExplicit = await upload('private', true);
    assert.equal(await scanAsset(db, { storage, scanner: scanner('pass'), classifier: classifier('safe') }, authorExplicit), 'approved');
    const safePost = await upload('post');
    assert.equal(await scanAsset(db, { storage, scanner: scanner('pass'), classifier: classifier('safe') }, safePost), 'approved');
    assert.equal(await scanAsset(db, { storage, scanner: scanner('pass'), classifier: classifier('safe') }, safePost), 'skipped');

    const rows = Object.fromEntries((await db.query('select * from feture.media_asset')).map(r => [r.id, r]));
    assert.equal(rows[authorExplicit].explicitness, 'explicit');
    assert.equal(rows[authorExplicit].explicitness_source, 'author');
    assert.equal(rows[explicitPost].explicitness_source, 'classifier');
    const topics = (await db.query('select topic from feture.outbox order by id')).map(r => r.topic);
    for (const t of ['media.scan', 'safety.csamMatch', 'moderation.mediaReview', 'media.approved']) assert.ok(topics.includes(t), t);

    const view = (id, ctx) => mediaDto(cfg, rows[id], { viewerProfileId: pb, place: 'public', showExplicit: false, ...ctx });
    assert.equal(await view(noProvider, {}), null); // waiting for review: only the author sees it
    assert.equal((await view(noProvider, { viewerProfileId: pa })).pending, true);
    assert.equal(await view(csam, {}), null);
    assert.equal(await view(explicitPost, {}), null); // explicit never in public places
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

    assert.deepEqual(await db.tx(q => removeAsset(q, asA, safePost)), { state: 'removed' });
    const [purge] = await db.query(`select available_at > now() + interval '23 hours' later from feture.outbox where topic = 'media.purge'`);
    assert.equal(purge.later, true);
    assert.equal(sniff(Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])), 'image/heic');
  } finally { await pg.close(); }
});

test('/api/fe handler: auth, schema, acting profile header, idempotent writes, no internal errors leak', async () => {
  const { pg, db } = await setup();
  try {
    const log = [];
    const handler = createFeHandler({
      db, pepper: PEPPER, commands: platform,
      cfg: { media: { storage: fakeStorage(), tokenSecret: SECRET, mediaOrigin: 'https://media.test' } },
      authenticate: async req => { if (req.headers['x-test-user']) return { accountHash: String(req.headers['x-test-user']) }; throw Object.assign(new Error('x'), { status: 401 }); },
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
    const mine = await call({ action: 'profile.mine' });
    assert.deepEqual(mine.body.profiles.map(p => p.handle), ['alex']);
    await pg.exec('reset role; revoke all on feture.op_ledger from feture_api; set role feture_api');
    const broken = await call({ ...intent, opId: '018f0000-0000-7000-8000-0000000000b2' }, { 'x-fe-profile': pa });
    assert.deepEqual([broken.statusCode, broken.body.error, Object.keys(broken.body).sort()], [503, 'unavailable', ['error', 'ok', 'requestId']]);
    assert.ok(log.every(e => Object.keys(e).sort().join() === 'action,outcome,requestId'));
    assert.ok(!JSON.stringify(log).includes('core-a'));
  } finally { await pg.close(); }
});

test('media Worker: token gate, variant/path binding, never the original, private cache bounded by the token', async () => {
  const { handleMedia } = await import('../workers/media/index.mjs');
  const { issueMediaToken } = await import('../server/media/token.mjs');
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
  assert.equal((await get(`/v/${other}/blur`, otherToken)).status, 404); // object missing
  assert.equal((await get(`/v/${asset}/blur`, otherToken)).status, 403); // token for another asset
});

test('/api/fe stays off without its environment', async () => {
  const fe = (await import('../api/fe.mjs')).default;
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { this.body = JSON.parse(s); } };
  await fe({ method: 'POST', headers: {} }, res);
  assert.deepEqual([res.statusCode, res.body.error, res.headers['Cache-Control']], [503, 'unavailable', 'no-store']);
});
