-- Audit 04.11.2026, stage 7: couples. Re-runnable.

-- Item 20: what each partner approves is a list (contracts/_approve.mjs). The old mode becomes the points it covered.
alter table feture.profile_member add column if not exists approves_scope text[] not null default '{}';
alter table feture.profile_member add column if not exists approves_scope_before_pause text[];
update feture.profile_member set approves_scope = array['profile', 'posts', 'links', 'communities', 'events', 'chats']
where approves_partner and approves_scope = '{}';
update feture.profile_member set approves_scope_before_pause = array['profile', 'posts', 'links', 'communities', 'events', 'chats']
where approves_before_pause and approves_scope_before_pause is null;
