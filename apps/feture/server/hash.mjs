// @ts-check
import { createHash, createHmac } from 'node:crypto';

/** JSON with sorted object keys, so equal requests hash equally. @param {unknown} value @returns {string} */
export function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (value);
    return '{' + Object.keys(obj).filter(k => obj[k] !== undefined).sort()
      .map(k => JSON.stringify(k) + ':' + stableJson(obj[k])).join(',') + '}';
  }
  return JSON.stringify(value ?? null);
}

/** @param {string | Buffer} value */
export const sha256 = value => createHash('sha256').update(value).digest();

/** @param {string | Buffer} key @param {string | Buffer} value */
export const hmac = (key, value) => createHmac('sha256', key).update(value).digest();

/** @param {Buffer} buf */
export const b64url = buf => buf.toString('base64url');
