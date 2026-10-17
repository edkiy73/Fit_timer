const ENGINE="__ENGINE_JSON__";
const BRIDGE="__BRIDGE_JSON__";
const $=s=>document.querySelector(s);
let mode='gesture',pair=true,lang='ru',theme='light',sourceHTML='',generation=0;
const mounted=new Map();
const screens=[
 ['dating','D03',{},'Знакомства','Dating','Четыре плавающие кнопки: возврат, пропуск, доступ, лайк. Автор выбирается у доступа и лайка.','Four floating actions: undo, pass, request, like. Identity applies to request and like.'],
 ['profile','P01',{id:'noah'},'Профиль человека','Member profile','Исходный профиль V10. Кнопки остаются на своих местах.','The original V10 profile. Buttons stay in their original positions.'],
 ['feed','F01',{sub:'foryou'},'Публикации в ленте','Feed posts','Настоящие карточки и панель реакций. Можно прокручивать ленту.','Real post cards and reaction controls. Scroll the feed.'],
 ['replies','F05',{id:'p1'},'Публикация и ответы','Post and replies','Лайки ответов и отправка сообщения в реальном экране.','Reply reactions and the real reply composer.'],
 ['compose','F07',{type:'text'},'Редактор публикации','Post composer','Оригинальный редактор: черновик, вложения, предпросмотр и публикация.','The original composer: draft, attachments, preview and publish.'],
 ['following','P10',{id:'mia',tab:'following'},'Подписки и подписчики','Following and followers','Короткие строки списка и исходные кнопки подписки.','Compact list rows and the original follow buttons.'],
 ['search','G01',{scope:'people',q:'Mia'},'Поиск людей','People search','Результаты и доступные действия из текущего V10.','Current V10 search results and available actions.'],
 ['notifications','N01',{},'Уведомления','Notifications','Исходный экран уведомлений без выдуманных новых кнопок.','Original notifications, without invented extra actions.'],
 ['discussion','C06',{id:'d1'},'Обсуждение сообщества','Community discussion','Права сообщества сохраняются. Механику пары не добавляем туда, где её нет в MVP.','Community permissions remain. No couple control is invented outside MVP rules.'],
 ['chat','H02',{id:'mia',actor:'me'},'Диалог','Conversation','В существующем чате автор задан составом участников.','Identity in an existing conversation follows its participants.'],
 ['event','E03',{id:'e1'},'Событие','Event','Участие — личное. Сохраняем текущие действия и расположение.','Attendance is personal. Existing actions and layout stay intact.'],
 ['community','C03',{id:'rope'},'Сообщество','Community','Реальное сообщество V10. Вступление остаётся личным.','The real V10 community. Membership stays personal.']
];
const L=(a,b)=>lang==='ru'?a:b;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function labels(){
 document.documentElement.lang=lang;document.documentElement.dataset.theme=theme;
 $('h1').textContent=L('Действия в настоящих экранах V10','Actions in the actual V10 screens');
 $('#intro').textContent=L('Здесь загружаются сами экраны прототипа. Их расположение, карточки и набор кнопок сохранены. Меняется только способ выбора автора действия.','These are the actual prototype screens. Layout, cards and action sets are preserved. Only the identity selection mechanism changes.');
 const titles=[L('01 · Раздельная кнопка','01 · Split control'),L('02 · Выбор при действии','02 · Choose on action'),L('03 · Два автора','03 · Both identities'),L('04 · Только жест','04 · Gesture only')];
 document.querySelectorAll('[data-mode]').forEach((b,i)=>{b.textContent=titles[i];b.setAttribute('aria-pressed',b.dataset.mode===mode);});
 $('#guide').textContent=!pair?L('Без активной пары — обычные кнопки V10.','Without an active couple, ordinary V10 controls.'):({gesture:L('Удержи настоящую кнопку. Вверх — Мы, вниз — Я. Отпусти для действия, вернись в центр для отмены.','Hold the original action button. Up — Us, down — Me. Release to act, return to center to cancel.'),split:L('Нажатие выполняет действие. Метка автора в кнопке открывает выбор.','Tap performs the action. The identity mark inside the button opens the selector.'),choose:L('Нажатие на кнопку открывает выбор автора и действия.','Tap an action to choose who performs it.'),dual:L('Две маленькие зоны «Я» и «Мы» внутри исходной кнопки.','Two compact Me / Us targets inside the original button.')}[mode]);
 $('#scope').textContent=L('На лайках и подписках: ↑ Мы · ↓ Я · → Я + Мы. Возврат и пропуск анкеты без выбора автора. Чат, участие в событии и вступление в сообщество — по действующим правилам V10.','Likes and follows: ↑ Us · ↓ Me · → Me + Us. Undo and pass have no identity selector. Chats, attendance and membership follow existing V10 rules.');
 $('#pair-label').textContent=L('Активная пара','Active couple');$('#reset').textContent=L('Начать заново','Reset');$('#lang').textContent=lang==='ru'?'EN':'RU';$('#theme').textContent=theme==='light'?L('Тёмная тема','Dark theme'):L('Светлая тема','Light theme');
 screens.forEach(s=>{const section=document.getElementById(s[0]);if(section){section.querySelector('h2').textContent=s[lang==='ru'?3:4];section.querySelector('.screen-note').textContent=s[lang==='ru'?5:6];}});
}
function makeSource(){
 const base=new URL('prototype-v10.html',location.href).href;
 return sourceHTML.replace('<head>',`<head><base href="${escape(base)}">`)
 .replace("S=freshState((p=>p==='new'||p==='full'?p:'pair')(new URLSearchParams(location.search).get('persona')));",`S=freshState('${pair?'pair':'full'}');`)
 .replace(/^S.lang=.*$/m,`S.lang='${lang}';`)
 .replace('/* ---- main.js ---- */',BRIDGE+'\n/* ---- main.js ---- */');
}
function mount(spec,token){
 if(mounted.has(spec[0])||token!==generation)return;const section=document.getElementById(spec[0]),iframe=section.querySelector('iframe');mounted.set(spec[0],iframe);
 iframe.onload=()=>{if(token!==generation)return;try{const w=iframe.contentWindow;w.FT_QA.go(spec[1],spec[2]);w.FT_LAB_BRIDGE.init(pair,lang);w.document.documentElement.dataset.theme=theme;const script=w.document.createElement('script');script.textContent=ENGINE;w.document.body.append(script);w.FT_REAL_ACTION_LAB.setMode(mode);section.querySelector('.loading').hidden=true;}catch(e){section.querySelector('.loading').textContent=L('Не удалось загрузить экран','Could not load this screen');console.error(e);}};
 iframe.srcdoc=makeSource();
}
function renderScreens(){generation++;const token=generation;mounted.clear();$('#screens').innerHTML=screens.map((s,i)=>`<section class="screen" id="${s[0]}"><div class="screen-heading"><span>${String(i+1).padStart(2,'0')}</span><h2>${escape(s[lang==='ru'?3:4])}</h2><a href="prototype-v10.html#${s[1]}${s[2].id?':'+s[2].id:''}" target="_blank" rel="noopener">V10 ↗</a></div><div class="frame"><iframe title="${escape(s[lang==='ru'?3:4])}"></iframe><span class="loading">${L('Загружаем настоящий экран…','Loading the actual screen…')}</span></div><p class="screen-note">${escape(s[lang==='ru'?5:6])}</p></section>`).join('');
 if(window.realFrameObserver)window.realFrameObserver.disconnect();window.realFrameObserver=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){const spec=screens.find(s=>s[0]===e.target.id);mount(spec,token);window.realFrameObserver.unobserve(e.target);}}),{rootMargin:'500px'});document.querySelectorAll('.screen').forEach(s=>window.realFrameObserver.observe(s));labels();}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.mode){mode=b.dataset.mode;labels();for(const f of mounted.values())f.contentWindow.FT_REAL_ACTION_LAB?.setMode(mode);}else if(b.id==='theme'){theme=theme==='light'?'dark':'light';labels();for(const f of mounted.values())f.contentWindow.document.documentElement.dataset.theme=theme;}else if(b.id==='lang'){lang=lang==='ru'?'en':'ru';renderScreens();}else if(b.id==='reset')renderScreens();});
$('#pair').addEventListener('change',e=>{pair=e.target.checked;renderScreens();});
labels();fetch('prototype-v10.html').then(r=>{if(!r.ok)throw new Error('V10 '+r.status);return r.text();}).then(html=>{if(!html.includes('window.FT_QA')||!html.includes('/* ---- main.js ---- */'))throw new Error('Unsupported V10 build');sourceHTML=html;renderScreens();}).catch(e=>{$('#screens').textContent=L('Не удалось загрузить исходный V10. Обнови страницу.','Could not load the original V10. Reload the page.');console.error(e);});
