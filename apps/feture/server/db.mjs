// @ts-check
/** One tiny query interface over two drivers: `postgres` in production (Supavisor, transaction mode)
 * and PGlite in tests. Domain code never sees the driver, only `query` and `tx`.
 * @typedef {{query: (text: string, params?: unknown[]) => Promise<any[]>}} Q
 * @typedef {Q & {tx: <T>(fn: (q: Q) => Promise<T>) => Promise<T>}} Db
 */

/** @param {{query: Function, transaction: Function}} pg PGlite instance @returns {Db} */
export function fromPglite(pg) {
  /** @param {{query: Function}} c @returns {Q} */
  const wrap = c => ({ query: async (text, params = []) => (await c.query(text, params)).rows });
  return { ...wrap(pg), tx: fn => pg.transaction(/** @param {{query: Function}} t */ t => fn(wrap(t))) };
}

/** @param {{unsafe: Function, begin: Function}} sql `postgres` client created with prepare:false @returns {Db} */
export function fromPostgres(sql) {
  /** @param {{unsafe: Function}} c @returns {Q} */
  const wrap = c => ({ query: (text, params = []) => c.unsafe(text, /** @type {any[]} */ (params)) });
  return { ...wrap(sql), tx: fn => sql.begin(/** @param {{unsafe: Function}} s */ s => fn(wrap(s))) };
}
