-- AppBase server store on Supabase/Postgres.
--
-- The server talks to storage through packages/core/server/store.js, which speaks
-- a small, fixed subset of Redis commands. This table + kv_exec() implement that
-- subset in Postgres, so the whole server store (accounts, sessions, sync, catalog,
-- trainer pages, counters, locks, analytics) can move without touching endpoints.
--
-- Supported commands (each element of `cmds` is a JSON array of strings):
--   GET k · MGET k… · SET k v [EX s] [NX] · INCR k · EXPIRE k s · RPUSH k v
--   LRANGE k start stop · LREM k count v · DEL k… · TTL k · TYPE k
--   SCAN cursor [MATCH glob] [COUNT n] · DBSIZE
--   UNLOCK k token          compare-and-delete (lock release)
--   KVPUT k kind json ttl   full replace, used by the storage migration copier
--
-- Expired rows are invisible to reads, replaced by writes and purged by pg_cron.

create table if not exists public.appbase_kv (
  key text collate "C" primary key,
  kind text not null check (kind in ('string', 'list')),
  str text,
  items text[],
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint appbase_kv_key_len check (char_length(key) between 1 and 512)
);

create index if not exists appbase_kv_expires_idx
  on public.appbase_kv (expires_at) where expires_at is not null;

alter table public.appbase_kv enable row level security;
revoke all on table public.appbase_kv from anon, authenticated;

create or replace function public.appbase_kv_live(p_exp timestamptz)
returns boolean language sql stable parallel safe
set search_path = ''
as $$ select p_exp is null or p_exp > now() $$;

