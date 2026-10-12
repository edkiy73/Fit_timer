-- C02.3c: private comment archive for its author, including pending/rejected status after reload.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
end $$;
create function public.feture_post_comment_mine(p_actor text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 cur jsonb;at_cursor timestamptz;id_cursor uuid;pid uuid;items jsonb;keys text[];
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or jsonb_typeof(p_command) is distinct from 'object'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_command) k;
 if p_command->>'action' is distinct from 'comments.mine' or
   keys is distinct from array['action','cursor','postId']::text[] or
   jsonb_typeof(p_command->'postId') is distinct from 'string' or
   p_command->>'postId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 pid:=(p_command->>'postId')::uuid;
 cur:=p_command->'cursor';
 if cur is distinct from 'null'::jsonb then
  if jsonb_typeof(cur) is distinct from 'object' or
     (select array_agg(k order by k) from jsonb_object_keys(cur) k) is distinct from array['at','id']::text[] or
     jsonb_typeof(cur->'at') is distinct from 'string' or jsonb_typeof(cur->'id') is distinct from 'string' or
     cur->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
  begin at_cursor:=(cur->>'at')::timestamptz;id_cursor:=(cur->>'id')::uuid;
  exception when others then return jsonb_build_object('ok',false,'error','invalid_cursor');end;
  if not isfinite(at_cursor) then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
 end if;
 -- Self-read does not require a current age proof/consent: owners must retain
 -- the ability to find, edit (after re-verification), or erase their own writing.
 if not exists(select 1 from public.feture_profiles where account_hash=p_actor)
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 select coalesce(jsonb_agg(jsonb_build_object('entry',public.feture_post_comment_dto(v,true),'at',v.created_at)
   order by v.created_at desc,v.id desc),'[]'::jsonb) into items
 from (
  select c.* from public.feture_post_comments c
  where c.author_hash=p_actor and c.post_id=pid and c.state<>'deleted'
    and (at_cursor is null or (c.created_at,c.id)<(at_cursor,id_cursor))
  order by c.created_at desc,c.id desc limit 21
 ) v;
 return jsonb_build_object('ok',true,
  'items',coalesce((select jsonb_agg(x->'entry' order by n)
    from jsonb_array_elements(items) with ordinality t(x,n) where n<=20),'[]'::jsonb),
  'nextCursor',case when jsonb_array_length(items)>20
   then jsonb_build_object('at',items->19->>'at','id',items->19->'entry'->>'id') else null end);
end $$;
revoke all on function public.feture_post_comment_mine(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_post_comment_mine(text,jsonb) to service_role;
notify pgrst,'reload schema';
