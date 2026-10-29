// @ts-check
/** Keyset paging and sort for every staff queue (one helper, so all queues page and sort the same way).
 * The base query selects its rows without ORDER BY / LIMIT and names its sort columns in `keys`, in sort order.
 * Every key must be non-null and the last one unique. A key's `dir` is `asc`, `desc`, or `order`: `order` follows the
 * reader's choice (`old` = ascending, `new` = descending), so only the queue's own date flips, never its priority.
 * The cursor is the text of the last row's keys joined by `|`, read by the database (no JS date, no lost microseconds).
 * @typedef {{name: string, type: string, dir?: string}} QueueKey
 * @typedef {{limit: number, after?: string | undefined, order?: 'old' | 'new' | undefined}} PageInput
 */

const SEP = '|';

/** @param {QueueKey} k @param {PageInput} input */
const dirOf = (k, input) => {
  const d = k.dir ?? 'order';
  return d === 'order' ? (input.order === 'new' ? 'desc' : 'asc') : d;
};

/** SQL for one page. Base placeholders are $1..$n (`baseParams`); this adds the cursor and the limit after them.
 * @param {PageInput} input @param {QueueKey[]} keys @param {string} base @param {unknown[]} baseParams
 * @returns {{sql: string, params: unknown[]}} */
export function queuePageSql(input, keys, base, baseParams) {
  const params = [...baseParams];
  /** @param {unknown} v */
  const ph = v => { params.push(v); return `$${params.length}`; };
  let where = 'true';
  if (input.after) {
    const vals = input.after.split(SEP);
    if (vals.length !== keys.length) throw new Error('bad_cursor');
    const phs = vals.map(ph);
    const ors = keys.map((k, i) => {
      const same = keys.slice(0, i).map((kk, j) => `x.${kk.name} = ${phs[j]}::${kk.type}`);
      const cmp = dirOf(k, input) === 'asc' ? '>' : '<';
      return `(${[...same, `x.${k.name} ${cmp} ${phs[i]}::${k.type}`].join(' and ')})`;
    });
    where = `(${ors.join(' or ')})`;
  }
  const limit = ph(input.limit);
  const orderBy = keys.map(k => `x.${k.name} ${dirOf(k, input)}`).join(', ');
  const cursorCols = keys.map(k => `x.${k.name}::text as ${k.name}_cursor`).join(', ');
  // `x_total`: how many rows from here on (the whole queue on a first page) — counted before the limit.
  return { sql: `select x.*, ${cursorCols}, count(*) over ()::int as x_total from (${base}) x where ${where} order by ${orderBy} limit ${limit}`, params };
}

/** Cursor of a row. @param {Record<string, any>} row @param {QueueKey[]} keys */
export const rowCursor = (row, keys) => keys.map(k => String(row[`${k.name}_cursor`])).join(SEP);

/** What a page returns besides its items: `next` asks for the following page (set only on a full page), `tail` names
 * the last row so a live refresh can ask for what came after it. Pass the raw rows (before any filtering by the handler),
 * so a page that is partly hidden from this reader still pages on.
 * @param {Record<string, any>[]} rows @param {QueueKey[]} keys @param {number} limit */
export function pageInfo(rows, keys, limit) {
  const last = rows[rows.length - 1];
  const tail = last ? rowCursor(last, keys) : null;
  // `total`: on a first page the size of the whole queue (a later page counts from its cursor on).
  return { next: rows.length === limit ? tail : null, tail, total: last ? Number(last.x_total) : 0 };
}

/** Rows as the response carries them: the cursor columns dropped. @param {Record<string, any>[]} rows */
export const plainRows = rows => rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !k.endsWith('_cursor') && k !== 'x_total')));

/** Most queues: the creation time (the reader's order), then the id. */
export const CREATED_KEYS = [{ name: 'created_at', type: 'timestamptz' }, { name: 'id', type: 'uuid', dir: 'asc' }];

/** Check queues: when the check was submitted, then its id. */
export const SUBMITTED_KEYS = [{ name: 'submitted_at', type: 'timestamptz' }, { name: 'id', type: 'uuid', dir: 'asc' }];
