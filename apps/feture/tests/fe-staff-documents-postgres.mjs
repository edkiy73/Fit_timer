// «Документы» in the staff area (owner 05.11.2026) on PGlite with the real documents schema: owners and leads save a
// draft, publish it as a new immutable version that the app requires from new accounts; others may not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { platform } from '../server/commands/platform.mjs';
import { me } from '../server/commands/me.mjs';
import { staff } from '../server/commands/staff.mjs';
import { setup as baseSetup, op } from './fe-helpers.mjs';

const mig = (/** @type {string} */ f) => readFileSync(new URL('../supabase/migrations/' + f, import.meta.url), 'utf8');

/** The test schema's stub of the documents tables, swapped for the real ones (20261010225653) once the people exist
 * (signing up reads the stub's documents). */
async function setup() {
  const env = await baseSetup({ commands: { ...platform, ...me, ...staff } });
  const boss = await env.person('uo', 'Boss'), mod = await env.person('um', 'Mira');
  await env.pg.exec('reset role');
  await env.pg.exec(`drop view public.feture_document_current; drop table public.feture_document_versions;
    create table public.feture_profiles (account_hash text primary key); create role service_role;`);
  // Its first line checks the old Supabase project it was written for; the schema itself is what matters here.
  await env.pg.exec(mig('20261010225653_feture_documents.sql').split('\n').filter(l => !l.includes('feture_seed')).join('\n'));
  await env.pg.exec(`grant select on public.feture_document_versions, public.feture_document_current to feture_api;
    create policy feture_api_read on public.feture_document_versions for select to feture_api using (true);`);
  await env.pg.exec(mig('20261105200000_fe_staff_documents.sql'));
  await env.pg.exec('set role feture_api');
  return { ...env, boss, mod };
}

test('«Документы»: save a draft, publish it as a new version (fresh code), the current version follows; a moderator may not', async () => {
  const { pg, db, call, boss, mod } = await setup();
  try {
    await db.query(`insert into feture.staff_role (account_id, role) select id, 'owner' from feture.account where person_profile_id = $1`, [boss]);
    await db.query(`insert into feture.staff_role (account_id, role) select id, 'moderator' from feture.account where person_profile_id = $1`, [mod]);
    const blocks = [{ type: 'heading', text: 'Правила' }, { type: 'paragraph', text: 'Уважай границы других.' }, { type: 'list', items: ['Без угроз', 'Без чужих фото'] }];
    const draft = { key: 'community', locale: 'ru', title: 'Правила сообщества', requiresAccept: true, blocks };
    assert.equal((await call('um', null, { action: 'staff.documentSave', opId: op(), expectedRevision: 0, ...draft })).status, 403);
    assert.equal((await call('uo', null, { action: 'staff.documentSave', opId: op(), expectedRevision: 0, ...draft })).revision, 1);
    assert.equal((await call('uo', null, { action: 'staff.documentSave', opId: op(), expectedRevision: 0, ...draft })).rule, 'revision_conflict');
    assert.equal((await call('uo', null, { action: 'staff.documentPublish', opId: op(), key: 'community', locale: 'ru', revision: 1, reviewed: true })).version, 1);
    const list = await call('uo', null, { action: 'staff.documents' });
    const cur = list.current.find((/** @type {any} */ d) => d.key === 'community' && d.locale === 'ru');
    assert.deepEqual([cur.version, cur.title, cur.sourceRevision], [1, 'Правила сообщества', 1]);
    assert.equal((await db.query(`select count(*)::int n from feture.staff_action where action in ('document.save', 'document.publish')`))[0].n, 2);
  } finally { await pg.close(); }
});
