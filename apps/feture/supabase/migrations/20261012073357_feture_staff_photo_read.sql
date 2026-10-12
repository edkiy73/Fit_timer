-- C01.5b2b: staged manager photo read only; does not enable publication.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch') then raise exception 'feture_prelaunch_required';end if;
end $$;
create function public.feture_staff_photo_read(p_actor text,p_generation text,p_id uuid,p_revision bigint) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare permission jsonb;p public.feture_posts%rowtype;r public.feture_post_photos%rowtype;c public.feture_photo_review_consents%rowtype;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{32}$' or p_generation is null or p_generation !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'error','forbidden');end if;
 if p_id is null or p_revision is null or p_revision<1 or p_revision>999999999999999 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 perform pg_advisory_xact_lock(hashtextextended('feture-operator-roles',0));
 permission:=public.feture_operator_bound_command(p_actor,p_generation,null,false,jsonb_build_object('action','status'));
 if permission->>'role' is distinct from 'manager' then return jsonb_build_object('ok',false,'error','forbidden');end if;
 if not public.feture_peer_eligible(p_actor) then return jsonb_build_object('ok',false,'error','review_required');end if;
 -- Staff review never takes a profile lock (owner mutation order is profile→post).
 select * into p from public.feture_posts where id=p_id for share;
 if p.id is null or p.author_hash=p_actor or p.state<>'pending' or p.audience not in ('public','granted')
  or p.revision<>p_revision or not public.feture_peer_eligible(p.author_hash)
  or public.feture_pair_blocked(p_actor,p.author_hash) then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 select * into c from public.feture_photo_review_consents where post_id=p_id and author_hash=p.author_hash for share;
 select * into r from public.feture_post_photos where post_id=p_id and state='attached';
 if c.post_id is null or c.revoked or c.consent_version<>'photo-staff-review-v1' or c.post_revision is distinct from p.revision
  or c.photo_operation is distinct from r.operation_id or c.content_hash is distinct from r.content_hash or r.operation_id is null then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 return jsonb_build_object('ok',true,'photo',jsonb_build_object('path',r.object_path,'hash',r.content_hash,'bytes',r.bytes,
  'width',r.width,'height',r.height,'consentRevision',c.revision));
end $$;
revoke all on function public.feture_staff_photo_read(text,text,uuid,bigint) from public,anon,authenticated;
grant execute on function public.feture_staff_photo_read(text,text,uuid,bigint) to service_role;
