-- Security audit 06.11.2026: «saved» opened a cancelled event past the community and organizer checks. Someone who knew an event id
-- could save it (saved.set checked nothing) and then read a cancelled event of a closed community or of a suspended organizer. The
-- saved branch now keeps the same two checks as the general one (the exact address and join link were never exposed: event_admitted).
create or replace function feture.event_visible(e feture.event, viewer uuid, viewer_account uuid) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  select case
    when exists (select 1 from feture.profile_member m where m.profile_id = e.organizer_profile_id and m.account_id = viewer_account and m.state = 'active') then true
    when e.state = 'cancelled' and not feture.blocked(viewer, e.organizer_profile_id) and (
      exists (select 1 from feture.event_rsvp r where r.event_id = e.id and r.profile_id = viewer and r.status in ('interested', 'going'))
      or exists (select 1 from feture.event_application x where x.event_id = e.id and x.profile_id = viewer and x.state in ('pending', 'approved', 'closed'))
      or (exists (select 1 from feture.saved_item s where s.kind = 'event' and s.target_id = e.id::text and s.profile_id = viewer)
          and exists (select 1 from feture.profile o where o.id = e.organizer_profile_id and o.state = 'active')
          and (e.community_id is null or exists (select 1 from feture.community c where c.id = e.community_id and c.state = 'published' and feture.community_reader(c.id, viewer))))) then true
    else e.state in ('published', 'cancelled')
      and exists (select 1 from feture.profile o where o.id = e.organizer_profile_id and o.state = 'active')
      and not feture.blocked(viewer, e.organizer_profile_id)
      and (e.community_id is null or exists (
            select 1 from feture.community c where c.id = e.community_id and c.state = 'published'
              and (c.privacy = 'open' and not e.members_only or feture.community_reader(c.id, viewer))))
  end
$$;
