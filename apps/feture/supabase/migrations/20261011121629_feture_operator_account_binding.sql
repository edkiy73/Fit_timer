-- Bind staff privileges to the Core account incarnation, never email alone.
alter table public.feture_operators add column account_generation text check(account_generation ~ '^[a-f0-9]{64}$');
create function public.feture_operator_bound_command(p_actor text,p_generation text,p_target_generation text,p_bootstrap boolean,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;target text;act text;prior_generation text;prior_role text;next_revision integer;
begin
 if p_generation is null or p_generation !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'error','forbidden');end if;
 perform pg_advisory_xact_lock(hashtextextended('feture-operator-roles',0));
 act:=p_command->>'action';
 if exists(select 1 from public.feture_operators where account_hash=p_actor and account_generation is distinct from p_generation) then
  if act='status' then return jsonb_build_object('ok',true,'role',null,'initialized',true,'items','[]'::jsonb,'events','[]'::jsonb);end if;
  return jsonb_build_object('ok',false,'error','forbidden');
 end if;
 if act='set' and (p_target_generation is null or p_target_generation !~ '^[a-f0-9]{64}$') then
  return jsonb_build_object('ok',false,'error','invalid_request');end if;
 target:=case when act='bootstrap' then p_actor else p_command->>'accountHash' end;
 select account_generation,role into prior_generation,prior_role from public.feture_operators where account_hash=target;
 result:=public.feture_operator_command(p_actor,p_bootstrap,p_command);
 if result->>'ok'='true' and act in ('bootstrap','set') then
  -- Changing the account incarnation is an explicit privilege decision too.
  if act='set' and prior_generation is not null and prior_generation is distinct from p_target_generation
    and prior_role is not distinct from p_command->>'role' then
   update public.feture_operators set revision=revision+1,updated_at=clock_timestamp() where account_hash=target returning revision into next_revision;
   insert into public.feture_operator_events(actor_hash,account_hash,event_type,role,revision)
    values(p_actor,target,'role_set',prior_role,next_revision);
  end if;
  update public.feture_operators set account_generation=case when act='bootstrap' then p_generation else p_target_generation end where account_hash=target;
  result:=public.feture_operator_command(p_actor,false,'{"action":"status"}'::jsonb);
 end if;
 return result;
end $$;
create function public.feture_qa_adult_bound_admin(p_actor text,p_generation text,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('feture-operator-roles',0));
 if p_generation is null or not exists(select 1 from public.feture_operators where account_hash=p_actor and account_generation=p_generation and role is not null)
 then return jsonb_build_object('ok',false,'error','forbidden');end if;
 return public.feture_qa_adult_admin(p_actor,p_command);
end $$;
revoke execute on function public.feture_operator_command(text,boolean,jsonb),public.feture_qa_adult_admin(text,jsonb) from service_role;
revoke execute on function public.feture_operator_bound_command(text,text,text,boolean,jsonb),public.feture_qa_adult_bound_admin(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.feture_operator_bound_command(text,text,text,boolean,jsonb),public.feture_qa_adult_bound_admin(text,text,jsonb) to service_role;
notify pgrst,'reload schema';
