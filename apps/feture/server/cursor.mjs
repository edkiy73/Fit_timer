// @ts-check
/** Opaque keyset cursor over (time, id) at full precision, for paged lists (server/README.md). A query selects
 * `<time>::text cursor_at` and `<id> cursor_id`, orders by both descending and fetches `limit + 1` rows; rows written
 * in one statement are never skipped. Older lists (posts, inbox, interests, events, communities) still carry their own
 * copy and can move here when touched. */
import { fail } from './errors.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** @param {string | undefined} c @returns {{at: string | null, id: string | null}} nulls for the first page */
export function readKeyset(c) {
  if (!c) return { at: null, id: null };
  try {
    const v = JSON.parse(Buffer.from(c, 'base64url').toString('utf8'));
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && !Number.isNaN(Date.parse(v[0])) && typeof v[1] === 'string' && UUID.test(v[1])) {
      return { at: v[0], id: v[1] };
    }
  } catch { /* invalid below */ }
  fail(400, 'invalid_input', { fields: ['cursor'] });
}

/** One page and the next cursor; the cursor columns never reach the response.
 * @template {{cursor_at: string, cursor_id: string}} T @param {T[]} rows @param {number} limit */
export function keysetPage(rows, limit) {
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(({ cursor_at: _a, cursor_id: _i, ...r }) => r),
    next: rows.length > limit && last ? Buffer.from(JSON.stringify([last.cursor_at, last.cursor_id])).toString('base64url') : null,
  };
}
