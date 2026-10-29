-- Display name and @nick (owner 29.10.2026).
-- Every profile has a unique nick (`handle`) and an optional name the person chose (`chosen_name`, any human name).
-- `name` stays the one column every read shows, now kept by triggers: the chosen name, else — a person: the nick;
-- a couple: «Имя и Имя» of the partners (their shown names), else the couple's nick. Writes go to `chosen_name`.
-- Change limits (server/commands/me.mjs): a nick once per 6 months, the first change after sign-up free; a name
-- once per 2 weeks, the first fill and one correction free. Couples have a nick too (mandatory, for tagging).

alter table feture.profile
  add column chosen_name text not null default '' check (char_length(chosen_name) <= 60),
  add column handle_changes integer not null default 0 check (handle_changes >= 0),
  add column name_changed_at timestamptz,
  add column name_changes integer not null default 0 check (name_changes >= 0);

-- What a profile shows as its name.
create function feture.shown_name(p_id uuid, p_kind text, p_chosen text, p_handle text) returns text
language sql stable set search_path = pg_catalog, feture as $$
  select left(coalesce(
    nullif(p_chosen, ''),
    case when p_kind = 'couple' then (
      select nullif(string_agg(pp.name, ' и ' order by pp.created_at, pp.id), '')
      from feture.profile_member m join feture.account a on a.id = m.account_id join feture.profile pp on pp.id = a.person_profile_id
      where m.profile_id = p_id and m.state = 'active' and pp.name <> '') end,
    p_handle, ''), 60)
$$;

-- Existing profiles (before the triggers, which would rewrite `name`): a person whose name is the nick chose none; a couple whose name is the partners' default chose none.
-- Nicks changed before keep that change counted.
update feture.profile set handle_changes = 1 where handle_changed_at is not null;
update feture.profile p set chosen_name = p.name
where p.state <> 'deleted' and p.name <> '' and p.name is distinct from p.handle
  and (p.kind = 'person' or p.name is distinct from feture.shown_name(p.id, 'couple', '', null));

create function feture.profile_name_keep() returns trigger
language plpgsql set search_path = pg_catalog, feture as $$
begin
  -- An insert that names the profile directly (older paths, tests) chose that name.
  if tg_op = 'INSERT' and new.chosen_name = '' and coalesce(new.name, '') <> '' and new.name is distinct from new.handle then
    new.chosen_name := new.name;
  end if;
  new.name := feture.shown_name(new.id, new.kind, new.chosen_name, new.handle);
  return new;
end $$;
create trigger profile_name_keep before insert or update on feture.profile
  for each row execute function feture.profile_name_keep();

-- A person's shown name changed: couples without a chosen name follow it.
create function feture.profile_name_couples() returns trigger
language plpgsql set search_path = pg_catalog, feture as $$
begin
  if new.kind = 'person' and new.name is distinct from old.name then
    update feture.profile c set name = c.name
    where c.kind = 'couple' and c.chosen_name = '' and c.id in (
      select cm.profile_id from feture.profile_member pm join feture.profile_member cm on cm.account_id = pm.account_id and cm.profile_kind = 'couple'
      where pm.profile_id = new.id);
  end if;
  return null;
end $$;
create trigger profile_name_couples after update on feture.profile
  for each row execute function feture.profile_name_couples();

-- A partner joined or left: the couple's default name follows.
create function feture.profile_member_name() returns trigger
language plpgsql set search_path = pg_catalog, feture as $$
begin
  if new.profile_kind = 'couple' then
    update feture.profile set name = name where id = new.profile_id and chosen_name = '';
  end if;
  return null;
end $$;
create trigger profile_member_name after insert or update of state on feture.profile_member
  for each row execute function feture.profile_member_name();

grant execute on function feture.shown_name(uuid, text, text, text) to feture_api;
grant execute on function feture.profile_name_keep() to feture_api;
grant execute on function feture.profile_name_couples() to feture_api;
grant execute on function feture.profile_member_name() to feture_api;

-- Couples get a nick from the partners' nicks (anya_max, then anya_max2 …), unique across all profiles and holds.
do $$
declare c record; base text; cand text; n integer;
begin
  for c in
    select p.id, string_agg(lower(left(regexp_replace(pp.handle, '[._]+$', ''), 9)), '_' order by pp.created_at, pp.id) parts
    from feture.profile p
    left join feture.profile_member m on m.profile_id = p.id and m.state = 'active'
    left join feture.account a on a.id = m.account_id left join feture.profile pp on pp.id = a.person_profile_id
    where p.kind = 'couple' and p.handle is null and p.state <> 'deleted'
    group by p.id
  loop
    base := regexp_replace(regexp_replace(coalesce(c.parts, ''), '[^a-z0-9_.]', '', 'g'), '[._]+$', '');
    if base !~ '^[a-z0-9][a-z0-9_.]{1,18}[a-z0-9]$' or base !~ '[a-z]' then base := 'pair'; end if;
    cand := base; n := 1;
    while exists (select 1 from feture.profile where lower(handle) = cand)
       or exists (select 1 from feture.handle_hold where handle = cand and until > now())
       or exists (select 1 from feture.reserved_handle where handle = cand) loop
      n := n + 1;
      cand := left(base, 20 - length(n::text)) || n::text;
    end loop;
    update feture.profile set handle = cand where id = c.id;
  end loop;
end $$;

-- Recompute every shown name once (the trigger does it).
update feture.profile set name = name;
