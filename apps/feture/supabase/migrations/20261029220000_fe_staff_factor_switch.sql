-- «2FA для сотрудников» (owner 29.10.2026, docs/infra/security.md): a test-only switch that waives the staff second
-- factor. Append-only log of changes; the newest row is the current value, no row = ON (required). It is written only
-- through the admin-key path (/api/admin feture.platform.staffFactor), never by a staff member. Nothing is deleted
-- from account_totp: switching OFF waives the requirement, ON again demands it exactly as before.
create table feture.staff_factor_change (
  id bigint generated always as identity primary key,
  required boolean not null,
  changed_by text not null default 'admin' check (char_length(changed_by) <= 60),
  changed_at timestamptz not null default now()
);

-- The current value; any failure to read it counts as ON (fail closed).
create function feture.staff_factor_required() returns boolean language plpgsql stable as $$
begin
  return coalesce((select c.required from feture.staff_factor_change c order by c.id desc limit 1), true);
exception when others then
  return true;
end $$;

alter table feture.staff_factor_change enable row level security;
alter table feture.staff_factor_change force row level security;
revoke all on feture.staff_factor_change from public;
create policy api_all on feture.staff_factor_change to feture_api using (true) with check (true);
grant select, insert on feture.staff_factor_change to feture_api;   -- the log can only grow
grant execute on function feture.staff_factor_required() to feture_api;
