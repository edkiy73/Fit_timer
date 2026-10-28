-- Video in posts, chats and the viewer; voice messages in chats (owner request, 28.10.2026).
-- Video: one asset = the clip (scanned, served as is from `o/<id>`) + a poster frame the device cut from the first
-- second, uploaded next to it (`u/<id>.poster`), scanned with it and rendered into the usual picture variants.
-- Voice: kind 'audio' with its own purpose 'voice' (chats only); the device declares the length and a coarse
-- waveform, the scan checks it is sound only. Limits live in server/media/assets.mjs.

alter table feture.media_asset drop constraint media_asset_kind_check;
alter table feture.media_asset add constraint media_asset_kind_check check (kind in ('image', 'video', 'audio'));
alter table feture.media_asset drop constraint media_asset_purpose_check;
alter table feture.media_asset add constraint media_asset_purpose_check
  check (purpose in ('post', 'avatar', 'private', 'chat', 'gallery', 'community', 'event', 'verification', 'voice'));

alter table feture.media_asset
  add column poster_mime text check (poster_mime is null or poster_mime in ('image/jpeg', 'image/webp')),
  add column poster_bytes bigint check (poster_bytes is null or poster_bytes between 1 and 2097152),
  -- Voice waveform: up to 64 levels 0…31, drawn in the bubble (nothing else is read from it).
  add column waveform smallint[] check (waveform is null or (cardinality(waveform) <= 64 and 0 <= all(waveform) and 31 >= all(waveform))),
  -- Sound only in 'voice'; a poster only on a video; video only where it can be shown. (Length and poster presence
  -- for new uploads are checked by media.uploadIntent.)
  add constraint media_asset_audio_voice check ((kind = 'audio') = (purpose = 'voice')),
  add constraint media_asset_poster_video check (poster_mime is null or kind = 'video'),
  add constraint media_asset_video_places check (kind <> 'video' or purpose in ('post', 'gallery', 'chat', 'private', 'avatar'));

-- «Прослушано»: the first time a member account of the other side played a voice message to the end (or most of it).
create table feture.message_listen (
  message_id uuid not null references feture.message(id) on delete cascade,
  account_id uuid not null references feture.account(id) on delete cascade,
  listened_at timestamptz not null default now(),
  primary key (message_id, account_id)
);

do $$
declare t text;
begin
  foreach t in array array['message_listen'] loop
    execute format('alter table feture.%I enable row level security', t);
    execute format('alter table feture.%I force row level security', t);
    execute format('revoke all on feture.%I from public', t);
    execute format('create policy api_all on feture.%I to feture_api using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on feture.%I to feture_api', t);
  end loop;
end $$;

-- The prelaunch bucket takes clips and voice notes too: 100 MB per object (the largest video), the same MIME list the
-- server accepts. Skipped where Supabase Storage does not exist (PGlite tests).
do $$ begin
  if to_regclass('storage.buckets') is null then return; end if;
  update storage.buckets set file_size_limit = 104857600,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp',
      'video/mp4', 'video/quicktime', 'video/webm', 'audio/webm', 'audio/mp4', 'audio/ogg']
  where id = 'feture-media';
end $$;
