-- F05.1 READ ONLY. Run on expected FitT project; no application/private rows are selected.
select c.relname as table_name,c.relrowsecurity as rls,
  array(select column_name from information_schema.columns cols
        where cols.table_schema='public' and cols.table_name=c.relname
        order by cols.ordinal_position) as columns,
  array(select grantee||':'||privilege_type from information_schema.role_table_grants g
        where g.table_schema='public' and g.table_name=c.relname
        and g.grantee in ('anon','authenticated','PUBLIC') order by 1) as client_grants
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and left(c.relname,7)='feture_'
order by c.relname;

select 'feture_categories' as table_name,count(*)::integer as rows from public.feture_categories
union all select 'feture_interests',count(*)::integer from public.feture_interests
union all select 'feture_tests',count(*)::integer from public.feture_tests
union all select 'feture_profiles',count(*)::integer from public.feture_profiles;
