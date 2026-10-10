-- FetUre-only tables co-located in the existing FitT Supabase PostgreSQL database.
-- Uses AppBase's email/account-hash identity. NOT Supabase Auth; no auth.users FK.
-- ALL tables deny direct anon/authenticated access; only trusted server adapter may access.
-- No existing FitTimer tables, policies, functions, roles, or data are changed.
-- Source: data/concept-catalog.json (demo taxonomy, NOT production test questions).
--
-- SAFETY: applies only if none of these tables already exist, to prevent accidental reuse.
do $$
declare existing_count integer;
begin
  select count(*) into existing_count
  from information_schema.tables
  where table_schema='public'
  and table_name in ('feture_categories','feture_interests','feture_tests','feture_profiles',
                     'feture_interest_states','feture_test_responses','feture_posts',
                     'feture_profile_access','feture_dating_preferences');
  if existing_count > 0 then
    raise exception 'feture_schema_already_exists: review before applying';
  end if;
end $$;

create table public.feture_categories (
 id text primary key, title text not null, short_title text not null,
 icon text not null, accent_color text not null, position integer not null unique);
create table public.feture_interests (
 id text primary key, category_id text not null references public.feture_categories(id),
 title text not null, position integer not null, unique(category_id,position));
create index feture_interests_by_category on public.feture_interests(category_id,position);
create table public.feture_tests (
 id text primary key, title text not null, description text not null,
 category_id text not null references public.feture_categories(id),
 question_count integer not null check(question_count between 1 and 100));
comment on table public.feture_tests is 'DEMO metadata only. Test question definitions and answer scoring require independent review.';
create table public.feture_profiles (
 account_hash text primary key check(char_length(account_hash) between 8 and 128),
 display_name text not null default '' check(char_length(display_name)<=80),
 about text not null default '' check(char_length(about)<=4000),
 dating_enabled boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now());
comment on column public.feture_profiles.account_hash is 'Opaque AppBase server-derived account key, never email/client-supplied account identity.';
create table public.feture_interest_states (
 account_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 interest_id text not null references public.feture_interests(id),
 status text not null check(status in ('unknown','curious','fantasy','want_to_try','experienced','soft_limit','hard_limit','not_interested')),
 intensity smallint check(intensity between 0 and 100),
 visibility text not null default 'private' check(visibility in ('private','public','granted')),
 updated_at timestamptz not null default now(),
 primary key(account_hash,interest_id));
create index feture_states_interest on public.feture_interest_states(interest_id);
create table public.feture_test_responses (
 account_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 test_id text not null references public.feture_tests(id),
 answers jsonb not null default '{}'::jsonb check(jsonb_typeof(answers)='object'),
 taken_at timestamptz not null default now(),
 primary key(account_hash,test_id));
create table public.feture_posts (
 id uuid primary key default gen_random_uuid(),
 author_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 body text not null check(char_length(body) between 1 and 10000),
 audience text not null default 'private' check(audience in ('private','public','granted')),
 created_at timestamptz not null default now());
create index feture_posts_author_time on public.feture_posts(author_hash,created_at desc);
create table public.feture_profile_access (
 owner_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 viewer_hash text not null references public.feture_profiles(account_hash) on delete cascade,
 scope text[] not null default '{}',
 expires_at timestamptz,
 revoked_at timestamptz,
 granted_at timestamptz not null default now(),
 primary key(owner_hash,viewer_hash), check(owner_hash<>viewer_hash));
create table public.feture_dating_preferences (
 account_hash text primary key references public.feture_profiles(account_hash) on delete cascade,
 enabled boolean not null default false,
 preferences jsonb not null default '{}'::jsonb check(jsonb_typeof(preferences)='object'),
 updated_at timestamptz not null default now());

