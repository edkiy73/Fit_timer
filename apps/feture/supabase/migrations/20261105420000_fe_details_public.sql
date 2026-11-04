-- «Данные» are always seen by everyone (owner 04.11.2026): no audience question at sign-up, no choice afterwards.
update feture.profile_details set details_vis = 'all' where details_vis is distinct from 'all';
alter table feture.profile_details alter column details_vis set default 'all';
