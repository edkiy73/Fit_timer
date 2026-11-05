-- City catalog from GeoNames (owner 06.11.2026): a place knows its GeoNames id and its population (the picker lists the
-- biggest first). The cities themselves come in 20261106000100_fe_cities_data.sql.
alter table feture.place add column if not exists geoname_id int unique;
alter table feture.place add column if not exists population int;
create index if not exists place_population on feture.place (population desc nulls last) where state = 'approved';
