// Realtime signals (S2 §8) on PGlite: opaque per-profile channels in session.bootstrap, kind-only payloads sent after
// commit, nothing on a replay or a failed command, a broken sender never breaks a command, notifications from the tick.
import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { social } from '../server/commands/social.mjs';
import { discover } from '../server/commands/discover.mjs';
import { chats } from '../server/commands/chats.mjs';
import { couples } from '../server/commands/couples.mjs';
import { channelFor, createSignals, broadcastSender, typingTag } from '../server/realtime.mjs';
import { runJobs } from '../server/jobs.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const PEPPER = 'p'.repeat(40); // the helper's handler pepper
const REALTIME = { url: 'https://abc.supabase.co', key: 'sb_publishable_test' };

async function world({ failing = false } = {}) {
  /** @type {any[][]} */
  const sent = [];
  const sender = async (/** @type {any[]} */ messages) => { if (failing) throw new Error('realtime_http_500'); sent.push(messages); };
  let signals;
  const env = await baseSetup({
    commands: { ...platform, ...me, ...social, ...discover, ...chats, ...couples }, realtime: REALTIME,
    signals: db => (signals = createSignals({ db, pepper: PEPPER, sender })),
  });
  const { call, db } = env;
  /** A Discover-ready person: registered, adult, with an approved avatar. */
  const person = async (/** @type {string} */ user, /** @type {string} */ handle) => {
    const id = await env.person(user, handle);
    const [{ account_id }] = await db.query('select account_id from feture.profile_member where profile_id = $1 limit 1', [id]);
    const [av] = await db.query(
      `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at, view_rule)
       values ($1, $2, 'image', 'avatar', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now(), 'normal') returning id`, [id, account_id]);
    await db.query('update feture.profile set avatar_asset_id = $1 where id = $2', [av.id, id]);
    return id;
  };
  const matchUp = async (/** @type {string} */ ua, /** @type {string} */ a, /** @type {string} */ ub, /** @type {string} */ b) => {
    await call(ua, a, { action: 'discover.decide', opId: op(), profileId: b, decision: 'like' });
    const r = await call(ub, b, { action: 'like.send', opId: op(), profileId: a, source: 'likes' });
    assert.equal(r.state, 'matched', JSON.stringify(r));
    return r.conversationId;
  };
  const accountOf = async (/** @type {string} */ p) => (await env.db.query('select id from feture.account where person_profile_id = $1', [p]))[0].id;
  return { ...env, person, sent, matchUp, accountOf, signals: /** @type {any} */ (signals) };
}

test('bootstrap gives each own profile an opaque channel bound to its members; nothing else is exposed', async () => {
  const { pg, call, person, coupleOf, accountOf } = await world();
  try {
    const a = await person('ua', 'alex'), b = await person('ub', 'kira');
    const couple = await coupleOf([a, b]);
    const boot = await call('ua', null, { action: 'session.bootstrap' });
    assert.equal(boot.status, 200);
    assert.deepEqual([boot.realtime.url, boot.realtime.key], [REALTIME.url, REALTIME.key]);
    const ua = await accountOf(a), ub = await accountOf(b);
    assert.deepEqual(boot.realtime.channels, { [a]: channelFor(PEPPER, a, [ua]), [couple]: channelFor(PEPPER, couple, [ua, ub]) });
    for (const t of Object.values(boot.realtime.channels)) {
      assert.match(String(t), /^fe:[A-Za-z0-9_-]{22,}$/);
      assert.ok(!String(t).includes(a) && !String(t).includes(couple)); // no profile id in the name
    }
    // The partner gets the same couple channel; an outsider's bootstrap does not list it.
    assert.equal((await call('ub', null, { action: 'session.bootstrap' })).realtime.channels[couple], boot.realtime.channels[couple]);
    await person('uc', 'noa');
    assert.equal((await call('uc', null, { action: 'session.bootstrap' })).realtime.channels[couple], undefined);
    // A partner who leaves keeps an old token that goes quiet: the name changes with the member set.
    await pg.query(`update feture.profile_member set state = 'left' where profile_id = $1 and account_id = $2`, [couple, ub]);
    assert.notEqual((await call('ua', null, { action: 'session.bootstrap' })).realtime.channels[couple], boot.realtime.channels[couple]);
  } finally { await pg.close(); }
});

