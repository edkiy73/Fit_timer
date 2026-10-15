/* V9 — topics, descriptions and quizzes. Claude, 14.10.2026.
   Every topic has a plain description: the same text explains the topic in a quiz question, in the jar sheet and in someone else's profile.
   A jar is one answer about one topic: a level 1–10, or «обсуждаемо», or «табу». Nothing else. */
Object.assign(TOPIC_DESC,{
 bondage:{ru:'Ограничение движений верёвкой, лентами или фиксаторами по договорённости. Главное — заранее обсуждённые сигналы и способ быстро освободить.',en:'Restricting movement with rope, straps or cuffs by agreement. What matters most: agreed signals and a quick way to release.'},
 shibari:{ru:'Японская техника обвязки верёвкой, где важны эстетика, ритм и доверие. Учиться лучше у опытных людей.',en:'A Japanese rope technique where aesthetics, rhythm and trust matter. Best learned from experienced people.'},
 suspension:{ru:'Подвес на верёвках. Требует серьёзной подготовки, точки крепления и человека, который умеет это делать.',en:'Being suspended in rope. Needs serious training, a proper hard point and someone who knows how.'},
 restraint:{ru:'Наручники, ремни, фиксаторы — всё, что ограничивает движение без сложной обвязки.',en:'Cuffs, straps, restraints — anything that limits movement without complex rope work.'},
 blindfold:{ru:'Повязка на глаза или маска для сна. Когда не видишь, остальные ощущения становятся ярче.',en:'A blindfold or sleep mask. When you can’t see, other sensations get stronger.'},
 spanking:{ru:'Шлепки ладонью или предметом. Сила и места заранее обсуждаются.',en:'Slaps with a hand or an implement. Intensity and areas are agreed in advance.'},
 flogging:{ru:'Удары флоггером — плетью с множеством мягких хвостов. Ощущение от лёгкого массажа до сильного.',en:'Strikes with a flogger — a whip with many soft tails. From a light massage feel to intense.'},
 wax:{ru:'Капли тёплого воска на кожу. Используют специальные свечи с низкой температурой плавления.',en:'Drops of warm wax on the skin, using special low-temperature candles.'},
 orgasm:{ru:'Когда один человек решает, когда и можно ли другому кончить.',en:'One person decides when — and whether — the other may come.'},
 chastity:{ru:'Ношение устройства, которое ограничивает доступ к себе, на время, о котором договорились.',en:'Wearing a device that limits access to yourself, for an agreed time.'},
 edging:{ru:'Подведение к оргазму и остановка, снова и снова.',en:'Bringing someone close to orgasm and stopping, again and again.'},
 toys:{ru:'Вибраторы, плаги и другие игрушки — вместе или для себя.',en:'Vibrators, plugs and other toys — together or for yourself.'},
 massage:{ru:'Массаж как часть близости: медленный, внимательный, с маслом или без.',en:'Massage as part of intimacy: slow, attentive, with or without oil.'},
 tickling:{ru:'Щекотка — игра на грани смеха и беспомощности.',en:'Tickling — play on the edge of laughter and helplessness.'},
 exhibition:{ru:'Удовольствие от того, что на тебя смотрят: на вечеринке, по видеосвязи или при партнёре.',en:'Enjoying being watched: at a party, on a video call or in front of a partner.'},
 roleplay:{ru:'Сценки с ролями: учитель и студент, незнакомцы в баре и всё, что придумаете вместе.',en:'Scenes with roles: teacher and student, strangers at a bar — anything you come up with together.'},
 control:{ru:'Один человек ведёт и принимает решения, другой следует. В рамках того, о чём договорились.',en:'One person leads and makes decisions, the other follows — within what you agreed.'},
 service:{ru:'Удовольствие от того, чтобы помогать и делать приятное: готовить, ухаживать, выполнять просьбы.',en:'Enjoying helping and pleasing: cooking, caring, doing what’s asked.'},
 rituals:{ru:'Повторяющиеся действия со смыслом для двоих: приветствие, особая одежда, вечерний отчёт.',en:'Repeated acts that mean something to both: a greeting, special clothing, an evening check-in.'},
 ds:{ru:'Отношения, где роли «ведущий — ведомый» есть не только в сцене, но и в общении.',en:'A relationship where leading and following roles go beyond scenes into everyday contact.'},
 tpe:{ru:'Почти полная передача решений одному партнёру. Требует большого доверия и регулярных пересмотров.',en:'Handing almost all decisions to one partner. Needs deep trust and regular check-ins.'},
 protocol:{ru:'Договорённые правила: обращения, позы, разрешения. Нравятся тем, кому важна структура.',en:'Agreed rules: forms of address, positions, permissions. For people who like structure.'},
 petplay:{ru:'Игра в животное: щенок, котёнок, лошадка. Поведение, уход, иногда атрибуты.',en:'Playing an animal: puppy, kitten, pony. Behaviour, care, sometimes gear.'},
 brat:{ru:'Ведомый дразнит и сопротивляется в шутку, ведущий «укрощает». Игра, а не настоящий конфликт.',en:'The follower teases and playfully resists, the leader “tames”. A game, not a real conflict.'},
 praise:{ru:'Похвала и тёплые слова как важная часть удовольствия.',en:'Praise and warm words as a big part of the pleasure.'},
 degradation:{ru:'Словесное унижение по договорённости. Слова и темы, которые нельзя трогать, обсуждаются заранее.',en:'Verbal humiliation by agreement. Words and topics that are off-limits are agreed first.'},
 worship:{ru:'Обожание тела или человека: поцелуи, внимание, восхищение.',en:'Worshipping a body or a person: kisses, attention, admiration.'},
 caregiver:{ru:'Один заботится и опекает, другой позволяет о себе заботиться.',en:'One person cares and looks after, the other lets themselves be cared for.'},
 primal:{ru:'Инстинктивная игра без сценария: возня, погоня, рычание.',en:'Instinctive play without a script: wrestling, chasing, growling.'},
 voyeur:{ru:'Удовольствие от того, чтобы смотреть на других — с их согласия.',en:'Enjoying watching others — with their consent.'},
 medical:{ru:'Ролевая игра «врач и пациент» — осмотры, халаты, инструменты.',en:'“Doctor and patient” roleplay — exams, coats, instruments.'},
 sensory:{ru:'Игра с ощущениями: перья, мех, лёд, разные текстуры на коже.',en:'Playing with sensations: feathers, fur, ice, different textures on the skin.'},
 experiments:{ru:'Готовность пробовать новое вместе — понемногу и с обсуждением.',en:'Being up for trying new things together — step by step and talking it through.'},
 impact:{ru:'Удары ладонью, флоггером, паддлом и другими предметами. Сила обсуждается заранее.',en:'Strikes with a hand, flogger, paddle and other implements. Intensity is agreed first.'},
 latex:{ru:'Одежда из латекса: ощущение на коже, блеск, звук.',en:'Latex clothing: how it feels on the skin, the shine, the sound.'},
 temperature:{ru:'Контраст тепла и холода: лёд, тёплое масло, воск.',en:'Contrast of warm and cold: ice, warm oil, wax.'},
 electro:{ru:'Лёгкие разряды тока специальными устройствами. Только безопасные приборы и не выше пояса.',en:'Mild electric stimulation with dedicated devices. Safe gear only and never above the waist.'},
 deprivation:{ru:'Лишение зрения, слуха или движения, чтобы обострить остальные ощущения.',en:'Taking away sight, hearing or movement to sharpen the other senses.'},
 touch:{ru:'Прикосновения как отдельное удовольствие: объятия, поглаживания, ласка.',en:'Touch as a pleasure of its own: hugs, strokes, caresses.'},
 voice:{ru:'Голос, шёпот, приказы на ухо, разговоры во время близости.',en:'Voice, whispers, orders in your ear, talking during intimacy.'},
 scent:{ru:'Запахи кожи, парфюма, одежды как часть притяжения.',en:'The scent of skin, perfume or clothing as part of attraction.'},
 marks:{ru:'Следы на коже после игры: покраснения, синяки, укусы. Обсуждается, где их можно оставлять.',en:'Marks on the skin after play: redness, bruises, bites. Where they’re OK is agreed first.'},
 leather:{ru:'Кожаная одежда и аксессуары: ремни, куртки, перчатки.',en:'Leather clothing and gear: harnesses, jackets, gloves.'},
 lingerie:{ru:'Красивое бельё — на себе или на партнёре.',en:'Beautiful lingerie — on yourself or on a partner.'},
 stockings:{ru:'Чулки, колготки и нейлон: вид, ощущение, ритуал надевания.',en:'Stockings, tights and nylon: the look, the feel, the ritual of putting them on.'},
 heels:{ru:'Каблуки и обувь как часть образа и притяжения.',en:'Heels and shoes as part of the look and attraction.'},
 feet:{ru:'Интерес к ступням: вид, прикосновения, массаж, поцелуи.',en:'Interest in feet: the look, touch, massage, kisses.'},
 uniform:{ru:'Форма и образы: деловой костюм, медицинская, военная, школьная.',en:'Uniforms and looks: business suit, medical, military, school.'},
 crossdress:{ru:'Одежда, которую обычно носит другой гендер, — для себя или в паре.',en:'Wearing clothes usually worn by another gender — for yourself or as a couple.'},
 masks:{ru:'Маски и капюшоны: анонимность, образ, тайна.',en:'Masks and hoods: anonymity, a persona, mystery.'},
 collars:{ru:'Ошейник как символ связи или роли — на сцене или каждый день.',en:'A collar as a symbol of a bond or role — in scenes or every day.'},
 intimacy:{ru:'Эмоциональная близость: доверие, нежность, долгие разговоры.',en:'Emotional closeness: trust, tenderness, long talks.'},
 slow:{ru:'Знакомство без спешки: переписка и разговоры до встречи, встреча — когда обоим комфортно.',en:'Getting to know each other without a rush: chats and talks first, meeting when both are comfortable.'},
 tantra:{ru:'Практики осознанной близости: дыхание, медленные прикосновения, внимание к ощущениям.',en:'Mindful intimacy practices: breathing, slow touch, attention to sensation.'},
 sexting:{ru:'Откровенная переписка: слова, фантазии, иногда фото по согласию.',en:'Explicit messaging: words, fantasies, sometimes photos by consent.'},
 threesome:{ru:'Встречи втроём — с партнёром или без.',en:'Meeting as three — with a partner or without.'},
 group:{ru:'Групповые встречи и вечеринки с понятными правилами.',en:'Group meetups and parties with clear rules.'},
 swap:{ru:'Пары меняются партнёрами по взаимной договорённости.',en:'Couples swap partners by mutual agreement.'},
 cuckold:{ru:'Удовольствие от того, что партнёр бывает с другими, — знать, смотреть или слушать рассказ.',en:'Enjoying your partner being with others — knowing, watching or hearing about it.'},
 aftercare:{ru:'Забота друг о друге после сцены: разговор, тепло, вода, тишина — то, что помогает вернуться в обычное состояние.',en:'Caring for each other after a scene: talking, warmth, water, quiet — whatever helps you come back.'},
 talk:{ru:'Договориться о желаниях и стоп-сигналах до встречи и пересматривать договорённости потом.',en:'Agreeing on wishes and stop signals before meeting, and revisiting them later.'},
 checkins:{ru:'Короткие вопросы «как ты?» во время игры и после неё.',en:'Short “how are you?” check-ins during and after play.'},
 safeword:{ru:'Слово или жест, после которого всё сразу останавливается.',en:'A word or gesture that stops everything immediately.'},
 safer:{ru:'Презервативы, барьеры и другие способы снизить риски.',en:'Condoms, barriers and other ways to lower risk.'},
 testing:{ru:'Регулярные тесты на инфекции и готовность делиться результатами.',en:'Regular STI testing and being open about results.'},
 breath:{ru:'Игры с дыханием. Очень рискованно, только с опытом и без давления на шею.',en:'Breath play. Very risky — experience only and never pressure on the neck.'},
 fear:{ru:'Игра с контролируемым страхом: темнота, неожиданность, напряжение.',en:'Play with controlled fear: darkness, surprise, suspense.'},
 filming:{ru:'Можно ли фотографировать и снимать на видео, и что потом с этим делать.',en:'Whether photos or video are OK, and what happens to them afterwards.'},
 substances:{ru:'Алкоголь и другие вещества на встрече. Многие предпочитают трезвую голову.',en:'Alcohol and other substances at a meetup. Many people prefer a clear head.'},
 unprotected:{ru:'Секс без презерватива или барьеров.',en:'Sex without condoms or barriers.'},
 publicplace:{ru:'Игра в местах, где вас могут увидеть посторонние.',en:'Play in places where strangers could see you.'},
 strongpain:{ru:'Сильная боль во время игры — дальше лёгких ощущений.',en:'Intense pain during play — beyond light sensations.'},
 overnight:{ru:'Остаться на ночь уже на первой встрече.',en:'Staying the night on a first meeting.'},
 thirdparty:{ru:'Когда к встрече присоединяется кто-то, о ком не договаривались.',en:'Someone joining a meeting who wasn’t agreed on.'},
 permanent:{ru:'Татуировки, шрамы, пирсинг и другие следы, которые останутся навсегда.',en:'Tattoos, scars, piercings and other marks that stay forever.'},
});
for(const k of Object.keys(HIDDEN_TOPICS))TOPIC_DESC[k]=TOPIC_DESC[k]||{ru:'Практика только для опытных людей. Скрыта из каталога.',en:'For experienced people only. Hidden from the catalogue.'};

