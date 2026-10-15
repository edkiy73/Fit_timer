/* ============ SEED DATA (prototype only, never a domain source) ============ */
const HOUR=3600e3, DAY=24*HOUR, NOW=Date.now();
const ago=h=>NOW-h*HOUR;
// Event start helper: N days ahead at hh:mm in Berlin-ish UTC offset (prototype precision is enough)
const at=(days,hh,mm=0)=>{const d=new Date(NOW+days*DAY);d.setUTCHours(hh-2,mm,0,0);return d.getTime();};
const P=(a,b,c,d)=>`--p1:${a};--p2:${b};--p3:${c};--p4:${d}`;
const PL={
 rose:P('#7A1236','#FF5A7A','#B9A6FF','#2A0D1F'), plum:P('#3C1B5A','#FF9F7A','#7A1236','#170A14'),
 sea:P('#1F3A4A','#7FE0B9','#B9A6FF','#0E1A22'), night:P('#2A2A55','#7FB8FF','#1F3A4A','#0E0E1E'),
 amber:P('#4A2A12','#FFB25A','#FF5A7A','#1F120A'), ember:P('#3A1A10','#F6B49B','#7A1236','#140A06'),
 coal:P('#2B2B2B','#FF6B3D','#6F6F6F','#0F0F0F'), lilac:P('#5C47D6','#FF5A7A','#F6B49B','#1A0F3A'),
 moss:P('#25403A','#C6F27F','#2A2A55','#0D1714'), wine:P('#5A1240','#FFB199','#5C47D6','#1A0F16'),
};

const TOPICS={
 bondage:{ru:'Связывание',en:'Bondage',cat:'practice'}, shibari:{ru:'Шибари',en:'Shibari',cat:'practice'},
 roleplay:{ru:'Ролевые игры',en:'Roleplay',cat:'dynamics'}, sensory:{ru:'Сенсорные игры',en:'Sensory play',cat:'senses'},
 control:{ru:'Контроль',en:'Control',cat:'dynamics'}, service:{ru:'Сервис',en:'Service',cat:'dynamics'},
 aftercare:{ru:'Забота после',en:'Aftercare',cat:'safety'}, exhibition:{ru:'Показ',en:'Exhibition',cat:'practice'},
 rituals:{ru:'Ритуалы',en:'Rituals',cat:'dynamics'}, intimacy:{ru:'Близость',en:'Intimacy',cat:'relations'},
 experiments:{ru:'Эксперименты',en:'Experiments',cat:'senses'}, impact:{ru:'Импакт',en:'Impact play',cat:'senses'},
 latex:{ru:'Латекс',en:'Latex',cat:'senses'}, slow:{ru:'Медленный темп',en:'Slow pace',cat:'relations'},
 talk:{ru:'Разговор о границах',en:'Boundary talks',cat:'safety'}, temperature:{ru:'Температура',en:'Temperature play',cat:'senses'},
};
// V7: richer taxonomy, comparable with large kink communities. Curated list — users can’t create entries.
Object.assign(TOPICS,{
 spanking:{ru:'Спанкинг',en:'Spanking',cat:'practice'}, flogging:{ru:'Флоггинг',en:'Flogging',cat:'practice'}, wax:{ru:'Игры с воском',en:'Wax play',cat:'practice'},
 suspension:{ru:'Подвес',en:'Suspension',cat:'practice'}, restraint:{ru:'Фиксация',en:'Restraint',cat:'practice'}, blindfold:{ru:'Повязка на глаза',en:'Blindfolds',cat:'practice'},
 orgasm:{ru:'Контроль оргазма',en:'Orgasm control',cat:'practice'}, chastity:{ru:'Целомудрие',en:'Chastity',cat:'practice'}, edging:{ru:'Эджинг',en:'Edging',cat:'practice'},
 toys:{ru:'Игрушки',en:'Toys',cat:'practice'}, massage:{ru:'Массаж',en:'Massage',cat:'practice'}, tickling:{ru:'Щекотка',en:'Tickling',cat:'practice'},
 ds:{ru:'D/s-динамика',en:'D/s dynamic',cat:'dynamics'}, tpe:{ru:'Полная передача власти',en:'Total power exchange',cat:'dynamics'}, protocol:{ru:'Протокол и правила',en:'Protocol & rules',cat:'dynamics'},
 petplay:{ru:'Пет-плей',en:'Pet play',cat:'dynamics'}, brat:{ru:'Брат-динамика',en:'Brat dynamic',cat:'dynamics'}, praise:{ru:'Похвала',en:'Praise',cat:'dynamics'},
 degradation:{ru:'Унижение',en:'Degradation',cat:'dynamics'}, worship:{ru:'Поклонение',en:'Worship',cat:'dynamics'}, caregiver:{ru:'Забота и опека',en:'Caregiving',cat:'dynamics'},
 primal:{ru:'Праймал',en:'Primal play',cat:'dynamics'}, voyeur:{ru:'Вуайеризм',en:'Voyeurism',cat:'dynamics'}, medical:{ru:'Медицинские ролевые',en:'Medical roleplay',cat:'dynamics'},
 electro:{ru:'Электростимуляция',en:'E-stim',cat:'senses'}, deprivation:{ru:'Сенсорная депривация',en:'Sensory deprivation',cat:'senses'}, touch:{ru:'Прикосновения',en:'Touch',cat:'senses'},
 voice:{ru:'Голос и шёпот',en:'Voice & whispers',cat:'senses'}, scent:{ru:'Запахи',en:'Scent',cat:'senses'}, marks:{ru:'Следы на коже',en:'Marks',cat:'senses'},
 leather:{ru:'Кожа',en:'Leather',cat:'fetish'}, lingerie:{ru:'Бельё',en:'Lingerie',cat:'fetish'}, stockings:{ru:'Чулки и нейлон',en:'Stockings & nylon',cat:'fetish'},
 heels:{ru:'Каблуки',en:'Heels',cat:'fetish'}, feet:{ru:'Фут-фетиш',en:'Feet',cat:'fetish'}, uniform:{ru:'Униформа',en:'Uniforms',cat:'fetish'},
 crossdress:{ru:'Кроссдрессинг',en:'Crossdressing',cat:'fetish'}, masks:{ru:'Маски',en:'Masks',cat:'fetish'}, collars:{ru:'Ошейники',en:'Collars',cat:'fetish'},
 tantra:{ru:'Тантра',en:'Tantra',cat:'relations'}, sexting:{ru:'Переписка 18+',en:'Sexting',cat:'relations'}, threesome:{ru:'Втроём',en:'Threesomes',cat:'relations'},
 group:{ru:'Групповые встречи',en:'Group play',cat:'relations'}, swap:{ru:'Обмен партнёрами',en:'Partner swap',cat:'relations'}, cuckold:{ru:'Куколд / хотвайф',en:'Cuckold / hotwife',cat:'relations'},
 checkins:{ru:'Проверка состояния',en:'Check-ins',cat:'safety'}, safeword:{ru:'Стоп-слово',en:'Safewords',cat:'safety'}, safer:{ru:'Безопасный секс',en:'Safer sex',cat:'safety'}, testing:{ru:'Тесты на ИППП',en:'STI testing',cat:'safety'},
 breath:{ru:'Дыхательные практики',en:'Breath play',cat:'edge'}, knife:{ru:'Игры с ножом',en:'Knife play',cat:'edge'}, needles:{ru:'Иглы',en:'Needle play',cat:'edge'},
 blood:{ru:'Кровь',en:'Blood play',cat:'edge'}, fear:{ru:'Игры со страхом',en:'Fear play',cat:'edge'}, cnc:{ru:'Ролевое «несогласие» (CNC)',en:'Consensual non-consent',cat:'edge'},
 filming:{ru:'Фото и видео',en:'Photos & filming',cat:'limits'}, substances:{ru:'Алкоголь и вещества',en:'Alcohol & substances',cat:'limits'}, unprotected:{ru:'Без защиты',en:'Unprotected sex',cat:'limits'},
 publicplace:{ru:'Публичные места',en:'Public places',cat:'limits'}, strongpain:{ru:'Сильная боль',en:'Intense pain',cat:'limits'}, overnight:{ru:'Ночёвка на первой встрече',en:'Overnight on a first meeting',cat:'limits'},
 thirdparty:{ru:'Третьи люди без договорённости',en:'Third people without agreement',cat:'limits'}, permanent:{ru:'Необратимые следы',en:'Permanent marks',cat:'limits'},
});
// V7.1: hidden from the catalogue by default (store-policy risk). In production this is an admin setting, not code.
const ADMIN_HIDDEN_TOPICS=['blood','needles','knife','cnc'];const HIDDEN_TOPICS={};for(const k of ADMIN_HIDDEN_TOPICS){HIDDEN_TOPICS[k]=TOPICS[k];delete TOPICS[k];}
const TOPIC_DESC={
 bondage:{ru:'Ограничение движений верёвкой, лентами или фиксаторами по взаимной договорённости. Главное — заранее обсуждённые сигналы и быстрый способ освободить.',en:'Restricting movement with rope, straps or cuffs by mutual agreement. The essentials are agreed signals and a quick way to release.'},
 shibari:{ru:'Японская техника обвязки, где важны эстетика, ритм и доверие. Учиться лучше у опытных людей и начинать с простых узлов.',en:'A Japanese rope technique focused on aesthetics, rhythm and trust. Best learned from experienced people, starting with simple ties.'},
 aftercare:{ru:'Внимание друг к другу после сцены: разговор, тепло, вода, тишина — то, что помогает вернуться в обычное состояние.',en:'Caring for each other after a scene: talking, warmth, water, quiet — whatever helps you both come back to normal.'},
 talk:{ru:'Как договариваться о желаниях и стоп-сигналах до встречи и пересматривать договорённости потом.',en:'How to agree on wishes and stop signals before meeting and revisit agreements later.'},
};
const CATS=[
 {id:'practice',ru:'Практики',en:'Practices',pl:'rose'},{id:'dynamics',ru:'Роли и динамика',en:'Roles & dynamics',pl:'lilac'},
 {id:'senses',ru:'Ощущения',en:'Sensations',pl:'amber'},{id:'fetish',ru:'Фетиши и образы',en:'Fetishes & looks',pl:'coal'},{id:'relations',ru:'Отношения и формат',en:'Relationships',pl:'sea'},
 {id:'safety',ru:'Безопасность и согласие',en:'Safety & consent',pl:'moss'},{id:'edge',ru:'Только с опытом',en:'Experienced only',pl:'wine'},{id:'limits',ru:'Частые границы',en:'Common limits',pl:'night'},
];
const OPT={
 gender:[['woman','женщина','woman'],['man','мужчина','man'],['nb','небинарная персона','non-binary'],['transw','транс-женщина','trans woman'],['transm','транс-мужчина','trans man'],['gq','гендерквир','genderqueer'],['ag','агендер','agender'],['search','пока ищу слово','still searching']],
 orient:[['hetero','гетеро','straight'],['bi','би','bi'],['pan','пан','pan'],['gay','гей','gay'],['lesbian','лесби','lesbian'],['queer','квир','queer'],['ace','асексуальность','asexual'],['demi','демисексуальность','demisexual']],
 format:[['mono','моногамия','monogamy'],['open','открытые отношения','open relationship'],['poly','полиамория','polyamory'],['swing','свинг','swinging'],['ra','анархия отношений','relationship anarchy'],['talk','только общение','just talking']],
 role:[['lead','ведущая','leading'],['recv','принимающая','receiving'],['switch','свитч','switch'],['service','сервис','service'],['none','не важно','no preference']],
 seek:[['chat','общение','conversation'],['dates','свидания','dates'],['rel','отношения','relationship'],['exp','совместный опыт','shared experience'],['friends','дружба','friendship'],['play','партнёра по практикам','a play partner'],['events','компанию на события','company for events'],['learn','научиться, наставника','to learn / a mentor'],['online','общение онлайн','online only']],
 pron:[['she','она/её','she/her'],['he','он/его','he/him'],['they','они/их','they/them'],['any','любые','any']],
};

