-- W06: private diary and owner-only map history. No admin/private-content route.
do $$begin if not exists(select 1 from feture_seed.environment where singleton and project_ref='anrhayozrhrmiwexmbhw' and stage='prelaunch') then raise exception 'feture_prelaunch_required';end if;end$$;
create table public.feture_journal_entries(
 account_hash text not null references public.feture_profiles(account_hash) on delete cascade,id uuid not null,
 title text not null check(char_length(title)<=160 and title !~ '[[:cntrl:]]'),
 text text not null check(char_length(text)<=3000 and replace(text,chr(10),'') !~ '[[:cntrl:]]'),
 topic_id text references public.feture_interests(id),deleted boolean not null default false,
 revision bigint not null check(revision between 1 and 9007199254740991),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(account_hash,id),check((deleted and title='' and text='' and topic_id is null) or(not deleted and char_length(btrim(text))>0)));
create index feture_journal_owner_page on public.feture_journal_entries(account_hash,created_at desc,id desc) where not deleted;
create index feture_journal_topic on public.feture_journal_entries(topic_id) where topic_id is not null;
create table public.feture_journal_operations(
 account_hash text not null references public.feture_profiles(account_hash) on delete cascade,operation_id uuid not null,
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),entry_id uuid,cleared_count bigint,
 primary key(account_hash,operation_id),foreign key(account_hash,entry_id) references public.feture_journal_entries(account_hash,id) on delete cascade,
 check((entry_id is null)=(cleared_count is not null)));
create index feture_journal_operation_entry on public.feture_journal_operations(account_hash,entry_id);
create table public.feture_interest_history(
 account_hash text not null references public.feture_profiles(account_hash) on delete cascade,id uuid not null default gen_random_uuid(),
 interest_id text not null references public.feture_interests(id),revision bigint not null,entry jsonb not null,
 created_at timestamptz not null,primary key(account_hash,id),unique(account_hash,interest_id,revision));
create index feture_interest_history_owner_page on public.feture_interest_history(account_hash,created_at desc,id desc);
create index feture_interest_history_topic on public.feture_interest_history(interest_id);
-- Invoker inherits the server-only mutation role. Replay/conflict writes no row, hence no duplicate history.
create function public.feture_interest_record_history() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$begin
 insert into public.feture_interest_history(account_hash,interest_id,revision,entry,created_at)
 values(new.account_hash,new.interest_id,new.revision,to_jsonb(new)-'account_hash',new.updated_at);
 return new;
end$$;
create trigger feture_interest_history_record after insert or update on public.feture_interest_states for each row execute function public.feture_interest_record_history();
create function public.feture_journal_dto(e public.feture_journal_entries) returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
 select jsonb_build_object('id',e.id,'title',e.title,'text',e.text,'topicId',e.topic_id,'deleted',e.deleted,'revision',e.revision,'createdAt',e.created_at,'updatedAt',e.updated_at);