/* the one answer scale used everywhere: quiz, jar sheet, compare */
/* every level has its own word and one plain sentence (owner, 15.10: no repeats like 7–9 «очень нравится») */
const LV_TXT={
 1:[['Едва любопытно','Barely curious'],['Знаю, что такое бывает. Пока просто любопытно.','I know it exists. Just curious for now.']],
 2:[['Мелькает мысль','Crosses my mind'],['Иногда приходит в голову — без спешки и планов.','It comes to mind now and then — no rush, no plans.']],
 3:[['Присматриваюсь','Eyeing it'],['Интересно, но сначала хочется узнать больше.','Curious, but I want to know more first.']],
 4:[['Попробую','I’d try it'],['С правильным человеком — почему бы и нет.','With the right person — why not.']],
 5:[['Интересно','Interested'],['Уже не просто мысль: хочется попробовать по-настоящему.','More than a thought: I want to really try it.']],
 6:[['Тянет','Drawn to it'],['Цепляет. Хочется возвращаться к этому снова.','It hooks me. I want to come back to it.']],
 7:[['Нравится','I like it'],['Приятно и знакомо — соглашаюсь с удовольствием.','Familiar and good — a happy yes.']],
 8:[['Очень нравится','Really into it'],['Одно из любимого. Радует каждый раз.','One of my favourites. Good every time.']],
 9:[['Обожаю','I adore it'],['Почти всегда «да». Это меня зажигает.','Almost always a yes. It lights me up.']],
 10:[['Без этого никак','A must'],['Часть меня. Без этого всё будет не то.','Part of who I am. Without it, it’s not the same.']],
};
const lvTxt=n=>LV_TXT[Math.max(1,Math.min(10,Math.round(+n)||1))];
const LV_WORD=n=>{const w=lvTxt(n)[0];return L(w[0],w[1]);};
const LV_HINT=n=>{const w=lvTxt(n)[1];return L(w[0],w[1]);};
const MARK_WORD=m=>m==='hard'?L('Табу','Taboo'):L('Обсуждаемо','Negotiable');
const MARK_TEXT=m=>m==='hard'?L('Точно нет. Не показываем в профиле и не предлагаем людей, для которых это важно.','A firm no. Never shown on your profile; we won’t suggest people for whom it matters.'):L('Возможно, но только после разговора и на твоих условиях.','Maybe — only after a talk and on your terms.');
/* direction of a level answer: give / receive / watch, any combination; all three read as «всё». Optional: no mark = not said.
   Limits (табу / обсуждаемо) and the «Частые границы» topics carry no direction. */
