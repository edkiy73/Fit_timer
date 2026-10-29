-- Timed moderation measures (audit 30.10.2026, item 9): a suspension or a restriction may end on its own.
-- null = until lifted by staff. The worker (server/jobs.mjs sweepExpiredSanctions) lifts what has run out;
-- feture.restricted() already treats an expired restriction as gone in the meantime.
alter table feture.profile add column suspended_until timestamptz, add column restricted_until timestamptz;

create index profile_suspended_until_idx on feture.profile (suspended_until) where suspended_until is not null;
create index profile_restricted_until_idx on feture.profile (restricted_until) where restricted_until is not null;

create or replace function feture.restricted(p uuid) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  select exists (select 1 from feture.profile x where x.id = p and x.restricted_at is not null
                   and (x.restricted_until is null or x.restricted_until > now()))
      or exists (select 1 from feture.profile_member m join feture.account a on a.id = m.account_id join feture.profile pp on pp.id = a.person_profile_id
                 where m.profile_id = p and m.state = 'active' and pp.restricted_at is not null
                   and (pp.restricted_until is null or pp.restricted_until > now()))
$$;

-- A measure that ran out is lifted by the worker, not by a person: its journal line has no staff member.
alter table feture.staff_action alter column staff_account_id drop not null;