const OPT_BASE={gender:8,orient:8,format:6,role:5};
// Curated identifiers; user input cannot create new taxonomy entries.
OPT.gender.push(['cisw','цис-женщина','cis woman'],['cism','цис-мужчина','cis man'],['fluid','гендерфлюид','genderfluid'],['flux','гендерфлакс','genderflux'],['bigender','бигендер','bigender'],['demigender','демигендер','demigender'],['demiw','демиженщина','demiwoman'],['demim','демимужчина','demiman'],['androgyne','андрогин','androgyne'],['neutral','гендерно-нейтральный','gender neutral'],['gnc','гендерно-неконформный','gender non-conforming'],['transnb','транс-небинарная персона','trans non-binary'],['transfem','трансфеминная персона','transfeminine'],['transmasc','трансмаскулинная персона','transmasculine'],['pangender','пангендер','pangender'],['multigender','мультигендер','multigender'],['femme','фем','femme'],['masc','маск','masc'],['butch','буч','butch'],['androgynous','андрогинная персона','androgynous'],['questioning','в поиске определения','questioning'],['unspecified','не указывать','prefer not to say']);
OPT.orient.push(['homoflexible','гомофлексибильность','homoflexible'],['heteroflexible','гетерофлексибильность','heteroflexible'],['omni','омнисексуальность','omnisexual'],['polysexual','полисексуальность','polysexual'],['grayace','грейсексуальность','graysexual'],['fluid','сексуальная флюидность','sexually fluid'],['andro','андросексуальность','androsexual'],['gyno','гиносексуальность','gynosexual'],['questioning','в поиске определения','questioning'],['unspecified','не указывать','prefer not to say']);
OPT.format.push(['enm','этическая немоногамия','ethical non-monogamy'],['solo-poly','соло-полиамория','solo polyamory'],['polyfidelity','полифиделити','polyfidelity'],['hierarchical-poly','иерархическая полиамория','hierarchical polyamory'],['nonhierarchical-poly','неиерархическая полиамория','non-hierarchical polyamory'],['monogamish','моногамия с договорёнными исключениями','monogamish'],['open-dating','встречи без эксклюзивности','non-exclusive dating'],['queerplatonic','квирплатонические отношения','queerplatonic relationship'],['exploring','исследую подходящий формат','exploring my relationship style'],['unspecified','не указывать','prefer not to say']);
OPT.format.splice(6,0,['serious','серьёзные отношения','a serious relationship'],['casual','без обязательств','casual'],['fwb','дружба с привилегиями','friends with benefits'],['play','партнёры по практикам','play partners'],['ds','отношения D/s','D/s relationship'],['ldr','на расстоянии','long distance'],['online','только онлайн','online only'],['onetime','разовые встречи','one-time meetups']);
OPT_BASE.format=14;
OPT.status=[['single','свободен(на)','single'],['dating','встречаюсь','dating'],['partnered','в отношениях','in a relationship'],['married','в браке','married'],['couple','мы пара — ищем вместе','we’re a couple, looking together'],['complicated','всё сложно','it’s complicated'],['unspecified','не указывать','prefer not to say']];
OPT.role[0][1]='ведущая роль';OPT.role[1][1]='принимающая роль';
OPT.role.push(['dom','доминант','dominant'],['sub','сабмиссив','submissive'],['top','топ','top'],['bottom','боттом','bottom'],['rigger','риггер','rigger'],['rope-bottom','принимающая роль в шибари','rope bottom'],['sadist','садист','sadist'],['masochist','мазохист','masochist'],['brat','брат','brat'],['brat-tamer','brat tamer','brat tamer'],['primal','праймал','primal'],['sensual','сенсуальная роль','sensual'],['exploring','исследую роли','exploring roles'],['unspecified','не указывать','prefer not to say']);
for(const k of Object.keys(OPT))OPT[k]=OPT[k].filter(x=>x[0]!=='unspecified'&&!(k==='pron'&&x[0]==='any'));
const CITY={berlin:{ru:'Берлин',en:'Berlin'},hamburg:{ru:'Гамбург',en:'Hamburg'},moscow:{ru:'Москва',en:'Moscow'},online:{ru:'Онлайн',en:'Online'}};