test('chat.send and chat.read signal the other side with the kind only, after commit, once per opId', async () => {
  const { pg, call, person, matchUp, sent, accountOf } = await world();
  try {
    const a = await person('ua', 'alex'), b = await person('ub', 'kira'), c = await person('uc', 'noa');
    const conv = await matchUp('ua', a, 'ub', b);
    sent.length = 0;
    const id = op();
    assert.equal((await call('ua', a, { action: 'chat.send', opId: id, conversationId: conv, body: 'Секретный текст' })).status, 200);
    const toB = channelFor(PEPPER, b, [await accountOf(b)]);
    assert.deepEqual(sent, [[{ topic: toB, event: 'new', payload: { k: 'chat' }, private: false }]]);
    // No text, no names, no ids anywhere in what goes out.
    const wire = JSON.stringify(sent);
    for (const leak of ['Секретный', 'alex', 'kira', conv, a, b]) assert.ok(!wire.includes(leak), leak);

    // A replay of the same opId answers from the ledger and signals nothing.
    sent.length = 0;
    const again = await call('ua', a, { action: 'chat.send', opId: id, conversationId: conv, body: 'Секретный текст' });
    assert.equal(again.replayed, true);
    assert.deepEqual(sent, []);

    // A refused command (not a member) signals nothing.
    assert.equal((await call('uc', c, { action: 'chat.send', opId: op(), conversationId: conv, body: 'x' })).status, 404);
    assert.deepEqual(sent, []);

    // Receipt: the sender's ticks update; reading again (nothing new) stays quiet.
    await call('ub', b, { action: 'chat.read', conversationId: conv, upToSeq: 1 });
    assert.deepEqual(sent, [[{ topic: channelFor(PEPPER, a, [await accountOf(a)]), event: 'new', payload: { k: 'chat' }, private: false }]]);
    sent.length = 0;
    await call('ub', b, { action: 'chat.read', conversationId: conv, upToSeq: 1 });
    assert.deepEqual(sent, []);
  } finally { await pg.close(); }
});

test('«печатает…»: the other side hears typing with the conversation tag only; members only, nothing stored', async () => {
  const { pg, call, person, matchUp, sent, accountOf } = await world();
  try {
    const a = await person('ua', 'alex'), b = await person('ub', 'kira'), c = await person('uc', 'noa');
    const conv = await matchUp('ua', a, 'ub', b);
    const tag = (await call('ub', b, { action: 'chat.messages', conversationId: conv })).typingTag;
    assert.equal(tag, typingTag(PEPPER, conv));
    assert.equal((await call('ua', a, { action: 'chat.messages', conversationId: conv })).typingTag, tag);
    sent.length = 0;
    assert.equal((await call('ua', a, { action: 'chat.typing', conversationId: conv })).sent, true);
    assert.deepEqual(sent, [[{ topic: channelFor(PEPPER, b, [await accountOf(b)]), event: 'new', payload: { k: 'typing', t: tag }, private: false }]]);
    for (const leak of [conv, a, b, 'alex']) assert.ok(!JSON.stringify(sent).includes(leak), leak);
    sent.length = 0;
    assert.equal((await call('uc', c, { action: 'chat.typing', conversationId: conv })).status, 404);
    assert.deepEqual(sent, []);
  } finally { await pg.close(); }
});

test('a failing sender never fails the command', async () => {
  const { pg, call, person, matchUp } = await world({ failing: true });
  try {
    const a = await person('ua', 'alex'), b = await person('ub', 'kira');
    const conv = await matchUp('ua', a, 'ub', b);
    const r = await call('ua', a, { action: 'chat.send', opId: op(), conversationId: conv, body: 'Привет' });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal((await call('ub', b, { action: 'chat.messages', conversationId: conv })).items.length, 1);
  } finally { await pg.close(); }
});