create or replace function public.appbase_kv_like(pattern text)
returns text language sql immutable parallel safe
set search_path = ''
as $$
  select replace(replace(replace(replace(replace(coalesce(pattern, '*'),
    '\', '\\'), '%', '\%'), '_', '\_'), '*', '%'), '?', '_')
$$;

create or replace function public.kv_exec(cmds jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  cmd jsonb;
  op text;
  k text;
  n int;
  i int;
  result_arr jsonb := '[]'::jsonb;
  res jsonb;
  r public.appbase_kv%rowtype;
  ttl int;
  nx boolean;
  v_exp timestamptz;
  cnt bigint;
  arr text[];
  s int;
  e int;
  cursor_key text;
  pat text;
  lim int;
  key_list text[];
begin
  if jsonb_typeof(cmds) <> 'array' then
    raise exception 'kv_exec: cmds must be an array';
  end if;

  for cmd in select value from jsonb_array_elements(cmds) loop
    op := upper(cmd->>0);
    k := cmd->>1;
    n := jsonb_array_length(cmd);
    res := 'null'::jsonb;

    if op = 'GET' then
      select * into r from appbase_kv where key = k and appbase_kv_live(expires_at);
      if found and r.kind = 'string' then res := to_jsonb(r.str); end if;

    elsif op = 'MGET' then
      select coalesce(jsonb_agg(
               (select case when a.kind = 'string' then to_jsonb(a.str) else 'null'::jsonb end
                  from appbase_kv a
                 where a.key = q.k and appbase_kv_live(a.expires_at))
               order by q.ord), '[]'::jsonb)
        into res
        from (select value as k, ordinality as ord
                from jsonb_array_elements_text(cmd - 0) with ordinality) q;
      -- jsonb_agg turns missing sub-select rows into SQL NULL, normalise to JSON null
      select coalesce(jsonb_agg(coalesce(x, 'null'::jsonb)), '[]'::jsonb) into res
        from jsonb_array_elements(res) x;

    elsif op = 'SET' then
      ttl := null; nx := false; i := 3;
      while i < n loop
        if upper(cmd->>i) = 'EX' then ttl := (cmd->>(i + 1))::int; i := i + 2;
        elsif upper(cmd->>i) = 'NX' then nx := true; i := i + 1;
        else raise exception 'kv_exec: unsupported SET option %', cmd->>i;
        end if;
      end loop;
      v_exp := case when ttl is null then null else now() + make_interval(secs => ttl) end;
      if nx then
        insert into appbase_kv as t (key, kind, str, items, expires_at, updated_at)
        values (k, 'string', cmd->>2, null, v_exp, now())
        on conflict (key) do update
          set kind = 'string', str = excluded.str, items = null,
              expires_at = excluded.expires_at, updated_at = now()
          where not appbase_kv_live(t.expires_at)
        returning t.key into cursor_key;
        res := case when found then '"OK"'::jsonb else 'null'::jsonb end;
      else
        insert into appbase_kv as t (key, kind, str, items, expires_at, updated_at)
        values (k, 'string', cmd->>2, null, v_exp, now())
        on conflict (key) do update
          set kind = 'string', str = excluded.str, items = null,
              expires_at = excluded.expires_at, updated_at = now();
        res := '"OK"'::jsonb;
      end if;

    elsif op = 'INCR' then
      insert into appbase_kv as t (key, kind, str, expires_at, updated_at)
      values (k, 'string', '1', null, now())
      on conflict (key) do update
        set kind = 'string', items = null, updated_at = now(),
            str = case when appbase_kv_live(t.expires_at) and t.kind = 'string'
                       then (coalesce(nullif(t.str, ''), '0')::bigint + 1)::text else '1' end,
            expires_at = case when appbase_kv_live(t.expires_at) and t.kind = 'string'
                              then t.expires_at else null end
      returning str::bigint into cnt;
      res := to_jsonb(cnt);

    elsif op = 'EXPIRE' then
      update appbase_kv
         set expires_at = now() + make_interval(secs => (cmd->>2)::int), updated_at = now()
       where key = k and appbase_kv_live(expires_at);
      get diagnostics cnt = row_count;
      res := to_jsonb(cnt);

    elsif op = 'RPUSH' then
      insert into appbase_kv as t (key, kind, items, expires_at, updated_at)
      values (k, 'list', array(select jsonb_array_elements_text(cmd - 0 - 0)), null, now())
      on conflict (key) do update
        set kind = 'list', str = null, updated_at = now(),
            items = case when appbase_kv_live(t.expires_at) and t.kind = 'list'
                         then coalesce(t.items, '{}') || excluded.items else excluded.items end,
            expires_at = case when appbase_kv_live(t.expires_at) and t.kind = 'list'
                              then t.expires_at else null end
      returning cardinality(items) into cnt;
      res := to_jsonb(cnt);

    elsif op = 'LRANGE' then
      select * into r from appbase_kv where key = k and appbase_kv_live(expires_at);
      if found and r.kind = 'list' then
        arr := coalesce(r.items, '{}');
        s := (cmd->>2)::int; e := (cmd->>3)::int;
        if s < 0 then s := greatest(cardinality(arr) + s, 0); end if;
        if e < 0 then e := cardinality(arr) + e; end if;
        e := least(e, cardinality(arr) - 1);
        if s > e then res := '[]'::jsonb;
        else res := to_jsonb(arr[s + 1 : e + 1]);
        end if;
      else
        res := '[]'::jsonb;
      end if;

    elsif op = 'LREM' then
      -- store.js only ever removes every occurrence (count 0)
      select * into r from appbase_kv where key = k and appbase_kv_live(expires_at) for update;
      if found and r.kind = 'list' then
        arr := array_remove(coalesce(r.items, '{}'), cmd->>3);
        cnt := cardinality(coalesce(r.items, '{}')) - cardinality(arr);
        if cardinality(arr) = 0 then delete from appbase_kv where key = k;
        elsif cnt > 0 then update appbase_kv set items = arr, updated_at = now() where key = k;
        end if;
        res := to_jsonb(cnt);
      else
        res := '0'::jsonb;
      end if;

    elsif op = 'DEL' then
      key_list := array(select jsonb_array_elements_text(cmd - 0));
      with d as (delete from appbase_kv where key = any(key_list) returning expires_at)
      select count(*) filter (where appbase_kv_live(expires_at)) into cnt from d;
      res := to_jsonb(cnt);

    elsif op = 'UNLOCK' then
      delete from appbase_kv
       where key = k and kind = 'string' and str = cmd->>2 and appbase_kv_live(expires_at);
      get diagnostics cnt = row_count;
      res := to_jsonb(cnt);

    elsif op = 'TTL' then
      select * into r from appbase_kv where key = k and appbase_kv_live(expires_at);
      if not found then res := '-2'::jsonb;
      elsif r.expires_at is null then res := '-1'::jsonb;
      else res := to_jsonb(greatest(1, ceil(extract(epoch from r.expires_at - now()))::bigint));
      end if;

    elsif op = 'TYPE' then
      select * into r from appbase_kv where key = k and appbase_kv_live(expires_at);
      res := to_jsonb(case when found then r.kind else 'none' end);

    elsif op = 'SCAN' then
      -- keyset cursor: '0' starts, the next cursor is the last returned key
      cursor_key := case when k is null or k = '0' then '' else k end;
      pat := '*'; lim := 500; i := 2;
      while i < n loop
        if upper(cmd->>i) = 'MATCH' then pat := cmd->>(i + 1);
        elsif upper(cmd->>i) = 'COUNT' then lim := least(greatest((cmd->>(i + 1))::int, 1), 5000);
        end if;
        i := i + 2;
      end loop;
      key_list := array(
        select key from appbase_kv
         where key > cursor_key collate "C" and appbase_kv_live(expires_at)
           and key like appbase_kv_like(pat)
         order by key
         limit lim);
      res := jsonb_build_array(
        case when cardinality(key_list) < lim then '0' else key_list[cardinality(key_list)] end,
        to_jsonb(key_list));

    elsif op = 'DBSIZE' then
      select count(*) into cnt from appbase_kv where appbase_kv_live(expires_at);
      res := to_jsonb(cnt);

    elsif op = 'KVPUT' then
      ttl := nullif(cmd->>4, '')::int;
      v_exp := case when ttl is null or ttl <= 0 then null else now() + make_interval(secs => ttl) end;
      if cmd->>2 = 'list' then
        insert into appbase_kv (key, kind, str, items, expires_at, updated_at)
        values (k, 'list', null, array(select jsonb_array_elements_text((cmd->>3)::jsonb)), v_exp, now())
        on conflict (key) do update
          set kind = 'list', str = null, items = excluded.items,
              expires_at = excluded.expires_at, updated_at = now();
      elsif cmd->>2 = 'string' then
        insert into appbase_kv (key, kind, str, items, expires_at, updated_at)
        values (k, 'string', (cmd->>3)::jsonb #>> '{}', null, v_exp, now())
        on conflict (key) do update
          set kind = 'string', str = excluded.str, items = null,
              expires_at = excluded.expires_at, updated_at = now();
      else
        raise exception 'kv_exec: unsupported KVPUT kind %', cmd->>2;
      end if;
      res := '"OK"'::jsonb;

    else
      raise exception 'kv_exec: unsupported command %', op;
    end if;

    result_arr := result_arr || jsonb_build_array(res);
  end loop;

  return result_arr;
end;
$$;

revoke all on function public.kv_exec(jsonb) from public, anon, authenticated;
grant execute on function public.kv_exec(jsonb) to service_role;

-- Purge expired rows in the background; reads already ignore them.
create extension if not exists pg_cron;
select cron.schedule(
  'appbase-kv-expire',
  '*/15 * * * *',
  $$delete from public.appbase_kv where expires_at is not null and expires_at <= now()$$
);
