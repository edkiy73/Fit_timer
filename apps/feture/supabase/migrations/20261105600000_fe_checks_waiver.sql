-- Checks waiver (owner 05.11.2026): an account can be freed from the manual checks before publication — the age check,
-- the photo check and the human media review. The owner is always freed; for anyone else the owner switches it on and
-- off (`staff.checksWaiver`, journalled). It belongs to the ACCOUNT, never to a couple: a couple's partners are each
-- judged by their own account. It never skips the automatic scan (CSAM), reports, blocks or measures.
alter table feture.account add column checks_waived boolean not null default false;

create or replace function feture.checks_waived(p_account uuid) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  select coalesce((select a.checks_waived from feture.account a where a.id = p_account), false)
      or exists (select 1 from feture.staff_role r where r.account_id = p_account and r.role = 'owner' and r.revoked_at is null)
$$;
revoke all on function feture.checks_waived(uuid) from public;
grant execute on function feture.checks_waived(uuid) to feture_api;

-- Adult: a confirmed age check that has not run out, or a waiver.
create or replace function feture.age_ok(p_account uuid) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  select coalesce((select a.age_verified_until > now() from feture.account a where a.id = p_account), false)
      or feture.checks_waived(p_account)
$$;
revoke all on function feture.age_ok(uuid) from public;
grant execute on function feture.age_ok(uuid) to feture_api;

-- The public badge: a waived person profile counts as photo-checked; a couple has no waiver of its own.
create or replace function feture.photo_verified(p_profile uuid) returns boolean
language sql stable security invoker set search_path = pg_catalog as $$
  select exists (select 1 from feture.account w where w.person_profile_id = p_profile and feture.checks_waived(w.id))
    or coalesce((
    select c.state = 'approved'
       and exists (select 1 from feture.media_asset m where m.id = c.photo_asset_id and m.state = 'approved')
       and (exists (select 1 from feture.profile p where p.id = c.profile_id and p.avatar_asset_id = c.photo_asset_id)
         or exists (select 1 from feture.media_attachment a where a.target_type = 'avatar' and a.target_id = c.profile_id and a.asset_id = c.photo_asset_id))
    from feture.photo_check c
    where c.profile_id = p_profile and c.state in ('approved', 'rejected')
    order by c.decided_at desc limit 1), false)
$$;

-- The Discover pool: a couple shows only when both partners are adults (a waiver counts for its own account).
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
         select count(*) = 2 and coalesce(bool_and(feture.age_ok(a.id)), false)
         from feture.profile_member m join feture.account a on a.id = m.account_id where m.profile_id = p and m.state = 'active')
       from feture.profile x where x.id = p)
  and not feture.restricted_in(p, 'discover')
$$;
