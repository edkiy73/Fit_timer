// Shared PGlite setup for the /api/fe tests: migrations in order, legal documents published the way production
// has them (RLS table + security_invoker view, readable by anon/authenticated only until our migration adds
// feture_api), the restricted feture_api role, and a handler with fake Core auth.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { fromPglite } from '../server/db.mjs';
import { createFeHandler } from '../server/handler.mjs';
import { tokenDelivery } from '../server/media/delivery.mjs';

export const MIGRATIONS = ['20261027120000_fe_platform.sql', '20261027120100_fe_media_bucket.sql', '20261027125900_fe_me.sql',
  '20261027130000_fe_catalog.sql', '20261027140000_fe_access.sql', '20261027150000_fe_couples.sql', '20261027160000_fe_staff.sql', '20261027170000_fe_feed.sql', '20261027175000_fe_moderation.sql', '20261027180000_fe_communities.sql', '20261027190000_fe_events.sql', '20261027210000_fe_discover.sql', '20261027220000_fe_chats.sql', '20261027230000_fe_notifications.sql', '20261027240000_fe_people.sql', '20261027250000_fe_premium.sql', '20261027260000_fe_moderation_more.sql', '20261027270000_fe_push.sql', '20261027280000_fe_dsa.sql', '20261027300000_fe_photo_check.sql'];
const mig = name => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');

export const DOCS = ['terms', 'privacy', 'community', 'adult-content', 'cookies'].map((key, i) => ({
  key, id: `018f0000-0000-4000-8000-0000000000d${i}`, hash: String.fromCharCode(97 + i).repeat(64), required: key !== 'cookies',
}));
export const ACCEPT = DOCS.filter(d => d.required).map(d => ({ id: d.id, contentHash: d.hash }));

let ops = 0;
export const op = () => `018f0000-0000-7000-8000-${String(++ops).padStart(12, '0')}`;

/** @param {{commands: Record<string, any>, migrations?: string[], signals?: (db: any) => any, realtime?: {url: string, key: string}}} opts */
export async function setup({ commands, migrations = MIGRATIONS, signals, realtime }) {
  const pg = new PGlite();
  await pg.exec('create role anon; create role authenticated;');
  await pg.exec(`
    create table public.feture_document_versions (id uuid primary key, document_key text, locale text, content_hash text,
      requires_accept boolean, version int default 1, effective_at timestamptz default now() - interval '1 day');
    alter table public.feture_document_versions enable row level security;
    create policy feture_reviewed_document_read on public.feture_document_versions for select to anon, authenticated using (true);
    create view public.feture_document_current with (security_invoker = true) as
      select distinct on (document_key, locale) id, document_key, locale, content_hash, requires_accept
      from public.feture_document_versions where effective_at <= now() order by document_key, locale, version desc;
    insert into public.feture_document_versions (id, document_key, locale, content_hash, requires_accept) values
      ${DOCS.map(d => `('${d.id}', '${d.key}', 'ru', '${d.hash}', ${d.required})`).join(', ')};`);
  for (const f of migrations) await pg.exec(mig(f));
  await pg.exec('set role feture_api');
  const db = fromPglite(pg);
  const handler = createFeHandler({
    db, pepper: 'p'.repeat(40), commands,
    cfg: { media: { storage: null, delivery: tokenDelivery('s'.repeat(40), 'https://media.test') }, realtime: realtime ?? null },
    signals: signals ? signals(db) : null,
    authenticate: async req => ({ accountHash: String(req.headers['x-test-user']), accountGeneration: String(req.headers['x-test-gen'] ?? 'g1') }),
    quota: async () => true, cors: () => false, log: () => {},
  });
  /** @param {string} user @param {string | null} profile @param {Record<string, unknown>} body @param {Record<string, string>} [headers] */
  const call = async (user, profile, body, headers = {}) => {
    const res = { statusCode: 0, setHeader() {}, end(s) { this.body = JSON.parse(s); } };
    await handler({ method: 'POST', headers: { 'x-test-user': user, ...(profile ? { 'x-fe-profile': profile } : {}), ...headers }, body }, res);
    return { status: res.statusCode, ...res.body };
  };
  /** Registered person; age-verified unless told otherwise. */
  const person = async (user, handle, { verified = true, birthDate = '1990-01-01' } = {}) => {
    const r = await call(user, null, { action: 'account.create', opId: op(), handle, birthDate, locale: 'ru', documents: ACCEPT, newsOptIn: false });
    assert.equal(r.status, 200, JSON.stringify(r));
    if (verified) await db.query(`update feture.account set age_verified_until = now() + interval '1 year' where person_profile_id = $1`, [r.profileId]);
    return r.profileId;
  };
  /** Couple profile of existing person profiles (slice E will create couples through invitations). */
  const coupleOf = async (personIds) => {
    const [{ id }] = await db.query(`insert into feture.profile (kind, name) values ('couple', 'Пара') returning id`);
    for (const p of personIds) {
      const [{ id: account }] = await db.query(`select id from feture.account where person_profile_id = $1`, [p]);
      await db.query(`insert into feture.profile_member (profile_id, profile_kind, account_id, joined_at) values ($1, 'couple', $2, now())`, [id, account]);
    }
    await db.query(`insert into feture.profile_settings (profile_id) values ($1)`, [id]);
    await db.query(`insert into feture.profile_details (profile_id) values ($1)`, [id]);
    return id;
  };
  return { pg, db, call, person, coupleOf };
}
