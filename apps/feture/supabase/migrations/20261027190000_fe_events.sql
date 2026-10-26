-- Slice D2: events (docs/server/S1-DOMAIN-MODEL.md §10, extract/communities-events.md §1.8–1.13).
-- The exact address and join link are for admitted people only; a pending application never counts as «идёт».

create table feture.event (
  id uuid primary key default feture.uuid_v7(),
  organizer_profile_id uuid not null references feture.profile(id) on delete cascade,
  created_by uuid not null references feture.account(id),
  community_id uuid references feture.community(id) on delete cascade,   -- never falls open to the public
  members_only boolean not null default false,                           -- created while the community was closed
  title text not null check (char_length(title) between 5 and 80),
  kind text not null check (kind in ('meetup', 'workshop', 'talk', 'party')),
  description text not null check (char_length(description) between 20 and 1500),
  format text not null check (format in ('offline', 'online')),
  place_id uuid references feture.place(id) on delete set null,
  area text check (area is null or char_length(area) <= 120),
  exact_address text check (exact_address is null or char_length(exact_address) <= 300),   -- admitted people only
  join_url text check (join_url is null or join_url ~ '^https://'),                         -- admitted people only
  tz text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  price jsonb not null default '{"kind":"free"}' check (jsonb_typeof(price) = 'object'),
  requires_application boolean not null default false,
  questions text[] not null default '{}' check (cardinality(questions) <= 3),
  requirements text check (requirements is null or char_length(requirements) <= 500),
  cover_asset_id uuid references feture.media_asset(id) on delete set null,
  plate text not null default 'lilac' check (plate in ('lilac', 'rose', 'sea', 'amber', 'moss', 'coal')),
  state text not null default 'in_review' check (state in ('pending_partner', 'in_review', 'published', 'rejected', 'hidden', 'cancelled')),
  pending_change jsonb check (pending_change is null or jsonb_typeof(pending_change) = 'object'),  -- major edits waiting for staff
  reject_reason text,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 300),
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (format = 'online' and join_url is not null or format = 'offline' and place_id is not null and area is not null and exact_address is not null),
  check (not requires_application or cardinality(questions) >= 1)
);
create index event_catalog on feture.event (starts_at) where state in ('published', 'cancelled');
create index event_organizer on feture.event (organizer_profile_id);
create index event_community on feture.event (community_id) where community_id is not null;

create table feture.event_draft (
  id uuid primary key default feture.uuid_v7(),
  owner_profile_id uuid not null references feture.profile(id) on delete cascade,
  created_by uuid not null references feture.account(id),
  form jsonb not null check (jsonb_typeof(form) = 'object'),
  step smallint not null default 1 check (step between 1 and 4),
  updated_at timestamptz not null default now()
);

create table feture.event_rsvp (
  event_id uuid not null references feture.event(id) on delete cascade,
  profile_id uuid not null references feture.profile(id) on delete cascade,
  status text not null check (status in ('interested', 'going', 'not_going')),
  show_in_list boolean not null default false,
  ticket_marked boolean not null default false,
  acted_by uuid not null references feture.account(id),
  updated_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

create table feture.event_application (
  id uuid primary key default feture.uuid_v7(),
  event_id uuid not null references feture.event(id) on delete cascade,
  profile_id uuid not null references feture.profile(id) on delete cascade,
  answers text[] not null,
  note text not null default '' check (char_length(note) <= 300),
  requirements_accepted_at timestamptz not null default now(),
  state text not null default 'pending' check (state in ('pending', 'approved', 'declined', 'withdrawn', 'closed')),
  acted_by uuid not null references feture.account(id),
  decided_by uuid references feture.account(id),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  rev integer not null default 1
);
create unique index event_application_one_open on feture.event_application (event_id, profile_id) where state in ('pending', 'approved');

create table feture.event_announcement (
  id uuid primary key default feture.uuid_v7(),
  event_id uuid not null references feture.event(id) on delete cascade,
  body text check (body is null or char_length(body) between 5 and 500),
  automatic boolean not null default false,
  changes text[] check (changes <@ array['time', 'place', 'link']),   -- automatic: what changed; the client words it
  check (automatic and cardinality(changes) > 0 or not automatic and body is not null),
  created_by uuid references feture.account(id),
  created_at timestamptz not null default now()
);

-- An event of a closed or hidden community stays members-only after the community opens (as discussions do).
create function feture.event_members_only() returns trigger
language plpgsql set search_path = pg_catalog, feture as $$
begin
  if new.community_id is not null and (tg_op = 'INSERT' or new.state = 'published') then
    new.members_only := new.members_only or exists (select 1 from feture.community c where c.id = new.community_id and c.privacy <> 'open');
  end if;
  return new;
end $$;
create trigger event_members_only before insert or update of state on feture.event
  for each row execute function feture.event_members_only();

-- Event visible to a viewer: published or cancelled (or the viewer is in the organizing profile), organizer active,
-- no block either way; an event of a closed or hidden community only for its members (Q30).
create function feture.event_visible(e feture.event, viewer uuid, viewer_account uuid) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  select case
    when exists (select 1 from feture.profile_member m where m.profile_id = e.organizer_profile_id and m.account_id = viewer_account and m.state = 'active') then true
    else e.state in ('published', 'cancelled')
      and exists (select 1 from feture.profile o where o.id = e.organizer_profile_id and o.state = 'active')
      and not feture.blocked(viewer, e.organizer_profile_id)
      and (e.community_id is null or exists (
            select 1 from feture.community c where c.id = e.community_id and c.state = 'published'
              and (c.privacy = 'open' and not e.members_only or feture.community_reader(c.id, viewer))))
  end
$$;

-- Admitted: may see the exact address or join link. Organizer; otherwise not cancelled, not over, and either an
-- approved application (events by application) or «иду» (open events).
create function feture.event_admitted(e feture.event, viewer uuid, viewer_account uuid) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  select exists (select 1 from feture.profile_member m where m.profile_id = e.organizer_profile_id and m.account_id = viewer_account and m.state = 'active')
    or (e.state = 'published' and e.ends_at > now() and not feture.blocked(viewer, e.organizer_profile_id) and case when e.requires_application
          then exists (select 1 from feture.event_application a where a.event_id = e.id and a.profile_id = viewer and a.state = 'approved')
          else exists (select 1 from feture.event_rsvp r where r.event_id = e.id and r.profile_id = viewer and r.status = 'going') end)
$$;

do $$
declare t text;
begin
  foreach t in array array['event', 'event_draft', 'event_rsvp', 'event_application', 'event_announcement'] loop
    execute format('alter table feture.%I enable row level security', t);
    execute format('alter table feture.%I force row level security', t);
    execute format('revoke all on feture.%I from public', t);
    execute format('create policy api_all on feture.%I to feture_api using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on feture.%I to feture_api', t);
  end loop;
end $$;
grant execute on function feture.event_visible(feture.event, uuid, uuid) to feture_api;
grant execute on function feture.event_admitted(feture.event, uuid, uuid) to feture_api;
