-- FetUre PRELAUNCH social-only fixture; DO NOT run outside FitT/project prelaunch.
-- No Core accounts, private details, payment URLs, storage objects, or service-role credentials.
-- Idempotent by deterministic v4 UUIDs. Cleanup recipe uses the same scoped IDs.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $content_seed$
#variable_conflict use_variable
declare
  payload jsonb := '{"datasetId":"feture-development-2026-10","version":2,"projectRef":"anrhayozrhrmiwexmbhw","stage":"prelaunch","people":[{"seedKey":"maya","displayName":"Майя","about":"Бали, кофе без спешки, длинные разговоры. Исследую границы привычного с уважением к чужим."},{"seedKey":"alex","displayName":"Алекс","about":"Днём продуктовый дизайнер, вечером книжки, музыка и вопросы без правильного ответа."},{"seedKey":"nika","displayName":"Ника","about":"Искренность, самоирония, музыка и любопытство к миру."},{"seedKey":"leo","displayName":"Лео","about":"Люблю небольшие компании, глубокую электронную музыку и красивые маршруты."},{"seedKey":"nora","displayName":"Nora","about":"Slow mornings, meaningful conversations, contemporary art and ocean air."},{"seedKey":"mira","displayName":"Мира","about":"Мне 31, фотографирую незнакомые города и собираю истории о людях."},{"seedKey":"kai","displayName":"Kai","about":"Based in Canggu. Movement, good food, open-minded people, no unnecessary drama."},{"seedKey":"alina","displayName":"Алина","about":"Делаю керамику, выращиваю растения и люблю живые обсуждения."},{"seedKey":"dan","displayName":"Дэн","about":"Интроверт с прекрасной коллекцией плейлистов. Иногда организую маленькие встречи."},{"seedKey":"sasha","displayName":"Саша","about":"Люблю свободные разговоры, психологию отношений и честные договорённости."},{"seedKey":"riley","displayName":"Riley","about":"Community builder, curious reader, better listener than storyteller."},{"seedKey":"sonya","displayName":"Соня","about":"Не люблю спешить. Танцы, книги, чувство юмора и бережность."},{"seedKey":"river","displayName":"River","about":"Not interested in labels. Interested in kindness, art and being present."},{"seedKey":"ilia","displayName":"Илья","about":"Музыкант и любитель пеших прогулок. Всегда за неожиданные вопросы."},{"seedKey":"kira","displayName":"Кира","about":"Разговоры до утра, море, безалкогольные коктейли, перформансы."},{"seedKey":"max","displayName":"Макс","about":"Собираю друзей за настольными играми. Иногда устраиваю кинопросмотры."},{"seedKey":"jules","displayName":"Jules","about":"Writer and occasional host. I believe good communities are built slowly."},{"seedKey":"lada","displayName":"Лада","about":"Исследую культуру, искусство, тело и границы. Всегда за уважение к выбору."},{"seedKey":"dima","displayName":"Дима","about":"Мне ближе душевная компания, чем шумная вечеринка. Делаю музыку."},{"seedKey":"ella","displayName":"Ella","about":"Learning to surf, learning to say no, learning to ask better questions."},{"seedKey":"artem","displayName":"Артём","about":"С интересом смотрю на людей и города. Дизайн, путешествия, книги."},{"seedKey":"taya","displayName":"Тая","about":"Влюблена в уютные пространства, красивый свет и маленькие встречи."},{"seedKey":"fox","displayName":"Velvet Fox","about":"Night owl. Electronic music, unusual aesthetics, lots of curiosity."},{"seedKey":"kapibara","displayName":"Капибара","about":"Мирный наблюдатель вечеринок, коллекционер мемов и хороших историй."},{"seedKey":"nova","displayName":"Nova","about":"Photographer. More interested in stories than perfect pictures."},{"seedKey":"polina","displayName":"Полина","about":"Организую творческие встречи, люблю коллажи и открытую коммуникацию."},{"seedKey":"sam","displayName":"Sam","about":"Here for thoughtful conversations, board games and ocean sunsets."},{"seedKey":"tima","displayName":"Тима","about":"Пробую новые занятия, учусь слушать и задавать вопросы."},{"seedKey":"anya","displayName":"Аня","about":"Ценю камерные мероприятия, честность и возможность быть собой."},{"seedKey":"moth","displayName":"Neon Moth","about":"After-dark dance floors, neon art and gentle company."},{"seedKey":"vlad","displayName":"Влад","about":"Настолки, документальное кино, независимые выставки и прогулки."},{"seedKey":"luna","displayName":"Luna","about":"Small gatherings, art books, deep house and mutual respect."},{"seedKey":"irina","displayName":"Ирина","about":"Живу между двумя языками, пишу заметки о городе и встречах."},{"seedKey":"morgan","displayName":"Morgan","about":"Avid reader, occasional DJ, always up for a good discussion."},{"seedKey":"vita","displayName":"Вита","about":"Море, йога без культа идеальности и дружба без соревнований."},{"seedKey":"zen","displayName":"Zen","about":"Designer, night swimmer, very serious about playlists."}],"posts":[{"seedKey":"post-001","author":"leo","body":"Вчера на ужине говорили о том, как меняется круг общения после переезда. Оказалось, у каждого своя версия дома.","kind":"story"},{"seedKey":"post-002","author":"riley","body":"I found a tiny gallery this weekend. The best part was talking to the artist afterward.","kind":"text"},{"seedKey":"post-003","author":"lada","body":"Хочу чаще ходить на встречи, где можно спокойно говорить, а не перекрикивать музыку.","kind":"text"},{"seedKey":"post-004","author":"nova","body":"Купила блокнот для случайных мыслей. За три дня исписала половину.","kind":"text"},{"seedKey":"post-005","author":"luna","body":"Unexpectedly good Sunday: no plans, a long walk, two thoughtful conversations.","kind":"story"},{"seedKey":"post-006","author":"nika","body":"Недавно впервые пришёл один на мероприятие. Оказалось гораздо проще знакомиться, чем я думал.","kind":"text"},{"seedKey":"post-007","author":"sasha","body":"Есть что-то особенное в людях, которые умеют слушать и не спешат отвечать.","kind":"text"},{"seedKey":"post-008","author":"jules","body":"Вечер с живой музыкой превратился в разговор о том, что для каждого означает свобода.","kind":"text"},{"seedKey":"post-009","author":"kapibara","body":"Coffee with strangers turned into a two-hour conversation about design and identity.","kind":"story"},{"seedKey":"post-010","author":"vlad","body":"Собрали дома маленький книжный клуб. Удивительно, насколько по-разному все прочитали одну историю.","kind":"text"},{"seedKey":"post-011","author":"alex","body":"Для меня хорошая вечеринка — это музыка, тёплая атмосфера и возможность вовремя уйти.","kind":"text"},{"seedKey":"post-012","author":"dan","body":"Пробую лучше формулировать свои границы — без длинных оправданий.","kind":"text"},{"seedKey":"post-013","author":"max","body":"Была на лекции про современные отношения. Больше всего понравились вопросы из зала.","kind":"story"},{"seedKey":"post-014","author":"fox","body":"Morning swim, fresh fruit, then a completely unplanned conversation with someone new.","kind":"text"},{"seedKey":"post-015","author":"moth","body":"Прошла небольшую выставку два раза: второй круг оказался интереснее первого.","kind":"text"},{"seedKey":"post-016","author":"maya","body":"Друзья предложили провести вечер без телефонов. Поддерживаю эту идею.","kind":"text"},{"seedKey":"post-017","author":"alina","body":"Я думала, что настолки не моё, пока не попала в хорошую компанию.","kind":"story"},{"seedKey":"post-018","author":"kira","body":"Discovering that community is not about big numbers but about remembering each other''s names.","kind":"text"},{"seedKey":"post-019","author":"taya","body":"Сделал плейлист для спокойного утра. Неожиданно друзья попросили ссылку.","kind":"text"},{"seedKey":"post-020","author":"anya","body":"Иногда самый смелый поступок — сказать: «Нет, сегодня я хочу побыть дома».","kind":"text"},{"seedKey":"post-021","author":"zen","body":"Завтра поеду смотреть закат в новом месте. Никакой программы, просто воздух.","kind":"story"},{"seedKey":"post-022","author":"kai","body":"A reminder to myself: being curious doesn''t mean agreeing with everything.","kind":"text"},{"seedKey":"post-023","author":"ilia","body":"Поймала себя на том, что стала задавать больше вопросов и давать меньше советов.","kind":"text"},{"seedKey":"post-024","author":"artem","body":"Вчера обсуждали, как знакомиться с людьми без давления и ожиданий. Очень отозвалось.","kind":"text"},{"seedKey":"post-025","author":"tima","body":"Сфотографировала серию дверей в старом районе. Почему-то вышел целый рассказ.","kind":"story"},{"seedKey":"post-026","author":"vita","body":"Maybe the best thing about living here is how many different stories cross paths.","kind":"text"},{"seedKey":"post-027","author":"mira","body":"Вышла после танцев с таким ощущением, будто целую неделю отдыхала.","kind":"text"},{"seedKey":"post-028","author":"river","body":"Собираем небольшой ужин на шесть человек. Люблю такой формат больше больших сборищ.","kind":"text"},{"seedKey":"post-029","author":"ella","body":"Someone asked me what I changed my mind about this year. Still thinking.","kind":"story"},{"seedKey":"post-030","author":"sam","body":"Неожиданно понравился разговор с человеком, с которым у нас почти ничего общего.","kind":"text"},{"seedKey":"post-031","author":"morgan","body":"Взял урок керамики. Кажется, у меня талант делать самые кривые чашки.","kind":"text"},{"seedKey":"post-032","author":"nora","body":"Мне нравится, когда на встрече правила ясные и никому не нужно их угадывать.","kind":"text"},{"seedKey":"post-033","author":"sonya","body":"Spent the afternoon creating a zine about places that feel like home.","kind":"story"},{"seedKey":"post-034","author":"dima","body":"Посмотрела документальный фильм про городские сообщества. Захотелось начать своё маленькое.","kind":"text"},{"seedKey":"post-035","author":"polina","body":"Сегодня встретились с друзьями без особого повода. Именно такие вечера потом и вспоминаются.","kind":"text"},{"seedKey":"post-036","author":"irina","body":"Я за медленные знакомства: интерес, разговор, доверие, а не бесконечные анкеты.","kind":"text"},{"seedKey":"post-037","author":"leo","body":"Turns out you can enjoy a party without staying until the last track.","kind":"story"},{"seedKey":"post-038","author":"riley","body":"На прогулке разговорились о том, что личные границы иногда меняются — и это нормально.","kind":"text"},{"seedKey":"post-039","author":"lada","body":"Меня вдохновляют маленькие культурные события, куда люди приходят не ради фотографий.","kind":"text"},{"seedKey":"post-040","author":"nova","body":"Finally made time for that long conversation instead of sending twenty voice notes.","kind":"text"},{"seedKey":"post-041","author":"luna","body":"Вечер прошёл на кухне у друзей. Музыка, простая еда, никаких сложных планов.","kind":"story"},{"seedKey":"post-042","author":"nika","body":"Found a beautiful independent bookshop. Left with three books and a new friend.","kind":"text"},{"seedKey":"post-043","author":"sasha","body":"Стараюсь не путать открытость с обязанностью рассказывать о себе всё.","kind":"text"},{"seedKey":"post-044","author":"jules","body":"Сделала коллаж из старых билетов, записок и открыток. Получилась карта воспоминаний.","kind":"text"},{"seedKey":"post-045","author":"kapibara","body":"Есть люди, с которыми даже тишина не кажется неловкой.","kind":"story"},{"seedKey":"post-046","author":"vlad","body":"Went to a movement workshop. Loved the focus on curiosity rather than performance.","kind":"text"},{"seedKey":"post-047","author":"alex","body":"В новой компании всегда интереснее узнавать, как у людей устроены увлечения.","kind":"text"},{"seedKey":"post-048","author":"dan","body":"За последнюю неделю три раза открывала для себя новую музыку благодаря знакомым.","kind":"text"},{"seedKey":"post-049","author":"max","body":"Уютная встреча в дождь лучше, чем грандиозные планы, которые никто не хочет выполнять.","kind":"story"},{"seedKey":"post-050","author":"fox","body":"Had a lovely conversation about how friendship evolves when you live abroad.","kind":"text"},{"seedKey":"post-051","author":"moth","body":"Вчера долго говорили про согласие, уважение и умение вовремя услышать друг друга.","kind":"text"},{"seedKey":"post-052","author":"maya","body":"Приятно быть в пространстве, где можно отказаться от участия и это воспринимается спокойно.","kind":"text"},{"seedKey":"post-053","author":"alina","body":"Собираюсь наконец сходить на открытый кинопоказ. Кто уже смотрел этот фильм?","kind":"story"},{"seedKey":"post-054","author":"kira","body":"Проверил на себе: если приходить на встречу с любопытством, а не ожиданиями, всё проще.","kind":"text"},{"seedKey":"post-055","author":"taya","body":"Я люблю события, после которых хочется записать пару мыслей, а не просто поставить галочку.","kind":"text"},{"seedKey":"post-056","author":"anya","body":"Small reminder: a welcoming space is built by people, not interior design.","kind":"text"},{"seedKey":"post-057","author":"zen","body":"Сегодня рассказывала друзьям о своих странных хобби. Никто не смеялся — все захотели попробовать.","kind":"story"},{"seedKey":"post-058","author":"kai","body":"Порой один хороший вопрос заменяет целый вечер small talk.","kind":"text"},{"seedKey":"post-059","author":"ilia","body":"В нашем кругу появился обычай спрашивать перед советом, нужен ли он вообще.","kind":"text"},{"seedKey":"post-060","author":"artem","body":"Новая неделя, новый плейлист и желание выйти из привычного маршрута.","kind":"text"},{"seedKey":"post-061","author":"tima","body":"An evening full of interesting questions is my idea of a very good time.","kind":"story"},{"seedKey":"post-062","author":"alex","body":"Какие три вещи делают встречу по-настоящему комфортной?","kind":"question"},{"seedKey":"post-063","author":"kai","body":"Какой самый необычный мастер-класс вы посещали?","kind":"question"},{"seedKey":"post-064","author":"sonya","body":"Что помогает вам почувствовать себя своим в новом городе?","kind":"question"},{"seedKey":"post-065","author":"jules","body":"Где вы находите мероприятия, о которых не пишут в больших афишах?","kind":"question"},{"seedKey":"post-066","author":"taya","body":"Вы чаще выбираете камерные встречи или большие события? Почему?","kind":"question"},{"seedKey":"post-067","author":"sam","body":"What makes a community feel genuinely safe and welcoming to you?","kind":"question"},{"seedKey":"post-068","author":"luna","body":"Как вы знакомитесь в новом городе без приложений?","kind":"question"},{"seedKey":"post-069","author":"maya","body":"Какая музыка мгновенно возвращает вас в хорошее воспоминание?","kind":"question"},{"seedKey":"post-070","author":"mira","body":"Что вам важнее в мероприятии: интересная тема или люди?","kind":"question"},{"seedKey":"post-071","author":"riley","body":"Would you rather join a discussion group or a creative workshop?","kind":"question"},{"seedKey":"post-072","author":"max","body":"Есть ли у вас любимые правила общения в незнакомой компании?","kind":"question"},{"seedKey":"post-073","author":"artem","body":"Как вы выбираете, куда пойти в свободный вечер?","kind":"question"},{"seedKey":"post-074","author":"polina","body":"Кто-нибудь пробовал проводить встречи без телефонов?","kind":"question"},{"seedKey":"post-075","author":"vlad","body":"Какая одна вещь отличает хороший разговор от просто долгого?","kind":"question"},{"seedKey":"post-076","author":"zen","body":"Что сейчас хочется изучить просто из любопытства?","kind":"question"}],"groups":[{"seedKey":"group-01","slug":"slow-conversations","title":"Разговоры без спешки","summary":"Встречаемся ради живых обсуждений: культура, выбор, отношения и жизнь между странами.","owner":"nora"},{"seedKey":"group-02","slug":"bali-meetups","title":"Bali meetups","summary":"Small local meetups, thoughtful introductions and shared adventures.","owner":"alina"},{"seedKey":"group-03","slug":"art-after-dark","title":"Искусство после заката","summary":"Выставки, перформансы, музыка и разговоры после них.","owner":"riley"},{"seedKey":"group-04","slug":"open-minded-reading","title":"Книжный круг","summary":"Читаем, спорим уважительно и делимся любимыми текстами.","owner":"ilia"},{"seedKey":"group-05","slug":"creative-workshops","title":"Creative workshops","summary":"Ceramics, collage, photography and ideas that are better made together.","owner":"jules"},{"seedKey":"group-06","slug":"music-and-motion","title":"Музыка и движение","summary":"Плейлисты, танцы, мягкие практики и новые звуки.","owner":"ella"},{"seedKey":"group-07","slug":"respectful-connections","title":"Бережные знакомства","summary":"Диалог, согласие, честная коммуникация и личные границы.","owner":"fox"},{"seedKey":"group-08","slug":"weekend-explorers","title":"Weekend explorers","summary":"Coastal walks, museums, small cafes and unexpected discoveries.","owner":"polina"},{"seedKey":"group-09","slug":"movie-society","title":"Кинозал","summary":"Камерные просмотры, обсуждения и рекомендации без спойлеров.","owner":"anya"},{"seedKey":"group-10","slug":"queer-friendly-culture","title":"Open culture","summary":"Inclusive arts, interesting spaces and respectful community conversations.","owner":"luna"}],"events":[{"seedKey":"event-01","title":"Вечер открытых вопросов","summary":"Разговорная встреча в небольшой компании. Можно приходить одному.","format":"offline","city":"Canggu","language":"ru","day":3,"owner":"mira"},{"seedKey":"event-02","title":"Creative collage evening","summary":"Bring curiosity. Materials and gentle guidance are included.","format":"offline","city":"Berawa","language":"en","day":5,"owner":"alina"},{"seedKey":"event-03","title":"Границы и коммуникация","summary":"Онлайн-дискуссия о том, как выражать просьбы и говорить «нет».","format":"online","city":"","language":"ru","day":7,"owner":"sasha"},{"seedKey":"event-04","title":"Listening party: warm electronic","summary":"An intimate session for discovering new music together.","format":"offline","city":"Seminyak","language":"en","day":9,"owner":"sonya"},{"seedKey":"event-05","title":"Книжный круг: новые истории","summary":"Обсудим короткие тексты, которые останутся с нами надолго.","format":"offline","city":"Ubud","language":"ru","day":12,"owner":"ilia"},{"seedKey":"event-06","title":"Community coffee morning","summary":"Meet people over coffee and unhurried conversations.","format":"offline","city":"Canggu","language":"en","day":14,"owner":"max"},{"seedKey":"event-07","title":"Знакомство с арт-дневником","summary":"Пробуем коллажи и визуальные заметки без требований к навыку.","format":"online","city":"","language":"ru","day":16,"owner":"lada"},{"seedKey":"event-08","title":"Conversations about belonging","summary":"An open online circle on living between cultures.","format":"online","city":"","language":"en","day":18,"owner":"ella"},{"seedKey":"event-09","title":"Танцевальный вечер без сценария","summary":"Неформальная встреча для любителей музыки и свободного движения.","format":"offline","city":"Pererenan","language":"ru","day":21,"owner":"taya"},{"seedKey":"event-10","title":"Curiosity club: ask better questions","summary":"A moderated conversation where every voice gets space.","format":"online","city":"","language":"en","day":23,"owner":"kapibara"},{"seedKey":"event-11","title":"Неспешная прогулка у океана","summary":"Начнём с прогулки, закончим разговором в тихом кафе.","format":"offline","city":"Sanur","language":"ru","day":25,"owner":"polina"},{"seedKey":"event-12","title":"Art & connection meetup","summary":"Small group discussions around creativity, trust and respectful openness.","format":"offline","city":"Ubud","language":"en","day":28,"owner":"tima"}],"commentTemplates":["Очень откликается. Спасибо, что поделились.","У меня похожий опыт — особенно про атмосферу.","Классная мысль, хочется обсудить подробнее.","Интересно, что у каждого это устроено по-своему.","Мне нравится такой спокойный подход.","Как здорово, что об этом можно открыто говорить.","Был на похожей встрече, очень понравилось.","Love this perspective, thanks for sharing.","That sounds like such a good evening.","I''d definitely join a conversation like this.","Можно узнать подробнее? Звучит интересно.","У меня немного другой опыт, но мысль понятна.","Спасибо за вопрос — задумался.","Хорошее напоминание про границы и уважение.","Пожалуй, запишу себе эту идею.","Exactly. Small gatherings can be the best."]}'::jsonb;
  item jsonb;
  ds text := 'feture-development-2026-10';
  actor text;
  target uuid;
  post_id uuid;
  comment_id uuid;
  root_id uuid;
  raw_id text;
  i integer;
  n integer := 0;
  post_count integer;
  people_count integer;
  posts jsonb;
  people jsonb;
  dt timestamptz;
  start_time timestamptz;
  draft jsonb;
  old_count integer;