/** Who follows whom (seed). 'me' entries exist only for the full persona. Counts in profiles are always the length of these lists. */
const FOLLOW_SEED={sofi:['mia','kira','me'],leon:['mia','maya'],mia:['maya','kai','sofi','me'],kai:['maya','mia','noa','me'],maya:['mia','noa'],ari:['kai'],kira:['sofi','mia','lina'],lina:['kira','me'],tomeva:['mia','maya'],lenamax:['tomeva','kira'],nikajonas:['noa','me'],dan:['me'],noa:['maya','kai']};
const PEOPLE={
 sofi:{pv:true,name:'Sofi',age:26,photo:1,nph:3,city:'berlin',km:4,pron:'she',gender:['woman'],orient:['bi'],format:['open','serious'],status:'single',role:'recv',seek:['dates','chat'],verified:true,online:true,dating:true,
  bio:{ru:'Люблю долгие переписки перед встречей и людей, которые не торопят. Фотографирую плёнку.',en:'I love long chats before meeting and people who don’t rush. I shoot film.'},
  jars:[['experiments',10],['bondage',8],['sensory',8],['exhibition',4]]},
 leon:{premium:true,name:'Leon',age:33,photo:2,nph:2,city:'berlin',km:8,pron:'he',gender:['transm'],orient:['bi'],format:'open',role:'lead',seek:['dates'],verified:true,online:false,last:{ru:'был вчера',en:'active yesterday'},dating:true,
  bio:{ru:'Сначала кофе и разговор, потом всё остальное. Веду небольшие вечеринки.',en:'Coffee and a talk first, everything else later. I host small parties.'},
  jars:[['control',10],['roleplay',8],['bondage',6],['latex',8]]},
 mia:{pv:true,premium:true,privText:{ru:'Перед первой сессией всегда созваниваемся. Стоп-слово — «красный», жест — два хлопка. После — обязательно чай и разговор.',en:'We always call before a first session. Safeword is “red”, gesture is two taps. Afterwards — tea and a talk, always.'},name:'Mia',age:29,photo:3,nph:5,city:'berlin',km:3,pron:'she',gender:['transw'],orient:['queer'],format:['poly','play'],status:'partnered',role:'switch',seek:['dates','exp'],verified:true,online:true,dating:true,
  bio:{ru:'Люблю людей, которые говорят прямо, не торопят события и заранее обсуждают ожидания. Практикую шибари шесть лет.',en:'I like people who speak directly, don’t rush and agree on expectations up front. Six years of shibari.'},
  jars:[['shibari',10],['bondage',8],['aftercare',10],['roleplay',8]]},
 kai:{pv:true,name:'Kai',age:27,photo:4,nph:2,city:'berlin',km:5,pron:'they',gender:['nb'],orient:['pan'],format:'ra',role:'switch',seek:['chat','friends'],verified:true,online:false,last:{ru:'был(а) сегодня',en:'active today'},dating:true,
  bio:{ru:'Ищу людей, с которыми можно спокойно говорить о границах. Остальное приложится.',en:'Looking for people I can calmly talk boundaries with. The rest will follow.'},
  jars:[['service',8],['bondage',6],['rituals',8],['talk',10],{t:'filming',lv:0,limit:'hard'}]},
 maya:{pv:true,name:'Maya',age:31,photo:5,nph:3,city:'hamburg',km:null,pron:'she',gender:['woman'],orient:['queer'],format:'mono',role:'none',seek:['chat'],verified:true,online:true,dating:false,socialLikes:true,
  bio:{ru:'Веду сообщество «Узлы и разговоры» и встречи для новичков. Здесь — ради людей и тем.',en:'I run the Rope & Talk community and newcomer meetups. Here for people and ideas.'},
  jars:[['shibari',10],['talk',10],['aftercare',8]]},
 ari:{name:'Ari',age:30,photo:6,city:'berlin',km:6,pron:'he',gender:['man'],orient:['gay'],format:'open',role:'service',seek:['dates','friends'],verified:true,online:false,last:{ru:'был 2 ч назад',en:'active 2h ago'},dating:true,
  bio:{ru:'Дизайнер, бегаю по утрам, люблю ритуалы и порядок. Пишите про книги.',en:'Designer, morning runner, into rituals and order. Talk to me about books.'},
  jars:[['service',10],['rituals',8],['latex',6],['slow',8]]},
 kira:{pv:true,name:'Kira',age:28,photo:7,nph:4,city:'berlin',km:2,pron:'she',gender:['woman'],orient:['pan'],format:['poly','serious'],status:'single',role:'recv',seek:['dates','rel'],verified:true,online:true,dating:true,
  bio:{ru:'Танцую, читаю, учусь доверять медленно. Важна честность и чувство юмора.',en:'I dance, read and learn to trust slowly. Honesty and humour matter.'},
  jars:[['bondage',8],['sensory',10],['intimacy',10],['experiments',6]]},
 lina:{name:'Lina',age:28,photo:9,nph:3,city:'berlin',km:7,pron:'she',gender:['woman'],orient:['bi'],format:'open',role:'switch',seek:['dates','chat'],verified:true,online:false,last:{ru:'была вчера',en:'active yesterday'},dating:true,
  bio:{ru:'Путешествую, готовлю для друзей, исследую себя без спешки.',en:'Travelling, cooking for friends, exploring myself at my own pace.'},
  jars:[['roleplay',8],['experiments',8],['intimacy',8]]},
 tomeva:{premium:true,members:['eva','tom'],name:'Eva & Tom',nameRu:'Eva и Tom',age:null,pair:true,plate:'amber',plate2:'ember',city:'berlin',km:3,pron:'any',gender:['woman','man'],orient:['bi'],format:'swing',role:'switch',seek:['exp','friends'],verified:true,online:true,dating:true,
  bio:{ru:'Пара, вместе 3 года. Отвечаем вдвоём, первая встреча — только в общественном месте.',en:'A couple, together 3 years. We reply together; first meeting in a public place only.'},
  jars:[['experiments',10],['exhibition',6],['intimacy',8]],pairNote:{ru:'пара · вместе 3 года',en:'couple · 3 years together'}},
 lenamax:{pair:true,name:'Lena & Max',nameRu:'Lena и Max',age:null,photo:'p1',city:'berlin',km:5,pron:'any',gender:['woman','man'],orient:['hetero','bi'],format:['open'],status:'partnered',role:'switch',seek:['exp','events'],verified:true,pv:true,online:true,dating:true,
  bio:{ru:'Пара, вместе 6 лет. Ходим на латекс-вечеринки, ищем пару или человека для общения и совместных выходов. Сначала переписка с обоими.',en:'A couple, together 6 years. We go to latex parties and look for a couple or a person to talk to and go out with. Chat with both of us first.'},
  jars:[['latex',10],['exhibition',8],['roleplay',7],['control',6]],pairNote:{ru:'пара · вместе 6 лет',en:'couple · 6 years together'}},
 nikajonas:{pair:true,name:'Nika & Jonas',nameRu:'Nika и Jonas',age:null,photo:'p2',city:'berlin',km:8,pron:'any',gender:['woman','man'],orient:['bi'],format:['poly'],status:'partnered',role:'switch',seek:['friends','dates'],verified:true,online:false,last:{ru:'были вчера',en:'active yesterday'},dating:true,
  bio:{ru:'Полиаморная пара. Любим долгие разговоры, кофейни и медленный темп. Пишите, если хочется познакомиться спокойно.',en:'A polyamorous couple. We love long talks, cafés and a slow pace. Write if you want to get to know each other calmly.'},
  jars:[['talk',10],['slow',9],['intimacy',8],['sensory',6]],pairNote:{ru:'пара · вместе 2 года',en:'couple · 2 years together'}},
 eva:{name:'Eva',age:32,plate:'amber',city:'berlin',pron:'she',gender:['woman'],orient:['bi'],format:'swing',role:'switch',seek:['exp','friends'],verified:true,pv:true,online:true,dating:false,pairOf:'tomeva',
  bio:{ru:'Половина пары Eva и Tom. Личные сообщения — сюда, общие вопросы — в профиль пары.',en:'One half of Eva & Tom. Personal messages here, couple questions on the couple profile.'},jars:[['roleplay',8],['intimacy',9]]},
 tom:{name:'Tom',age:34,plate:'ember',city:'berlin',pron:'he',gender:['man'],orient:['bi'],format:'swing',role:'lead',seek:['exp'],verified:true,online:false,last:{ru:'был сегодня',en:'active today'},dating:false,pairOf:'tomeva',
  bio:{ru:'Готовлю, катаюсь на велосипеде. В паре с Eva.',en:'I cook and ride bikes. In a couple with Eva.'},jars:[['control',8],['rituals',7]]},
 dan:{name:'Dan',age:35,plate:'night',city:'berlin',pron:'he',gender:['man'],orient:['hetero'],format:'mono',role:'none',seek:['chat'],dating:false,bio:{ru:'Читаю больше, чем пишу.',en:'I read more than I post.'},jars:[]},
 noa:{name:'Noa',age:34,plate:'sea',city:'moscow',pron:'they',gender:['nb'],orient:['queer'],format:'ra',role:'none',seek:['chat'],dating:false,verified:true,bio:{ru:'Психолог, веду онлайн-круги о согласии.',en:'Counsellor, I host online circles on consent.'},jars:[['talk',10],['aftercare',10]]},
};