test('the worker tick signals new notifications in one batch after they are written', async () => {
  const { pg, db, call, person, matchUp, sent, signals, accountOf } = await world();
  try {
    const a = await person('ua', 'alex'), b = await person('ub', 'kira');
    await matchUp('ua', a, 'ub', b);
    sent.length = 0;
    await runJobs(db, { scan: null, signals });
    const topics = sent.flat().map(m => m.topic);
    // The match notification reaches the side that did not complete the match (the other caused it).
    assert.ok(topics.includes(channelFor(PEPPER, a, [await accountOf(a)])), JSON.stringify(sent));
    for (const m of sent.flat()) assert.deepEqual([m.event, m.private, Object.keys(m.payload)], ['new', false, ['k']]);
    assert.ok(sent.flat().every(m => ['notify', 'decide'].includes(m.payload.k)));
    // Nothing new: the next tick is quiet.
    sent.length = 0;
    await runJobs(db, { scan: null, signals });
    assert.deepEqual(sent, []);
    void call;
  } finally { await pg.close(); }
});

test('REST sender: Supabase batch broadcast shape, secret only in headers, short timeout', async () => {
  /** @type {any} */
  let got;
  const send = broadcastSender({ url: 'https://abc.supabase.co/', secret: 'sb_secret_x', timeoutMs: 50,
    fetch: /** @type {any} */ (async (/** @type {string} */ url, /** @type {any} */ init) => { got = { url, init }; return { ok: true, status: 202 }; }) });
  await send([{ topic: 'fe:abc', event: 'new', payload: { k: 'chat' }, private: false }]);
  assert.equal(got.url, 'https://abc.supabase.co/realtime/v1/api/broadcast');
  assert.equal(got.init.method, 'POST');
  assert.equal(got.init.headers.apikey, 'sb_secret_x');
  assert.deepEqual(JSON.parse(got.init.body), { messages: [{ topic: 'fe:abc', event: 'new', payload: { k: 'chat' }, private: false }] });
  const slow = broadcastSender({ url: 'https://abc.supabase.co', secret: 's', timeoutMs: 20,
    fetch: /** @type {any} */ ((/** @type {string} */ _u, /** @type {any} */ init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))) });
  await assert.rejects(slow([]), /aborted/); // createSignals swallows it; the sender itself reports
});

test('a couple invite (addressed to the account) signals «decide» on the invitee’s own profile', async () => {
  const { pg, db, call, person, sent, signals, accountOf } = await world();
  try {
    const a = await person('ua', 'alex'), b = await person('ub', 'kira');
    assert.equal((await call('ua', a, { action: 'couple.invite', opId: op(), handle: 'kira' })).status, 200);
    sent.length = 0;
    await runJobs(db, { scan: null, signals });
    const want = channelFor(PEPPER, b, [await accountOf(b)]);
    assert.ok(sent.flat().some(m => m.topic === want && m.payload.k === 'decide'), JSON.stringify(sent));
  } finally { await pg.close(); }
});

test('own server (SSE): bootstrap tells the client the transport; the channels stay the same opaque tokens', async () => {
  const env = await baseSetup({
    commands: { ...platform, ...me }, realtime: { url: 'https://app.example.com', key: 'sse', transport: 'sse' },
    signals: db => createSignals({ db, pepper: PEPPER, sender: async () => {} }),
  });
  try {
    const a = await env.person('ua', 'alex');
    const boot = await env.call('ua', null, { action: 'session.bootstrap' });
    assert.equal(boot.status, 200);
    assert.deepEqual({ url: boot.realtime.url, key: boot.realtime.key, transport: boot.realtime.transport },
      { url: 'https://app.example.com', key: 'sse', transport: 'sse' });
    assert.match(boot.realtime.channels[a], /^fe:[A-Za-z0-9_-]{32}$/);
  } finally { await env.pg.close(); }
});
