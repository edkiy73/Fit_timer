-- Prelaunch media bucket (docs/server/S3-MEDIA.md, owner decision 27.10.2026: stay on Supabase until launch).
-- Private; clients reach it only through server-issued signed upload URLs and signed variant URLs.
-- Skipped where Supabase Storage does not exist (PGlite tests).
do $$ begin
  if to_regclass('storage.buckets') is null then return; end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('feture-media', 'feture-media', false, 20971520, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'feture_media_no_direct_client') then
    create policy feture_media_no_direct_client on storage.objects as restrictive for all to anon, authenticated
      using (bucket_id <> 'feture-media') with check (bucket_id <> 'feture-media');
  end if;
end $$;