begin
  if current_user <> 'postgres'
    or not exists(select 1 from feture_seed.environment
      where singleton and stage='prelaunch' and project_ref='anrhayozrhrmiwexmbhw')
    or payload->>'datasetId' <> ds
    or payload->>'projectRef' <> 'anrhayozrhrmiwexmbhw'
    or payload->>'stage' <> 'prelaunch'
    or (payload->>'version')::integer <> 2
  then raise exception 'seed_context_mismatch'; end if;
  people := payload->'people';
  posts := payload->'posts';
  people_count:=jsonb_array_length(people);
  post_count:=jsonb_array_length(posts);
  if people_count <> 36 or post_count <> 76 then raise exception 'seed_size_mismatch';end if;
  if (select count(*) from feture_seed.records where table_name='feture_profiles'
      and dataset_id=ds and kind='synthetic-development'
      and generation_version=2) <> people_count
  then raise exception 'seed_profiles_not_registered';end if;
  if exists (select 1 from jsonb_array_elements(people) p
     where not exists(select 1 from feture_seed.records r
       where r.table_name='feture_profiles'
        and r.row_key='seed:'||ds||':'||(p->>'seedKey')
        and r.dataset_id=ds and r.kind='synthetic-development'))
  then raise exception 'seed_identity_unowned';end if;

  for item in select value from jsonb_array_elements(posts) loop
    raw_id:=md5(ds||':post:'||(item->>'seedKey'));
    target:=(substr(raw_id,1,8)||'-'||substr(raw_id,9,4)||'-4'||substr(raw_id,14,3)||'-8'||substr(raw_id,18,3)||'-'||substr(raw_id,21,12))::uuid;
    actor:='seed:'||ds||':'||(item->>'author');
    if not exists(select 1 from feture_seed.records where row_key=actor and table_name='feture_profiles' and dataset_id=ds)
      or item->>'kind' not in ('story','text','question')
      or length(item->>'body') not between 1 and 3000 then raise exception 'seed_invalid_post'; end if;
    if exists(select 1 from public.feture_posts where id=target and (author_hash<>actor or body<>item->>'body'))
    then raise exception 'seed_post_conflict';end if;
    n:=n+1;dt:=clock_timestamp()-make_interval(days=>((n*7)%25),hours=>((n*3)%21),mins=>((n*11)%50));
    insert into public.feture_posts(id,author_hash,body,audience,kind,author_label,state,created_at,updated_at,submitted_at,published_at,planned_audience)
    values(target,actor,item->>'body','public',item->>'kind',
      (select display_name from public.feture_profiles where account_hash=actor),
      'published',dt,dt,dt,dt,'public')
    on conflict(id) do nothing;
  end loop;

  n:=0;
  for item in select value from jsonb_array_elements(payload->'groups') loop
    raw_id:=md5(ds||':group:'||(item->>'seedKey'));
    target:=(substr(raw_id,1,8)||'-'||substr(raw_id,9,4)||'-4'||substr(raw_id,14,3)||'-8'||substr(raw_id,18,3)||'-'||substr(raw_id,21,12))::uuid;
    actor:='seed:'||ds||':'||(item->>'owner');
    if not exists(select 1 from feture_seed.records where row_key=actor and table_name='feture_profiles' and dataset_id=ds)
    then raise exception 'seed_group_owner_unowned'; end if;
    if exists(select 1 from public.feture_groups where id=target and (owner_hash<>actor or slug<>item->>'slug'))
    then raise exception 'seed_group_conflict';end if;
    n:=n+1;dt:=clock_timestamp()-make_interval(days=>n*2);
    insert into public.feture_groups(id,owner_hash,slug,title,summary,rules,visibility,state,created_at,updated_at,published_at)
    values(target,actor,item->>'slug',item->>'title',item->>'summary',
      'Уважение к личным границам. Без давления, спама и публикации чужих личных данных.',
      'public','published',dt,dt,dt)
    on conflict(id) do nothing;
  end loop;

  n:=0;
  for item in select value from jsonb_array_elements(payload->'events') loop
    raw_id:=md5(ds||':event:'||(item->>'seedKey'));
    target:=(substr(raw_id,1,8)||'-'||substr(raw_id,9,4)||'-4'||substr(raw_id,14,3)||'-8'||substr(raw_id,18,3)||'-'||substr(raw_id,21,12))::uuid;
    actor:='seed:'||ds||':'||(item->>'owner');
    if not exists(select 1 from feture_seed.records where row_key=actor and table_name='feture_profiles' and dataset_id=ds)
    then raise exception 'seed_event_owner_unowned';end if;
    start_time:=date_trunc('day',clock_timestamp())+make_interval(days=>(item->>'day')::integer,hours=>11);
    draft:=jsonb_build_object(
      'title',item->>'title','summary',item->>'summary',
      'description',item->>'summary','conditions','Бережная коммуникация и добровольное участие.',
      'format',item->>'format','visibility','public',
      'startsAt',to_char(start_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'endsAt',to_char((start_time+interval '2 hours') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'timeZone','Asia/Makassar','language',item->>'language','city',item->>'city',
      'publicLocation',case when item->>'format'='offline' then item->>'city'||' — район встречи' else '' end,
      'price',null,'ticketUrl',null,'privateLocation',null,'privateJoinUrl',null);
    if exists(select 1 from public.feture_events e where e.id=target and (e.owner_hash<>actor or e.draft->>'title'<>item->>'title'))
    then raise exception 'seed_event_conflict';end if;
    n:=n+1;dt:=clock_timestamp()-make_interval(days=>((n*3)%14));
    insert into public.feture_events(id,owner_hash,draft,state,created_at,updated_at,submitted_at,published_at)
    values(target,actor,draft,'published',dt,dt,dt,dt)
    on conflict(id) do nothing;
  end loop;

  -- Event RSVP intentions: three synthetic participants per event, no attendee list exposure.
  for i in 1..(jsonb_array_length(payload->'events')*3) loop
    item:=payload->'events'->((i-1)%jsonb_array_length(payload->'events'));
    raw_id:=md5(ds||':event:'||(item->>'seedKey'));
    target:=(substr(raw_id,1,8)||'-'||substr(raw_id,9,4)||'-4'||substr(raw_id,14,3)||'-8'||substr(raw_id,18,3)||'-'||substr(raw_id,21,12))::uuid;
    actor:='seed:'||ds||':'||(people->((i*7+2)%people_count)->>'seedKey');
    if actor='seed:'||ds||':'||(item->>'owner') then
      actor:='seed:'||ds||':'||(people->((i*7+3)%people_count)->>'seedKey');
    end if;
    insert into public.feture_event_rsvps(event_id,actor_hash,status,visible_to_attendees,created_at,updated_at)
    values(target,actor,case when i%4=0 then 'interested' else 'going' end,false,clock_timestamp(),clock_timestamp())
    on conflict(event_id,actor_hash) do nothing;
  end loop;

  for i in 1..(post_count*2) loop
    item:=posts->((i-1)%post_count);
    raw_id:=md5(ds||':post:'||(item->>'seedKey'));
    post_id:=(substr(raw_id,1,8)||'-'||substr(raw_id,9,4)||'-4'||substr(raw_id,14,3)||'-8'||substr(raw_id,18,3)||'-'||substr(raw_id,21,12))::uuid;
    raw_id:=md5(ds||':comment:'||i::text);
    comment_id:=(substr(raw_id,1,8)||'-'||substr(raw_id,9,4)||'-4'||substr(raw_id,14,3)||'-8'||substr(raw_id,18,3)||'-'||substr(raw_id,21,12))::uuid;
    actor:='seed:'||ds||':'||(people->((i*11+3)%people_count)->>'seedKey');
    if actor = 'seed:'||ds||':'||(item->>'author') then
      actor:='seed:'||ds||':'||(people->((i*11+4)%people_count)->>'seedKey');
    end if;
    if exists(select 1 from public.feture_post_comments c where c.id=comment_id and (c.post_id<>post_id or c.author_hash<>actor))
    then raise exception 'seed_comment_conflict';end if;
    insert into public.feture_post_comments(id,post_id,author_hash,body,state,created_at,updated_at)
    values(comment_id,post_id,actor,payload->'commentTemplates'->>((i*7)%16),'published',
      clock_timestamp()-make_interval(days=>((i*3)%19)),clock_timestamp()-make_interval(days=>((i*3)%19)))
    on conflict(id) do nothing;
  end loop;
  for i in 1..(post_count*4) loop
    item:=posts->((i-1)%post_count);
    raw_id:=md5(ds||':post:'||(item->>'seedKey'));
    post_id:=(substr(raw_id,1,8)||'-'||substr(raw_id,9,4)||'-4'||substr(raw_id,14,3)||'-8'||substr(raw_id,18,3)||'-'||substr(raw_id,21,12))::uuid;
    actor:='seed:'||ds||':'||(people->((i*13+3)%people_count)->>'seedKey');
    if actor<>'seed:'||ds||':'||(item->>'author') then
      insert into public.feture_post_reactions(post_id,account_hash,kind,created_at)
      values(post_id,actor,'like',clock_timestamp()-make_interval(days=>((i*5)%17)))
      on conflict do nothing;
    end if;
  end loop;
end
$content_seed$;
select 'profiles' as entity,count(*)::int as rows from public.feture_profiles
union all select 'posts',count(*)::int from public.feture_posts
union all select 'groups',count(*)::int from public.feture_groups
union all select 'events',count(*)::int from public.feture_events
union all select 'rsvps',count(*)::int from public.feture_event_rsvps
union all select 'comments',count(*)::int from public.feture_post_comments
union all select 'likes',count(*)::int from public.feture_post_reactions;
commit;
