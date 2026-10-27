// @ts-check
/** Text search helpers shared by the commands that take a typed query (feed, events, communities). */

/** `%words%` for ILIKE: % _ and \ typed by the person are literal. @param {string | undefined} q */
export const likePattern = q => q ? '%' + q.replace(/[\\%_]/g, m => '\\' + m) + '%' : null;

/** Opaque keyset cursor over (time, id): encode. @param {Date | string} at @param {string} id */
export const writeCursor = (at, id) => Buffer.from(JSON.stringify([new Date(at).toISOString(), id])).toString('base64url');
