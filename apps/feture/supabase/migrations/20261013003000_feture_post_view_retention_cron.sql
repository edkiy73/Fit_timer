-- M01 retention release gate: scheduled service-only cleanup of hashed daily post view receipts.
-- Receipts older than 30 UTC calendar days are removed in bounded batches; aggregate counters stay.
do $$ begin
 if not exists(select 1 from feture_seed.environment
   where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
 if to_regprocedure('public.feture_post_view_prune(integer)') is null
 then raise exception 'feture_post_view_prune_required';end if;
 if not exists(select 1 from pg_extension where extname='pg_cron')
 then raise exception 'pg_cron_required';end if;
 if exists(select 1 from cron.job where jobname='feture_post_view_retention_30d')
 then raise exception 'feture_post_view_retention_already_scheduled';end if;
end $$;
create function public.feture_post_view_retention_sweep()
returns integer language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 n integer; total integer:=0;
begin
 -- Do not run an unlimited loop in a single cron transaction.
 for i in 1..100 loop
  n:=public.feture_post_view_prune(1000);
  total:=total+n;
  exit when n<1000;
 end loop;
 return total;
end $$;
revoke all on function public.feture_post_view_retention_sweep()
 from public,anon,authenticated;
grant execute on function public.feture_post_view_retention_sweep() to service_role;
-- 02:25 UTC daily. Up to 100,000 receipts per sweep. Current prelaunch volume is zero.
select cron.schedule(
 'feture_post_view_retention_30d',
 '25 2 * * *',
 'select public.feture_post_view_retention_sweep()'
);
notify pgrst,'reload schema';
