/* ============ REVIEW DRAWER (prototype-only tooling, not product UI) ============ */
let QA_LIST=()=>[
 [L('Вход и регистрация','Sign in & sign up'),[['A01',L('Приветствие','Welcome')],['A02',L('Регистрация: Apple, Google, почта','Sign up: Apple, Google, email'),{mode:'up'}],['A02',L('Вход','Sign in'),{mode:'in'}],['A03',L('Код из письма','Email code'),{email:'alex@mail.com',mode:'up'}],['A04',L('Профиль и дата рождения','Profile & date of birth'),{email:'new@mail.com',via:'google'}],['A04X',L('Младше 18','Under 18')],['A05',L('Кто ты (необязательно)','Who you are (optional)'),{step:1}],['A05',L('Интересы и сообщества','Interests & communities'),{step:2}],['A05',L('Первый тест','First quiz'),{step:3}]]],
 [L('Лента и события','Feed & events'),[['F01',L('Лента · для тебя','Feed · for you'),{sub:'foryou'}],['F01',L('Подписки','Following'),{sub:'following'}],['F05',L('Публикация и ответы','Post & replies'),{id:'p1'}],['F04',L('Тема #шибари','Topic #shibari'),{id:'shibari'}],['!create',L('Создать: выбор типа','Create: choose type')],['F07',L('Редактор публикации','Post editor'),{type:'text'}],['F07',L('Редактор опроса','Poll editor'),{type:'poll'}],['F10',L('Мои публикации','My posts')],['E00',L('События','Events')],['E03',L('Событие с заявкой','Event with application'),{id:'e1'}],['E03',L('Онлайн-событие','Online event'),{id:'e2'}],['E03',L('Билет у организатора','External ticket'),{id:'e3'}],['E03',L('Отменённое событие','Cancelled event'),{id:'e7'}],['E06',L('Заявка на участие','Application form'),{id:'e4'}],['E10',L('Мои события','My events')],['E11',L('Создать событие','Create event')],['E15',L('Панель организатора','Organiser panel'),{id:'e8'}],['E16',L('Заявки участников','Attendee applications'),{id:'e8'}]]],
 [L('Люди','People'),[['D03',L('Подборка со свайпами','Discover deck'),{sub:'discover'}],['!datingOff',L('Знакомства выключены','Dating is off')],['D02',L('Включить знакомства','Turn on dating')],['D04',L('Фильтры знакомств','Dating filters')],['D03',L('Симпатии','Likes'),{sub:'likes'}],['H01',L('Взаимные контакты','Mutual contacts'),{sub:'chats'}],['!match',L('Это взаимно','It’s mutual')],['D09',L('Просмотренные','Recently viewed')],['!deckEnd',L('Анкеты закончились','Nobody left')]]],
 [L('Профили и доступы','Profiles & access'),[['P01',L('Профиль · Mia','Profile · Mia'),{id:'mia'}],['P01',L('Профиль без знакомств · Maya','Social-only profile · Maya'),{id:'maya'}],['P01',L('Профиль пары','Couple profile'),{id:'tomeva'}],['P05',L('Что у вас общего','Shared interests'),{id:'mia'}],['!req',L('Запрос доступа','Request access')],['P07',L('Доступы · ко мне','Access · received'),{tab:'in'}],['P07',L('Доступы · мои запросы','Access · sent'),{tab:'out'}],['!grant',L('Что открыть (решение)','What to share (decision)')],['P08',L('Открытый мне профиль','Profile shared with me'),{id:'mia'}],['P03',L('Мой профиль глазами других','My profile as others see it')],['P02',L('Редактор профиля','Edit profile')],['P04',L('Расширенный профиль','Private profile')]]],
 [L('Сообщества','Communities'),[['C01',L('Каталог','Discover'),{sub:'discover'}],['C01',L('Мои сообщества','Joined'),{sub:'joined'}],['C03',L('Открытое сообщество','Open community'),{id:'rope'}],['C03',L('Закрытое сообщество','Closed community'),{id:'queer'}],['C06',L('Обсуждение','Discussion'),{id:'d1'}],['C07',L('Новое обсуждение','New discussion'),{id:'rope'}],['C08',L('Создать сообщество','Create community')]]],
 [L('Чаты и уведомления','Chats & notifications'),[['H01',L('Чаты','Chats'),{sub:'chats'}],['H01',L('Совместные чаты','Couple chats'),{kind:'couple'}],['H02',L('Диалог','Conversation'),{id:'mia'}],['H02',L('Новый диалог: с чего начать','New chat: starters'),{id:'sofi'}],['N01',L('Уведомления','Notifications')]]],
 [L('Я','Me'),[['X01',L('Раздел «Я»','Me hub')],['!jar',L('Отметка по теме','Topic entry')],['X05',L('Тесты','Quizzes')],['X04',L('История карты','Map history')],['!topic',L('Тема в чужом профиле','Topic on someone’s profile')],['X07',L('Описание теста','About quiz'),{id:'rope'}],['X08',L('Вопрос теста','Quiz question'),{id:'rope'}],['!result',L('Результат теста','Quiz result')],['G04',L('Сохранённое','Saved')],['G01',L('Поиск с фильтрами','Search with filters'),{scope:'all'}]]],
 [L('Настройки и Premium','Settings & Premium'),[['K01',L('Настройки','Settings')],['K04',L('Приватность','Privacy')],['K05',L('Уведомления','Notifications')],['K06',L('Вход и сессии','Sign-in & sessions')],['K07',L('Данные и удаление','Data & deletion')],['K03',L('Тема','Appearance')],['B01','Premium'],['!paywall',L('Окно Premium (возврат анкеты)','Premium popup (undo)')],['!limit',L('Лимит запросов','Request limit')],['A07',L('Проверка возраста','Age check')]]],
];
const QA_RUN={
 create:()=>{qaApp('F01',{sub:'foryou'});setTimeout(()=>ACT.create(),300);},
 datingOff:()=>{qaApp('D03',{sub:'discover'});S.me.dating=false;refresh();},
 match:()=>{qaApp('D03',{sub:'discover'});setTimeout(()=>showMatch('kira'),200);},
 deckEnd:()=>{qaApp('D03',{sub:'discover'});S.deckOrder.forEach(id=>S.decided[id]=S.decided[id]||-1);refresh();},
 req:()=>{qaApp('P01',{id:'kira'});setTimeout(()=>{S.reqOut=S.reqOut.filter(x=>x.p!=='kira');ACT.reqAccess({dataset:{v:'kira'}});},300);},
 grant:()=>{qaApp('P07',{tab:'in'});setTimeout(()=>{const r=S.reqIn.find(x=>x.status==='new');if(r)ACT.grant({dataset:{v:r.id}});},300);},
 jar:()=>{qaApp('X01',{});setTimeout(()=>openJar('bondage'),300);},
 result:()=>{S.me.tests.senses={done:true,step:7,ans:{touch:10,sensory:8,temperature:6,wax:'discuss',massage:9,tickling:3,deprivation:'hard'},t:Date.now()};qaApp('X09',{id:'senses'});},
 paywall:()=>{qaApp('D03',{sub:'discover'});setTimeout(()=>paywall('undo'),300);},
 topic:()=>{qaApp('P01',{id:'mia'});setTimeout(()=>openTopic('shibari','mia'),300);},
 limit:()=>{qaApp('P01',{id:'ari'});S.reqOut=Array.from({length:S.quota.max},(_,i)=>({id:'quota'+i,p:'quota'+i,status:'pending',t:Date.now()-i*1000,scopes:['info']}));setTimeout(()=>ACT.reqAccess({dataset:{v:'ari'}}),300);},
};
function qaApp(id,p={}){
 if(!S.session)signIn(S.persona==='pair'?'pair':'full');
 closeSheet(true);ACT.matchClose&&$('#matchLayer').innerHTML&&ACT.matchClose();
 const t=ROOT_TAB[id]||SC[id].tab||S.nav.tab;
 S.nav.tab=t;S.nav.stacks[t].length=1;
 if(ROOT_TAB[id]){Object.assign(S.nav.stacks[t][0].p,p);S.nav.stacks[t][0].scroll=0;render('fade');}
 else{const st=S.nav.stacks[t];st.push({id,p:{...p},f:{}});render('fwd');}
}
function qaGo(id,p){
 closeSheet(true);if($('#matchLayer').innerHTML)ACT.matchClose();
 if(id[0]==='!'){QA_RUN[id.slice(1)]();return;}
 if(SC[id].auth||id==='A04X'){S.session=null;initNav();if(id!=='A01'){if(id==='A04X')S.nav.auth.push({id:'A04',p:{email:'new@mail.com',via:'email'},f:{}});S.nav.auth.push({id,p:{...p},f:{}});}render('fade');return;}
 if(id==='Q03'&&S.pair?.status!=='active')signIn('pair');
 qaApp(id,p);
}
function qaRender(){const q='';const r=cur();
 $('#qaNav').innerHTML=QA_LIST().map(([g,items])=>{const it=items.filter(([id,l])=>!q||l.toLowerCase().includes(q)||id.toLowerCase().includes(q));return it.length?`<div class="qa-g">${g}</div>${it.map(([id,l,p],k)=>`<button class="qa-l ${r&&r.id===id&&JSON.stringify(p||{})===JSON.stringify(Object.fromEntries(Object.entries(r.p).filter(([k2])=>p&&k2 in p)))?'on':''}" data-qa="${id}" data-qp='${JSON.stringify(p||{})}'><code>${id[0]==='!'?'···':id}</code><span>${l}</span></button>`).join('')}`:'';}).join('');
 const th=themePref();
 $('#qaOpts').innerHTML=[[L('Техработы (админка)','Maintenance (admin)'),[['off',L('Выключены','Off')],['on',L('Включены','On')]],QA.maintenance?'on':'off','qaMaintenance'],[L('Язык','Language'),[['ru','RU'],['en','EN']],S.lang,'qaLang'],[L('Тема','Theme'),[['light',L('Светлая','Light')],['dark',L('Тёмная','Dark')],['auto',L('Авто','Auto')]],th,'qaTheme'],[L('Ширина','Width'),[['auto',L('Окно','Window')],['compact','320'],['phone','390'],['tablet','768'],['landscape','1024'],['desktop','1440']],QA.frame,'qaFrame'],[L('Сеть','Network'),[['on',L('Есть','Online')],['off',L('Нет','Offline')]],QA.offline?'off':'on','qaNet'],[L('Фото-проверка','Photo check'),[['ok',L('Одобрить','Approve')],['no',L('Отклонить','Reject')]],'','qaPv'],[L('Подарок','Gift'),[['get',L('Получить Premium','Receive Premium')]],'','qaGift'],[L('Часы чата','Chat clock'),[['0',L('Сейчас','Now')],['15','+15 мин'],['120','+2 ч'],['1440','+24 ч']],String(Math.round((QA.clockShift||0)/60e3)),'qaClock'],[L('Проверяемый участник','Test participant'),[['me',L('Alex','Alex')],['partner',L('Партнёр','Partner')]],S.pairMember||'me','qaPairMember'],[L('Пара: тестовые действия','Couple: test actions'),[['invite',L('Открыть приглашение','Open invitation')],['incoming',L('Входящие','Incoming')],['member',L('Вступить: партнёр','Partner: join')],['leave',L('Выйти: партнёр','Partner: leave')],['blocked',L('Ограничить: партнёр','Restrict partner')],['unblock',L('Снять ограничение','Unrestrict partner')],['photos',L('Фото для пары','Couple photos')],['expire',L('+31 день','+31 days')]],'','qaPairAction'],[L('Аккаунт','Account'),[['full',L('Заполненный','Filled')],['pair',L('В паре','Couple')],['new',L('Новый','New')]],S.persona,'qaPersona'],['Premium',[['0',L('Нет','Off')],['1',L('Есть','On')]],S.me.premium?'1':'0','qaPrem'],[L('Знакомства в админке','Dating (admin)'),[['on',L('Включены','On')],['off',L('Скоро','Soon')]],QA.datingLive===false?'off':'on','qaDating'],[L('Логотип','Logo'),[['a','A'],['b','B'],['c','C']],QA.logo||'a','qaLogo'],[L('Мои запросы','My requests'),[['wait',L('Ждать ответа','Wait for answer')],['yes',L('Одобрять сразу','Approve at once')]],QA.autoApprove?'yes':'wait','qaAuto'],[L('Длина текстов','Text length'),[['off',L('Обычные','Normal')],['on',L('Длинные','Long')]],QA.long?'on':'off','qaLongT'],[L('Тексты без пробелов','Unbroken text'),[['off',L('Обычные','Normal')],['on',L('Без пробелов','No spaces')]],QA.nosp?'on':'off','qaNosp'],[L('Опасные символы','Hostile input'),[['off',L('Обычные','Normal')],['on',L('Теги и спецсимволы','Tags & symbols')]],QA.xss?'on':'off','qaXss'],[L('Проверка возраста','Age check'),[['off',L('По дате рождения','By birth date')],['on',L('Обязательна','Required')]],QA.ageRequired?'on':'off','qaAge']].map(([t,items,v,act])=>`<div class="qa-opt"><span>${t}</span>${seg(items,v,act)}</div>`).join('');
 $('#qaHint').innerHTML=L('Коды подтверждения: <b>000000</b> — неверный, <b>999999</b> — истёк, любой другой — верный. Почта <b>limit@…</b> — лимит отправки. Ник <b>alex</b> занят.','Codes: <b>000000</b> wrong, <b>999999</b> expired, any other works. Email <b>limit@…</b> hits the send limit. Nickname <b>alex</b> is taken.')+`<button class="btn secondary mt12" data-act="qaRestart">${L('Начать регистрацию заново','Restart registration')}</button><span class="note">${L('Очистит текущую сессию прототипа и откроет приветствие.','Clears this prototype session and opens the welcome screen.')}</span>`;
}
ACT.qaRestart=()=>restartPrototype();
window.FT_QA={go:(id,p)=>qaGo(id,p||{}),list:()=>QA_LIST(),screen:()=>cur()&&cur().id,tab:t=>tab(t),back:()=>back(),field:n=>cur()?.f?.[n],approveAll:()=>{QA.autoApprove=true;return qaApproveAll();},
 stress:on=>qaLong(on!==false)};
