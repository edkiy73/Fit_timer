-- A city without a Russian name shows its English one in Russian too (the screens read name_ru for a Russian person).
update feture.place set name_ru = name_en where name_ru is null and name_en is not null;
