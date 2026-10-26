-- Slice G3: push delivery (docs/server/S2-API.md §8, extract/people-discover-chats.md §4.4).
-- The device's time zone decides quiet hours.
alter table feture.push_device add column tz text not null default 'UTC' check (char_length(tz) <= 64);
