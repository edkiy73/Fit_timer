// The production adapter never has more operations in flight than pooled connections (postgres pipelines
// beyond that, and Supavisor in transaction mode stalls on a pipelined query), and a transaction's queries
// run one after another. JSON text reaches json/jsonb as is, as with PGlite (no double encoding).
import assert from 'node:assert/strict';
import test from 'node:test';
import postgres from 'postgres';
import { POSTGRES_TYPES, fromPostgres } from '../server/db.mjs';

function fakeSql() {
  const state = { inFlight: 0, peak: 0, txInFlight: 0, txPeak: 0 };
  const tick = () => new Promise(r => setTimeout(r, 5));
  const unsafe = async () => { state.inFlight++; state.peak = Math.max(state.peak, state.inFlight); await tick(); state.inFlight--; return [{ ok: 1 }]; };
  const begin = async fn => {
    state.inFlight++; state.peak = Math.max(state.peak, state.inFlight);
    try {
      return await fn({ unsafe: async () => { state.txInFlight++; state.txPeak = Math.max(state.txPeak, state.txInFlight); await tick(); state.txInFlight--; return [{ ok: 1 }]; } });
    } finally { state.inFlight--; }
  };
  return { state, sql: { unsafe, begin } };
}

test('no more operations in flight than slots, across concurrent callers', async () => {
  const { state, sql } = fakeSql();
  const db = fromPostgres(sql, 3);
  const results = await Promise.all([
    ...Array.from({ length: 10 }, () => db.query('select 1')),
    ...Array.from({ length: 4 }, () => db.tx(q => q.query('select 1'))),
  ]);
  assert.equal(results.length, 14);
  assert.equal(state.peak, 3);
});

test('queries of one transaction run one after another, and a failed one does not block the next', async () => {
  const { state, sql } = fakeSql();
  const db = fromPostgres(sql, 3);
  await db.tx(async q => {
    await Promise.all([q.query('a'), q.query('b'), q.query('c'), q.query('d')]);
  });
  assert.equal(state.txPeak, 1);
  let calls = 0;
  const flaky = { unsafe: async () => { calls++; if (calls === 1) throw new Error('boom'); return [{ ok: 1 }]; }, begin: async fn => fn(flaky) };
  const db2 = fromPostgres(flaky, 1);
  await db2.tx(async q => {
    await assert.rejects(q.query('x'));
    assert.deepEqual(await q.query('y'), [{ ok: 1 }]);
  });
});

test('code holding a slot is not made to wait for another (no deadlock with one slot)', async () => {
  const { sql } = fakeSql();
  const db = fromPostgres(sql, 1);
  const r = await Promise.race([
    db.tx(async () => db.query('select 1')),
    new Promise(resolve => setTimeout(() => resolve('deadlock'), 500)),
  ]);
  assert.notEqual(r, 'deadlock');
});

test('json/jsonb parameters: text passes through, values are encoded once; bigint is a number', async () => {
  const sql = postgres('postgres://u:p@127.0.0.1:1/db', { types: POSTGRES_TYPES });
  for (const oid of [114, 3802]) {
    const serialize = sql.options.serializers[oid];
    assert.equal(serialize('["a",1]'), '["a",1]');
    assert.equal(serialize('{"k":"v"}'), '{"k":"v"}');
    assert.equal(serialize({ k: 'v' }), '{"k":"v"}');
    assert.equal(serialize(['a']), '["a"]');
  }
  assert.deepEqual(sql.options.parsers[3802]('{"k":[1]}'), { k: [1] });
  assert.equal(sql.options.parsers[20]('42'), 42); // bigint as a number, as PGlite returns it
  assert.equal(sql.options.serializers[20](42), '42');
  await sql.end({ timeout: 0 });
});
