-- Owner decision 28.10.2026: no article-only subscription («Следить за статьями»). One follows an author or not.
-- The table, its rows and the queued «new article» notifications go; follows are untouched.
delete from feture.outbox where topic = 'note.published';
drop table if exists feture.note_subscription;
