-- «Нужно решить» → the relationship status (owner 05.11.2026): the card is one of the account's decisions on the
-- server, so «Я», the dock, the bell and «Действовать как» count the same; «Оставить» is kept here, on every device.
alter table feture.profile_details add column if not exists status_kept boolean not null default false;
