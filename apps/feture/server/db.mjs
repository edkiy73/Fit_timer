// @ts-check
/** One tiny query interface over two drivers: `postgres` in production (Supavisor, transaction mode)
 * and PGlite in tests. Domain code never sees the driver, only `query` and `tx`.
 * @typedef {{query: (text: string, params?: unknown[]) => Promise<any[]>}} Q
 * @typedef {Q & {tx: <T>(fn: (q: Q) => Promise<T>) => Promise<T>}} Db
 */
import { AsyncLocalStorage } from 'node:async_hooks';

/** @param {{query: Function, transaction: Function}} pg PGlite instance @returns {Db} */
export function fromPglite(pg) {
  /** @param {{query: Function}} c @returns {Q} */
  const wrap = c => ({ query: async (text, params = []) => (await c.query(text, params)).rows });
  return { ...wrap(pg), tx: fn => pg.transaction(/** @param {{query: Function}} t */ t => fn(wrap(t))) };
}

/** `postgres` JSON.stringifies every json/jsonb parameter, but domain code passes JSON text it already encoded
 * (as PGlite in tests expects): a string arrives encoded twice and is stored as a JSON string, which the
 * schema's checks refuse (or, without a check, keep silently). Text is passed through, anything else
 * encoded once — the same as PGlite. Use as `types` when creating the client. */
export const POSTGRES_TYPES = Object.freeze({
  // bigint (message seq, queue ids, unqualified count(*)) comes back as a number, as from PGlite; all ours fit.
  bigint: { to: 20, from: [20], serialize: (/** @type {unknown} */ x) => String(x), parse: (/** @type {string} */ x) => Number(x) },
  json: { to: 114, from: [114, 3802], serialize: (/** @type {unknown} */ x) => typeof x === 'string' ? x : JSON.stringify(x), parse: (/** @type {string} */ x) => JSON.parse(x) },
});

/** `postgres` pipelines a query onto a busy connection once every pooled one is taken, and Supavisor in
 * transaction mode stalls on a pipelined query until something else reaches that backend (minutes in
 * production). So no more operations are in flight than the pool has connections — across the concurrent
 * requests a warm instance serves too — and the queries of one transaction go one after another.
 * Code that already holds a slot (inside a transaction) is not made to wait for another one.
 * @param {{unsafe: Function, begin: Function}} sql `postgres` client created with prepare:false
 * @param {number} slots the client's `max` @returns {Db} */
export function fromPostgres(sql, slots) {
  const held = new AsyncLocalStorage();
  /** @type {Array<() => void>} */
  const waiting = [];
  let free = slots;
  const release = () => { const next = waiting.shift(); if (next) next(); else free++; };
  /** @template T @param {() => Promise<T>} fn @returns {Promise<T>} */
  const gated = async fn => {
    if (held.getStore()) return fn();
    if (free > 0) free--; else await new Promise(resolve => waiting.push(() => resolve(undefined)));
    try { return await held.run(true, fn); } finally { release(); }
  };
  /** @param {{unsafe: Function}} c @returns {Q} */
  const serial = c => {
    /** @type {Promise<unknown>} */
    let chain = Promise.resolve();
    return {
      query: (text, params = []) => {
        const run = chain.then(() => c.unsafe(text, /** @type {any[]} */ (params)));
        chain = run.catch(() => {});
        return run;
      },
    };
  };
  return {
    query: (text, params = []) => gated(async () => sql.unsafe(text, /** @type {any[]} */ (params))),
    tx: fn => gated(() => sql.begin(/** @param {{unsafe: Function}} s */ s => fn(serial(s)))),
  };
}
