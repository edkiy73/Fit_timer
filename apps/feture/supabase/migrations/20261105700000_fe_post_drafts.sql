-- A draft is saved in any state (owner 05.11.2026): the title length and the post/article rules apply to a post that
-- goes out, not to a draft (a draft may have a one-letter title, an article without a title, a text past the length).
-- Publishing checks the full rules in the command (post.publish) and these constraints again once the state changes.
alter table feture.post drop constraint if exists post_title_check;
alter table feture.post drop constraint if exists post_check;
alter table feture.post add constraint post_title_check
  check (title is null or char_length(title) <= 120 and (state = 'draft' or char_length(title) >= 3));
alter table feture.post add constraint post_check
  check (state = 'draft' or (type = 'post' and char_length(body) <= 1000) or (type = 'note' and title is not null));
