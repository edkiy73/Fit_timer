-- Feed pages in publication order without reading every post (perf pass 28.10.2026). feed.list asks for published
-- in-feed posts outside communities, newest first, and checks feture.post_visible() on each row; the existing
-- post_feed index also requires audience = 'all', which the query does not (followers-only posts are in the feed too),
-- so today the planner scans the whole table and calls post_visible() for every post (≈0.2 ms each: 32 ms at 156
-- posts, seconds at tens of thousands). With this index it walks the posts newest first and stops after one page.
create index if not exists post_feed_all on feture.post (published_at desc, id desc)
  where state = 'published' and in_feed and community_id is null;