for(const [pairId,ids,names] of [['lenamax',['lena','max'],['Lena','Max']],['nikajonas',['nika','jonas'],['Nika','Jonas']]]){const pair=PEOPLE[pairId];pair.members=ids;ids.forEach((id,i)=>{PEOPLE[id]={name:names[i],age:i?33:30,plate:i?'sea':'rose',city:pair.city,pron:i?'he':'she',gender:[i?'man':'woman'],orient:['bi'],format:[...pair.format],status:'partnered',role:'switch',seek:['friends'],dating:false,socialLikes:true,pairOf:pairId,bio:{ru:'Личный профиль. Общий профиль пары доступен ниже.',en:'Personal profile. Our couple profile is linked below.'},jars:[]};});}
const COMMUNITIES={
 rope:{name:{ru:'Узлы и разговоры',en:'Rope & Talk'},plate:'rose',cover:'/images/v10-content/community-rope.webp',privacy:'open',members:1284,city:'berlin',topics:['shibari','bondage','talk'],mods:['maya','mia'],
  desc:{ru:'Учимся обвязкам безопасно и без спешки. Практика, разборы ошибок и встречи в Берлине.',en:'Learning rope safely and slowly. Practice, mistakes reviewed, and meetups in Berlin.'},
  rules:[{ru:'Согласие прежде всего: фото и истории о других — только с их разрешения.',en:'Consent first: photos and stories about others only with their permission.'},{ru:'Без советов «на глаз» по безопасности — делимся источниками.',en:'No guesswork safety advice — share sources.'},{ru:'Личные сообщения — только по взаимной симпатии, не через группу.',en:'Private messages only through mutual likes, not via the group.'}]},
 slow:{name:{ru:'Медленный темп',en:'Slow Pace'},plate:'sea',cover:'/images/v10-content/community-slow.webp',privacy:'open',members:642,city:'online',topics:['slow','talk','intimacy'],mods:['kai'],
  desc:{ru:'Для тех, кто знакомится не торопясь: переписка, разговоры, доверие.',en:'For those who take their time: writing, talking, trust.'},
  rules:[{ru:'Уважаем темп другого человека.',en:'Respect other people’s pace.'},{ru:'Никакого давления и навязчивых сообщений.',en:'No pressure or pushy messages.'}]},
 queer:{name:{ru:'Квир Берлин',en:'Queer Berlin'},plate:'lilac',cover:'/images/v10-content/community-queer.webp',privacy:'closed',members:389,city:'berlin',topics:['intimacy','talk'],mods:['mia'],
  desc:{ru:'Закрытое сообщество квир-людей Берлина. Вступление по заявке.',en:'A closed community for queer people in Berlin. Join by request.'},
  rules:[{ru:'Только для квир-людей и союзников по приглашению.',en:'Queer people and invited allies only.'},{ru:'Ничего из группы не выносится наружу.',en:'Nothing leaves the group.'}],
  questions:[{ru:'Почему хочешь вступить?',en:'Why do you want to join?'}]},
 latex:{name:{ru:'Латекс-клуб',en:'Latex Club'},plate:'coal',cover:'/images/v10-content/community-latex.webp',privacy:'closed',members:211,city:'berlin',topics:['latex','exhibition'],mods:['leon'],
  desc:{ru:'Уход за латексом, мастерские и закрытые вечера.',en:'Latex care, workshops and private evenings.'},
  rules:[{ru:'Фото участников — только с согласия.',en:'Photos of members only with consent.'}],questions:[{ru:'Есть ли у тебя опыт с латексом?',en:'Do you have experience with latex?'}]},
 first:{name:{ru:'Новичкам',en:'First Steps'},plate:'moss',privacy:'open',members:2310,city:'online',topics:['talk','aftercare','slow'],mods:['maya','noa'],
  desc:{ru:'Глупых вопросов нет. Объясняем термины, делимся опытом, помогаем начать безопасно.',en:'No stupid questions. Explaining terms, sharing experience, helping you start safely.'},
  rules:[{ru:'Отвечаем доброжелательно.',en:'Answer kindly.'},{ru:'Не просим и не отправляем откровенные фото.',en:'Don’t ask for or send explicit photos.'}]},
 poly:{name:{ru:'Пары и поли',en:'Couples & Poly'},plate:'amber',cover:'/images/v10-content/community-poly.webp',privacy:'open',members:905,city:'berlin',topics:['intimacy','talk'],mods:['tomeva'],
  desc:{ru:'Договорённости, ревность, календари и всё, что помогает отношениям нескольких людей.',en:'Agreements, jealousy, calendars and everything that helps multi-partner relationships.'},
  rules:[{ru:'Пары пишут от имени обоих только с согласия обоих.',en:'Couples post for both only with both agreeing.'}]},
 circle:{name:{ru:'Круг общения',en:'Conversation Circle'},plate:'sea',cover:'/images/v10-content/community-slow.webp',privacy:'closed',members:1,knownMembers:true,seedMembers:['kai'],city:'online',topics:['talk','slow'],mods:['kai'],
  desc:{ru:'Небольшой круг для спокойных разговоров, обмена опытом и встреч без спешки.',en:'A small circle for calm conversations, sharing experiences and unhurried meetups.'},
  rules:[{ru:'Истории участников остаются внутри сообщества.',en:'Members’ stories stay within the community.'},{ru:'Уважаем право отказаться и не торопим друг друга.',en:'Respect the right to say no and don’t rush each other.'}],questions:[{ru:'О чём хочешь поговорить в круге?',en:'What would you like to discuss in the circle?'}]},
};