/* «Мои запросы → Одобрять сразу» (QA.autoApprove): answers yes to everything the user is waiting for —
   private-profile requests from seed profiles, event applications, closed communities,
   posts with photos, new community / event review, photo verification. New likes become mutual at once (likePerson). */
function qaApproveAll(){if(!S?.session)return 0;let n=0;const now=Date.now(),note=x=>S.notifs.unshift({id:'n'+now+'_'+n,t:now,read:false,...x});
 [S,...(activePair()?[social('couple')]:[])].forEach(st=>st.reqOut.forEach(r=>{if(r.status==='pending'&&PEOPLE[r.p]&&!isBlocked(r.p)){r.status='granted';r.granted=[...r.scopes];r.until=now+7*DAY;note({type:'grant',p:r.p,go:['P08',{id:r.p}]});n++;}}));
 // Pair invitations and all joint consents require the other participant's explicit action, even in QA.

 if(S.pairProposal&&S.pair){S.pair.name={ru:S.pairProposal,en:S.pairProposal};S.pairProposal=null;n++;}
 Object.entries(S.rsvp||{}).forEach(([id,r])=>{if(r.app==='pending'&&EV(id)){r.app='approved';note({type:'evapp',e:id,go:['E03',{id}]});n++;}});
 [...(S.pendingJoin||[])].forEach(id=>{if(!COMMUNITIES[id])return;S.pendingJoin.delete(id);S.joined.add(id);(S.communityRequests[id]||[]).forEach(q=>{if(q.p==='me'&&q.status==='pending'){q.status='approved';q.updated=now;}});note({type:'groupok',c:id,go:['C03',{id}]});n++;});
 (S.myPosts||[]).forEach(p=>{if(p.status==='review'){p.status='published';note({type:'postok',go:['F10',{}]});n++;}});
 Object.entries(COMMUNITIES).forEach(([id,c])=>{if(c.status==='review'&&S.managedCommunities?.has(id)){delete c.status;n++;}});
 Object.entries(S.extraEvents||{}).forEach(([id,e])=>{if(e.status==='review'){e.status='published';note({type:'evok',e:id,go:['E15',{id}]});n++;}});
 if(S.me.photoCheck==='pending'){pvResolve(true);n++;}
 if(n){refresh();renderSide();toast(L(`Одобрено сразу: ${n}`,`Approved at once: ${n}`),{type:'ok'});}return n;}
