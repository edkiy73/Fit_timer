-- e2e persona accounts (owner 28.10.2026): their profiles must not crowd the Discover decks of real and test-world
-- people. An account is marked when it is created from a Core login `qa-…@feture.test` (only the admin test code
-- signs in at feture.test, so nobody can mark themselves); Discover leaves marked profiles out for unmarked viewers,
-- and marked viewers still meet each other, so scenarios keep working. People search puts them last.
alter table feture.account add column qa boolean not null default false;