const DISCUSSIONS=[
 {id:'d1',media:[{type:'image',url:'/images/v10-content/discussion-d1-rope-basics.webp'}],c:'rope',author:'mia',t:ago(5),pinned:true,title:{ru:'С чего начать: верёвка, ножницы, разговор',en:'Where to start: rope, shears, a conversation'},text:{ru:'Собрала короткий список для первых занятий. Самое важное в нём — не верёвка, а разговор до начала.',en:'A short list for first sessions. The most important item isn’t rope — it’s the talk before you start.'},replies:[['kai',{ru:'Спасибо! Ножницы для бандажа — то, о чём я не подумал(а).',en:'Thanks! Safety shears are what I hadn’t thought of.'}],['dan',{ru:'Сохранил. Можно ссылку на видео про узлы?',en:'Saved. Any link to a knot video?'}]]},
 {id:'d2',c:'rope',author:'maya',t:ago(30),title:{ru:'Разбор: что делать, если немеет рука',en:'Review: what to do if a hand goes numb'},text:{ru:'Пишу по следам вчерашней практики. Как заметить заранее и как быстро освободить.',en:'Following yesterday’s practice: how to notice early and release fast.'},replies:[['sofi',{ru:'Очень полезно, особенно про сигнал рукой.',en:'Really useful, especially the hand signal.'}]]},
 {id:'d3',media:[{type:'image',url:'/images/v10-content/discussion-d3-communication.webp'}],c:'slow',author:'kai',t:ago(8),title:{ru:'Сколько вы переписываетесь до первой встречи?',en:'How long do you chat before meeting?'},text:{ru:'У меня обычно две недели. Иногда кажется, что это много.',en:'Usually two weeks for me. Sometimes it feels like a lot.'},replies:[['kira',{ru:'Неделя-две, и обязательно голосом.',en:'A week or two, and always a voice call.'}]]},
 {id:'d4',c:'slow',author:'lina',t:ago(50),title:{ru:'Ваш лучший первый вопрос',en:'Your best first question'},text:{ru:'Не «привет, как дела». Что спрашиваете вы?',en:'Not “hi, how are you”. What do you ask?'},replies:[]},
 {id:'d5',c:'first',author:'noa',t:ago(2),pinned:true,title:{ru:'Словарь: 20 терминов простыми словами',en:'Glossary: 20 terms in plain words'},text:{ru:'Обновили словарь. Если чего-то не хватает — пишите в ответах.',en:'We updated the glossary. Missing something? Reply below.'},replies:[['sofi',{ru:'Добавьте, пожалуйста, «забота после».',en:'Please add “aftercare”.'}]]},
 {id:'d6',c:'first',author:'dan',t:ago(20),title:{ru:'Как сказать партнёру о своём интересе?',en:'How do I tell my partner about my interest?'},text:{ru:'Встречаемся три года, боюсь, что не поймёт.',en:'We’ve been together three years, I’m afraid they won’t understand.'},replies:[['maya',{ru:'Начни с карты интересов — можно показать только выбранное.',en:'Start with your map — you can share only what you choose.'}],['kira',{ru:'Мне помог разговор не в спальне, а на прогулке.',en:'For me it helped to talk on a walk, not in the bedroom.'}]]},
 {id:'d7',c:'queer',author:'mia',t:ago(26),title:{ru:'Встреча в субботу: кто идёт?',en:'Saturday meetup: who’s coming?'},text:{ru:'Только для участников группы.',en:'Members only.'},replies:[]},
 {id:'d8',c:'latex',author:'leon',t:ago(70),title:{ru:'Уход: тальк или силикон?',en:'Care: talc or silicone?'},text:{ru:'Спор вечный, давайте с фактами.',en:'The eternal debate — facts please.'},replies:[]},
 {id:'d9',c:'poly',author:'tomeva',t:ago(12),title:{ru:'Общий календарь: ваш опыт',en:'Shared calendar: your experience'},text:{ru:'Пробуем общий календарь на троих. Что работает у вас?',en:'We’re trying a shared calendar for three. What works for you?'},replies:[['kai',{ru:'Цвета по людям и правило «не двигать чужое».',en:'Colour per person and a “don’t move others’ events” rule.'}]]},
];

const POSTS=[
 {id:'p1',author:'mia',t:ago(2),type:'result',tags:['roleplay','talk'],likes:24,aud:'all',text:{ru:'Перепрошла тест «Роли» спустя полгода. Принимающая роль выросла, а интерес к показу ушёл почти в ноль. У кого ещё так менялось?',en:'Retook the Roles quiz after six months. Receiving role went up, interest in exhibition dropped to almost zero. Anyone else?'},result:[['roleplay',8],['exhibition',2]],comments:[['kai',{ru:'У меня наоборот — стало интереснее пробовать новое.',en:'Opposite for me — trying new things got more interesting.'}],['dan',{ru:'Классная идея — сравнивать себя с собой.',en:'Great idea to compare yourself with yourself.'}]]},
 {id:'p2',author:'kai',t:ago(20),type:'photo',media:[{type:'image',url:'/images/v10-content/post-p2-rope-details-45.webp'}],plate:'sea',tags:['shibari'],likes:41,aud:'all',text:{ru:'Вчерашний мастер-класс по обвязкам. Учились не узлам, а тому, как договариваться заранее.',en:'Yesterday’s rope workshop. We learned not knots but how to agree in advance.'},comments:[['mia',{ru:'Было тепло и спокойно, спасибо всем!',en:'It was warm and calm, thanks everyone!'}]]},
 {id:'p3',author:'tomeva',t:ago(70),type:'text',tags:['intimacy','talk'],likes:58,aud:'all',text:{ru:'Год в открытых отношениях. Главное, что поняли: правила лучше обновлять заранее, а не после.',en:'A year in an open relationship. Main lesson: update the rules before, not after.'},comments:[]},
 {id:'p4',author:'maya',t:ago(4),type:'poll',tags:['talk'],likes:17,aud:'all',text:{ru:'Собираю опыт для встречи новичков в субботу.',en:'Collecting experience for Saturday’s newcomers meetup.'},pollQ:{ru:'Как вы предпочитаете обсуждать границы перед встречей?',en:'How do you prefer to discuss boundaries before meeting?'},poll:[[{ru:'В переписке',en:'In writing'},34],[{ru:'Голосом',en:'Voice call'},21],[{ru:'При встрече за кофе',en:'Over coffee in person'},45]],comments:[]},
 {id:'p5',author:'sofi',t:ago(9),type:'text',tags:['slow'],likes:12,aud:'all',text:{ru:'Если вы тоже любите долгие переписки перед встречей — вы по адресу.',en:'If you also love long chats before meeting — you’re in the right place.'},comments:[]},
 {id:'p6',author:'leon',t:ago(30),type:'photo',media:[{type:'image',url:'/images/v10-content/post-p6-latex-night-prep-45.webp'}],plate:'coal',tags:['latex'],likes:33,aud:'followers',text:{ru:'Готовим следующую Latex Night. Дресс-код мягкий, правила строгие.',en:'Preparing the next Latex Night. Soft dress code, strict rules.'},comments:[]},
 {id:'p7',author:'ari',t:ago(14),type:'text',media:[{type:'image',url:'/images/v10-content/post-p7-morning-coffee-45.webp'}],tags:['rituals','service'],likes:9,aud:'all',text:{ru:'Маленький ритуал утра: кофе, список дел и одно доброе сообщение. Удивительно, как это меняет день.',en:'A small morning ritual: coffee, a to-do list and one kind message. Amazing how it changes the day.'},comments:[]},
 {id:'p8',author:'noa',t:ago(40),type:'text',tags:['talk','aftercare'],likes:66,aud:'all',text:{ru:'Напоминание: «забота после» нужна не только тому, кто был в принимающей роли.',en:'Reminder: aftercare isn’t only for the person in the receiving role.'},comments:[['sofi',{ru:'Очень важно, спасибо.',en:'So important, thank you.'}]]},
 {id:'p9',author:'kira',t:ago(55),type:'text',media:[{type:'image',url:'/images/v10-content/post-p9-evening-atmosphere-45.webp'}],tags:['sensory'],likes:21,aud:'all',text:{ru:'Попробовали вечер без телефонов и света — только звук и прикосновения. Записала ощущения в дневник, делюсь кусочком.',en:'We tried an evening with no phones or lights — just sound and touch. Wrote it in my journal, sharing a piece.'},comments:[]},
];

