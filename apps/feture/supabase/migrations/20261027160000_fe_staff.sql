-- S4 step 1–2: staff roles, append-only staff journal, staff media views, media review decisions
-- (docs/server/S4-MODERATION.md §1–3). The first owner is granted by the project owner directly in SQL.

create table feture.staff_role (
  account_id uuid not null references feture.account(id) on delete cascade,
  role text not null check (role in ('owner', 'lead', 'moderator', 'verifier', 'auditor', 'support')),
  granted_by uuid references feture.account(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (account_id, role, granted_at)
);
create unique index staff_role_active on feture.staff_role (account_id, role) where revoked_at is null;

-- Every staff decision and every look at user media, append-only.
create table feture.staff_action (
  id uuid primary key default feture.uuid_v7(),
  staff_account_id uuid not null references feture.account(id),
  action text not null check (action ~ '^[a-z]+(\.[a-zA-Z]+)+$'),
  target_type text not null,
  target_id uuid,
  detail jsonb not null default '{}' check (jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default now()
);
create index staff_action_target on feture.staff_action (target_type, target_id, created_at desc);
create index staff_action_staff on feture.staff_action (staff_account_id, created_at desc);

create function feture.staff_action_immutable() returns trigger language plpgsql set search_path = pg_catalog as $$
begin raise exception 'feture_staff_action_immutable'; end $$;
create trigger staff_action_no_rewrite before update or delete on feture.staff_action
  for each row execute function feture.staff_action_immutable();

do $$
declare t text;
begin
  foreach t in array array['staff_role', 'staff_action'] loop
    execute format('alter table feture.%I enable row level security', t);
    execute format('alter table feture.%I force row level security', t);
    execute format('revoke all on feture.%I from public', t);
    execute format('create policy api_all on feture.%I to feture_api using (true) with check (true)', t);
  end loop;
end $$;
grant select, insert, update on feture.staff_role to feture_api;
grant select, insert on feture.staff_action to feture_api;   -- the journal can only grow
grant execute on function feture.staff_action_immutable() to feture_api;
