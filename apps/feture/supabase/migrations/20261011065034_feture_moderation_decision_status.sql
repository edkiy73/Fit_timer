-- P03.2: server-only readback of a specific moderation decision receipt.
-- A missing receipt does not prove the previous request cannot still commit.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
end $$;
create function public.feture_moderation_decision_status(p_id uuid,p_case uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('ok',true,'state',
  case when exists(select 1 from public.feture_moderation_decisions d where d.id=p_id and d.case_id=p_case)
       then 'applied' else 'unknown' end)
$$;
revoke execute on function public.feture_moderation_decision_status(uuid,uuid) from public,anon,authenticated;
grant execute on function public.feture_moderation_decision_status(uuid,uuid) to service_role;
notify pgrst,'reload schema';
