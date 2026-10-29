// Shared PGlite setup for the /api/fe tests: migrations in order, legal documents published the way production
// has them (RLS table + security_invoker view, readable by anon/authenticated only until our migration adds
// feture_api), the restricted feture_api role, and a handler with fake Core auth.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { fromPglite } from '../server/db.mjs';
import { createFeHandler } from '../server/handler.mjs';
import { tokenDelivery } from '../server/media/delivery.mjs';
import { hmac } from '../server/hash.mjs';

export const PEPPER = 'p'.repeat(40);
/** The keyed session id the handler stores for a test sign-in (`x-test-session`, default «test-session»). */
export const testSessionKey = (session = 'test-session') => hmac(PEPPER, 'fe-session:v1:' + session).toString('base64url');

export const MIGRATIONS = ['20261027120000_fe_platform.sql', '20261027120100_fe_media_bucket.sql', '20261027125900_fe_me.sql',
  '20261027130000_fe_catalog.sql', '20261027140000_fe_access.sql', '20261027150000_fe_couples.sql', '20261027160000_fe_staff.sql', '20261027170000_fe_feed.sql', '20261027175000_fe_moderation.sql', '20261027180000_fe_communities.sql', '20261027190000_fe_events.sql', '20261027210000_fe_discover.sql', '20261027220000_fe_chats.sql', '20261027230000_fe_notifications.sql', '20261027240000_fe_people.sql', '20261027250000_fe_premium.sql', '20261027260000_fe_moderation_more.sql', '20261027270000_fe_push.sql', '20261027280000_fe_dsa.sql', '20261027300000_fe_photo_check.sql', '20261028120000_fe_places.sql', '20261028130000_fe_age_document.sql', '20261028150000_fe_wave3.sql', '20261028160000_fe_albums.sql', '20261028170000_fe_access_center.sql', '20261028180000_fe_waves67.sql', '20261028190000_fe_media_av.sql', '20261028200000_fe_account.sql', '20261028220000_fe_drop_notesub.sql', '20261028221500_fe_dispute_guard.sql', '20261028230000_fe_qa_accounts.sql', '20261028231000_fe_video_edit.sql', '20261028233000_fe_video_edit_drop.sql', '20261028240000_fe_qa_hidden.sql', '20261029010000_fe_interest_history_drop.sql', '20261029120000_fe_chat_requests.sql', '20261029140000_fe_second_factor.sql', '20261029153000_fe_notification_defaults.sql', '20261029170000_fe_access_interests.sql', '20261029180000_fe_user_second_factor.sql'];
const mig = name => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');

export const DOCS = ['terms', 'privacy', 'community', 'adult-content', 'cookies'].map((key, i) => ({
  key, id: `018f0000-0000-4000-8000-0000000000d${i}`, hash: String.fromCharCode(97 + i).repeat(64), required: key !== 'cookies',
}));
export const ACCEPT = DOCS.filter(d => d.required).map(d => ({ id: d.id, contentHash: d.hash }));

let ops = 0;
export const op = () => `018f0000-0000-7000-8000-${String(++ops).padStart(12, '0')}`;

/** staffFactor: false (default) — a staff role granted in a test comes with an enrolled second factor and a fresh check
 * in the default test session, so tests about other staff work need no codes; true — the real thing
 * (tests/fe-second-factor-postgres.mjs).
 * mail: receives the new-device emails (server/signin.mjs); a request names its address with `x-fit-email`.
 * @param {{commands: Record<string, any>, migrations?: string[], signals?: (db: any) => any, realtime?: {url: string, key: string}, push?: {webKey: string}, billing?: any, staffFactor?: boolean, mail?: any}} opts */