/* «Длинные тексты»: worst-case lengths at the input limits, switchable in the review panel or with ?long=1.
   Nicknames 20 (the only public name; limit 20), community 50, event 80, discussion title 120, bio 500, long real city names.
   The original seed values are kept and restored when the switch goes back to «Обычные». */
const LONG={snap:null};
function qaLong(on){
 if(on&&NOSP.on)qaNosp(false);
 if(!LONG.snap)LONG.snap={people:Object.fromEntries(Object.entries(PEOPLE).map(([k,p])=>[k,{name:p.name,nameRu:p.nameRu,bio:p.bio}])),city:{...CITY},comm:Object.fromEntries(Object.entries(COMMUNITIES).map(([k,c])=>[k,{name:c.name,desc:c.desc}])),ev:Object.fromEntries(Object.entries(EVENTS).map(([k,e])=>[k,e.title])),disc:(S.discussions||[]).map(d=>d.title)};
 const o=LONG.snap;QA.long=on;
 if(!on){Object.entries(o.people).forEach(([k,v])=>{if(PEOPLE[k])Object.assign(PEOPLE[k],v);});Object.assign(CITY,o.city);Object.entries(o.comm).forEach(([k,v])=>{if(COMMUNITIES[k])Object.assign(COMMUNITIES[k],v);});Object.entries(o.ev).forEach(([k,v])=>{if(EVENTS[k])EVENTS[k].title=v;});(S.discussions||[]).forEach((d,i)=>{if(o.disc[i]!=null)d.title=o.disc[i];});if(LONG.me){Object.assign(S.me,LONG.me);LONG.me=null;}refresh();return;}
 const nm=['alexandrina.maximila','konstantin.wolfgang1','anastasia_valentina2','jean.baptiste.montgo'];
 const bio={ru:'Говорю прямо и бережно. Люблю долгие переписки, верёвку, медленные вечера и людей, которые заранее обсуждают границы. Первая встреча — только в публичном месте и без спешки. Мне важно, чтобы обе стороны могли остановиться в любой момент и не объяснять почему. Пишу длинно, отвечаю не сразу, но всегда отвечаю. Если сомневаешься — спроси, я лучше объясню ещё раз, чем угадаю. Не люблю сюрпризы и давление, люблю ясные договорённости и смех после. Пишу этот текст до лимита, чтобы проверить, как ведёт себя длинное описание в профиле.'.slice(0,500),en:'I speak plainly and kindly. I love long chats, rope, slow evenings and people who talk about boundaries first. First meeting only in a public place and without rushing. Both sides must be able to stop at any moment without explaining why. I write long and reply slowly, but I always reply. If unsure, ask — I would rather explain twice than guess. No surprises or pressure; clear agreements and laughter after. This text runs to the limit to test a long profile description.'.slice(0,500)};
 Object.keys(PEOPLE).forEach((id,i)=>{const p=PEOPLE[id];p.name=nm[i%nm.length];if(p.nameRu)p.nameRu=nm[i%nm.length];if(i%3===0)p.bio=bio;});
 if(!LONG.me)LONG.me={nick:S.me.nick};S.me.nick='alexandra.valentina1';
 Object.keys(CITY).forEach((k,i)=>{CITY[k]=i%2?{ru:'Гармиш-Партенкирхен',en:'Garmisch-Partenkirchen'}:{ru:'Франкфурт-на-Майне',en:'Frankfurt am Main'};});
 Object.values(COMMUNITIES).forEach(c=>{c.name={ru:'Верёвочные практики и разговоры о границах для новых'.slice(0,50),en:'Rope practice and boundary talks for curious beginners'.slice(0,50)};});
 Object.values(EVENTS).forEach(e=>{e.title={ru:'Большой вечер знакомства для новичков: верёвка, разговоры, правила и согласие'.slice(0,80),en:'Big newcomers evening: rope, conversations, house rules and consent basics'.slice(0,80)};});
 (S.discussions||[]).forEach(d=>{d.title={ru:'Как вы договариваетесь о стоп-словах и сигналах, если партнёр новичок и стесняется говорить прямо?'.slice(0,120),en:'How do you agree on safewords and signals when your partner is new and shy about saying things directly?'.slice(0,120)};});
 refresh();}