const DIRS=['give','get','watch'];
const DIR_WORD=d=>({give:L('давать','giving'),get:L('получать','receiving'),watch:L('смотреть','watching')})[d]||'';
const normDir=d=>{const a=Array.isArray(d)?d:d==='all'?DIRS:d?[d]:[];const out=DIRS.filter(x=>a.includes(x));return out.length?out:undefined;};
const dirText=d=>{const a=normDir(d);if(!a)return '';return a.length===DIRS.length?L('всё','all of it'):a.map(DIR_WORD).join(', ');};
const hasDir=t=>!isLimitCat(t);
/** one jar shape everywhere: [t,lv,dir?] seed arrays or {t,lv,limit,vis,dir} objects */
const normJar=x=>{const j=Array.isArray(x)?{t:x[0],lv:x[1],dir:x[2]}:{...x};const d=j.limit?undefined:normDir(j.dir);if(d)j.dir=d;else delete j.dir;return j;};
const jarWord=j=>{j=normJar(j);return j.limit?MARK_WORD(j.limit):[`${j.lv} · ${LV_WORD(j.lv)}`,dirText(j.dir)].filter(Boolean).join(', ');};
/** the answer without its number (the number sits in a badge): «Нравится, давать» */
const jarDesc=j=>{j=normJar(j);return j.limit?MARK_WORD(j.limit):[LV_WORD(j.lv),dirText(j.dir)].filter(Boolean).join(', ');};
/** short form for comparisons: «8/10, давать» */
const jarShort=j=>{j=normJar(j);return j.limit?MARK_WORD(j.limit).toLowerCase():[`${j.lv}/10`,dirText(j.dir)].filter(Boolean).join(', ');};
const isLimitCat=t=>TOPICS[t]?.cat==='limits';
const topicQ=t=>isLimitCat(t)?L('Как ты к этому относишься?','How do you feel about this?'):L('Насколько тебе это интересно?','How into this are you?');

