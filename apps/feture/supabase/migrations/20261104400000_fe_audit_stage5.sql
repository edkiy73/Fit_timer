-- Audit 04.11.2026, stage 5: a block closes everything. Re-runnable.

-- Items 19, В4: a block a personal profile set for its couples too remembers where it came from, so unblocking there
-- lifts both; a couple formed later inherits its partners' blocks the same way.
alter table feture.block add column if not exists via_profile_id uuid references feture.profile(id) on delete cascade;
create index if not exists block_via on feture.block (via_profile_id) where via_profile_id is not null;

-- Items 11, В14: members left in a community whose owner blocked them (or whom they blocked) leave it quietly. Read from
-- the blocks themselves (not feture.blocked(), which also hides test personas from each other's viewers).
update feture.community_member m set state = 'left', role = 'member'
from feture.community c
where c.id = m.community_id and m.state = 'active' and m.role <> 'owner' and exists (
  select 1 from feture.block b
  where (b.blocker_profile_id = c.owner_profile_id and b.blocked_profile_id in (select feture.profile_people(m.profile_id)))
     or (b.blocker_profile_id = m.profile_id and b.blocked_profile_id in (select feture.profile_people(c.owner_profile_id))));
