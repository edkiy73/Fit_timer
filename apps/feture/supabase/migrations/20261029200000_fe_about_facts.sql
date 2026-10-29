-- «Обо мне» facts on person profiles (owner 29.10.2026): height, smoking, alcohol, kids, languages, zodiac sign.
-- All optional; each has its own audience in about_vis ({fact: 'all' | 'granted' | 'only'}, a missing key = 'only').
-- Additive: apply before the deploy that reads them.
alter table feture.profile_details
  add column if not exists height smallint check (height between 120 and 230),
  add column if not exists smoking text check (smoking in ('no', 'sometimes', 'yes')),
  add column if not exists alcohol text check (alcohol in ('no', 'rarely', 'sometimes')),
  add column if not exists kids text check (kids in ('have', 'want', 'dont_want', 'unsure')),
  add column if not exists langs text[] not null default '{}' check (cardinality(langs) <= 6),
  add column if not exists zodiac text check (zodiac in ('aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio',
    'sagittarius', 'capricorn', 'aquarius', 'pisces')),
  add column if not exists about_vis jsonb not null default '{}'::jsonb check (jsonb_typeof(about_vis) = 'object');
