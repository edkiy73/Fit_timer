// Every outbox topic is handled or explicitly silent (nothing waits in feture.outbox forever), and every new
// «Нужно решить» item reaches the person: a push and a live signal. On PGlite as feture_api.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { posts } from '../server/commands/posts.mjs';
import { couples } from '../server/commands/couples.mjs';
import { people } from '../server/commands/people.mjs';
import { inbox } from '../server/commands/inbox.mjs';
import { mediaHandlers } from '../server/jobs.mjs';
import { notifyHandlers, SILENT_TOPICS } from '../server/notify.mjs';
import { pushHandlers } from '../server/push.mjs';
import { noticeHandlers } from '../server/commands/dsa.mjs';
import { helpHandlers } from '../server/commands/support.mjs';
import { verificationHandlers } from '../server/commands/premium.mjs';
import { drain, enqueue } from '../server/outbox.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const SERVER = fileURLToPath(new URL('../server/', import.meta.url));
/** Topic expressions that are not a literal, with every value they can take (a new one fails the test until listed). */
const DYNAMIC = /** @type {Record<string, string[]>} */ ({
  "'event.' + input.decision": ['event.approve', 'event.reject', 'event.hide'], // contracts/events.mjs event.decide
});

/** @param {string} dir @returns {string[]} */
const files = dir => readdirSync(dir).flatMap(f => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.mjs') ? [p] : [];
});

/** Every topic some server code enqueues. */
function enqueuedTopics() {
  const topics = new Set();
  for (const file of files(SERVER)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\benqueue\(\s*\w+\s*,\s*([^,]+?)\s*,/g)) {
      const expr = m[1].replace(/\s+/g, ' ');
      if (/^(topic|t)$/.test(expr) && file.endsWith('outbox.mjs')) continue;
      if (DYNAMIC[expr]) { DYNAMIC[expr].forEach(t => topics.add(t)); continue; }
      // A ternary: only its two branches are topics (the condition may compare with strings too).
      const literals = [...(expr.includes('?') ? expr.slice(expr.indexOf('?')) : expr).matchAll(/'([^']+)'/g)].map(x => x[1]);
      if (literals.length && (/^'[^']+'$/.test(expr) || expr.includes('?')) && !expr.includes('+')) { literals.forEach(t => topics.add(t)); continue; }
      const constant = /^[A-Z_]+$/.test(expr) && src.match(new RegExp(`const ${expr} = '([^']+)'`));
      if (constant) { topics.add(constant[1]); continue; }
      assert.fail(`${file}: enqueue topic «${expr}» is not a literal; list its values in DYNAMIC`);
    }
  }
  return topics;
}

test('every enqueued topic has a handler or is listed as silent', () => {
  const mail = async () => {};
  /** @type {any} */ const db = null;
  const handled = new Set([mediaHandlers(db, { scan: null }), verificationHandlers(db, {}), notifyHandlers(db), noticeHandlers(db, mail),
    helpHandlers(db, mail, 'support@example.com'), pushHandlers(db, null)].flatMap(Object.keys));
  const topics = enqueuedTopics();
  assert.ok(topics.size > 50, 'the scan found the enqueue calls');
  for (const t of ['post.returned', 'link.proposed', 'link.changeProposed', 'moderation.report', 'event.approve']) assert.ok(topics.has(t), t);
  const lost = [...topics].filter(t => !handled.has(t)).sort();
  assert.deepEqual(lost, [], 'topics nobody takes would wait in feture.outbox forever: handle them or add them to SILENT_TOPICS');
  // Silent topics are silent: no real handler with the same name elsewhere, and each is still enqueued somewhere.
  for (const t of SILENT_TOPICS) assert.ok(topics.has(t), `${t} is listed as silent but nothing enqueues it`);
});

const setup = () => baseSetup({ commands: { ...platform, ...me, ...social, ...posts, ...couples, ...people, ...inbox } });
const draft = (/** @type {string} */ body) => ({ type: 'post', body, audience: 'all', inFeed: true, topics: [], mediaIds: [], interests: [], tags: [] });

