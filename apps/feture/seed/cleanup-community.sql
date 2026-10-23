-- PRELAUNCH ONLY: remove exactly the social rows identified by the community seed.
-- This deletes interactions with these synthetic posts/events/groups (including later QA interactions).
-- It DOES NOT remove Core accounts, real authors' own posts, catalog, or any shared AppBase records.
-- Run with the expected FitT project as postgres; follow with reviewed feture_seed.manage profiles cleanup.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $cleanup_seed$
#variable_conflict use_variable
declare
  entries jsonb := '{"datasetId":"feture-development-2026-10","projectRef":"anrhayozrhrmiwexmbhw","posts":[{"seedKey":"post-001","author":"leo"},{"seedKey":"post-002","author":"riley"},{"seedKey":"post-003","author":"lada"},{"seedKey":"post-004","author":"nova"},{"seedKey":"post-005","author":"luna"},{"seedKey":"post-006","author":"nika"},{"seedKey":"post-007","author":"sasha"},{"seedKey":"post-008","author":"jules"},{"seedKey":"post-009","author":"kapibara"},{"seedKey":"post-010","author":"vlad"},{"seedKey":"post-011","author":"alex"},{"seedKey":"post-012","author":"dan"},{"seedKey":"post-013","author":"max"},{"seedKey":"post-014","author":"fox"},{"seedKey":"post-015","author":"moth"},{"seedKey":"post-016","author":"maya"},{"seedKey":"post-017","author":"alina"},{"seedKey":"post-018","author":"kira"},{"seedKey":"post-019","author":"taya"},{"seedKey":"post-020","author":"anya"},{"seedKey":"post-021","author":"zen"},{"seedKey":"post-022","author":"kai"},{"seedKey":"post-023","author":"ilia"},{"seedKey":"post-024","author":"artem"},{"seedKey":"post-025","author":"tima"},{"seedKey":"post-026","author":"vita"},{"seedKey":"post-027","author":"mira"},{"seedKey":"post-028","author":"river"},{"seedKey":"post-029","author":"ella"},{"seedKey":"post-030","author":"sam"},{"seedKey":"post-031","author":"morgan"},{"seedKey":"post-032","author":"nora"},{"seedKey":"post-033","author":"sonya"},{"seedKey":"post-034","author":"dima"},{"seedKey":"post-035","author":"polina"},{"seedKey":"post-036","author":"irina"},{"seedKey":"post-037","author":"leo"},{"seedKey":"post-038","author":"riley"},{"seedKey":"post-039","author":"lada"},{"seedKey":"post-040","author":"nova"},{"seedKey":"post-041","author":"luna"},{"seedKey":"post-042","author":"nika"},{"seedKey":"post-043","author":"sasha"},{"seedKey":"post-044","author":"jules"},{"seedKey":"post-045","author":"kapibara"},{"seedKey":"post-046","author":"vlad"},{"seedKey":"post-047","author":"alex"},{"seedKey":"post-048","author":"dan"},{"seedKey":"post-049","author":"max"},{"seedKey":"post-050","author":"fox"},{"seedKey":"post-051","author":"moth"},{"seedKey":"post-052","author":"maya"},{"seedKey":"post-053","author":"alina"},{"seedKey":"post-054","author":"kira"},{"seedKey":"post-055","author":"taya"},{"seedKey":"post-056","author":"anya"},{"seedKey":"post-057","author":"zen"},{"seedKey":"post-058","author":"kai"},{"seedKey":"post-059","author":"ilia"},{"seedKey":"post-060","author":"artem"},{"seedKey":"post-061","author":"tima"},{"seedKey":"post-062","author":"alex"},{"seedKey":"post-063","author":"kai"},{"seedKey":"post-064","author":"sonya"},{"seedKey":"post-065","author":"jules"},{"seedKey":"post-066","author":"taya"},{"seedKey":"post-067","author":"sam"},{"seedKey":"post-068","author":"luna"},{"seedKey":"post-069","author":"maya"},{"seedKey":"post-070","author":"mira"},{"seedKey":"post-071","author":"riley"},{"seedKey":"post-072","author":"max"},{"seedKey":"post-073","author":"artem"},{"seedKey":"post-074","author":"polina"},{"seedKey":"post-075","author":"vlad"},{"seedKey":"post-076","author":"zen"}],"groups":[{"seedKey":"group-01","owner":"nora"},{"seedKey":"group-02","owner":"alina"},{"seedKey":"group-03","owner":"riley"},{"seedKey":"group-04","owner":"ilia"},{"seedKey":"group-05","owner":"jules"},{"seedKey":"group-06","owner":"ella"},{"seedKey":"group-07","owner":"fox"},{"seedKey":"group-08","owner":"polina"},{"seedKey":"group-09","owner":"anya"},{"seedKey":"group-10","owner":"luna"}],"events":[{"seedKey":"event-01","owner":"mira"},{"seedKey":"event-02","owner":"alina"},{"seedKey":"event-03","owner":"sasha"},{"seedKey":"event-04","owner":"sonya"},{"seedKey":"event-05","owner":"ilia"},{"seedKey":"event-06","owner":"max"},{"seedKey":"event-07","owner":"lada"},{"seedKey":"event-08","owner":"ella"},{"seedKey":"event-09","owner":"taya"},{"seedKey":"event-10","owner":"kapibara"},{"seedKey":"event-11","owner":"polina"},{"seedKey":"event-12","owner":"tima"}]}'::jsonb;
  item jsonb;
  kind text;
  raw_id text;
  row_id uuid;
  owner_key text;
  ids uuid[];
