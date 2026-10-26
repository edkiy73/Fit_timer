// @ts-check
/** A client-safe failure: `code` and optional `extra` reach the response, nothing else does. */
export class FeError extends Error {
  /** @param {number} status @param {string} code @param {Record<string, unknown>} [extra] */
  constructor(status, code, extra) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

/** @param {number} status @param {string} code @param {Record<string, unknown>} [extra] @returns {never} */
export function fail(status, code, extra) {
  throw new FeError(status, code, extra);
}

/** Postgres unique_violation, from either driver. @param {unknown} error */
export const isUniqueViolation = error =>
  !!error && typeof error === 'object' && /** @type {{code?: unknown}} */ (error).code === '23505';