const EVENTS={
 e1:{title:{ru:'Вечер шибари для начинающих',en:'Shibari basics evening'},type:'workshop',format:'offline',city:'berlin',area:{ru:'Кройцберг',en:'Kreuzberg'},venue:{ru:'Studio Knoten, Oranienstraße 12, 2 этаж',en:'Studio Knoten, Oranienstraße 12, 2nd floor'},start:at(3,19),end:at(3,22),tz:'Europe/Berlin',price:{ru:'15 €',en:'€15'},organizer:'maya',community:'rope',approval:true,plate:'rose',cover:'/images/v10-content/event-e1-shibari-workshop.webp',gallery:[{type:'image',url:'/images/v10-content/gallery-e1-ropes.webp'}],
  desc:{ru:'Небольшая группа до 12 человек. Разберём три базовых узла, сигналы и безопасное освобождение. Верёвки выдаём. Можно прийти одному или в паре.',en:'A small group of up to 12. Three basic ties, signals and safe release. Rope provided. Come solo or with a partner.'},
  reqs:[{ru:'18+ и подтверждённый возраст',en:'18+ with verified age'},{ru:'Согласие с правилами студии',en:'Agree to studio rules'},{ru:'Удобная одежда',en:'Comfortable clothes'}],q:[{ru:'Был ли у тебя опыт с верёвкой?',en:'Any experience with rope?'}]},
 e2:{title:{ru:'Круг о границах: онлайн',en:'Boundaries circle: online'},type:'talk',format:'online',start:at(1,18,30),end:at(1,20),tz:'Europe/Moscow',price:null,organizer:'noa',community:'first',approval:false,plate:'sea',cover:'/images/v10-content/event-e2-boundaries-circle.webp',link:'https://meet.feture.app/circle-7',
  desc:{ru:'Спокойный разговор в кругу до 20 человек: как просить, как отказывать и как пересматривать договорённости. Камеру можно не включать.',en:'A calm circle of up to 20: how to ask, how to say no, how to revisit agreements. Camera optional.'},reqs:[{ru:'Можно анонимно для других участников',en:'You can stay anonymous to other attendees'}]},
 e3:{title:{ru:'Latex Night',en:'Latex Night'},type:'party',format:'offline',city:'berlin',area:{ru:'Фридрихсхайн',en:'Friedrichshain'},venue:{ru:'Club Velour, Revaler Str. 99',en:'Club Velour, Revaler Str. 99'},start:at(9,22),end:at(10,4),tz:'Europe/Berlin',price:{ru:'25 €',en:'€25'},organizer:'leon',community:'latex',approval:false,external:'tickets.velour.club',plate:'coal',cover:'/images/v10-content/event-e3-latex-night.webp',gallery:[{type:'image',url:'/images/v10-content/gallery-e3-club.webp'}],
  desc:{ru:'Вечеринка с мягким дресс-кодом и строгими правилами согласия. Билеты продаёт клуб.',en:'A party with a soft dress code and strict consent rules. Tickets sold by the club.'},reqs:[{ru:'18+, документ на входе',en:'18+, ID at the door'},{ru:'Дресс-код: латекс, кожа или чёрное',en:'Dress code: latex, leather or black'}]},
 e4:{title:{ru:'Кофе для новичков',en:'Newcomers coffee'},type:'meetup',format:'offline',city:'berlin',area:{ru:'Нойкёльн',en:'Neukölln'},venue:{ru:'Café Ruhe, Weserstraße 40',en:'Café Ruhe, Weserstraße 40'},start:at(5,12),end:at(5,14),tz:'Europe/Berlin',price:null,organizer:'maya',community:'first',approval:false,plate:'moss',cover:'/images/v10-content/event-e4-newcomers-coffee.webp',gallery:[{type:'image',url:'/images/v10-content/gallery-e4-cafe.webp'}],
  desc:{ru:'Знакомимся в обычном кафе, без дресс-кода и сцен. Просто поговорить и задать вопросы.',en:'Meeting in a regular café, no dress code, no scenes. Just talk and ask questions.'},reqs:[]},
 e5:{title:{ru:'Мастерская: забота после сцены',en:'Workshop: aftercare'},type:'workshop',format:'online',start:at(12,19),end:at(12,21),tz:'Europe/Berlin',price:{ru:'10 €',en:'€10'},organizer:'mia',community:null,approval:false,external:'pay.example.org',plate:'wine',cover:'/images/v10-content/event-e5-aftercare-workshop.webp',
  desc:{ru:'Практическая онлайн-мастерская: что нужно телу и голове после интенсивной сцены.',en:'A practical online workshop: what body and mind need after an intense scene.'},reqs:[]},
 e6:{title:{ru:'Пикник сообщества',en:'Community picnic'},type:'meetup',format:'offline',city:'berlin',area:{ru:'Тиргартен',en:'Tiergarten'},venue:{ru:'Тиргартен, у озера',en:'Tiergarten, by the lake'},start:NOW-12*DAY,end:NOW-12*DAY+3*HOUR,tz:'Europe/Berlin',price:null,organizer:'maya',community:'rope',approval:false,plate:'moss',cover:'/images/v10-content/event-e6-community-picnic.webp',past:true,
  desc:{ru:'Летний пикник сообщества.',en:'Summer community picnic.'},reqs:[]},
 e7:{title:{ru:'Квир-вечер в Шёнеберге',en:'Queer evening in Schöneberg'},type:'party',format:'offline',city:'berlin',area:{ru:'Шёнеберг',en:'Schöneberg'},venue:{ru:'—',en:'—'},start:at(6,21),end:at(7,2),tz:'Europe/Berlin',price:null,organizer:'mia',community:'queer',approval:true,plate:'lilac',cancelled:{ru:'Площадка закрылась на ремонт. Перенесём, как только найдём новое место.',en:'The venue closed for renovation. We’ll reschedule once we find a new place.'},
  desc:{ru:'Танцы и разговоры.',en:'Dancing and conversations.'},reqs:[]},
};

