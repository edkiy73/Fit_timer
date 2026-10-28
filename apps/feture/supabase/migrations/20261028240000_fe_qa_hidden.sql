-- e2e persona content stays out of everyone else's lists (owner 28.10.2026, «скрой qa контент»). Profiles of e2e
-- persona accounts (feture.account.qa, 20261028230000_fe_qa_accounts.sql) are hidden from every viewer who is not one:
-- their posts, discussions, replies, events, communities, likes, follows, activity and notifications. Persona viewers
-- still see everything, so scenarios keep working. One rule, `feture.qa_hidden(viewer, owner)`, and it lives inside
-- `feture.blocked(viewer, target)`, which every list and the post/event/community visibility rules already apply
-- per viewer — so no list can miss it. Unlike a block it is one-way: a persona viewer is never hidden from anything.

-- Materialised on the profile so the rule is two primary-key reads: a profile is a persona's when any of its member
-- accounts is (a couple with a persona partner included), kept in sync with memberships and account.qa.
alter table feture.profile add column qa boolean not null default false;

create function feture.profile_qa_sync(profile uuid) returns void
language sql security definer set search_path = pg_catalog, feture as $$
  update feture.profile p set qa = x.qa
  from (select exists (select 1 from feture.profile_member m join feture.account a on a.id = m.account_id
                       where m.profile_id = profile and a.qa) qa) x
  where p.id = profile and p.qa is distinct from x.qa
$$;

create function feture.profile_member_qa() returns trigger
language plpgsql security definer set search_path = pg_catalog, feture as $$
begin
  if tg_op <> 'INSERT' then perform feture.profile_qa_sync(old.profile_id); end if;
  if tg_op <> 'DELETE' then perform feture.profile_qa_sync(new.profile_id); end if;
  return null;
end $$;
create trigger profile_member_qa after insert or delete or update of profile_id, account_id on feture.profile_member
  for each row execute function feture.profile_member_qa();

create function feture.account_qa() returns trigger
language plpgsql security definer set search_path = pg_catalog, feture as $$
begin
  perform feture.profile_qa_sync(m.profile_id) from feture.profile_member m where m.account_id = new.id;
  return null;
end $$;
create trigger account_qa after update of qa on feture.account
  for each row when (old.qa is distinct from new.qa) execute function feture.account_qa();

update feture.profile p set qa = true
where exists (select 1 from feture.profile_member m join feture.account a on a.id = m.account_id where m.profile_id = p.id and a.qa);

-- Hidden for this viewer: the owner is a persona's and the viewer is not (an absent viewer is not one either).
create function feture.qa_hidden(viewer uuid, owner uuid) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  select coalesce((select o.qa from feture.profile o where o.id = owner), false)
     and not coalesce((select v.qa from feture.profile v where v.id = viewer), false)
$$;

-- Hidden from each other: a block by one side on the other or on anyone the other contains; and, one way, a persona's
-- profile from a viewer who is not one (feture.qa_hidden).
create or replace function feture.blocked(viewer uuid, target uuid) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  select feture.qa_hidden(viewer, target) or exists (
    select 1 from feture.block b
    where (b.blocker_profile_id = viewer and b.blocked_profile_id in (select feture.profile_people(target)))
       or (b.blocker_profile_id = target and b.blocked_profile_id in (select feture.profile_people(viewer))))
$$;

grant execute on function feture.qa_hidden(uuid, uuid) to feture_api;
grant execute on function feture.profile_qa_sync(uuid) to feture_api;
grant execute on function feture.profile_member_qa() to feture_api;
grant execute on function feture.account_qa() to feture_api;
