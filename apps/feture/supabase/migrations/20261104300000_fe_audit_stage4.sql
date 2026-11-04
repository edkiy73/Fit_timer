-- Audit 04.11.2026, stage 4: sanctions. Re-runnable.

-- Item 6: a restriction names what it limits (contracts/moderation.mjs RESTRICT_SCOPES, presets there). NULL on a
-- restricted profile = every point. Restrictions in force get «Стандартное», the closest to what they did before.
alter table feture.profile add column if not exists restriction_scope text[];
update feture.profile set restriction_scope = array['discover', 'likes', 'messages', 'access', 'links', 'search', 'follows', 'communities', 'events']
where restricted_at is not null and restriction_scope is null;

-- Restricted in this point (a person's restriction covers the couples they act as).
create or replace function feture.restricted_in(p uuid, point text) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  select exists (select 1 from feture.profile x where x.id = p and x.restricted_at is not null
                   and (x.restricted_until is null or x.restricted_until > now())
                   and (x.restriction_scope is null or point = any(x.restriction_scope)))
      or exists (select 1 from feture.profile_member m join feture.account a on a.id = m.account_id join feture.profile pp on pp.id = a.person_profile_id
                 where m.profile_id = p and m.state = 'active' and pp.restricted_at is not null
                   and (pp.restricted_until is null or pp.restricted_until > now())
                   and (pp.restriction_scope is null or point = any(pp.restriction_scope)))
$$;
grant execute on function feture.restricted_in(uuid, text) to feture_api;

-- The Discover pool leaves out only profiles restricted in «Знакомства».
create or replace function feture.discoverable(p uuid) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  select exists (
    select 1 from feture.profile x
    join feture.profile_settings s on s.profile_id = x.id and s.discover_mode = 'visible'
    join feture.media_asset av on av.id = x.avatar_asset_id and av.state = 'approved' and av.explicitness = 'safe'
    where x.id = p and x.state = 'active')
  and not exists (
    select 1 from feture.profile_member m join feture.account a on a.id = m.account_id
    where m.profile_id = p and m.state = 'active' and a.state <> 'active')
  and (select x.kind = 'person' or (
         select count(*) = 2 and coalesce(bool_and(coalesce(a.age_verified_until > now(), false)), false)
         from feture.profile_member m join feture.account a on a.id = m.account_id where m.profile_id = p and m.state = 'active')
       from feture.profile x where x.id = p)
  and not feture.restricted_in(p, 'discover')
$$;

-- Items 2, 9: a suspension is appealed as the target `account` (the person profile's id).
alter table feture.appeal drop constraint if exists appeal_target_type_check;
alter table feture.appeal add constraint appeal_target_type_check check (target_type in ('post', 'reply', 'community', 'event', 'profile', 'account', 'media', 'revision'));

-- Item 28: a sanction in force when its account is deleted carries over to a new account of the same login (keyed
-- like the under-18 marker: survives re-creating the login). Nothing else about the person is kept.
create table if not exists feture.sanction_carry (
  key_hmac bytea primary key check (octet_length(key_hmac) = 32),
  kind text not null check (kind in ('suspend', 'restrict')),
  rule text check (rule is null or rule ~ '^[a-z_]{2,32}$'),
  until timestamptz,
  scope text[],
  created_at timestamptz not null default now()
);
alter table feture.sanction_carry enable row level security;
alter table feture.sanction_carry force row level security;
revoke all on feture.sanction_carry from public;
grant select, insert, update, delete on feture.sanction_carry to feture_api;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'feture' and tablename = 'sanction_carry' and policyname = 'sanction_carry_api') then
    create policy sanction_carry_api on feture.sanction_carry to feture_api using (true) with check (true);
  end if;
end $$;
