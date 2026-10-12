-- C02.4d3: feed-only mute filter before LIMIT/cursor; unchanged direct read and mine.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
end $$;
create function public.feture_post_feed_command(p_actor text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 keys text[];cursor_value jsonb;after_at timestamptz;after_id uuid;page jsonb;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or jsonb_typeof(p_command) is distinct from 'object'
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_command) k;
 if p_command->>'action' is distinct from 'posts.feed' or
    keys is distinct from array['action','cursor']::text[]
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 cursor_value:=p_command->'cursor';
 if cursor_value is distinct from 'null'::jsonb then
  if jsonb_typeof(cursor_value) is distinct from 'object' or
    (select array_agg(k order by k) from jsonb_object_keys(cursor_value) k) is distinct from array['at','id']::text[] or
    jsonb_typeof(cursor_value->'at') is distinct from 'string' or
    jsonb_typeof(cursor_value->'id') is distinct from 'string' or
    cursor_value->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
  begin after_at:=(cursor_value->>'at')::timestamptz;after_id:=(cursor_value->>'id')::uuid;
  exception when others then return jsonb_build_object('ok',false,'error','invalid_cursor');end;
  if not isfinite(after_at) then return jsonb_build_object('ok',false,'error','invalid_cursor');end if;
 end if;
 if not public.feture_peer_eligible(p_actor)
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 select coalesce(jsonb_agg(jsonb_build_object('entry',public.feture_post_dto(v,v.author_hash=p_actor),
   'at',v.published_at) order by v.published_at desc,v.id desc),'[]'::jsonb) into page
 from (
  select p.* from public.feture_posts p
  where public.feture_post_visible(p,p_actor)
    and not exists (
     select 1 from public.feture_author_relationships r
     join public.feture_public_authors a on a.public_id=r.target_id
     where r.viewer_hash=p_actor and r.kind='mute' and a.account_hash=p.author_hash
    )
    and (after_at is null or (p.published_at,p.id)<(after_at,after_id))
  order by p.published_at desc,p.id desc limit 21
 ) v;
 return jsonb_build_object('ok',true,
  'items',coalesce((select jsonb_agg(x->'entry' order by n) from jsonb_array_elements(page)
    with ordinality j(x,n) where n<=20),'[]'::jsonb),
  'nextCursor',case when jsonb_array_length(page)>20
   then jsonb_build_object('at',page->19->>'at','id',page->19->'entry'->>'id') else null end);
end $$;
revoke all on function public.feture_post_feed_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_post_feed_command(text,jsonb) to service_role;
notify pgrst,'reload schema';
