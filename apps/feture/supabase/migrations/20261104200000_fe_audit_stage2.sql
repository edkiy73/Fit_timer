-- Audit 04.11.2026, stage 2: moderation queues without dead items. Re-runnable.

-- Item 4: a post moderators removed stays removed when its author «deletes» it (so it can still be appealed); it only
-- leaves the author's own lists. Posts that were archived that way before go back to «removed».
alter table feture.post add column if not exists author_hidden boolean not null default false;
update feture.post p set state = 'removed', author_hidden = true, updated_at = now()
where p.state = 'archived' and p.removed_reason is not null
  and exists (select 1 from feture.staff_action s where s.target_type = 'post' and s.target_id = p.id and s.action in ('report.remove', 'dispute.remove'));

-- Item 22: a report on material that is gone (a closed community, a deleted account or couple) closes as «unavailable».
alter table feture.report drop constraint if exists report_resolution_check;
alter table feture.report add constraint report_resolution_check check (resolution in ('removed', 'kept', 'unavailable'));

-- Item 24: an appeal of an account or couple that is gone closes without a decision.
alter table feture.appeal drop constraint if exists appeal_state_check;
alter table feture.appeal add constraint appeal_state_check check (state in ('open', 'granted', 'denied', 'closed'));

-- Item 25: a «это я на фото» dispute closes when the post is gone, without strikes for anyone.
alter table feture.photo_dispute drop constraint if exists photo_dispute_state_check;
alter table feture.photo_dispute add constraint photo_dispute_state_check check (state in ('open', 'confirmed', 'rejected', 'closed'));

-- Items 22, 24, 25: what was left hanging before the fix.
update feture.report r set state = 'resolved', resolution = 'unavailable', resolved_at = now()
where r.state = 'open' and (
  (r.target_type = 'profile' and exists (select 1 from feture.profile p where p.id = r.target_id and p.state = 'deleted'))
  or (r.target_type = 'community' and exists (select 1 from feture.community c where c.id = r.target_id and c.state = 'deleted')));

update feture.appeal ap set state = 'closed', decided_at = now()
where ap.state = 'open' and exists (select 1 from feture.profile p where p.id = ap.profile_id and p.state = 'deleted');

update feture.photo_dispute d set state = 'closed', decided_at = now()
where d.state = 'open' and exists (select 1 from feture.post p left join feture.profile o on o.id = p.owner_profile_id
  where p.id = d.post_id and (p.state in ('archived', 'removed') or o.state = 'deleted'));

-- Item 26: reports on a post already removed (by a dispute decision) are answered by that removal.
update feture.report r set state = 'resolved', resolution = 'removed', resolved_at = now()
where r.state = 'open' and r.target_type = 'post' and exists (select 1 from feture.post p where p.id = r.target_id and p.state = 'removed');

-- Item 18: a change waits for staff only on a published community; hidden and closed ones drop theirs.
update feture.community set pending_change = null where pending_change is not null and state <> 'published';