/* «Тексты без пробелов» (QA.nosp, ?nospace=1): every user-visible free-text field gets ONE unbroken string of the field's maximum length
   (limits come from the forms: nickname 20, bio 500, community name 50, event title 80, discussion title 120, comment 1000, chat message 2000 …;
   fields with no limit get 600). Cyrillic, Latin, digits, wide capitals, a URL and an e-mail rotate across fields.
   Data only: ids, routes, enums, photo URLs and timestamps are never touched. Nothing is stored — the original value of every field is kept
   in NOSP.log and put back on «Обычные». Content created while the mode is on (new posts, replies, chat answers…) is substituted too,
   unless the tester already typed an unbroken string of a comparable length. Re-applied before every screen/sheet render, so lazily created data is covered. */
const NOSP={on:false,kind:'text',log:[],seen:new WeakMap(),byPut:new Map(),n:0};
const NOSP_NOLIMIT=600;
const NOSP_CHUNK={cyr:'Непрерывнаястрокабезпробеловсверхдлинноеслово',lat:'Unbreakablestringwithoutanyspacesoverflowcheck',mix:'ПриветWorldДлинноеСловоLongWord2026Ёё',num:'01234567890123456789',wide:'WМШЩWМШЩЖЫWMШЩ'};
/* «Опасные символы» (QA.xss): instead of long words, hostile strings — tags, event handlers, javascript: links, broken markup,
   Markdown, template syntax, bidi/zero-width/combining marks, control characters, SQL/path strings. Every script payload calls
   window.__x(id), so a test can see exactly which field executed. Same data-only, restorable machinery as «Без пробелов». */
