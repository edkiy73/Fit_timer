-- S4 step 3 support (docs/server/S4-MODERATION.md §3–5): evidence snapshots on reports, who objected to a photo,
-- the base version of a revision, and why an account was suspended (some suspensions only the owner may lift).

alter table feture.report add column snapshot jsonb check (snapshot is null or jsonb_typeof(snapshot) = 'object');
alter table feture.post add column disputed_by uuid references feture.profile(id) on delete set null;
alter table feture.post_revision add column base_rev integer;
alter table feture.account add column suspension_rule text;
