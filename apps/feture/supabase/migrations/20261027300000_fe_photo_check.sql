-- V01 «Фото подтверждено» (docs/server/S2-CATALOG.md «H» verification.photoSubmit, S1 §3, S3-MEDIA §8).
-- The server picks a gesture, the person sends a selfie making it, staff compare it with the profile photos. The badge
-- means «the profile photos show this person»: not an age or identity check, it opens nothing. The selfie is seen only
-- by staff, never published, and goes 30 days after the decision (same as the age check). No expiry: the badge holds
-- while the compared photo is still one of the profile's photos (a new main photo needs a new check).
-- Re-runnable: every object is created only when missing.

create table if not exists feture.photo_check (
  id uuid primary key default feture.uuid_v7(),
  profile_id uuid not null references feture.profile(id) on delete cascade,         -- the person profile
  account_id uuid not null references feture.account(id) on delete cascade,
  gesture text not null check (gesture ~ '^[a-z_]{2,32}$'),
  asset_id uuid references feture.media_asset(id) on delete set null,               -- the selfie (purpose verification)
  photo_asset_id uuid references feture.media_asset(id) on delete set null,         -- the profile photo it was compared with
  state text not null default 'started' check (state in ('started', 'submitted', 'approved', 'rejected', 'expired')),
  reason text check (reason is null or reason ~ '^[a-z_]{2,32}$'),
  decided_by uuid references feture.account(id) on delete set null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  decided_at timestamptz,
  check ((state = 'rejected') = (reason is not null)),
  check ((state in ('approved', 'rejected')) = (decided_at is not null))
);
create unique index if not exists photo_check_one_open on feture.photo_check (profile_id) where state in ('started', 'submitted');
create index if not exists photo_check_queue on feture.photo_check (submitted_at) where state = 'submitted';
create index if not exists photo_check_profile on feture.photo_check (profile_id, created_at desc);
create index if not exists photo_check_asset on feture.photo_check (asset_id) where asset_id is not null;

alter table feture.photo_check enable row level security;
alter table feture.photo_check force row level security;
revoke all on feture.photo_check from public;
do $$ begin
  if to_regrole('anon') is not null then execute 'revoke all on feture.photo_check from anon'; end if;
  if to_regrole('authenticated') is not null then execute 'revoke all on feture.photo_check from authenticated'; end if;
end $$;
drop policy if exists api_all on feture.photo_check;
create policy api_all on feture.photo_check to feture_api using (true) with check (true);
grant select, insert, update, delete on feture.photo_check to feture_api;

-- The public badge: only a yes/no, from the latest decided check of the profile, while the photo staff compared is
-- still approved and still the main photo or one of the profile's photos.
create or replace function feture.photo_verified(p_profile uuid) returns boolean
language sql stable security invoker set search_path = pg_catalog as $$
  select coalesce((
    select c.state = 'approved'
       and exists (select 1 from feture.media_asset m where m.id = c.photo_asset_id and m.state = 'approved')
       and (exists (select 1 from feture.profile p where p.id = c.profile_id and p.avatar_asset_id = c.photo_asset_id)
         or exists (select 1 from feture.media_attachment a where a.target_type = 'avatar' and a.target_id = c.profile_id and a.asset_id = c.photo_asset_id))
    from feture.photo_check c
    where c.profile_id = p_profile and c.state in ('approved', 'rejected')
    order by c.decided_at desc limit 1), false)
$$;
revoke all on function feture.photo_verified(uuid) from public;
grant execute on function feture.photo_verified(uuid) to feture_api;