window.__x=id=>{(window.__xssHits=window.__xssHits||[]).push(id);};
function nospPayload(tag,lim,n,nick){
 const id=n.toString(36);
 if(tag==='link'||tag==='ext')return `javascript:__x('${id}')//https://example.com`.slice(0,lim);
 const short=[`"><b data-xss=${id}>x`,`<b data-xss=${id}>x</b>&'`,`'"&<>;${id}`,`\u202E${id}\u200Dabc`,`<i/onclick=__x(${id})>`,`{{7*7}}\${id}`];
 if(nick||lim<48)return short[n%short.length].slice(0,lim);
 const P=[
  `<img src=x onerror=__x('${id}')>`,
  `<script>__x('${id}')</script>`,
  `"><svg onload=__x('${id}')>`,
  `'"><iframe srcdoc="<script>parent.__x('${id}')</script>"></iframe>`,
  `</h2></div></section></main><b id=brk${id} style="position:fixed;inset:0;background:red">BRK</b>`,
  `[x](javascript:__x('${id}')) [y](https://e.x/a"onmouseover="__x('${id}')) <a href="javascript:__x('${id}')">l</a>`,
  '{{constructor.constructor("__x(\''+id+'\')")()}} ${__x(\''+id+'\')} %s %n \\x00 \\u0000',
  `&lt;img src=x onerror=__x('${id}')&gt; &#60;b&#62; &amp;amp; &#x3C;script&#x3E;`,
  `\u202E\u2066RTL-OVERRIDE\u2069\u200B\u200D\uFEFF${id} \u202Dtext`,
  `Z̷̢̛̖͓̰a̸̺͉̽l̴̡̛g̵̨͚o̷͍̓ ${'\u0336\u0334\u0335\u0337\u0489'.repeat(40)} ${id}`,
  `<style>*{display:none!important}</style><meta http-equiv=refresh content="0;url=javascript:__x('${id}')"><base href="https://evil.example/">`,
  `**bold** _it_ ~~s~~ \`code\` \n# h\n- li\n> q\n\n\n![img](https://x.y/a.png) [a](https://x.y) ${id}`,
  `\u0000\u0001\r\n\t<!--${id}--><![CDATA[x]]><?php echo 1 ?>`,
  `data:text/html,<script>__x('${id}')</script> vbscript:x file:///etc/passwd`,
  `'; DROP TABLE users;-- ' OR 1=1 -- ../../etc/passwd %2e%2e%2f %00 ${id}`,
  `<a href=# onclick="__x('${id}')" onmouseover=__x('${id}')>click</a><input autofocus onfocus=__x('${id}')><details open ontoggle=__x('${id}')>`
 ];
 return P[n%P.length].slice(0,lim);
}
function nospGen(tag,lim,n,nick){
 if(NOSP.kind==='xss'){(NOSP.ids=NOSP.ids||{})[n.toString(36)]=tag;return nospPayload(tag,lim,n,nick);}
 const rep=(c,k)=>c.repeat(Math.ceil(k/c.length)+1).slice(0,k);
 const id=n.toString(36); // every generated value is unique, so copies made from it can be traced back and restored
 if(nick){const v=[()=>rep('alexandrina.maximila',lim),()=>rep('W',lim),()=>rep('m_W.',lim),()=>rep(NOSP_CHUNK.num,lim)];return (id+v[n%v.length]()).slice(0,lim);}
 const flavors=['cyr','lat','mix','url','email','num','wide'];let f=flavors[n%flavors.length];
 if(lim<40&&(f==='url'||f==='email'))f='lat';
 const pre=tag+id+':',room=Math.max(1,lim-pre.length);
 let body;
 if(f==='url'){const head='https://example.com/';body=room>head.length+20?head+rep('Unbreakablepathsegment0123456789?q=ПриветWorld&x=1',room-head.length):rep(NOSP_CHUNK.lat,room);}
 else if(f==='email'){const dom='@verylongsubdomainnamewithoutspaces.example.org';body=room>dom.length+20?rep('first.last.nospaces.',room-dom.length)+dom:rep(NOSP_CHUNK.lat,room);}
 else body=rep(NOSP_CHUNK[f],room);
 return (pre+body).slice(0,lim);
}
/* a value the tester typed already looks like the stress string — leave it alone */
const nospTyped=(v,lim)=>v!==''&&!/\s/.test(v)&&v.length>=Math.min(Math.round(lim*.6),100);
function nospSet(h,k,lim,tag,nick){
 const cur=h[k];if(typeof cur!=='string'||cur===''||cur==='—')return;
 let m=NOSP.seen.get(h);if(!m)NOSP.seen.set(h,m={});
 const e=m[k];if(e&&cur===e.put)return;
 if(nospTyped(cur,lim))return;
 const put=nospGen(tag,lim,NOSP.n++,nick);
 const rec={h,k,orig:cur,put};m[k]=rec;NOSP.log.push(rec);NOSP.byPut.set(put,cur);h[k]=put;
}
/** a text field that is either a plain string or {ru,en}; lim may be a number or [ru,en] */
function nospSub(h,k,lim,tag,nick){
 if(!h)return;const v=h[k];if(v==null)return;
 if(typeof v==='string')nospSet(h,k,lim,tag,nick);
 else if(typeof v==='object'){for(const l of ['ru','en'])if(typeof v[l]==='string')nospSet(v,l,lim,tag+l,nick);}
}
const nospEach=(list,f)=>{if(Array.isArray(list))list.forEach(f);else if(list&&typeof list==='object')Object.values(list).forEach(f);};
function nospApply(){
 if(!NOSP.on||typeof S==='undefined'||!S)return;
 const N=NOSP_NOLIMIT;
 Object.entries(PEOPLE).forEach(([id,p])=>{const lim=p.pair?60:20;nospSub(p,'name',lim,'nick',!p.pair);nospSub(p,'nameRu',60,'nick');nospSub(p,'bio',500,'bio');nospSub(p,'privText',1000,'priv');nospSub(p,'pairNote',100,'pair');});
 Object.entries(CITY).forEach(([id,c])=>{if(id==='online'||!c)return;nospSub(c,'ru',60,'city');nospSub(c,'en',60,'city');});
 Object.values(COMMUNITIES).forEach(c=>{nospSub(c,'name',50,'comm');nospSub(c,'desc',500,'cdesc');const rl=(c.rules||[]).length||1;nospEach(c.rules,r=>{nospSub(r,'ru',Math.floor(1000/rl),'rule');nospSub(r,'en',Math.floor(1000/rl),'rule');});nospEach(c.questions,q=>{nospSub(q,'ru',120,'cq');nospSub(q,'en',120,'cq');});});
 const ev=e=>{if(!e)return;nospSub(e,'title',80,'ev');nospSub(e,'desc',1500,'edesc');nospSub(e,'area',N,'area');nospSub(e,'venue',N,'venue');nospSub(e,'price',N,'price');nospSub(e,'cancelled',300,'cancel');nospSet(e,'link',N,'link');nospSet(e,'external',N,'ext');
  const rl=(e.reqs||[]).length||1;nospEach(e.reqs,r=>{nospSub(r,'ru',Math.floor(500/rl),'req');nospSub(r,'en',Math.floor(500/rl),'req');});
  nospEach(e.q,q=>{nospSub(q,'ru',120,'eq');nospSub(q,'en',120,'eq');});nospEach(e.apps,a=>nospSub(a,'answer',300,'ans'));nospEach(e.announce,a=>nospSub(a,'text',500,'ann'));};
 Object.values(EVENTS).forEach(ev);Object.values(S.extraEvents||{}).forEach(ev);
 const m=S.me;if(m){nospSet(m,'nick',20,'nick',true);nospSub(m,'bio',500,'bio');nospSub(m,'privText',1000,'priv');nospSet(m,'email',120,'mail');nospEach(m.journal,j=>nospSub(j,'text',1000,'jrn'));}
 const post=p=>{nospSub(p,'text',1000,'post');nospSub(p,'pollQ',200,'pollq');nospEach(p.poll,o=>Array.isArray(o)?nospSub(o,0,80,'opt'):nospSub(o,'t',80,'opt'));nospEach(p.comments,c=>nospSub(c,'text',1000,'cmt'));};
 (S.posts||[]).forEach(post);(S.myPosts||[]).forEach(post);Object.values(S.postEdits||{}).forEach(x=>x&&typeof x==='object'&&post(x));
 (S.discussions||[]).forEach(d=>{nospSub(d,'title',120,'disc');nospSub(d,'text',3000,'dtext');nospEach(d.replies,r=>nospSub(r,'text',1000,'rep'));});
 Object.values(S.threads||{}).forEach(t=>nospEach(t.msgs,x=>nospSub(x,'text',2000,'msg')));
 (S.updates||[]).forEach(u=>nospSub(u,'text',500,'upd'));
 Object.values(S.communityRequests||{}).forEach(l=>nospEach(l,q=>nospSub(q,'answer',300,'join')));
 const pr=S.pair;if(pr){nospSub(pr,'name',60,'pname');nospSub(pr,'desc',500,'pdesc');nospSub(pr,'rules',1000,'prules');if(pr.proposal)nospSub(pr.proposal,'text',500,'prop');
  const pp=pr.profile;if(pp){nospSub(pp,'name',60,'pname');nospSub(pp,'bio',500,'bio');nospSub(pp,'privText',1000,'priv');}}
 if(S.pairInvite)nospSet(S.pairInvite,'nick',20,'nick',true);
 (S.searchRecent||[]).forEach((q,i,a)=>nospSet(a,i,200,'q'));
}
/* copies of substituted values made by the prototype itself (a couple profile cloned from the couple name, drafts …) are put back too */
function nospSweep(o,seen=new WeakSet(),d=0){
 if(!o||typeof o!=='object'||d>9||seen.has(o))return;const pr=Object.getPrototypeOf(o);if(pr!==Object.prototype&&pr!==Array.prototype&&pr!==null)return;seen.add(o);
 for(const k of Object.keys(o)){const v=o[k];if(typeof v==='string'){if(NOSP.byPut.has(v))o[k]=NOSP.byPut.get(v);}else nospSweep(v,seen,d+1);}
}
function qaNosp(on,kind='text'){
 if(on&&QA.long)qaLong(false);
 if(on&&NOSP.on&&NOSP.kind!==kind)qaNosp(false);
 if(!NOSP.on===!on)return;
 NOSP.on=!!on;NOSP.kind=kind;QA.nosp=!!on&&kind==='text';QA.xss=!!on&&kind==='xss';
 if(on){nospApply();}
 else{NOSP.log.forEach(r=>{if(r.h[r.k]===r.put)r.h[r.k]=r.orig;});
  nospSweep(S);[PEOPLE,CITY,COMMUNITIES,EVENTS].forEach(x=>nospSweep(x));
  NOSP.log=[];NOSP.seen=new WeakMap();NOSP.byPut=new Map();NOSP.ids={};NOSP.n=0;}
 refresh();resheet();}
