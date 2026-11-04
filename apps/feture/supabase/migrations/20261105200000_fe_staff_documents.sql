-- «Документы» in the staff area (owner 05.11.2026): the API role edits drafts and publishes versions through the same
-- reviewed SQL functions the old admin used (public.feture_document_save / _publish); versions stay immutable.
-- Re-runnable; skips itself where the documents tables do not exist.
do $$ begin
  if to_regclass('public.feture_document_drafts') is null then return; end if;
  grant select, insert, update on public.feture_document_drafts to feture_api;
  grant select, insert on public.feture_document_versions to feture_api;
  grant execute on function public.feture_document_content_valid(jsonb) to feture_api;
  grant execute on function public.feture_document_save(text, text, bigint, text, jsonb, boolean) to feture_api;
  grant execute on function public.feture_document_publish(text, text, bigint, boolean, timestamptz) to feture_api;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'feture_document_drafts' and policyname = 'feture_api_staff') then
    execute 'create policy feture_api_staff on public.feture_document_drafts to feture_api using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'feture_document_versions' and policyname = 'feture_api_publish') then
    execute 'create policy feture_api_publish on public.feture_document_versions for insert to feture_api with check (true)';
  end if;
end $$;
