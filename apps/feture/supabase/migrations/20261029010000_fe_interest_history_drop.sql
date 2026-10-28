-- Owner, 29.10.2026: «История интересов» is removed from the product (screen, command and texts). Pre-launch data is
-- disposable, so the table that only fed that screen goes too; nothing else reads or writes it.
drop table if exists feture.interest_history;