async function world() {
  const env = await setup();
  const { db } = env;
  /** @type {import('../server/realtime.mjs').Signal[]} */
  const signals = [];
  const deliver = async () => { while ((await drain(db, notifyHandlers(db, s => signals.push(s)), { limit: 50 })) > 0) { /* until empty */ } };
  const accountOf = async (/** @type {string} */ profile) => (await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [profile]))[0].account_id;
  /** Push kinds queued for an account. */
  const pushes = async (/** @type {string} */ account) => (await db.query(
    `select payload->>'kind' kind from feture.outbox where topic = 'push.deliver' and payload->>'account' = $1 order by id`, [account])).map(r => r.kind);
  const waiting = async () => (await db.query(`select topic from feture.outbox where done_at is null and topic <> 'push.deliver' order by id`)).map(r => r.topic);
  return { ...env, signals, deliver, accountOf, pushes, waiting };
}

test('silent topics are marked done without a notification and kept for the sweep', async () => {
  const { pg, db, person, call, deliver, waiting } = await world();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
    for (const t of SILENT_TOPICS) await enqueue(db, t, b, { from: a, owner: a, with: a });
    await deliver();
    assert.deepEqual(await waiting(), []);
    const rows = await db.query(`select topic from feture.outbox where topic = any($1) and done_at is not null`, [[...SILENT_TOPICS]]);
    assert.equal(rows.length, SILENT_TOPICS.length); // still there: the 7-day sweep removes them
    assert.deepEqual((await call('ub', null, { action: 'notifications.list' })).items, []);
  } finally { await pg.close(); }
});

test('a post back from review tells its writer once, opens the draft; a stale or republished one says nothing', async () => {
  const { pg, db, person, call, deliver, accountOf, pushes, signals, coupleOf } = await world();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
    const pair = await coupleOf([a, b]);
    const ua = await accountOf(a);
    const d = await call('ua', pair, { action: 'post.saveDraft', opId: op(), post: draft('С фото') });
    const [m] = await db.query(
      `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
       values ($1, $2, 'image', 'post', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'rejected', 'safe', now()) returning id`, [pair, ua]);
    await db.query(`insert into feture.media_attachment (asset_id, target_type, target_id) values ($1, 'post', $2)`, [m.id, d.id]);
    assert.equal((await call('ua', pair, { action: 'post.publish', opId: op(), postId: d.id })).state, 'draft');
    await deliver();
    const mine = (await call('ua', null, { action: 'notifications.list' })).items;
    assert.deepEqual(mine.map((/** @type {any} */ n) => [n.type, n.object?.type, n.object?.id, n.data.reason]), [['postReturned', 'post', d.id, 'media_rejected']]);
    assert.deepEqual(await pushes(ua), ['other']);
    assert.ok(signals.some(s => s.kind === 'notify'));
    // A couple's draft is its writer's alone: the partner hears nothing.
    assert.ok(!(await call('ub', null, { action: 'notifications.list' })).items.some((/** @type {any} */ n) => n.type === 'postReturned'));

    // Not announced once it is no longer a draft (published again, or gone).
    await db.query(`update feture.post set state = 'published' where id = $1`, [d.id]);
    await enqueue(db, 'post.returned', pair, { postId: d.id, reason: 'media_rejected' });
    await deliver();
    assert.equal((await call('ua', null, { action: 'notifications.list' })).items.length, 1);
  } finally { await pg.close(); }
});

