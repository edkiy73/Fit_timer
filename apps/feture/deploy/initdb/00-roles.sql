-- FetUre on plain PostgreSQL (docs/infra/migration-plan.md). Runs once, on an empty data directory.
-- The roles the migrations grant to are Supabase's names; PostgREST switches into them by the JWT `role` claim.
--   authenticator — the only login PostgREST uses; it can become the three API roles and nothing else.
--   service_role  — what the server-side key (APPBASE_REST_KEY) means: bypasses RLS, like on Supabase.
--   feture_api    — the app's own login (FETURE_DATABASE_URL), limited to the `feture` schema by the migrations.
--   anon/authenticated — no keys are ever issued for them here; they exist so the grants in the migrations apply.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
  -- FetUre's API role (created the same way by supabase/migrations/…_fe_platform.sql). Roles are not in a pg_dump,
  -- so it must exist before a backup is restored on a new server; migrate.sh then gives it its password.
  if not exists (select 1 from pg_roles where rolname = 'feture_api') then create role feture_api nologin noinherit; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
create extension if not exists pg_cron;
