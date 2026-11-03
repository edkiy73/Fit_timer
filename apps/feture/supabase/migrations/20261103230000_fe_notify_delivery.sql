-- Notifications, stages 6 and 6B (docs/notifications.md «Push», «Email», owner 03.11.2026): precise, timely push and
-- email notifications.

-- Push: a device whose push waits for the end of quiet hours (an important one) is `deferred`; the later item sends it.
alter table feture.push_delivery drop constraint if exists push_delivery_state_check;
alter table feture.push_delivery add constraint push_delivery_state_check check (state in ('queued', 'sent', 'failed', 'deferred'));

-- What a device of the account was last shown, by its tag (server/push.mjs): the next push closes those no longer
-- actual (a decided task, a read chat). `ref` holds ids only. Swept after two days.
create table feture.push_shown (
  account_id uuid not null references feture.account(id) on delete cascade,
  tag text not null check (tag ~ '^[a-z]{1,2}:[0-9a-zA-Z:._-]{1,120}$'),
  ref jsonb not null default '{}' check (jsonb_typeof(ref) = 'object'),
  shown_at timestamptz not null default now(),
  primary key (account_id, tag)
);
create index push_shown_age on feture.push_shown (account_id, shown_at desc);

-- Settings categories (owner: «Сообщения», «Решения» и «Пара» отдельно). `decide` followed `req` until now, so it
-- starts with what `req` had; messages and the couple start on. The digest is daily, weekly or off: «instant» is gone
-- (urgent things come at once by their own rule), and becomes daily.
update feture.notification_settings
   set settings = jsonb_set(jsonb_set(settings, '{categories}',
         coalesce(settings -> 'categories', '{}'::jsonb)
         || jsonb_build_object(
              'messages', coalesce(settings #> '{categories,messages}', coalesce(settings #> '{categories,match}', '{"push": true, "email": true}'::jsonb)),
              'decide', coalesce(settings #> '{categories,decide}', coalesce(settings #> '{categories,req}', '{"push": true, "email": true}'::jsonb)),
              'pair', coalesce(settings #> '{categories,pair}', '{"push": true, "email": true}'::jsonb))),
         '{digest}', to_jsonb(case when settings ->> 'digest' in ('daily', 'weekly', 'off') then settings ->> 'digest' else 'daily' end)),
       updated_at = now()
 where settings ? 'categories' or settings ? 'digest';

-- Email (server/email.mjs). The address a person signs in with (Core proves it with the email code) is kept for
-- notification mail only: sealed with a key derived from FETURE_ID_PEPPER, so a database copy alone cannot be joined
-- back to anyone's email (S1 D2), plus a keyed hash to match bounces and complaints. `tz`: the device's time zone for
-- the morning digest; `seen_at`: when the app was last opened; `digest_at`: when the last digest went.
create table feture.email_address (
  account_id uuid primary key references feture.account(id) on delete cascade,
  address_sealed text not null check (char_length(address_sealed) <= 1024),
  address_hash bytea not null check (octet_length(address_hash) = 32),
  tz text not null default 'UTC' check (char_length(tz) <= 64),
  seen_at timestamptz not null default now(),
  digest_at timestamptz,
  updated_at timestamptz not null default now()
);
create index email_address_hash on feture.email_address (address_hash);

-- One row per (item, address): `ref` names the item (`n:<notification>`, `d:<kind>:<id>`, `digest:<local day>`),
-- `object` the object it is about (at most one «now» email per object), `url` the place its button opens. queued → sent | skipped (no longer actual,
-- over a cap, switched off) | failed (a final refusal or out of attempts). `next_at` is the lease while a worker sends
-- it, or when it is due. last_error and the skip reason are short codes; provider_id is Resend's message id.
create table feture.email_delivery (
  id bigint generated always as identity primary key,
  account_id uuid not null references feture.account(id) on delete cascade,
  ref text not null check (ref ~ '^[a-z]{1,6}:[0-9a-zA-Z:._-]{1,120}$'),
  object text check (object is null or char_length(object) <= 120),
  mode text not null check (mode in ('now', 'now-if-unread', 'digest')),
  url text check (url is null or char_length(url) <= 320 and url ~ '^/#/n/[0-9a-zA-Z/?=&_-]+$'),  -- the destination resolver's route
  address_hash bytea not null check (octet_length(address_hash) = 32),
  state text not null default 'queued' check (state in ('queued', 'sent', 'skipped', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_at timestamptz not null default now(),
  provider_id text check (provider_id is null or provider_id ~ '^[0-9a-zA-Z_-]{1,100}$'),
  last_error text check (last_error is null or last_error ~ '^[a-z][a-z0-9_]{0,31}$'),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (account_id, ref, address_hash)
);
create index email_delivery_due on feture.email_delivery (next_at) where state = 'queued';
create index email_delivery_sent on feture.email_delivery (account_id, sent_at desc) where state = 'sent';

-- Addresses that bounced or complained (the Resend webhook): no mail to them again. Keyed by the address hash only.
create table feture.email_suppression (
  address_hash bytea primary key check (octet_length(address_hash) = 32),
  reason text not null check (reason in ('bounce', 'complaint')),
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['push_shown', 'email_address', 'email_delivery', 'email_suppression'] loop
    execute format('alter table feture.%I enable row level security', t);
    execute format('alter table feture.%I force row level security', t);
    execute format('revoke all on feture.%I from public', t);
    execute format('create policy api_all on feture.%I to feture_api using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on feture.%I to feture_api', t);
  end loop;
end $$;