begin
  if current_user <> 'postgres' or
     not exists(select 1 from feture_seed.environment where singleton and
       project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
     or entries->>'projectRef'<>'anrhayozrhrmiwexmbhw'
     or entries->>'datasetId'<>'feture-development-2026-10'
  then raise exception 'seed_cleanup_environment_mismatch';end if;
  -- Check the synthetic origin of every owner before touching content.
  for kind in select unnest(array['posts','groups','events']) loop
    ids:=array[]::uuid[];
    for item in select value from jsonb_array_elements(entries->kind) loop
      raw_id:=md5('feture-development-2026-10:'||
        case kind when 'posts' then 'post' when 'groups' then 'group' else 'event' end||
        ':'||(item->>'seedKey'));
      row_id:=(substr(raw_id,1,8)||'-'||substr(raw_id,9,4)||'-4'||substr(raw_id,14,3)||
        '-8'||substr(raw_id,18,3)||'-'||substr(raw_id,21,12))::uuid;
      owner_key:='seed:feture-development-2026-10:'||
        (item->>case kind when 'posts' then 'author' else 'owner' end);
      if not exists(select 1 from feture_seed.records r
        where r.dataset_id='feture-development-2026-10' and r.table_name='feture_profiles'
         and r.row_key=owner_key and r.kind='synthetic-development') then
        raise exception 'seed_cleanup_unowned_actor';end if;
      if kind='posts' and exists(select 1 from public.feture_posts p
        where p.id=row_id and p.author_hash<>owner_key) or
         kind='groups' and exists(select 1 from public.feture_groups g
        where g.id=row_id and g.owner_hash<>owner_key) or
         kind='events' and exists(select 1 from public.feture_events e
        where e.id=row_id and e.owner_hash<>owner_key)
      then raise exception 'seed_cleanup_foreign_owner';end if;
      ids:=array_append(ids,row_id);
    end loop;
    if kind='posts' then
      if exists(select 1 from public.feture_test_share_operations t where t.post_id=any(ids))
      then raise exception 'seed_cleanup_external_dependencies';end if;
      delete from public.feture_posts p where p.id=any(ids);
    elsif kind='groups' then
      delete from public.feture_groups g where g.id=any(ids);
    else
      delete from public.feture_events e where e.id=any(ids);
    end if;
  end loop;
end
$cleanup_seed$;
select 'posts' as entity,count(*)::int as rows from public.feture_posts
union all select 'groups',count(*)::int from public.feture_groups
union all select 'events',count(*)::int from public.feture_events
union all select 'comments',count(*)::int from public.feture_post_comments
union all select 'reactions',count(*)::int from public.feture_post_reactions;
commit;
