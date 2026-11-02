// Realtime over SSE on our own server (server/realtime-sse.mjs): a real HTTP server, real streaming responses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHub } from '../server/realtime-sse.mjs';
import { channelFor, createSignals } from '../server/realtime.mjs';

const A = channelFor('p'.repeat(40), 'profile-a', ['acc-1']);
const B = channelFor('p'.repeat(40), 'profile-b', ['acc-2']);

async function serve(hub) {
  const server = createServer((req, res) => hub.handle(req, res));
  await new Promise(r => server.listen(0, '127.0.0.1', () => r(null)));
  return { server, base: `http://127.0.0.1:${/** @type {any} */ (server.address()).port}` };
}

/** Opens a stream and collects its `data:` events. */
async function listen(base, channels, headers = {}) {
  const ctl = new AbortController();
  const res = await fetch(`${base}/api/fe-events?c=${encodeURIComponent(channels.join(','))}`, { headers, signal: ctl.signal });
  const events = [];
  let text = '';
  const reading = (async () => {
    try {
      for await (const chunk of /** @type {any} */ (res.body)) {
        text += Buffer.from(chunk).toString('utf8');
        let i;
        while ((i = text.indexOf('\n\n')) >= 0) {
          const block = text.slice(0, i); text = text.slice(i + 2);
          for (const line of block.split('\n')) if (line.startsWith('data: ')) events.push(JSON.parse(line.slice(6)));
        }
      }
    } catch { /* aborted */ }
  })();
  return { res, events, close: async () => { ctl.abort(); await reading; } };
}

const tick = (ms = 50) => new Promise(r => setTimeout(r, ms));

test('a signal reaches exactly the streams of its channel, with only kind and tag', async () => {
  const hub = createHub();
  const { server, base } = await serve(hub);
  try {
    const one = await listen(base, [A]);
    const both = await listen(base, [A, B]);
    const other = await listen(base, [B]);
    assert.equal(one.res.status, 200);
    assert.match(String(one.res.headers.get('content-type')), /^text\/event-stream/);
    assert.equal(one.res.headers.get('access-control-allow-origin'), '*');
    await tick();
    await hub.sender([{ topic: A, event: 'new', payload: { k: 'chat' }, private: false },
      { topic: A, event: 'new', payload: { k: 'typing', t: 'abcdefgh12345678' }, private: false }]);
    await tick();
    assert.deepEqual(one.events, [{ c: A, k: 'chat' }, { c: A, k: 'typing', t: 'abcdefgh12345678' }]);
    assert.deepEqual(both.events, one.events);
    assert.deepEqual(other.events, []);
    assert.deepEqual(hub.stats(), { connections: 3, topics: 2 });
    await one.close(); await both.close(); await other.close();
    await tick();
    assert.deepEqual(hub.stats(), { connections: 0, topics: 0 }, 'closing a stream unsubscribes it');
  } finally { server.close(); }
});

test('only well-formed channels, a few at a time; per-address and total caps', async () => {
  const hub = createHub({ maxPerAddress: 2, maxTotal: 3 });
  const { server, base } = await serve(hub);
  try {
    for (const bad of [[], ['nope'], ['fe:short'], [A, B, A + 'x', B + 'y', 'fe:' + 'z'.repeat(30)]]) {
      const r = await fetch(`${base}/api/fe-events?c=${encodeURIComponent(bad.join(','))}`);
      assert.equal(r.status, 400, JSON.stringify(bad));
    }
    assert.equal((await fetch(`${base}/api/fe-events?c=${A}`, { method: 'POST' })).status, 405);
    const s1 = await listen(base, [A], { 'x-forwarded-for': '1.1.1.1' });
    const s2 = await listen(base, [A], { 'x-forwarded-for': '1.1.1.1' });
    const s3 = await listen(base, [A], { 'x-forwarded-for': '1.1.1.1' });
    assert.equal(s3.res.status, 429, 'per address');
    const s4 = await listen(base, [A], { 'x-forwarded-for': '2.2.2.2' });
    const s5 = await listen(base, [A], { 'x-forwarded-for': '3.3.3.3' });
    assert.equal(s5.res.status, 429, 'total');
    for (const s of [s1, s2, s3, s4, s5]) await s.close();
    await tick();
    assert.equal((await listen(base, [A], { 'x-forwarded-for': '1.1.1.1' })).res.status, 200, 'slots come back after close');
  } finally { server.closeAllConnections(); server.close(); }
});

test('createSignals with the hub as sender: the same signals as Broadcast, de-duplicated', async () => {
  const hub = createHub();
  /** @type {any[]} */ const got = [];
  hub.subscribe([A], e => got.push(e));
  const db = { query: async () => [{ profile_id: 'profile-a', members: ['acc-1'] }] };
  const signals = createSignals({ db: /** @type {any} */ (db), pepper: 'p'.repeat(40), sender: hub.sender });
  await signals.send([{ profile: 'profile-a', kind: 'notify' }, { profile: 'profile-a', kind: 'notify' }, { profile: 'profile-a', kind: 'feed' }]);
  assert.deepEqual(got, [{ c: A, k: 'notify' }, { c: A, k: 'feed' }]);
});
