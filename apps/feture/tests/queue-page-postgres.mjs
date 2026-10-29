// Keyset paging of the staff queues (server/queue-page.mjs) on PGlite: every page after the first starts exactly after the
// cursor of the previous one, in both orders, with boolean, integer and timestamp keys, equal values and no repeats.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { queuePageSql, pageInfo, rowCursor } from '../server/queue-page.mjs';

/** Walks every page of a base query and returns the ids in the order the pages gave them. */
async function walk(pg, base, keys, order, limit) {
  const ids = [];
  let after;
  for (let pages = 0; pages < 100; pages++) {
    const { sql, params } = queuePageSql({ limit, after, order }, keys, base, []);
    const rows = (await pg.query(sql, params)).rows;
    ids.push(...rows.map(r => r.id));
    const info = pageInfo(rows, keys, limit);
    if (!info.next) return ids;
    after = info.next;
  }
  throw new Error('paging does not end');
}

test('queue paging: every item once, in order, both directions, mixed key types', async () => {
  const pg = new PGlite();
  await pg.exec(`
    create table q(id uuid primary key, urgent boolean not null, opened_at timestamptz not null, prio int not null);
    insert into q
      select gen_random_uuid(), g % 3 = 0, timestamptz '2026-10-27 14:07:02.353791+00' + (g / 4) * interval '7 microseconds', g % 2
      from generate_series(1, 37) g;`);
  const keys = [{ name: 'urgent', type: 'boolean', dir: 'desc' }, { name: 'prio', type: 'int', dir: 'asc' },
    { name: 'opened_at', type: 'timestamptz' }, { name: 'id', type: 'uuid', dir: 'asc' }];
  const base = 'select id, urgent, opened_at, prio from q';
  for (const order of ['old', 'new']) {
    for (const limit of [1, 4, 50]) {
      const ids = await walk(pg, base, keys, order, limit);
      assert.equal(ids.length, 37, `${order} limit ${limit}: item count`);
      assert.equal(new Set(ids).size, 37, `${order} limit ${limit}: no repeats`);
      const full = (await pg.query(`${base} order by urgent desc, prio asc, opened_at ${order === 'new' ? 'desc' : 'asc'}, id asc`)).rows.map(r => r.id);
      assert.deepEqual(ids, full, `${order} limit ${limit}: same order as one full query`);
    }
  }
  await pg.close();
});

test('queue paging: a cursor with the wrong number of parts is refused', () => {
  const keys = [{ name: 'created_at', type: 'timestamptz' }, { name: 'id', type: 'uuid' }];
  assert.throws(() => queuePageSql({ limit: 5, after: 'only-one-part' }, keys, 'select 1', []), /bad_cursor/);
  assert.equal(rowCursor({ created_at_cursor: '2026-10-27 14:07:02+00', id_cursor: 'a' }, keys), '2026-10-27 14:07:02+00|a');
});
