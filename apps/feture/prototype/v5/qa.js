/* ============ REVIEW DRAWER (prototype-only tooling, not product UI) ============ */
const QA_LIST=()=>[
 [L('Вход и регистрация','Sign in & sign up'),[['A01',L('Приветствие','Welcome')],['A02',L('Регистрация: Apple, Google, почта','Sign up: Apple, Google, email'),{mode:'up'}],['A02',L('Вход','Sign in'),{mode:'in'}],['A03',L('Код из письма','Email code'),{email:'alex@mail.com',mode:'up'}],['A04',L('Профиль и дата рождения','Profile & date of birth'),{email:'new@mail.com',via:'google'}],['A04X',L('Младше 18','Under 18')],['A05',L('Кто ты (необязательно)','Who you are (optional)'),{step:1}],['A05',L('С чего начать','Where to start'),{step:2}]]],
 [L('Лента и события','Feed & events'),[['F01',L('Лента · для тебя','Feed · for you'),{sub:'foryou'}],['F01',L('Подписки','Following'),{sub:'following'}],['F05',L('Публикация и ответы','Post & replies'),{id:'p1'}],['F04',L('Тема #шибари','Topic #shibari'),{id:'shibari'}],['!create',L('Создать: выбор типа','Create: choose type')],['F07',L('Редактор публикации','Post editor'),{type:'text'}],['F07',L('Редактор опроса','Poll editor'),{type:'poll'}],['F10',L('Мои публикации','My posts')],['F01',L('События','Events'),{sub:'events'}],['E03',L('Событие с заявкой','Event with application'),{id:'e1'}],['E03',L('Онлайн-событие','Online event'),{id:'e2'}],['E03',L('Билет у организатора','External ticket'),{id:'e3'}],['E03',L('Отменённое событие','Cancelled event'),{id:'e7'}],['E06',L('Заявка на участие','Application form'),{id:'e4'}],['E10',L('Мои события','My events')],['E11',L('Создать событие','Create event')],['E15',L('Панель организатора','Organiser panel'),{id:'e8'}],['E16',L('Заявки участников','Attendee applications'),{id:'e8'}]]],
 [L('Люди','People'),[['D03',L('Подборка со свайпами','Discover deck'),{sub:'discover'}],['!datingOff',L('Знакомства выключены','Dating is off')],['D02',L('Включить знакомства','Turn on dating')],['D04',L('Фильтры знакомств','Dating filters')],['D03',L('Симпатии','Likes'),{sub:'likes'}],['D03',L('Совпадения','Matches'),{sub:'matches'}],['!match',L('Это взаимно','It’s mutual')],['D09',L('Просмотренные','Recently viewed')],['!deckEnd',L('Анкеты закончились','Nobody left')]]],
 [L('Профили и доступы','Profiles & access'),[['P01',L('Профиль · Mia','Profile · Mia'),{id:'mia'}],['P01',L('Профиль без знакомств · Maya','Social-only profile · Maya'),{id:'maya'}],['P01',L('Профиль пары','Couple profile'),{id:'tomeva'}],['P05',L('Что у вас общего','Shared interests'),{id:'mia'}],['!req',L('Запрос доступа','Request access')],['P07',L('Доступы · ко мне','Access · received'),{tab:'in'}],['P07',L('Доступы · мои запросы','Access · sent'),{tab:'out'}],['!grant',L('Что открыть (решение)','What to share (decision)')],['P08',L('Открытый мне профиль','Profile shared with me'),{id:'mia'}],['P03',L('Мой профиль глазами других','My profile as others see it')],['P02',L('Редактор профиля','Edit profile')],['P04',L('Расширенный профиль','Private profile')]]],
 [L('Сообщества','Communities'),[['C01',L('Каталог','Discover'),{sub:'discover'}],['C01',L('Мои сообщества','Joined'),{sub:'joined'}],['C03',L('Открытое сообщество','Open community'),{id:'rope'}],['C03',L('Закрытое сообщество','Closed community'),{id:'queer'}],['C06',L('Обсуждение','Discussion'),{id:'d1'}],['C07',L('Новое обсуждение','New discussion'),{id:'rope'}],['C08',L('Создать сообщество','Create community')]]],
 [L('Чаты и уведомления','Chats & notifications'),[['H01',L('Чаты','Chats'),{sub:'chats'}],['H01',L('Обновления','Updates'),{sub:'updates'}],['H02',L('Диалог','Conversation'),{id:'mia'}],['H02',L('Новый диалог: с чего начать','New chat: starters'),{id:'sofi'}],['N01',L('Уведомления','Notifications')]]],
 [L('Я','Me'),[['X01',L('Моя карта','My map'),{sub:'map'}],['!jar',L('Отметка по теме','Topic entry')],['X04',L('История карты','Map history')],['X01',L('Изучить','Explore'),{sub:'explore'}],['X06',L('Тема и знания','Topic guide'),{id:'aftercare'}],['X07',L('Описание теста','About quiz'),{id:'roles'}],['X08',L('Вопрос теста','Quiz question'),{id:'roles'}],['!result',L('Результат теста','Quiz result')],['X01',L('Дневник','Journal'),{sub:'journal'}],['X14',L('Новая запись','New entry')],['G04',L('Сохранённое','Saved')],['G01',L('Поиск с фильтрами','Search with filters'),{scope:'all'}]]],
 [L('Настройки и Premium','Settings & Premium'),[['K01',L('Настройки','Settings')],['K04',L('Приватность','Privacy')],['K05',L('Уведомления','Notifications')],['K06',L('Вход и сессии','Sign-in & sessions')],['K07',L('Данные и удаление','Data & deletion')],['K03',L('Тема','Appearance')],['B01','Premium'],['!limit',L('Лимит запросов','Request limit')],['A07',L('Проверка возраста','Age check')]]],
];
const QA_RUN={
 create:()=>{qaApp('F01',{sub:'foryou'});setTimeout(()=>ACT.create(),300);},
 datingOff:()=>{qaApp('D03',{sub:'discover'});S.me.dating=false;refresh();},
 match:()=>{qaApp('D03',{sub:'discover'});setTimeout(()=>showMatch('kira'),200);},
 deckEnd:()=>{qaApp('D03',{sub:'discover'});S.deckOrder.forEach(id=>S.decided[id]=S.decided[id]||-1);refresh();},
 req:()=>{qaApp('P01',{id:'kira'});setTimeout(()=>{S.reqOut=S.reqOut.filter(x=>x.p!=='kira');ACT.reqAccess({dataset:{v:'kira'}});},300);},
 grant:()=>{qaApp('P07',{tab:'in'});setTimeout(()=>{const r=S.reqIn.find(x=>x.status==='new');if(r)ACT.grant({dataset:{v:r.id}});},300);},
 jar:()=>{qaApp('X01',{sub:'map'});setTimeout(()=>openJar('bondage'),300);},
 result:()=>{S.me.tests.roles={done:true,step:5,ans:{0:4,1:2,2:'practice',3:'try',4:0,5:5},t:Date.now()};qaApp('X09',{id:'roles'});},
 limit:()=>{qaApp('P01',{id:'ari'});S.quota.used=S.quota.max;setTimeout(()=>ACT.reqAccess({dataset:{v:'ari'}}),300);},
};
function qaApp(id,p={}){
 if(!S.session)signIn('full');
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
 qaApp(id,p);
}
function qaRender(){const q=($('#qaQ')?.value||'').toLowerCase();const r=cur();
 $('#qaNav').innerHTML=QA_LIST().map(([g,items])=>{const it=items.filter(([id,l])=>!q||l.toLowerCase().includes(q)||id.toLowerCase().includes(q));return it.length?`<div class="qa-g">${g}</div>${it.map(([id,l,p],k)=>`<button class="qa-l ${r&&r.id===id&&JSON.stringify(p||{})===JSON.stringify(Object.fromEntries(Object.entries(r.p).filter(([k2])=>p&&k2 in p)))?'on':''}" data-qa="${id}" data-qp='${JSON.stringify(p||{})}'><code>${id[0]==='!'?'···':id}</code><span>${l}</span></button>`).join('')}`:'';}).join('');
 const th=themePref();
 $('#qaOpts').innerHTML=[[L('Язык','Language'),[['ru','RU'],['en','EN']],S.lang,'qaLang'],[L('Тема','Theme'),[['light',L('Светлая','Light')],['dark',L('Тёмная','Dark')],['auto',L('Авто','Auto')]],th,'qaTheme'],[L('Ширина','Width'),[['auto',L('Окно','Window')],['phone',L('Телефон','Phone')],['tablet',L('Планшет','Tablet')]],QA.frame,'qaFrame'],[L('Сеть','Network'),[['on',L('Есть','Online')],['off',L('Нет','Offline')]],QA.offline?'off':'on','qaNet'],[L('Аккаунт','Account'),[['full',L('Заполненный','Filled')],['new',L('Новый','New')]],S.persona,'qaPersona'],['Premium',[['0',L('Нет','Off')],['1',L('Есть','On')]],S.me.premium?'1':'0','qaPrem']].map(([t,items,v,act])=>`<div class="qa-opt"><span>${t}</span>${seg(items,v,act)}</div>`).join('');
 $('#qaHint').innerHTML=L('Коды подтверждения: <b>000000</b> — неверный, <b>999999</b> — истёк, любой другой — верный. Почта <b>limit@…</b> — лимит отправки. Ник <b>alex</b> занят.','Codes: <b>000000</b> wrong, <b>999999</b> expired, any other works. Email <b>limit@…</b> hits the send limit. Nickname <b>alex</b> is taken.');
}
window.FT_QA={go:(id,p)=>qaGo(id,p||{}),list:()=>QA_LIST(),screen:()=>cur()&&cur().id};
window.QA_SYNC=()=>{if($('#qa.open'))qaRender();};
const qa=$('#qa'),qaScrim=$('#qaScrim');
window.QA_CLOSE=()=>{qa.classList.remove('open');qaScrim.classList.remove('on');qa.setAttribute('aria-hidden','true');$('#qaFab').focus();};
$('#qaFab').onclick=()=>{qaRender();qa.classList.add('open');qaScrim.classList.add('on');qa.removeAttribute('aria-hidden');setTimeout(()=>$('#qaQ').focus(),200);};
qaScrim.onclick=QA_CLOSE;$('#qaClose').onclick=QA_CLOSE;
$('#qaQ').addEventListener('input',qaRender);
qa.addEventListener('click',e=>{
 const b=e.target.closest('[data-qa]');if(b){qaGo(b.dataset.qa,JSON.parse(b.dataset.qp||'{}'));if(matchMedia('(max-width:900px)').matches)QA_CLOSE();else qaRender();return;}
 const a=e.target.closest('[data-act]');if(!a)return;e.stopPropagation();const v=a.dataset.v;
 ({qaLang:()=>{S.lang=v;document.documentElement.lang=v;refresh();resheet();},qaTheme:()=>applyTheme(v),qaFrame:()=>{QA.frame=v;document.body.classList.toggle('frame',v!=='auto');document.body.classList.toggle('tablet',v==='tablet');refresh();},qaNet:()=>{QA.offline=v==='off';refresh();toast(QA.offline?L('Режим «нет сети»: действия будут падать с ошибкой','Offline mode: actions will fail with an error'):L('Сеть восстановлена','Back online'),{type:QA.offline?'warn':'ok'});},qaPersona:()=>{signIn(v);toast(v==='new'?L('Новый пустой аккаунт','New empty account'):L('Заполненный аккаунт Alex','Filled account: Alex'),{type:'ok'});},qaPrem:()=>{S.me.premium=v==='1';refresh();}}[a.dataset.act]||(()=>{}))();
 qaRender();
},true);