test('the migration closes silent rows and stale returned posts, keeps a decline inside its undo window', async () => {
  const { pg, db } = await world();
  try {
    const rows = [['access.revoked', '0'], ['moderation.report', '0'], ['community.joined', '0'], ['match.ended', '0'],
      ['post.returned', '2 days'], ['post.returned', '1 hour'], ['like.received', '0']];
    for (const [topic, age] of rows) {
      await db.query(`insert into feture.outbox (topic, payload, created_at) values ($1, '{}', now() - $2::interval)`, [topic, age]);
    }
    await db.query(`insert into feture.outbox (topic, payload, available_at) values ('access.declined', '{}', now() + interval '1 minute')`);
    await db.query(`insert into feture.outbox (topic, payload, available_at) values ('access.declined', '{}', now() - interval '1 minute')`);
    await pg.exec(readFileSync(new URL('../supabase/migrations/20261103110000_fe_outbox_silent.sql', import.meta.url), 'utf8'));
    const open = await db.query(`select topic, available_at > now() later from feture.outbox where done_at is null order by id`);
    assert.deepEqual(open.map(r => [r.topic, r.later]), [['post.returned', false], ['like.received', false], ['access.declined', true]]);
  } finally { await pg.close(); }
});

test('a link proposal and a proposed change reach the other side; a returned approval reaches the one who asked', async () => {
  const { pg, db, person, call, deliver, accountOf, pushes, signals, coupleOf } = await world();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira');
    const ub = await accountOf(b), ua = await accountOf(a);
    const l = await call('ua', a, { action: 'link.propose', opId: op(), profileId: b, kind: 'friend' });
    await deliver();
    assert.deepEqual(await pushes(ub), ['decide']);
    assert.ok(signals.some(s => s.profile === b && s.kind === 'decide'));
    assert.deepEqual((await call('ub', null, { action: 'notifications.list' })).items, []); // it is in «Нужно решить», not the inbox
    await call('ub', b, { action: 'link.answer', opId: op(), linkId: l.id, accept: true, vis: 'all' });
    await call('ub', b, { action: 'link.proposeChange', opId: op(), linkId: l.id, kind: 'ds', mySide: 'dom' });
    signals.length = 0;
    await deliver();
    assert.ok((await pushes(ua)).includes('decide'));
    assert.ok(signals.some(s => s.profile === a && s.kind === 'decide'));

    // A partner's change returned for rework: the asker gets a push and a signal, no inbox row.
    const c = await person('uc', 'Noa');
    const pair = await coupleOf([b, c]);
    await db.query('update feture.profile_member set approves_partner = true where profile_id = $1', [pair]);
    const p = await call('ub', pair, { action: 'profile.update', opId: op(), rev: 1, bio: 'Нас двое' });
    await deliver();
    const before = (await pushes(ub)).length;
    signals.length = 0;
    assert.equal((await call('uc', pair, { action: 'decide.approval', opId: op(), approvalId: p.pending.approvalId, choice: 'return' })).state, 'returned');
    await deliver();
    assert.deepEqual((await pushes(ub)).slice(before), ['decide']);
    assert.ok(signals.some(s => s.profile === pair && s.kind === 'decide'));
    assert.ok(!(await call('ub', null, { action: 'notifications.list' })).items.some((/** @type {any} */ n) => n.type === 'pair.decided'));
  } finally { await pg.close(); }
});

test('a pair invite from someone blocked since sends no push', async () => {
  const { pg, person, call, deliver, accountOf, pushes } = await world();
  try {
    const a = await person('ua', 'Alex'), b = await person('ub', 'Kira'), c = await person('uc', 'Noa');
    const ub = await accountOf(b), uc = await accountOf(c);
    await call('ua', null, { action: 'couple.invite', opId: op(), handle: 'Kira' });
    // Kira blocks Alex before the queue runs.
    await call('ub', b, { action: 'block.set', opId: op(), profileId: a, on: true });
    await deliver();
    assert.deepEqual(await pushes(ub), []);
    // Someone not blocked still gets theirs (a second account invites Noa).
    await person('ud', 'Mia');
    await call('ud', null, { action: 'couple.invite', opId: op(), handle: 'Noa' });
    await deliver();
    assert.deepEqual(await pushes(uc), ['decide']);
  } finally { await pg.close(); }
});