/* every screen / sheet render re-applies the mode first, so data created lazily or by interaction is covered */
Object.values(SC).forEach(sc=>{if(!sc||!sc.render||sc.nospHook)return;const r0=sc.render;sc.render=function(...a){NOSP.on&&nospApply();return r0.apply(this,a);};sc.nospHook=1;});
{const ds0=drawSheet;drawSheet=function(){NOSP.on&&nospApply();return ds0();};}
FT_QA.nospace=on=>qaNosp(on!==false);FT_QA.hostile=on=>qaNosp(on!==false,'xss');FT_QA.hits=()=>window.__xssHits||[];FT_QA.sanitize=on=>{window.__NO_SANITIZE__=on===false;};FT_QA.hostileIds=()=>NOSP.ids||{};FT_QA.nospStat=()=>({on:NOSP.on,fields:NOSP.log.length});
window.QA_SYNC=()=>{if($('#qa.open'))qaRender();};
const qa=$('#qa'),qaScrim=$('#qaScrim');
window.QA_CLOSE=()=>{qa.classList.remove('open');qaScrim.classList.remove('on');qa.setAttribute('aria-hidden','true');syncModal();$('#qaFab').focus({preventScroll:true});};
$('#qaFab').onclick=()=>{qaRender();qa.classList.add('open');qaScrim.classList.add('on');qa.removeAttribute('aria-hidden');syncModal();};
qaScrim.onclick=QA_CLOSE;$('#qaClose').onclick=QA_CLOSE;
qa.addEventListener('click',e=>{
 const b=e.target.closest('[data-qa]');if(b){qaGo(b.dataset.qa,JSON.parse(b.dataset.qp||'{}'));if(matchMedia('(max-width:900px)').matches)QA_CLOSE();else qaRender();return;}
 const a=e.target.closest('[data-act]');if(!a)return;e.stopPropagation();const v=a.dataset.v;
 if(a.dataset.act==='qaRestart'){ACT.qaRestart();return;}
 ({qaNosp:()=>qaNosp(v==='on'),qaXss:()=>qaNosp(v==='on','xss'),qaPairMember:()=>{S.pairMember=v;refresh();resheet();},qaPairAction:()=>ACT.qaPair(a),qaMaintenance:()=>{QA.maintenance=v==='on';if(QA.maintenance){ACT.matchClose?.();$('#matchLayer').innerHTML='';}closeSheet(true);S.ui.ask?.();closeViewer();refresh();},qaLang:()=>{S.lang=v;document.documentElement.lang=v;refresh();resheet();},qaTheme:()=>applyTheme(v),qaFrame:()=>{QA.frame=v;document.body.classList.remove('frame','tablet','compact');document.body.classList.toggle('qa-viewport',v!=='auto');document.body.style.setProperty('--qa-width',({compact:320,phone:390,tablet:768,landscape:1024,desktop:1440}[v]||innerWidth)+'px');refresh();},qaPv:()=>pvResolve(v==='ok'),qaGift:()=>giftReceive(),qaClock:()=>{QA.clockShift=(+v)*60e3;refresh();toast(L('Модельное время чата сдвинуто — только для проверки исчезающих фото','Chat model time shifted — only for testing disappearing media'));},qaNet:()=>{QA.offline=v==='off';refresh();toast(QA.offline?L('Режим «нет сети»: действия будут падать с ошибкой','Offline mode: actions will fail with an error'):L('Сеть восстановлена','Back online'),{type:QA.offline?'warn':'ok'});},qaPersona:()=>{signIn(v);toast(v==='new'?L('Новый пустой аккаунт','New empty account'):v==='pair'?L('Alex в паре с Kira — два отдельных аккаунта','Alex in a couple with Kira — two separate accounts'):L('Заполненный аккаунт Alex','Filled account: Alex'),{type:'ok'});},qaPrem:()=>{S.me.premium=v==='1';refresh();},qaDating:()=>{QA.datingLive=v==='on';refresh();},qaLogo:()=>{QA.logo=v;renderSide();refresh();},qaAge:()=>{QA.ageRequired=v==='on';refresh();},qaLongT:()=>qaLong(v==='on'),qaAuto:()=>{QA.autoApprove=v==='yes';if(QA.autoApprove)qaApproveAll();}}[a.dataset.act]||(()=>{}))();
 qaRender();
},true);

