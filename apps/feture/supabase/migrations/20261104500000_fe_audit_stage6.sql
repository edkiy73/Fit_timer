-- Audit 04.11.2026, stage 6: communities and events — closing, ownership, leftovers. Re-runnable.

-- Item 13: a community whose owner (a couple) is paused stays visible (marked «владелец на паузе» in the app), it was
-- «не найдено» for its members before.
create or replace function feture.community_visible(c feture.community, viewer uuid, viewer_account uuid) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  select case
    when exists (select 1 from feture.profile_member m where m.profile_id = c.owner_profile_id and m.account_id = viewer_account and m.state = 'active') then c.state <> 'deleted'
    else c.state = 'published'
      and exists (select 1 from feture.profile o where o.id = c.owner_profile_id and o.state in ('active', 'paused'))
      and not feture.blocked(viewer, c.owner_profile_id)
      and (c.privacy <> 'hidden' or exists (select 1 from feture.community_member cm where cm.community_id = c.id and cm.profile_id = viewer and cm.state = 'active'))
  end
$$;

-- Item 15: a cancelled event still opens for the people it concerns (their «Событие отменено» card), also when its
-- community is closed or its organizer gone; everyone else sees it as before.
create or replace function feture.event_visible(e feture.event, viewer uuid, viewer_account uuid) returns boolean
language sql stable set search_path = pg_catalog, feture as $$
  select case
    when exists (select 1 from feture.profile_member m where m.profile_id = e.organizer_profile_id and m.account_id = viewer_account and m.state = 'active') then true
    when e.state = 'cancelled' and not feture.blocked(viewer, e.organizer_profile_id) and (
      exists (select 1 from feture.event_rsvp r where r.event_id = e.id and r.profile_id = viewer and r.status in ('interested', 'going'))
      or exists (select 1 from feture.event_application x where x.event_id = e.id and x.profile_id = viewer and x.state in ('pending', 'approved', 'closed'))
      or exists (select 1 from feture.saved_item s where s.kind = 'event' and s.target_id = e.id::text and s.profile_id = viewer)) then true
    else e.state in ('published', 'cancelled')
      and exists (select 1 from feture.profile o where o.id = e.organizer_profile_id and o.state = 'active')
      and not feture.blocked(viewer, e.organizer_profile_id)
      and (e.community_id is null or exists (
            select 1 from feture.community c where c.id = e.community_id and c.state = 'published'
              and (c.privacy = 'open' and not e.members_only or feture.community_reader(c.id, viewer))))
  end
$$;

-- Item 13: what deleted couples left behind. Their communities close, their future events are cancelled, their
-- memberships, answers and applications end (nobody is told now: these were never shown as live to anyone since).
update feture.community c set state = 'deleted', pending_change = null, updated_at = now()
where c.state <> 'deleted' and exists (select 1 from feture.profile p where p.id = c.owner_profile_id and p.kind = 'couple' and p.state = 'deleted');
update feture.event e set state = 'cancelled', cancelled_at = now(), rev = rev + 1, updated_at = now()
where e.state = 'published' and e.ends_at > now() and exists (select 1 from feture.profile p where p.id = e.organizer_profile_id and p.kind = 'couple' and p.state = 'deleted');
update feture.community_member m set state = 'left', role = 'member'
where m.state = 'active' and exists (select 1 from feture.profile p where p.id = m.profile_id and p.kind = 'couple' and p.state = 'deleted');
delete from feture.event_rsvp r where exists (select 1 from feture.profile p where p.id = r.profile_id and p.kind = 'couple' and p.state = 'deleted');
update feture.event_application a set state = 'withdrawn', decided_at = now(), rev = rev + 1
where a.state in ('pending', 'approved') and exists (select 1 from feture.profile p where p.id = a.profile_id and p.kind = 'couple' and p.state = 'deleted');
delete from feture.follow f where exists (select 1 from feture.profile p where p.state = 'deleted' and p.kind = 'couple' and p.id in (f.follower_profile_id, f.target_profile_id));
