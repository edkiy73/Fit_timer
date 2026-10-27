-- Queue worker tick (docs/server/README.md «Чтобы включить /api/fe», step 5): pg_cron calls POST /api/fe?jobs=1 once a
-- minute through pg_net. The endpoint and its Bearer secret live in Supabase Vault (`feture_jobs_url`,
-- `feture_jobs_secret`), so moving off Vercel means updating one Vault entry. Without both entries nothing is called.
-- Skipped where pg_cron, pg_net or Vault do not exist (PGlite tests).
do $$ begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_net')
     or to_regnamespace('cron') is null or to_regnamespace('vault') is null then
    return;
  end if;
  create extension if not exists pg_net;
  perform cron.schedule('feture-jobs', '* * * * *', $job$
    select net.http_post(
      url := u.decrypted_secret,
      headers := jsonb_build_object('Authorization', 'Bearer ' || s.decrypted_secret, 'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000)
    from vault.decrypted_secrets s, vault.decrypted_secrets u
    where s.name = 'feture_jobs_secret' and u.name = 'feture_jobs_url'
  $job$);
end $$;