export async function setup({ commands, migrations = MIGRATIONS, signals, realtime, push, billing, staffFactor = false, mail }) {
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
  if (!staffFactor && migrations.includes('20261029140000_fe_second_factor.sql')) {
    await pg.exec(`
      create function public.test_staff_factor() returns trigger language plpgsql security definer as $f$
      begin
        insert into feture.account_totp (account_id, secret_sealed, enabled_at) values (new.account_id, 'test', now()) on conflict do nothing;
        insert into feture.staff_session (account_id, session_key) values (new.account_id, '${testSessionKey()}')
          on conflict (account_id, session_key) do update set started_at = now(), checked_at = now();
        return new;
      end $f$;
      create trigger test_staff_factor after insert on feture.staff_role for each row execute function public.test_staff_factor();`);
  }
  await pg.exec('set role feture_api');
  const db = fromPglite(pg);
  const handler = createFeHandler({
    db, pepper: PEPPER, commands,
    cfg: { media: { storage: null, delivery: tokenDelivery('s'.repeat(40), 'https://media.test') }, realtime: realtime ?? null, push: push ?? null, ...(billing ? { billing } : {}) },
    signals: signals ? signals(db) : null,
    // A test user named qa-… stands for an e2e persona login (qa-…@feture.test).
    authenticate: async req => ({ accountHash: String(req.headers['x-test-user']), accountGeneration: String(req.headers['x-test-gen'] ?? 'g1'), qa: String(req.headers['x-test-user']).startsWith('qa-'),
      sessionKey: String(req.headers['x-test-session'] ?? 'test-session'), ...(req.headers['x-test-sid'] ? { sessionId: String(req.headers['x-test-sid']) } : {}),
      // The device family and when Core opened the sign-in (new-device notice): `x-test-label`, `x-test-at` (default: now).
      deviceLabel: String(req.headers['x-test-label'] ?? ''), signedInAt: String(req.headers['x-test-at'] ?? new Date().toISOString()) }),
    quota: async () => true, cors: () => false, log: () => {}, maintenanceTtl: 0, mail: mail ?? null, appUrl: 'https://app.test',
  });
  /** @param {string} user @param {string | null} profile @param {Record<string, unknown>} body @param {Record<string, string>} [headers] */
  const call = async (user, profile, body, headers = {}) => {
    const res = { statusCode: 0, setHeader() {}, end(s) { this.body = JSON.parse(s); } };
    await handler({ method: 'POST', headers: { 'x-test-user': user, ...(profile ? { 'x-fe-profile': profile } : {}), ...headers }, body }, res);
    return { status: res.statusCode, ...res.body };
  };
  /** Registered person; age-verified unless told otherwise. New accounts start outside Discover (owner 28.10.2026); most
   * tests need a person who is in it, so `discover` switches it on here — pass `discover: null` to keep the real default. */
  const person = async (user, handle, { verified = true, birthDate = '1990-01-01', discover = /** @type {string | null} */ ('visible') } = {}) => {
    const r = await call(user, null, { action: 'account.create', opId: op(), handle, birthDate, locale: 'ru', documents: ACCEPT, newsOptIn: false });
    assert.equal(r.status, 200, JSON.stringify(r));
    if (verified) await db.query(`update feture.account set age_verified_until = now() + interval '1 year' where person_profile_id = $1`, [r.profileId]);
    if (discover) await db.query('update feture.profile_settings set discover_mode = $2 where profile_id = $1', [r.profileId, discover]);
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

/** A person whose profile photo staff matched with a selfie, with an account `days` old — a trusted claimant of
 * «это я на фото» when older than DISPUTE_LIMITS.trustedAccountAge. @param {any} db @param {string} profileId @param {number} days */
export async function photoVerified(db, profileId, days = 40) {
  const [{ id: accountId }] = await db.query('select id from feture.account where person_profile_id = $1', [profileId]);
  const [{ id: photo }] = await db.query(
    `insert into feture.media_asset (owner_profile_id, uploaded_by, kind, purpose, storage_key, mime, declared_bytes, state, explicitness, copies_at)
     values ($1, $2, 'image', 'avatar', 'u/' || gen_random_uuid(), 'image/jpeg', 10, 'approved', 'safe', now()) returning id`, [profileId, accountId]);
  await db.query('update feture.profile set avatar_asset_id = $2 where id = $1', [profileId, photo]);
  await db.query(`insert into feture.photo_check (profile_id, account_id, gesture, photo_asset_id, state, decided_at) values ($1, $2, 'thumbs_up', $3, 'approved', now())`,
    [profileId, accountId, photo]);
  await db.query(`update feture.account set created_at = now() - make_interval(days => $2) where id = $1`, [accountId, days]);
}