-- Locked-down PostgREST surface consistent with public.appbase_documents.
alter table public.feture_categories enable row level security;
revoke all on table public.feture_categories from public, anon, authenticated;
grant select,insert,update,delete on public.feture_categories to service_role;
alter table public.feture_interests enable row level security;
revoke all on table public.feture_interests from public, anon, authenticated;
grant select,insert,update,delete on public.feture_interests to service_role;
alter table public.feture_tests enable row level security;
revoke all on table public.feture_tests from public, anon, authenticated;
grant select,insert,update,delete on public.feture_tests to service_role;
alter table public.feture_profiles enable row level security;
revoke all on table public.feture_profiles from public, anon, authenticated;
grant select,insert,update,delete on public.feture_profiles to service_role;
alter table public.feture_interest_states enable row level security;
revoke all on table public.feture_interest_states from public, anon, authenticated;
grant select,insert,update,delete on public.feture_interest_states to service_role;
alter table public.feture_test_responses enable row level security;
revoke all on table public.feture_test_responses from public, anon, authenticated;
grant select,insert,update,delete on public.feture_test_responses to service_role;
alter table public.feture_posts enable row level security;
revoke all on table public.feture_posts from public, anon, authenticated;
grant select,insert,update,delete on public.feture_posts to service_role;
alter table public.feture_profile_access enable row level security;
revoke all on table public.feture_profile_access from public, anon, authenticated;
grant select,insert,update,delete on public.feture_profile_access to service_role;
alter table public.feture_dating_preferences enable row level security;
revoke all on table public.feture_dating_preferences from public, anon, authenticated;
grant select,insert,update,delete on public.feture_dating_preferences to service_role;