$$;
create function public.feture_journal_command(p_owner text,p_command jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare c jsonb:=p_command;act text:=p_command->>'action';o uuid;i uuid;expected bigint;h text;e public.feture_journal_entries;r public.feture_journal_operations;cleared bigint;at_time timestamptz;after_id uuid;items jsonb;last_row jsonb;
begin
 if p_owner is null or p_owner !~ '^[a-f0-9]{32}$' or jsonb_typeof(c) is distinct from 'object' or act is null or act not in('journal.list','journal.read','journal.save','journal.delete','history.list','history.clear') then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 if act in('journal.list','history.list') then
  if c->'cursor' is not null and c->'cursor'<>'null'::jsonb then at_time:=(c->'cursor'->>'at')::timestamptz;after_id:=(c->'cursor'->>'id')::uuid;if at_time is null or after_id is null then return jsonb_build_object('ok',false,'error','invalid_request');end if;end if;
  if act='journal.list' then
   select coalesce(jsonb_agg(public.feture_journal_dto(x) order by x.created_at desc,x.id desc),'[]') into items from
   (select * from public.feture_journal_entries where account_hash=p_owner and not deleted and (at_time is null or(created_at,id)<(at_time,after_id)) order by created_at desc,id desc limit 31) x;
  else
   select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'interestId',x.interest_id,'revision',x.revision,'entry',x.entry,'createdAt',x.created_at) order by x.created_at desc,x.id desc),'[]') into items from
   (select * from public.feture_interest_history where account_hash=p_owner and (at_time is null or(created_at,id)<(at_time,after_id)) order by created_at desc,id desc limit 31) x;
  end if;
  if jsonb_array_length(items)>30 then last_row:=items->29;items:=items-30;end if;
  return jsonb_build_object('ok',true,'items',items,'nextCursor',case when last_row is not null then jsonb_build_object('at',last_row->'createdAt','id',last_row->'id') else null end);
 end if;
 if act='journal.read' then
  select * into e from public.feture_journal_entries where account_hash=p_owner and id=(c->>'id')::uuid and not deleted;
  if e.id is null then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  return jsonb_build_object('ok',true,'entry',public.feture_journal_dto(e));
 end if;
 o:=(c->>'operationId')::uuid;if o is null then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 h:=encode(sha256(convert_to(c::text,'UTF8')),'hex');
 insert into public.feture_profiles(account_hash) values(p_owner) on conflict do nothing;
 perform 1 from public.feture_profiles where account_hash=p_owner for update;
 select * into r from public.feture_journal_operations where account_hash=p_owner and operation_id=o;
 if found then
  if r.payload_hash<>h then return jsonb_build_object('ok',false,'error','operation_conflict');end if;
  if r.entry_id is null then return jsonb_build_object('ok',true,'cleared',r.cleared_count,'replayed',true);end if;
  select * into e from public.feture_journal_entries where account_hash=p_owner and id=r.entry_id;
  return jsonb_build_object('ok',true,'entry',public.feture_journal_dto(e),'replayed',true);
 end if;
 if act='history.clear' then
  delete from public.feture_interest_history where account_hash=p_owner;get diagnostics cleared=row_count;
  insert into public.feture_journal_operations(account_hash,operation_id,payload_hash,cleared_count) values(p_owner,o,h,cleared);
  return jsonb_build_object('ok',true,'cleared',cleared,'replayed',false);
 end if;
 i:=(c->>'id')::uuid;expected:=(c->>'expectedRevision')::bigint;
 if i is null or expected is null or expected<0 or expected>=9007199254740991 then return jsonb_build_object('ok',false,'error','invalid_request');end if;
 select * into e from public.feture_journal_entries where account_hash=p_owner and id=i;
 if e.deleted then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
 if coalesce(e.revision,0)<>expected then return jsonb_build_object('ok',false,'error','revision_conflict');end if;
 if act='journal.delete' then
  if e.id is null then return jsonb_build_object('ok',false,'error','resource_not_found');end if;
  update public.feture_journal_entries set title='',text='',topic_id=null,deleted=true,revision=revision+1,updated_at=clock_timestamp() where account_hash=p_owner and id=i returning * into e;
 else
  if jsonb_typeof(c->'title') is distinct from 'string' or jsonb_typeof(c->'text') is distinct from 'string' or char_length(c->>'title')>160 or char_length(c->>'text')>3000 or char_length(btrim(c->>'text'))=0 or c->>'title' ~ '[[:cntrl:]]' or replace(c->>'text',chr(10),'') ~ '[[:cntrl:]]' or(jsonb_typeof(c->'topicId') is distinct from 'null' and jsonb_typeof(c->'topicId') is distinct from 'string') then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  if c->>'topicId' is not null and not exists(select 1 from public.feture_interests where id=c->>'topicId') then return jsonb_build_object('ok',false,'error','invalid_request');end if;
  if e.id is null and(select count(*) from public.feture_journal_entries where account_hash=p_owner and not deleted)>=1000 then return jsonb_build_object('ok',false,'error','journal_limit');end if;
  insert into public.feture_journal_entries(account_hash,id,title,text,topic_id,revision) values(p_owner,i,c->>'title',c->>'text',c->>'topicId',expected+1)
  on conflict(account_hash,id) do update set title=excluded.title,text=excluded.text,topic_id=excluded.topic_id,revision=excluded.revision,updated_at=clock_timestamp() returning * into e;
 end if;
 insert into public.feture_journal_operations(account_hash,operation_id,payload_hash,entry_id) values(p_owner,o,h,i);
 return jsonb_build_object('ok',true,'entry',public.feture_journal_dto(e),'replayed',false);
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('ok',false,'error','invalid_request');end$$;
alter table public.feture_journal_entries enable row level security;
alter table public.feture_journal_operations enable row level security;
alter table public.feture_interest_history enable row level security;
revoke all on public.feture_journal_entries,public.feture_journal_operations,public.feture_interest_history from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.feture_journal_entries to service_role;
grant select,insert,delete on public.feture_journal_operations,public.feture_interest_history to service_role;
revoke all on function public.feture_journal_dto(public.feture_journal_entries),public.feture_journal_command(text,jsonb),public.feture_interest_record_history() from public,anon,authenticated;
grant execute on function public.feture_journal_dto(public.feture_journal_entries),public.feture_journal_command(text,jsonb),public.feture_interest_record_history() to service_role;
notify pgrst,'reload schema';
