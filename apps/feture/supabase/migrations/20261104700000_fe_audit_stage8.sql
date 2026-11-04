-- Audit 04.11.2026, stage 8: events and mentions. Re-runnable.

-- Item 36: «Мест», optional. A couple takes two places.
alter table feture.event add column if not exists seats int;
do $$ begin
  alter table feture.event add constraint event_seats_range check (seats is null or seats between 1 and 10000);
exception when duplicate_object then null; end $$;

-- Item 53: who comes to an event, person by person: approved applications (events by application) or «иду», each
-- active profile's members. A person marked both alone and with the couple comes once (count distinct account_id).
create or replace function feture.event_going(ev uuid) returns table (profile_id uuid, account_id uuid)
language sql stable security definer set search_path = '' as $$
  select g.profile_id, m.account_id
  from feture.event e
  cross join lateral (
    select x.profile_id from feture.event_application x where x.event_id = e.id and x.state = 'approved' and e.requires_application
    union
    select r.profile_id from feture.event_rsvp r where r.event_id = e.id and r.status = 'going' and not e.requires_application
  ) g
  join feture.profile p on p.id = g.profile_id and p.state = 'active'
  join feture.profile_member m on m.profile_id = p.id and m.state = 'active'
  where e.id = ev
$$;
revoke all on function feture.event_going(uuid) from public;
grant execute on function feture.event_going(uuid) to feture_api;

-- Item 43: a mention keeps the profile it was written to, so a new nickname still opens the same person and the old
-- nickname taken by someone else never points to them.
alter table feture.mention add column if not exists written text;
update feture.mention m set written = lower(p.handle) from feture.profile p where p.id = m.profile_id and m.written is null;