-- Initial catalog: only reference metadata; fictitious people and posts never inserted.
insert into public.feture_categories(id,title,short_title,icon,accent_color,position) values ('category-1','Роли и динамика','Роли','layers','#7156cb',0);
insert into public.feture_interests(id,category_id,title,position) values ('interest-1-1','category-1','Ведущая роль',0);
insert into public.feture_interests(id,category_id,title,position) values ('interest-1-2','category-1','Принимающая роль',1);
insert into public.feture_interests(id,category_id,title,position) values ('interest-1-3','category-1','Свитч',2);
insert into public.feture_interests(id,category_id,title,position) values ('interest-1-4','category-1','Передача инициативы',3);
insert into public.feture_interests(id,category_id,title,position) values ('interest-1-5','category-1','Контроль',4);
insert into public.feture_interests(id,category_id,title,position) values ('interest-1-6','category-1','Доверие',5);
insert into public.feture_interests(id,category_id,title,position) values ('interest-1-7','category-1','Партнёрская динамика',6);
insert into public.feture_interests(id,category_id,title,position) values ('interest-1-8','category-1','Ролевой обмен',7);
insert into public.feture_interests(id,category_id,title,position) values ('interest-1-9','category-1','Сервис',8);
insert into public.feture_interests(id,category_id,title,position) values ('interest-1-10','category-1','Наставничество',9);
insert into public.feture_interests(id,category_id,title,position) values ('interest-1-11','category-1','Равноправие',10);
insert into public.feture_interests(id,category_id,title,position) values ('interest-1-12','category-1','Договорённости',11);
insert into public.feture_categories(id,title,short_title,icon,accent_color,position) values ('category-2','Близость и контакт','Близость','heart','#e35278',1);
insert into public.feture_interests(id,category_id,title,position) values ('interest-2-1','category-2','Телесная близость',0);
insert into public.feture_interests(id,category_id,title,position) values ('interest-2-2','category-2','Объятия',1);
insert into public.feture_interests(id,category_id,title,position) values ('interest-2-3','category-2','Нежность',2);
insert into public.feture_interests(id,category_id,title,position) values ('interest-2-4','category-2','Поцелуи',3);
insert into public.feture_interests(id,category_id,title,position) values ('interest-2-5','category-2','Массаж',4);
insert into public.feture_interests(id,category_id,title,position) values ('interest-2-6','category-2','Медленный темп',5);
insert into public.feture_interests(id,category_id,title,position) values ('interest-2-7','category-2','Совместный отдых',6);
insert into public.feture_interests(id,category_id,title,position) values ('interest-2-8','category-2','Тактильность',7);
insert into public.feture_interests(id,category_id,title,position) values ('interest-2-9','category-2','Зрительный контакт',8);
insert into public.feture_interests(id,category_id,title,position) values ('interest-2-10','category-2','Сенсорное внимание',9);
insert into public.feture_interests(id,category_id,title,position) values ('interest-2-11','category-2','Игра с дистанцией',10);
insert into public.feture_interests(id,category_id,title,position) values ('interest-2-12','category-2','Послеобсуждение',11);
insert into public.feture_categories(id,title,short_title,icon,accent_color,position) values ('category-3','Сенсорика и ощущения','Ощущения','spark','#bf765b',2);
insert into public.feture_interests(id,category_id,title,position) values ('interest-3-1','category-3','Мягкие текстуры',0);
insert into public.feture_interests(id,category_id,title,position) values ('interest-3-2','category-3','Шёлк',1);
insert into public.feture_interests(id,category_id,title,position) values ('interest-3-3','category-3','Кожа',2);
insert into public.feture_interests(id,category_id,title,position) values ('interest-3-4','category-3','Температура',3);
insert into public.feture_interests(id,category_id,title,position) values ('interest-3-5','category-3','Ароматы',4);
insert into public.feture_interests(id,category_id,title,position) values ('interest-3-6','category-3','Звуки',5);
insert into public.feture_interests(id,category_id,title,position) values ('interest-3-7','category-3','Тишина',6);
insert into public.feture_interests(id,category_id,title,position) values ('interest-3-8','category-3','Прикосновения',7);
insert into public.feture_interests(id,category_id,title,position) values ('interest-3-9','category-3','Контраст ощущений',8);
insert into public.feture_interests(id,category_id,title,position) values ('interest-3-10','category-3','Повязка на глаза',9);
insert into public.feture_interests(id,category_id,title,position) values ('interest-3-11','category-3','Свет и тень',10);
insert into public.feture_interests(id,category_id,title,position) values ('interest-3-12','category-3','Сенсорные ритуалы',11);
insert into public.feture_categories(id,title,short_title,icon,accent_color,position) values ('category-4','Романтика и эмоции','Эмоции','heart','#aa5f93',3);
insert into public.feture_interests(id,category_id,title,position) values ('interest-4-1','category-4','Забота',0);
insert into public.feture_interests(id,category_id,title,position) values ('interest-4-2','category-4','Открытость',1);
insert into public.feture_interests(id,category_id,title,position) values ('interest-4-3','category-4','Комплименты',2);
insert into public.feture_interests(id,category_id,title,position) values ('interest-4-4','category-4','Романтика',3);
insert into public.feture_interests(id,category_id,title,position) values ('interest-4-5','category-4','Поддержка',4);
insert into public.feture_interests(id,category_id,title,position) values ('interest-4-6','category-4','Внимательность',5);
insert into public.feture_interests(id,category_id,title,position) values ('interest-4-7','category-4','Публичное проявление чувств',6);
insert into public.feture_interests(id,category_id,title,position) values ('interest-4-8','category-4','Интеллектуальная связь',7);
insert into public.feture_interests(id,category_id,title,position) values ('interest-4-9','category-4','Уязвимость',8);
insert into public.feture_interests(id,category_id,title,position) values ('interest-4-10','category-4','Нежная инициатива',9);
insert into public.feture_interests(id,category_id,title,position) values ('interest-4-11','category-4','Письма',10);
insert into public.feture_interests(id,category_id,title,position) values ('interest-4-12','category-4','Эмоциональная безопасность',11);
insert into public.feture_categories(id,title,short_title,icon,accent_color,position) values ('category-5','Фантазии и сценарии','Фантазии','sparkle','#7563ce',4);
insert into public.feture_interests(id,category_id,title,position) values ('interest-5-1','category-5','Ролевые сценарии',0);
insert into public.feture_interests(id,category_id,title,position) values ('interest-5-2','category-5','Театральность',1);
insert into public.feture_interests(id,category_id,title,position) values ('interest-5-3','category-5','Костюмы',2);
insert into public.feture_interests(id,category_id,title,position) values ('interest-5-4','category-5','Воображаемые сюжеты',3);
insert into public.feture_interests(id,category_id,title,position) values ('interest-5-5','category-5','Смена контекста',4);
insert into public.feture_interests(id,category_id,title,position) values ('interest-5-6','category-5','Игра образов',5);
insert into public.feture_interests(id,category_id,title,position) values ('interest-5-7','category-5','Спонтанность',6);
insert into public.feture_interests(id,category_id,title,position) values ('interest-5-8','category-5','Планирование',7);
insert into public.feture_interests(id,category_id,title,position) values ('interest-5-9','category-5','Фантазии в переписке',8);
insert into public.feture_interests(id,category_id,title,position) values ('interest-5-10','category-5','Эксперименты',9);
insert into public.feture_interests(id,category_id,title,position) values ('interest-5-11','category-5','Импровизация',10);
insert into public.feture_interests(id,category_id,title,position) values ('interest-5-12','category-5','Фантазия без реализации',11);
insert into public.feture_categories(id,title,short_title,icon,accent_color,position) values ('category-6','Эстетика и стиль','Эстетика','eye','#b16c8b',5);
insert into public.feture_interests(id,category_id,title,position) values ('interest-6-1','category-6','Фотография',0);
insert into public.feture_interests(id,category_id,title,position) values ('interest-6-2','category-6','Стиль одежды',1);
insert into public.feture_interests(id,category_id,title,position) values ('interest-6-3','category-6','Латекс',2);
insert into public.feture_interests(id,category_id,title,position) values ('interest-6-4','category-6','Кружево',3);
insert into public.feture_interests(id,category_id,title,position) values ('interest-6-5','category-6','Минимализм',4);
insert into public.feture_interests(id,category_id,title,position) values ('interest-6-6','category-6','Готика',5);
insert into public.feture_interests(id,category_id,title,position) values ('interest-6-7','category-6','Украшения',6);
insert into public.feture_interests(id,category_id,title,position) values ('interest-6-8','category-6','Маски',7);
insert into public.feture_interests(id,category_id,title,position) values ('interest-6-9','category-6','Макияж',8);
insert into public.feture_interests(id,category_id,title,position) values ('interest-6-10','category-6','Перформанс',9);
insert into public.feture_interests(id,category_id,title,position) values ('interest-6-11','category-6','Портреты',10);
insert into public.feture_interests(id,category_id,title,position) values ('interest-6-12','category-6','Визуальные образы',11);
insert into public.feture_categories(id,title,short_title,icon,accent_color,position) values ('category-7','Практики и исследования','Практики','compass','#278e84',6);
insert into public.feture_interests(id,category_id,title,position) values ('interest-7-1','category-7','Шибари',0);
insert into public.feture_interests(id,category_id,title,position) values ('interest-7-2','category-7','Связывание',1);
insert into public.feture_interests(id,category_id,title,position) values ('interest-7-3','category-7','Ролевые игры',2);
insert into public.feture_interests(id,category_id,title,position) values ('interest-7-4','category-7','Договорённости',3);
insert into public.feture_interests(id,category_id,title,position) values ('interest-7-5','category-7','Совместное изучение',4);
insert into public.feture_interests(id,category_id,title,position) values ('interest-7-6','category-7','Обучающие встречи',5);
insert into public.feture_interests(id,category_id,title,position) values ('interest-7-7','category-7','Мягкие эксперименты',6);
insert into public.feture_interests(id,category_id,title,position) values ('interest-7-8','category-7','Партнёрские ритуалы',7);
insert into public.feture_interests(id,category_id,title,position) values ('interest-7-9','category-7','Сенсорные упражнения',8);
insert into public.feture_interests(id,category_id,title,position) values ('interest-7-10','category-7','Безопасные практики',9);
insert into public.feture_interests(id,category_id,title,position) values ('interest-7-11','category-7','Обмен опытом',10);
insert into public.feture_interests(id,category_id,title,position) values ('interest-7-12','category-7','Осознанность',11);
insert into public.feture_categories(id,title,short_title,icon,accent_color,position) values ('category-8','Форматы отношений','Отношения','users','#c1774f',7);
insert into public.feture_interests(id,category_id,title,position) values ('interest-8-1','category-8','Моногамия',0);
insert into public.feture_interests(id,category_id,title,position) values ('interest-8-2','category-8','Открытые отношения',1);
insert into public.feture_interests(id,category_id,title,position) values ('interest-8-3','category-8','Полиамория',2);
insert into public.feture_interests(id,category_id,title,position) values ('interest-8-4','category-8','Свинг',3);
insert into public.feture_interests(id,category_id,title,position) values ('interest-8-5','category-8','Анархия отношений',4);
insert into public.feture_interests(id,category_id,title,position) values ('interest-8-6','category-8','Партнёрство без романтики',5);
insert into public.feture_interests(id,category_id,title,position) values ('interest-8-7','category-8','Дружба',6);
insert into public.feture_interests(id,category_id,title,position) values ('interest-8-8','category-8','Долгосрочная связь',7);
insert into public.feture_interests(id,category_id,title,position) values ('interest-8-9','category-8','Неформальные отношения',8);
insert into public.feture_interests(id,category_id,title,position) values ('interest-8-10','category-8','Профиль пары',9);
insert into public.feture_interests(id,category_id,title,position) values ('interest-8-11','category-8','Совместное общение',10);
insert into public.feture_interests(id,category_id,title,position) values ('interest-8-12','category-8','Личная автономия',11);
insert into public.feture_categories(id,title,short_title,icon,accent_color,position) values ('category-9','Общение и социальность','Общение','chat','#597fba',8);
insert into public.feture_interests(id,category_id,title,position) values ('interest-9-1','category-9','Личные сообщения',0);
insert into public.feture_interests(id,category_id,title,position) values ('interest-9-2','category-9','Групповые обсуждения',1);
insert into public.feture_interests(id,category_id,title,position) values ('interest-9-3','category-9','Камерные встречи',2);
insert into public.feture_interests(id,category_id,title,position) values ('interest-9-4','category-9','Вечеринки',3);
insert into public.feture_interests(id,category_id,title,position) values ('interest-9-5','category-9','Мастер-классы',4);
insert into public.feture_interests(id,category_id,title,position) values ('interest-9-6','category-9','События',5);
insert into public.feture_interests(id,category_id,title,position) values ('interest-9-7','category-9','Онлайн-знакомства',6);
insert into public.feture_interests(id,category_id,title,position) values ('interest-9-8','category-9','Новые друзья',7);
insert into public.feture_interests(id,category_id,title,position) values ('interest-9-9','category-9','Большие сообщества',8);
insert into public.feture_interests(id,category_id,title,position) values ('interest-9-10','category-9','Анонимные вопросы',9);
insert into public.feture_interests(id,category_id,title,position) values ('interest-9-11','category-9','Обмен историями',10);
insert into public.feture_interests(id,category_id,title,position) values ('interest-9-12','category-9','Тематические клубы',11);
insert into public.feture_categories(id,title,short_title,icon,accent_color,position) values ('category-10','Границы и безопасность','Границы','shield','#258d71',9);
insert into public.feture_interests(id,category_id,title,position) values ('interest-10-1','category-10','Согласие',0);
insert into public.feture_interests(id,category_id,title,position) values ('interest-10-2','category-10','Стоп-слово',1);
insert into public.feture_interests(id,category_id,title,position) values ('interest-10-3','category-10','Чёткие границы',2);
insert into public.feture_interests(id,category_id,title,position) values ('interest-10-4','category-10','Мягкие границы',3);
insert into public.feture_interests(id,category_id,title,position) values ('interest-10-5','category-10','Приватность',4);
insert into public.feture_interests(id,category_id,title,position) values ('interest-10-6','category-10','Конфиденциальность',5);
insert into public.feture_interests(id,category_id,title,position) values ('interest-10-7','category-10','Aftercare',6);
insert into public.feture_interests(id,category_id,title,position) values ('interest-10-8','category-10','Обсуждение ожиданий',7);
insert into public.feture_interests(id,category_id,title,position) values ('interest-10-9','category-10','Проверка самочувствия',8);
insert into public.feture_interests(id,category_id,title,position) values ('interest-10-10','category-10','Личные правила',9);
insert into public.feture_interests(id,category_id,title,position) values ('interest-10-11','category-10','Право передумать',10);
insert into public.feture_interests(id,category_id,title,position) values ('interest-10-12','category-10','Безопасность встреч',11);
insert into public.feture_categories(id,title,short_title,icon,accent_color,position) values ('category-11','Самовыражение и идентичность','Идентичность','user','#ab648a',10);
insert into public.feture_interests(id,category_id,title,position) values ('interest-11-1','category-11','Самовыражение',0);
insert into public.feture_interests(id,category_id,title,position) values ('interest-11-2','category-11','Самоопределение',1);
insert into public.feture_interests(id,category_id,title,position) values ('interest-11-3','category-11','Ориентация',2);
insert into public.feture_interests(id,category_id,title,position) values ('interest-11-4','category-11','Гендерная идентичность',3);
insert into public.feture_interests(id,category_id,title,position) values ('interest-11-5','category-11','Местоимения',4);
insert into public.feture_interests(id,category_id,title,position) values ('interest-11-6','category-11','Личный стиль',5);
insert into public.feture_interests(id,category_id,title,position) values ('interest-11-7','category-11','Принятие себя',6);
insert into public.feture_interests(id,category_id,title,position) values ('interest-11-8','category-11','Видимость',7);
insert into public.feture_interests(id,category_id,title,position) values ('interest-11-9','category-11','Неоднозначность',8);
insert into public.feture_interests(id,category_id,title,position) values ('interest-11-10','category-11','Любопытство',9);
insert into public.feture_interests(id,category_id,title,position) values ('interest-11-11','category-11','Личные ценности',10);
insert into public.feture_interests(id,category_id,title,position) values ('interest-11-12','category-11','Изменения со временем',11);
insert into public.feture_categories(id,title,short_title,icon,accent_color,position) values ('category-12','Ритм и образ жизни','Образ жизни','clock','#a67637',11);
insert into public.feture_interests(id,category_id,title,position) values ('interest-12-1','category-12','Спонтанность',0);
insert into public.feture_interests(id,category_id,title,position) values ('interest-12-2','category-12','Планирование встреч',1);
insert into public.feture_interests(id,category_id,title,position) values ('interest-12-3','category-12','Уединение',2);
insert into public.feture_interests(id,category_id,title,position) values ('interest-12-4','category-12','Общительность',3);
insert into public.feture_interests(id,category_id,title,position) values ('interest-12-5','category-12','Путешествия',4);
insert into public.feture_interests(id,category_id,title,position) values ('interest-12-6','category-12','Медленное знакомство',5);
insert into public.feture_interests(id,category_id,title,position) values ('interest-12-7','category-12','Активный отдых',6);
insert into public.feture_interests(id,category_id,title,position) values ('interest-12-8','category-12','Домашний уют',7);
insert into public.feture_interests(id,category_id,title,position) values ('interest-12-9','category-12','Городские события',8);
insert into public.feture_interests(id,category_id,title,position) values ('interest-12-10','category-12','Баланс времени',9);
insert into public.feture_interests(id,category_id,title,position) values ('interest-12-11','category-12','Свободный график',10);
insert into public.feture_interests(id,category_id,title,position) values ('interest-12-12','category-12','Уютные пространства',11);
insert into public.feture_tests(id,title,description,category_id,question_count) values ('test-1','Твои роли и динамика','Как тебе комфортнее распределять инициативу','category-1',8);
insert into public.feture_tests(id,title,description,category_id,question_count) values ('test-2','Язык близости','Что создаёт ощущение контакта','category-2',8);
insert into public.feture_tests(id,title,description,category_id,question_count) values ('test-3','Карта ощущений','Какие ощущения интересны тебе','category-3',8);
insert into public.feture_tests(id,title,description,category_id,question_count) values ('test-4','Эмоциональная связь','Как проявляются доверие и забота','category-4',8);
insert into public.feture_tests(id,title,description,category_id,question_count) values ('test-5','Фантазия или опыт','Чего хочется только в воображении','category-5',8);
insert into public.feture_tests(id,title,description,category_id,question_count) values ('test-6','Эстетика и самовыражение','Как образы отражают твои желания','category-6',8);
insert into public.feture_tests(id,title,description,category_id,question_count) values ('test-7','Исследовать новое','Про любопытство и темп','category-7',8);
insert into public.feture_tests(id,title,description,category_id,question_count) values ('test-8','Формат отношений','Комфортные договорённости с партнёром','category-8',8);
insert into public.feture_tests(id,title,description,category_id,question_count) values ('test-9','Социальная энергия','Общение, группы и встречи','category-9',8);
insert into public.feture_tests(id,title,description,category_id,question_count) values ('test-10','Твои границы','Что обязательно учитывать другим','category-10',8);
insert into public.feture_tests(id,title,description,category_id,question_count) values ('test-11','Быть собой','Что важно для идентичности','category-11',8);
insert into public.feture_tests(id,title,description,category_id,question_count) values ('test-12','Твой ритм','Как ты любишь развивать близость','category-12',8);
insert into public.feture_tests(id,title,description,category_id,question_count) values ('test-13','Сила доверия','Доверие, правила и открытость','category-10',8);
insert into public.feture_tests(id,title,description,category_id,question_count) values ('test-14','Комфорт в сообществе','Где тебе легко быть собой','category-9',8);
insert into public.feture_tests(id,title,description,category_id,question_count) values ('test-15','Новое без давления','Твой темп открытий','category-7',8);
insert into public.feture_tests(id,title,description,category_id,question_count) values ('test-16','Моя приватность','Что и кому комфортно показывать','category-10',8);
insert into public.feture_tests(id,title,description,category_id,question_count) values ('test-17','Способы заботиться','Поддержка и бережность','category-4',8);
insert into public.feture_tests(id,title,description,category_id,question_count) values ('test-18','Общий язык','Как обсуждать ожидания','category-8',8);

-- Assert import completeness transactionally.
do $$ begin
 if (select count(*) from public.feture_categories)<>12 or (select count(*) from public.feture_interests)<>144 or (select count(*) from public.feture_tests)<>18 then
 raise exception 'feture_catalog_seed_incomplete';
 end if;
end $$;
