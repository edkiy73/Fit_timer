-- C02.4c opaque public author resolution from a currently readable *public* post only.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required';end if;
end $$;
create function public.feture_public_author_resolve(p_actor text,p_post_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare p public.feture_posts%rowtype;public_id uuid;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or p_post_id is null
 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select * into p from public.feture_posts where id=p_post_id;
 if not found or p.state<>'published' or p.audience<>'public' or
    not public.feture_peer_eligible(p_actor) or
    not public.feture_peer_eligible(p.author_hash) or
    public.feture_pair_blocked(p_actor,p.author_hash) or
    not public.feture_post_visible(p,p_actor)
 then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 select a.public_id into public_id from public.feture_public_authors a
 where a.account_hash=p.author_hash;
 return jsonb_build_object('ok',true,'publicAuthorId',public_id);
end $$;
revoke all on function public.feture_public_author_resolve(text,uuid) from public,anon,authenticated;
grant execute on function public.feture_public_author_resolve(text,uuid) to service_role;
notify pgrst,'reload schema';
