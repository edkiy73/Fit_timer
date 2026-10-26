// @ts-check
import { fail, isUniqueViolation } from './errors.mjs';
import { sha256, stableJson } from './hash.mjs';

/** @typedef {import('./db.mjs').Db} Db @typedef {import('./db.mjs').Q} Q */

/** Runs one write command exactly once per (account, opId) in one transaction.
 * A retry with the same opId and the same input returns the stored result with `replayed: true`;
 * the same opId with a different input is a client bug and gets 409.
 * @template {Record<string, unknown>} T
 * @param {Db} db @param {string} accountId
 * @param {{opId: string, action: string, input: unknown}} op
 * @param {(q: Q) => Promise<T>} run
 * @returns {Promise<T & {replayed?: true}>} */
export async function once(db, accountId, { opId, action, input }, run) {
  const hash = sha256(stableJson({ action, input }));
  const attempt = () => db.tx(async q => {
    const [prev] = await q.query(
      'select request_hash, result from feture.op_ledger where account_id = $1 and op_id = $2',
      [accountId, opId]);
    if (prev) return replay(prev, hash);
    const result = await run(q);
    await q.query(
      `insert into feture.op_ledger (account_id, op_id, action, request_hash, result)
       values ($1, $2, $3, $4, $5)`,
      [accountId, opId, action, hash, JSON.stringify(result)]);
    return result;
  });
  try {
    return await attempt();
  } catch (error) {
    // Two identical requests raced; the loser's transaction rolled back, so reading the winner is safe.
    if (!isUniqueViolation(error)) throw error;
    return attempt();
  }
}

/** @param {{request_hash: Uint8Array, result: any}} prev @param {Buffer} hash */
function replay(prev, hash) {
  if (!Buffer.from(prev.request_hash).equals(hash)) fail(409, 'op_conflict');
  const result = typeof prev.result === 'string' ? JSON.parse(prev.result) : prev.result;
  return { ...result, replayed: true };
}
