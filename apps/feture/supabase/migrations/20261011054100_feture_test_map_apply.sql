-- W05.2 — user-confirmed topic discovery from a completed owned questionnaire.
-- Canonical Core actor is resolved by the server. This RPC is service-role only.
do $$ begin
 if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch')
 then raise exception 'feture_prelaunch_required'; end if;
end $$;

create table public.feture_test_map_receipts (
 account_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 operation_id uuid not null,
 attempt_id uuid not null references public.feture_test_attempts(id) on delete cascade,
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 interest_ids text[] not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(account_hash,operation_id)
);
create index feture_test_map_receipts_attempt on public.feture_test_map_receipts(attempt_id);
alter table public.feture_test_map_receipts enable row level security;
revoke all on public.feture_test_map_receipts from public,anon,authenticated,service_role;
grant select,insert on public.feture_test_map_receipts to service_role;

create function public.feture_test_map_apply(p_owner text,p_attempt uuid,p_operation uuid,p_interest_ids text[])
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 a public.feture_test_attempts%rowtype;
 receipt public.feture_test_map_receipts%rowtype;
 ids text[];allowed text[];payload text;topic text;now_at timestamptz;
begin
 if p_owner is null or p_owner !~ '^[a-f0-9]{32}$' or p_attempt is null or p_operation is null
    or p_interest_ids is null or cardinality(p_interest_ids) not between 1 and 3
    or array_position(p_interest_ids,null) is not null then
   return jsonb_build_object('ok',false,'error','invalid_request');
 end if;
 select array_agg(v order by v) into ids from unnest(p_interest_ids) v;
 if (select count(distinct v) from unnest(ids) v) <> cardinality(ids)
    or exists(select 1 from unnest(ids) v where v !~ '^interest-[1-9][0-9]{0,2}-[1-9][0-9]{0,2}$') then
   return jsonb_build_object('ok',false,'error','invalid_request');
 end if;
 payload:=encode(sha256(convert_to(jsonb_build_object('attempt',p_attempt,'ids',to_jsonb(ids))::text,'UTF8')),'hex');
 -- Same owner-row lock as direct map mutations and questionnaire commands.
 perform 1 from public.feture_profiles where account_hash=p_owner for update;
 select * into a from public.feture_test_attempts where id=p_attempt and account_hash=p_owner and status='completed';
 if a.id is null then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 select * into receipt from public.feture_test_map_receipts where account_hash=p_owner and operation_id=p_operation;
 if receipt.operation_id is not null then
   if receipt.payload_hash<>payload then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
   return jsonb_build_object('ok',true,'replayed',true,'interestIds',to_jsonb(receipt.interest_ids));
 end if;
 -- Only approved editorial topic IDs may be suggested for each published questionnaire.
 allowed:=case a.test_id
 when 'dynamics' then array['interest-1-4','interest-1-11','interest-1-12']
 when 'closeness' then array['interest-4-12','interest-2-7','interest-12-3']
 when 'sensations' then array['interest-3-8','interest-3-7','interest-5-10']
 when 'boundaries' then array['interest-10-3','interest-10-5','interest-10-11']
 when 'relationships' then array['interest-8-8','interest-8-12','interest-10-8']
 when 'pace' then array['interest-12-6','interest-2-6','interest-10-9']
 else array[]::text[] end;
 if not(ids <@ allowed) then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if exists(select 1 from public.feture_interest_states s where s.account_hash=p_owner and s.interest_id=any(ids)) then
   -- Existing values, boundaries and even deletion tombstones cannot be overridden by test import.
   return jsonb_build_object('ok',false,'error','revision_conflict');
 end if;
 if (select count(*) from public.feture_interests i where i.id=any(ids)) <> cardinality(ids) then
   return jsonb_build_object('ok',false,'error','invalid_request');
 end if;
 now_at:=clock_timestamp();
 foreach topic in array ids loop
   insert into public.feture_interest_states
    (account_hash,interest_id,stance,experience,boundary,boundary_note,intensity,visibility,use_for_discovery,revision,source,test_version,deleted,updated_at)
   values(p_owner,topic,'curious','unspecified','none',null,null,'private',false,1,'test',a.version_id,false,now_at);
 end loop;
 insert into public.feture_test_map_receipts(account_hash,operation_id,attempt_id,payload_hash,interest_ids)
 values(p_owner,p_operation,p_attempt,payload,ids);
 return jsonb_build_object('ok',true,'replayed',false,'interestIds',to_jsonb(ids));
end $$;
revoke execute on function public.feture_test_map_apply(text,uuid,uuid,text[]) from public,anon,authenticated;
grant execute on function public.feture_test_map_apply(text,uuid,uuid,text[]) to service_role;
notify pgrst,'reload schema';