const REQ_SCOPES=[['info',{ru:'желания и границы',en:'wishes and boundaries'}],['photos',{ru:'приватные фото',en:'private photos'}],['video',{ru:'видео',en:'video'}],['album',{ru:'альбом «Лето»',en:'album “Summer”'}]];

/* ---------- personas ---------- */
function fullMe(){return{privText:{ru:'Новичок в верёвке, поэтому сначала — разговор и короткая встреча на нейтральной территории. Не люблю сюрпризов.',en:'New to rope, so first a talk and a short meeting on neutral ground. I don’t like surprises.'},
 nick:'alex_b',name:'Alex',showAge:true,dob:'1994-03-14',photo:8,photos:[8],city:'berlin',pron:'he',gender:['man'],orient:['bi'],format:['open','play'],status:'single',role:'lead',seek:['dates','chat'],
 bio:{ru:'Говорю прямо, слушаю внимательно. Люблю верёвку, долгие прогулки и людей, которые знают свои границы.',en:'I speak directly and listen closely. I love rope, long walks and people who know their limits.'},
 vis:{...PUBLIC_VIS},email:'alex@mail.com',methods:['email','google'],dating:true,datingVisible:true,socialLikes:true,requestsFrom:'all',rsvpShow:false,ageCheck:'ok',premium:false,
 jars:[
  {t:'bondage',lv:8,real:'practice',vis:'public'},{t:'shibari',lv:6,real:'try',vis:'public'},{t:'roleplay',lv:8,real:'practice',vis:'public'},{t:'aftercare',lv:10,real:'practice',vis:'public'},
  {t:'control',lv:8,real:'practice',vis:'granted'},{t:'sensory',lv:6,real:'fantasy',vis:'granted'},{t:'experiments',lv:10,real:'try',vis:'only'},{t:'intimacy',lv:8,real:'practice',vis:'public'},
  {t:'impact',lv:0,limit:'hard',vis:'only'},{t:'exhibition',lv:0,limit:'discuss',vis:'granted'}],
 history:[{t:ago(30),topic:'shibari',from:4,to:6,src:'test'},{t:ago(200),topic:'aftercare',from:8,to:10,src:'manual'},{t:ago(400),topic:'impact',from:'—',to:'limit',src:'manual'}],
 journal:[
  {id:'j1',t:ago(26),topics:['shibari'],text:{ru:'Первое занятие у Mia. Страшно было только первые десять минут. Записать: спросить про ножницы для бандажа.',en:'First session with Mia. Scary only for the first ten minutes. Note: ask about safety shears.'}},
  {id:'j2',t:ago(130),topics:['talk'],text:{ru:'Поговорили с Kai о границах. Понял, что мне проще писать, чем говорить вслух — это нормально.',en:'Talked boundaries with Kai. I realised writing is easier for me than saying it out loud — and that’s fine.'}},
  {id:'j3',t:ago(400),topics:[],text:{ru:'Завёл дневник. Пусть здесь будет то, что я не готов показывать никому.',en:'Started a journal. A place for things I’m not ready to show anyone.'}}],
 tests:{rope:{done:true,t:ago(30),ans:{bondage:8,shibari:6,restraint:7,blindfold:5,suspension:'discuss',collars:'hard'}},care:{step:2,ans:{talk:10,safeword:10}}},
 saved:{posts:['p8'],events:['e4'],topics:['aftercare']},
};}
function newMe(){return{
 nick:'',name:'',showAge:false,dob:'',photo:null,photos:[],city:null,pron:null,gender:[],orient:[],format:[],status:null,role:null,seek:[],bio:{ru:'',en:''},
 vis:{gender:'only',orient:'only',format:'only',role:'only'},email:'',methods:[],dating:false,datingVisible:false,socialLikes:true,requestsFrom:'all',rsvpShow:false,ageCheck:'none',premium:false,
 jars:[],history:[],journal:[],tests:{},saved:{posts:[],events:[],topics:[]},fresh:true};}

