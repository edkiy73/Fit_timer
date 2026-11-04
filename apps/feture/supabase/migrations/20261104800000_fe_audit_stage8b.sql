-- Audit 04.11.2026, stage 8b, item 50: «Кто может написать первым» is a list of points (contracts/me.mjs
-- MESSAGE_POINTS). Re-runnable: the old setting is read once, when the column is made.
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'feture' and table_name = 'profile_settings' and column_name = 'messages_open') then
    alter table feture.profile_settings add column messages_open text[] not null default array['mutual', 'community', 'event'];
    -- «Все» stays everyone, «Никто» nobody; «Знакомые» becomes the new default: one follow is no longer enough.
    update feture.profile_settings set messages_open = case messages_from when 'all' then array['all'] when 'none' then array[]::text[] else array['mutual', 'community', 'event'] end;
  end if;
end $$;
