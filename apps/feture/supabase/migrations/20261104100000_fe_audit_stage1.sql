-- Audit 04.11.2026, stage 1 (fixes of existing data; the code fixes come with it). Re-runnable.

-- Item 10: age and photo checks of accounts deleted before the fix stayed «submitted» in the staff queues (and their
-- counts). They expire, as account.delete now does for new deletions.
update feture.age_check c set state = 'expired'
where c.state in ('started', 'submitted')
  and exists (select 1 from feture.account a where a.id = c.account_id and a.state = 'deleted');

update feture.photo_check c set state = 'expired'
where c.state in ('started', 'submitted')
  and exists (select 1 from feture.profile p where p.id = c.profile_id and p.state = 'deleted');

-- Item 42: a partner is never blocked (server/commands/social.mjs blockProfile). Blocks made before between partners of
-- one couple (active, paused or suspended) — from a personal profile or from the couple — are removed.
delete from feture.block b
where exists (
  select 1 from feture.profile_member bm
  join feture.profile_member cm on cm.profile_id = bm.profile_id and cm.state = 'active' and cm.account_id <> bm.account_id
  join feture.profile c on c.id = bm.profile_id and c.kind = 'couple' and c.state in ('active', 'paused', 'suspended')
  join feture.account ta on ta.id = cm.account_id and ta.person_profile_id = b.blocked_profile_id
  where bm.state = 'active' and bm.profile_kind = 'couple'
    and bm.account_id in (select m.account_id from feture.profile_member m where m.profile_id = b.blocker_profile_id and m.state = 'active'));