function freshState(persona){
 const full=persona!=='new';
 const st={
  persona,lang:'ru',session:null,
  me:full?fullMe():newMe(),
  follows:new Set(full?['maya','mia','kai','noa']:[]),
  graph:Object.fromEntries(Object.entries(FOLLOW_SEED).map(([k,v])=>[k,new Set(full?v:v.filter(x=>x!=='me'))])),
  joined:new Set(full?['rope','first']:[]), pendingJoin:new Set(full?['queer']:[]),
  managedCommunities:new Set(full?['circle']:[]), communityMembers:{},
  communityRequests:full?{circle:[
   {id:'cr1',p:'kira',t:ago(2),status:'pending',showMember:true,answer:{ru:'Хочу обсуждать границы и знакомиться без спешки.',en:'I’d like to discuss boundaries and meet people slowly.'}},
   {id:'cr2',p:'lina',t:ago(4),status:'pending',showMember:false,answer:{ru:'Ищу небольшой круг для спокойных разговоров.',en:'I’m looking for a small circle for calm conversations.'}},
   {id:'cr3',p:'kai',t:ago(48),updated:ago(24),status:'approved',showMember:true,answer:{ru:'Интересны разговоры о доверии и заботе.',en:'I’m interested in conversations about trust and care.'}}
  ]}:{} ,
  posts:POSTS.map(p=>({...p,pollVoters:p.poll?p.poll.map((_,i)=>Object.keys(PEOPLE).filter((id,j)=>!PEOPLE[id].pair&&j%p.poll.length===i).slice(0,5)):undefined,liked:false,saved:false,comments:p.comments.map((c,i)=>({a:c[0],text:c[1],t:p.t+HOUR,likes:(i*3+2)%6}))})),
  myPosts:full?[{id:'m1',author:'me',t:ago(48),type:'text',tags:['shibari'],likes:14,aud:'all',status:'published',text:{ru:'Первый раз сходил на занятие по шибари. Больше всего удивило, сколько времени уходит на разговор до начала — и как это успокаивает.',en:'Went to my first shibari class. What surprised me most was how much time goes into talking first — and how calming that is.'},comments:[]},
   {id:'m2',author:'me',t:ago(3),type:'text',tags:['talk'],likes:0,aud:'followers',status:'draft',text:{ru:'Черновик: как я учусь говорить «нет» без чувства вины…',en:'Draft: how I’m learning to say “no” without guilt…'},comments:[]}]:[],
  postEdits:{}, // private saved revisions; never part of published Posts
  discussions:DISCUSSIONS.map(d=>({...d,replies:d.replies.map((r,i)=>({a:r[0],text:r[1],t:d.t+HOUR,likes:(i*2+1)%5}))})),
  rsvp:full?{e1:{status:'going',app:'pending',answers:true},e2:{status:'interested'},e6:{status:'going',app:'none'}}:{},
  myEvents:full?['e8']:[],
  extraEvents:{},
  decided:{}, // personId -> 1 like / -1 pass (discover)
  deckOrder:['kira','lenamax','leon','ari','nikajonas','tomeva'],
  likesIn:full?[{p:'kira',src:'discover',t:ago(3)},{p:'lenamax',src:'discover',t:ago(9)},{p:'leon',src:'profile',t:ago(20)},{p:'ari',src:'discover',t:ago(40)}]:[],
  likesOut:full?[{p:'maya',src:'profile',t:ago(10)}]:[],
  matches:full?[{p:'mia',t:ago(26)},{p:'kai',t:ago(120)},{p:'sofi',t:ago(5)},{p:'lina',t:ago(1)},{p:'tomeva',t:ago(24)}]:[],
  threads:full?{
   mia:{msgs:[{me:0,text:{ru:'Привет! Увидела, что у нас совпали связывание и забота после 🙂',en:'Hi! Saw we matched on bondage and aftercare 🙂'},t:ago(25)},{me:1,text:{ru:'Привет! Да, редко кто сразу пишет про заботу после',en:'Hi! Yes, rarely does anyone mention aftercare first'},t:ago(24.8)},{me:0,text:{ru:'Расскажешь, как ты к этому пришёл?',en:'Will you tell me how you got into it?'},t:ago(.1)},{me:0,text:{ru:'С прошлой встречи 🙂',en:'From the last meetup 🙂'},t:ago(.6),media:{type:'image',url:'/images/v10-content/post-p7-morning-coffee-45.webp',mode:'normal'}},{me:0,text:'',t:ago(.5),media:{type:'image',url:'/images/v10-content/gallery-e1-ropes.webp',mode:'once',openedAt:null,done:false}},{me:0,text:'',t:ago(.4),media:{type:'image',url:'/images/v10-content/post-p2-rope-details-45.webp',mode:'t15',openedAt:null,done:false}}],unread:1},
   kai:{msgs:[{me:1,text:{ru:'Спасибо за круг вчера, было очень спокойно.',en:'Thanks for the circle yesterday, it was really calm.'},t:ago(50)},{me:0,text:{ru:'Рад(а), что пришёл! В четверг будет ещё один.',en:'Glad you came! There’s another one on Thursday.'},t:ago(49)}],unread:0},
   tomeva:{pair:true,msgs:[{me:0,text:{ru:'Eva: Тогда в субботу в кафе?',en:'Eva: Saturday at the café then?'},t:ago(1.2)}],unread:1},
  }:{},
  archived:new Set(full?[]:[]),muted:new Set(),
  blocked:full?[{p:'dan',t:ago(300)}]:[],
  reqIn:full?[{id:'r1',p:'kai',scopes:['info','photos'],t:ago(.2),status:'new'},{id:'r2',p:'leon',scopes:['info'],t:ago(2),status:'new'},{id:'r3',p:'tomeva',scopes:['info','photos','album'],t:ago(22),status:'new'}]:[],
  reqOut:full?[{id:'o1',p:'kira',scopes:['info','photos'],t:ago(4),status:'pending'},{id:'o2',p:'mia',scopes:['info','photos','album'],t:ago(30),status:'partial',granted:['info','album'],until:NOW+5*DAY},{id:'o3',p:'leon',scopes:['info'],t:ago(80),status:'declined'},{id:'o4',p:'ari',scopes:['info'],t:ago(200),status:'expired'}]:[],
  sharedByMe:full?[{p:'mia',scopes:['info','photos'],until:NOW+5*DAY,t:ago(28)},{p:'kai',scopes:['info'],until:NOW+23*HOUR,t:ago(1)}]:[],
  notifs:full?[
   {id:'n1',type:'match',p:'lina',t:ago(1),read:false,go:['H01']},
   {id:'n2',type:'req',p:'kai',t:ago(.2),read:false,go:['P07',{tab:'in'}]},
   {id:'n3',type:'event',e:'e1',t:ago(3),read:false,go:['E03',{id:'e1'}]},
   {id:'n4',type:'like',p:'kira',t:ago(3),read:false,go:['D06']},
   {id:'n5',type:'reply',p:'dan',post:'m1',t:ago(6),read:true,go:['F05',{id:'m1'}]},
   {id:'n6',type:'grant',p:'mia',t:ago(28),read:true,go:['P08',{id:'mia'}]},
   {id:'n8',type:'follow',p:'lina',t:ago(2),read:false,go:['P10',{id:'me',tab:'followers'}]},
   {id:'n7',type:'group',c:'rope',t:ago(60),read:true,go:['C03',{id:'rope'}]},
  ]:[],
  updates:full?[{id:'u1',e:'e1',t:ago(3),read:false,text:{ru:'Начало перенесли на 19:00. Возьмите удобную одежду.',en:'Start moved to 19:00. Bring comfortable clothes.'}},{id:'u2',c:'rope',t:ago(30),read:true,text:{ru:'Новые правила фотосъёмки на встречах — загляните в раздел «Правила».',en:'New photo rules for meetups — see the Rules tab.'}}]:[],
  history:full?[{p:'sofi',d:1,t:ago(30)},{p:'mia',d:1,t:ago(50)},{p:'lina',d:1,t:ago(60)},{p:'dan',d:-1,t:ago(80)}]:[],
  filters:{feed:{},following:{},events:{format:'all'},dating:{show:'all',age:[18,99],dist:100,gender:[],orient:[],format:[],seek:[],topics:[],role:[],placeMode:'city',city:'',coords:null},search:{},comm:{}},
  searchRecent:full?['shibari','Mia','Kai']:[],
  quota:{max:10,used:full?1:0},
  ui:{},
  // in the pair persona Kira is my partner's separate account, not a like/request in my queues
  pair:persona==='pair'?{status:'active',with:'kira',since:ago(24*40),name:{ru:'Alex и Kira',en:'Alex & Kira'},
   desc:{ru:'Пара, вместе год. Отвечаем по очереди, о встречах договариваемся вдвоём.',en:'A couple, together a year. We reply in turns and agree on meetings together.'},
   rules:{ru:'Сначала переписка с обоими, потом встреча в людном месте.',en:'Chat with both of us first, then meet somewhere public.'},
   proposal:{by:'kira',field:'desc',text:{ru:'Пара, вместе год. Любим спокойный темп и честные разговоры.',en:'A couple, together a year. We like a slow pace and honest talks.'},t:ago(5)},
   grants:[{p:'tomeva',scopes:['info'],me:'yes',partner:'yes',until:NOW+3*DAY},{p:'mia',scopes:['photos'],me:'yes',partner:'pending',until:null}]}:null,
 };
 if(persona==='pair'){st.likesIn=st.likesIn.filter(x=>x.p!=='kira');st.reqOut=st.reqOut.filter(x=>x.p!=='kira');st.deckOrder=st.deckOrder.filter(x=>x!=='kira');st.communityRequests.circle=st.communityRequests.circle.filter(x=>x.p!=='kira');st.notifs=st.notifs.filter(x=>x.p!=='kira');st.follows.add('kira');st.graph.kira.add('me');}
 // organizer event for the full persona (E15/E16)
 if(full){st.extraEvents.e8={title:{ru:'Клуб чтения: «Больше двух»',en:'Book club: “More Than Two”'},type:'talk',format:'online',start:at(8,19),end:at(8,20,30),tz:'Europe/Berlin',price:null,organizer:'me',community:'slow',approval:true,plate:'plum',link:'https://meet.feture.app/bookclub',desc:{ru:'Обсуждаем по главе в неделю. Камера по желанию.',en:'One chapter a week. Camera optional.'},reqs:[],q:[{ru:'Читал(а) ли книгу раньше?',en:'Have you read the book before?'}],status:'published',apps:[{p:'kira',status:'pending',answer:{ru:'Нет, начну с вами',en:'No, I’ll start with you'}},{p:'ari',status:'approved',answer:{ru:'Да, дважды',en:'Yes, twice'}},{p:'lina',status:'pending',answer:{ru:'Частично',en:'Partly'}}],announce:[]};}
 return st;
}