const qaListV6=QA_LIST;QA_LIST=()=>[...qaListV6(),[L('Дополнено в V6','Completed in V6'),[['Q01',L('Связь пары','Couple connection')],['Q03',L('Общий профиль пары (аккаунт «В паре»)','Couple profile (Couple account)')],['P01',L('Половина пары · Eva','Couple member · Eva'),{id:'eva'}],['P10',L('Мои подписчики','My followers'),{id:'me',tab:'followers'}],['P10',L('Подписки Mia','Mia is following'),{id:'mia',tab:'following'}],['P03',L('Как видят: с доступом','Preview: with access'),{lv:'granted'}],['Q02',L('Приглашение','Invitation')],['Q05',L('Общие доступы','Shared grants')],['Q06',L('Разъединить пару','Unlink couple')],['P04',L('Расширенный профиль: фото и видео','Private profile: photos & video')],['K08',L('Ссылки и сравнения','Links and comparisons')],['S01',L('Помощь','Help')]]]];


ACT.qaPair=a=>{const v=a.dataset.v;if(v==='invite'){if(!S.pairInvite){toast(L('Сначала отправьте приглашение в разделе «Я»','Send an invitation from Me first'),{type:'warn'});return;}S.pairMember='partner';QA_CLOSE();ACT.pairInvitationReview();return;}if(v==='expire'){if(S.pair?.status!=='dissolved'){toast(L('Сначала разорвите пару','Unlink the couple first'),{type:'warn'});return;}expirePair(Date.now()+31*DAY);refresh();toast(L('Срок восстановления истёк в модели прототипа','Prototype recovery period expired'));return;}if(!activePair()){toast(L('Нужна активная пара','An active couple is required'),{type:'warn'});return;}const P=S.pair;if(v==='member'||v==='leave'){P.memberCommunities??={};P.memberCommunities[P.with]=v==='member'?['rope','first']:[];refresh();toast(v==='member'?L('Партнёр вступил в rope и first','Partner joined rope and first'):L('Партнёр вышел из сообществ','Partner left communities'));return;}if(v==='blocked'||v==='unblock'){S.communityRestrictions??={};S.communityRestrictions.rope??={};S.communityRestrictions.rope[P.with]=v==='blocked';refresh();toast(v==='blocked'?L('Партнёр ограничен в rope','Partner restricted in rope'):L('Ограничение в rope снято','Restriction removed in rope'));return;}if(v==='photos'){const m=editableProfile({p:{owner:'couple'}});if(!coupleWritable())return;m.photos=['/images/v10-content/post-p7-morning-coffee-45.webp'];m.photo=m.photos[0];markCoupleDraft();if(['P02','P04'].includes(cur().id)&&cur().p.owner==='couple'){cur().photos=[...m.photos];cur().dirty=true;}refresh();toast(L('Тестовое фото добавлено в черновик пары','Test photo added to couple draft'));return;}if(v==='incoming'){const st=social('couple'),id='mia',now=Date.now();if(!st.likesIn.some(x=>x.p===id))st.likesIn.push({p:id,src:'profile',t:now});if(!st.reqIn.some(x=>x.p===id&&x.status==='new'))st.reqIn.push({id:'qr'+now,p:id,scopes:['info','photos'],status:'new',t:now});if(!st.matches.some(x=>x.p===id))st.matches.push({p:id,t:now});const t=ensureThread(id,'couple');t.msgs.push({me:0,sender:id,text:{ru:'Привет вам обоим!',en:'Hello to both of you!'},t:now,media:{type:'image',url:'/images/v10-content/post-p7-morning-coffee-45.webp',mode:'once',recipients:realMembers('couple'),views:{}}});t.unread++;pairNotify('message',String(now),{p:id,go:['H02',{id,actor:'couple'}]});pairNotify('req','qa_mia',{p:id,go:['P07',{owner:'couple'}]});refresh();toast(L('Добавлены сообщение, симпатия и запрос для пары','Couple message, like and request added'));}};
