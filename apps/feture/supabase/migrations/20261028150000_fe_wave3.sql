-- FetUre backlog wave 3 (28.10.2026): who liked / who voted, removing one's mention, saved (not yet published) edits
-- of a published post, the «Подписки» activity feed. Most tables already exist (feed slice); this adds the revision a
-- saved edit was made on and the indexes the new reads need.

-- A saved edit remembers the post revision it was made on: publishing it over a newer version is refused.
alter table feture.post_saved_edit add column base_rev integer not null default 0;

-- «Нравится»: who liked one post or reply, newest first.
create index if not exists reaction_target_time on feture.reaction (target_type, target_id, created_at desc);
-- «Подписки» activity: what a followed person liked recently.
create index if not exists reaction_profile_time on feture.reaction (profile_id, created_at desc) where target_type = 'post';
-- «Подписки» activity: events a followed person is going to.
create index if not exists event_rsvp_profile on feture.event_rsvp (profile_id, updated_at desc);
-- Who chose a poll option, newest first.
create index if not exists poll_vote_option on feture.poll_vote (post_id, option, created_at desc);
