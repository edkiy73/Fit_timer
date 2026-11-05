-- A city knows its time zone (GeoNames), so an event's time follows the city it is held in (owner 29.10.2026: event tz from the city).
alter table feture.place add column if not exists tz text;
