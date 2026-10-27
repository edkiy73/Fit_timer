-- Wave 5 «Галерея и альбомы» (V21 galAlbum*, galSel*, postAlbum*, setAlbum, phToggle/phPost).
-- A profile's gallery is the photos of its own published posts; albums group those posts. The album table itself
-- came with slice B (20261027170000_fe_feed.sql); this adds what the commands need: the cover link, indexes, and
-- the two visibility rules (album, and «this post is public» for profile photos taken from posts).

alter table feture.album
  add constraint album_cover_post foreign key (cover_post_id) references feture.post(id) on delete set null;
create index album_owner on feture.album (owner_profile_id, position, created_at);
create index post_album on feture.post (album_id, published_at desc, id desc) where album_id is not null;

-- May the viewer see the album: members of the owning profile always; others when the owner is active, there is no
-- block either way, and the album is for everyone or the viewer follows the profile («Подписчикам»).
create function feture.album_visible(a feture.album, viewer uuid, viewer_account uuid) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  select case
    when exists (select 1 from feture.profile_member m where m.profile_id = a.owner_profile_id and m.account_id = viewer_account and m.state = 'active')
      then true
    else exists (select 1 from feture.profile o where o.id = a.owner_profile_id and o.state = 'active')
      and not feture.blocked(viewer, a.owner_profile_id)
      and (a.vis = 'all' or exists (select 1 from feture.follow f where f.follower_profile_id = viewer and f.target_profile_id = a.owner_profile_id))
  end
$$;

-- A post everyone may see (blocks aside): published, for everyone, not a discussion, not disputed, every photo mark
-- confirmed. Only photos of such posts may stand among the profile photos («В профиль — только то, что видят все»).
create function feture.post_public(p feture.post) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  select p.state = 'published' and p.audience = 'all' and p.community_id is null and p.disputed_at is null
    and not exists (select 1 from feture.photo_tag t where t.post_id = p.id and t.state <> 'ok')
$$;

-- The public post (of the profile) a profile photo comes from, or null for an uploaded profile photo or a photo whose
-- post is no longer public.
create function feture.photo_post(asset uuid, profile uuid) returns uuid
language sql stable set search_path = pg_catalog, feture as $$
  select p.id from feture.media_attachment a join feture.post p on p.id = a.target_id
  where a.target_type = 'post' and a.asset_id = asset and p.owner_profile_id = profile and feture.post_public(p)
  order by p.published_at desc limit 1
$$;

grant execute on function feture.album_visible(feture.album, uuid, uuid) to feture_api;
grant execute on function feture.post_public(feture.post) to feture_api;
grant execute on function feture.photo_post(uuid, uuid) to feture_api;