/* 12 quizzes: each is a set of concrete topics. One question = one topic. */
const QUIZ={
 rope:{title:{ru:'Верёвка и фиксация',en:'Rope & restraint'},pl:'rose',ic:'link',desc:{ru:'Связывание, шибари, фиксация, повязка на глаза.',en:'Bondage, shibari, restraint, blindfolds.'},topics:['bondage','shibari','restraint','blindfold','suspension','collars']},
 senses:{title:{ru:'Ощущения',en:'Sensations'},pl:'amber',ic:'spark',desc:{ru:'Прикосновения, температура, воск, игры с ощущениями.',en:'Touch, temperature, wax, sensory play.'},topics:['touch','sensory','temperature','wax','massage','tickling','deprivation','voice']},
 power:{title:{ru:'Власть и роли',en:'Power & roles'},pl:'lilac',ic:'crown',desc:{ru:'Кто ведёт, кто следует и какие правила вам подходят.',en:'Who leads, who follows and which rules suit you.'},topics:['control','service','ds','protocol','rituals','praise','brat','tpe']},
 impact:{title:{ru:'Интенсивность',en:'Intensity'},pl:'wine',ic:'bolt',desc:{ru:'Шлепки, флоггер, следы на коже, сильные ощущения.',en:'Spanking, flogging, marks, strong sensations.'},topics:['spanking','flogging','impact','marks','strongpain','electro']},
 looks:{title:{ru:'Образы и материалы',en:'Looks & materials'},pl:'coal',ic:'tag',desc:{ru:'Латекс, кожа, бельё, униформа, маски.',en:'Latex, leather, lingerie, uniforms, masks.'},topics:['latex','leather','lingerie','stockings','heels','uniform','masks','crossdress']},
 play:{title:{ru:'Игра и роли',en:'Play & roleplay'},pl:'lilac',ic:'couple',desc:{ru:'Сценки, пет-плей, праймал, медицинские ролевые.',en:'Scenes, pet play, primal, medical roleplay.'},topics:['roleplay','petplay','primal','medical','caregiver','worship','fear']},
 show:{title:{ru:'Взгляд и показ',en:'Watching & being seen'},pl:'sea',ic:'eye',desc:{ru:'Смотреть, показывать себя, фото и видео.',en:'Watching, being watched, photos and video.'},topics:['exhibition','voyeur','sexting','filming','publicplace']},
 open:{title:{ru:'Формат отношений',en:'Relationship formats'},pl:'sea',ic:'people',desc:{ru:'Втроём, группы, обмен партнёрами, куколд.',en:'Threesomes, groups, swapping, cuckolding.'},topics:['threesome','group','swap','cuckold','thirdparty']},
 control:{title:{ru:'Контроль и удовольствие',en:'Control & pleasure'},pl:'rose',ic:'lock',desc:{ru:'Контроль оргазма, эджинг, целомудрие, игрушки.',en:'Orgasm control, edging, chastity, toys.'},topics:['orgasm','edging','chastity','toys']},
 care:{title:{ru:'Забота и безопасность',en:'Care & safety'},pl:'moss',ic:'shield',desc:{ru:'Что тебе важно, чтобы чувствовать себя спокойно.',en:'What you need to feel safe and at ease.'},topics:['talk','safeword','checkins','aftercare','safer','testing']},
 pace:{title:{ru:'Темп знакомства',en:'Pace of dating'},pl:'night',ic:'clock',desc:{ru:'Как быстро тебе комфортно сближаться.',en:'How fast you’re comfortable getting close.'},topics:['slow','intimacy','tantra','overnight','substances']},
 limits:{title:{ru:'Частые границы',en:'Common limits'},pl:'amber',ic:'block',desc:{ru:'Что для тебя «нет», а что — только после разговора.',en:'What’s a no for you and what needs a talk first.'},topics:['unprotected','permanent','strongpain','publicplace','filming','substances','thirdparty']},
};
