/* Админка каталога: очередь, правка, удаление, тренеры.

   Каталог целиком живёт в базе — в приложении не осталось ни одной зашитой
   программы. Значит, единственный способ им управлять — эта страница, и она
   обязана уметь всё: взять или отклонить заявку, поправить уже лежащее, убрать
   из каталога и закрыть автора. Запись — программа V2 + накладки языков.

   Запуск:  ADMIN_KEY=testadminkey123456 node tests/dev-server.js 8124
            node tests/admin-flow.js */

const { catalogProgram, translated } = require('./helpers/catalog-program');
let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const ADMIN = process.env.ADMIN_KEY || 'testadminkey123456';
const CHROME = process.env.FIT_CHROME || '';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

const api = (action, extra, key) => fetch(BASE + '/api/admin', {
  method: 'POST',
  headers: {'Content-Type': 'application/json',
            'X-Admin-Key': encodeURIComponent(key || ADMIN)},
  body: JSON.stringify(Object.assign({action}, extra || {}))
}).then(async r => ({s: r.status, j: await r.json().catch(() => ({}))}));
const post = (path, body) => fetch(BASE + path, {method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify(body)}).then(r => r.json());

// Тренер — только через аккаунт: вход по коду → страница тренера (как в приложении)
async function makeTrainer(handle){
  const email = 'adm.' + Math.random().toString(36).slice(2, 8) + '@example.com', deviceId = 'adm-dev';
  const sent = await post('/api/auth', {action: 'send', email});
  const v = await post('/api/auth', {action: 'verify', email, code: sent.devCode, deviceId});
  return post('/api/trainer/' + encodeURIComponent(handle), {email, deviceId, token: v.syncToken,
    trainer: {name: 'Админ-тест', about: 'Тренер для проверки админки.'}});
}
const PROGRAM = name => catalogProgram(name, ['Приседания', 'Отжимания', 'Планка']);

(async () => {
  const b = await chromium.launch(CHROME ? {executablePath: CHROME} : {});
  const errs = [];

  // ---- дверь заперта ----
  ok('без ключа не пускает', (await api('overview', {}, 'wrong-key-0000')).s === 403);
  // Ключ с кириллицей ронял сам запрос: в заголовок можно положить только ASCII.
  ok('ключ с кириллицей не роняет запрос, а отвергается',
     (await api('overview', {}, 'неверный')).s === 403);

  // ---- стартовый набор: каталог начинается с чистого листа ----
  const seeded = await api('seed');
  ok('стартовый набор пуст — старые программы не заливаются', seeded.s === 200 && seeded.j.items === 0, seeded.j.items);
  const TRAINER = '@adm.' + Math.random().toString(36).slice(2, 7);
  const tr = await makeTrainer(TRAINER);
  ok('тренер заведён через аккаунт', tr.ok === true, JSON.stringify(tr));
  const listedTrainer = (await api('overview')).j.trainers.find(t => t.handle === TRAINER);
  ok('и виден в админке', !!listedTrainer);

  const adminUser='admin-smoke@example.com';
  ok('тестовый пользователь создаётся',(await api('user_create',{email:adminUser})).s===200);
  const campPreview=await api('campaign_send',{preview:true,kind:'news',push:true,email:false,cursor:0,copy:{ru:{title:'Тест',body:'Тестовое сообщение'},en:{title:'Test',body:'Test message'}}});
  ok('рассылку можно безопасно просчитать без отправки',campPreview.s===200&&campPreview.j.preview===true,campPreview.j.total);

  // ---- добавить своими руками ----
  const NAME = 'От нас ' + Math.random().toString(36).slice(2, 6);
  const добавь = (over) => {
    const o = over || {};
    const program = o.program || PROGRAM(o.name || NAME);
    const item = Object.assign({
      name: NAME, cat: 'power', level: 'Средний', min: 25,
      gives: 'Программа, добавленная прямо из админки, а не присланная тренером.'
    }, o, {program});
    item.sourceLocale = 'ru';
    item.locales = o.locales || {
      ru: {name:item.name, gives:item.gives},
      en: {name:'EN ' + item.name, gives:'English version. ' + item.gives, texts:translated(program, {})}
    };
    return api('add', {item});
  };

  // ---- серверный черновик -> явная публикация ----
  const draftProgram = PROGRAM('Черновик для публикации');
  const draftItem = {
    sourceLocale:'ru',cat:'power',level:'Средний',min:25,by:'',pro:false,program:draftProgram,
    locales:{
      ru:{name:'Черновик для публикации',gives:'Полная программа для проверки безопасного цикла черновик и публикация.'},
      en:{name:'Publish draft test',gives:'Complete program for testing the safe draft and publish workflow.',texts:translated(draftProgram,{})}
    }
  };
  const draftSaved=await api('save_draft',{item:draftItem});
  ok('готовую программу можно сначала сохранить черновиком',draftSaved.s===200&&/^d/.test(draftSaved.j.id||''),draftSaved.j.id);
  const draftOverview=(await api('overview')).j;
  ok('черновик виден в админке', (draftOverview.drafts||[]).some(x=>x.id===draftSaved.j.id));
  const draftHidden=await fetch(BASE+'/api/catalog').then(r=>r.json());
  ok('черновик не виден публичному каталогу',!(draftHidden.items||[]).some(x=>x.id===draftSaved.j.id));
  const draftPublished=await api('publish_draft',{id:draftSaved.j.id,pro:false});
  ok('черновик публикуется только отдельным действием',draftPublished.s===200&&draftPublished.j.status==='approved');
  const draftVisible=await fetch(BASE+'/api/catalog').then(r=>r.json());
  ok('после публикации программа появилась в каталоге',(draftVisible.items||[]).some(x=>x.id===draftSaved.j.id));
  await api('remove',{id:draftSaved.j.id});

  const incomplete=await api('save_draft',{item:{
    sourceLocale:'ru',cat:'tone',level:'Новичок',min:20,
    locales:{ru:{name:'Проба',gives:''}}
  }});
  ok('незавершённый черновик тоже сохраняется',incomplete.s===200,incomplete.j.id);
  const blocked=await api('publish_draft',{id:incomplete.j.id,pro:false});
  ok('незавершённый черновик нельзя опубликовать',blocked.s===400&&(blocked.j.miss||[]).length>0,(blocked.j.miss||[]).join(', '));
  ok('черновик можно удалить',(await api('delete_draft',{id:incomplete.j.id})).s===200);

  const bad1 = await добавь({gives: 'коротко'});
  ok('недобор полей не проходит', bad1.s === 400 && (bad1.j.miss || []).length > 0,
     (bad1.j.miss || []).join(', '));
  const bad2 = await добавь({cat: 'Сила и выносливость'});
  ok('цель названием, а не ключом, не проходит', bad2.s === 400, (bad2.j.miss || []).join(', '));
  const short = PROGRAM(NAME + ' мало');
  short.plans[0].exercises = short.plans[0].exercises.slice(0, 2);
  const bad3 = await добавь({name: NAME + ' мало', program: short});
  ok('меньше трёх упражнений не проходит', bad3.s === 400 && (bad3.j.miss || []).includes('хотя бы три упражнения'),
     (bad3.j.miss || []).join(', '));
  const bad4 = await добавь({name: NAME + ' пол', locales: {ru: {name: NAME + ' пол', gives: 'Программа, добавленная прямо из админки, а не присланная тренером.'},
    en: {name: 'Half', gives: 'English version, long enough to pass.', texts: Object.assign(translated(PROGRAM('x'), {}), {stages: []})}}});
  ok('без текстов этапов второго языка не проходит', bad4.s === 400 && (bad4.j.miss || []).some(x => /EN: тексты/.test(x)),
     (bad4.j.miss || []).join(', '));

  const added = await добавь();
  ok('добавляется и сразу в каталоге', added.s === 200 && !!added.j.id, added.j.id);
  const cat2 = await fetch(BASE + '/api/catalog').then(r => r.json());
  ok('витрина её видит', cat2.items.some(x => x.id === added.j.id));

  // ---- поправить ----
  const ed = await api('edit', {id: added.j.id, item: {min: 33, level: 'Продвинутый'}});
  ok('правка проходит', ed.s === 200);
  const cat3 = await fetch(BASE + '/api/catalog').then(r => r.json());
  const mine = cat3.items.find(x => x.id === added.j.id);
  ok('правка доехала до витрины', mine && mine.min === 33 && mine.level === 'Продвинутый',
     mine && `${mine.min} мин, ${mine.level}`);
  const edBad = await api('edit', {id: added.j.id, item: {name: 'ы'}});
  ok('правка тоже проверяется', edBad.s === 400, (edBad.j.miss || []).join(', '));

  // ---- убрать ----
  ok('убирается из каталога', (await api('remove', {id: added.j.id})).s === 200);
  const cat4 = await fetch(BASE + '/api/catalog').then(r => r.json());
  ok('и пропала с витрины', !cat4.items.some(x => x.id === added.j.id));

  // ---- картинки: обложка и фото упражнений (v2: по exercise.id) ----
  const pic = t => 'data:image/png;base64,' + btoa('pic-' + t).replace(/=/g, '');
  const picProgram = PROGRAM(NAME + ' с фото');
  const [exA, , exC] = picProgram.plans[0].exercises;
  const withPics = await добавь({
    name: NAME + ' с фото', program: picProgram,
    cover: pic('cover'),
    media: {v:2, items:[{id:exA.id, p:0, i:0, n:'Приседания', data:pic('sq')}, {id:exC.id, p:0, i:2, n:'Планка', data:pic('pl')}]}
  });
  ok('программа добавляется с картинками', withPics.s === 200, withPics.j.id);
  const mediaIds = item => ((item && item.media && item.media.items) || []).map(x => x.id).join();
  const one = await fetch(BASE + '/api/catalog?item=' + withPics.j.id).then(r => r.json());
  ok('обложка сохранилась', !!(one.item && one.item.cover));
  ok('фото упражнений сохранились по id', mediaIds(one.item) === exA.id + ',' + exC.id, mediaIds(one.item));

  // правкой картинку можно и заменить, и убрать
  await api('edit', {id: withPics.j.id, item: {cover: '', media: {v:2, items:[{id:exC.id, p:0, i:2, data:pic('pl2')}]}}});
  const one2 = await fetch(BASE + '/api/catalog?item=' + withPics.j.id).then(r => r.json());
  ok('обложку можно убрать правкой', !one2.item.cover);
  ok('карта фото заменяется целиком', mediaIds(one2.item) === exC.id, mediaIds(one2.item));
  await api('edit', {id: withPics.j.id, item: {media: {v:2, items:[{id:exC.id, data:'не-картинка'}]}}});
  ok('мусор вместо картинки не принимается',
     !(await fetch(BASE + '/api/catalog?item=' + withPics.j.id).then(r => r.json())).item.media);
  await api('edit', {id: withPics.j.id, item: {media: {'Планка': pic('legacy')}}});
  ok('старая карта «имя → фото» не принимается',
     !(await fetch(BASE + '/api/catalog?item=' + withPics.j.id).then(r => r.json())).item.media);
  await api('remove', {id: withPics.j.id});

  // ---- закрыть и вернуть тренера ----
  ok('тренер закрывается', (await api('ban', {handle: TRAINER})).s === 200);
  const banned = (await api('overview')).j.trainers.find(t => t.handle === TRAINER);
  ok('это видно в списке', banned && banned.banned === true);
  ok('и возвращается', (await api('unban', {handle: TRAINER})).s === 200);

  const KEPT = NAME + ' витрина';
  const kept = await добавь({name: KEPT});
  ok('программа для витрины админки добавлена', kept.s === 200, kept.j.id || kept.j.error);

  const mobileDraft=await api('save_draft',{item:draftItem});
  ok('для mobile smoke создан черновик редактора',mobileDraft.s===200,mobileDraft.j.id);

  // ---- сама страница ----
  const page = await (await b.newContext({viewport: {width: 412, height: 900}, locale: 'ru-RU'})).newPage();
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/admin.html', {waitUntil: 'load'});
  await page.waitForTimeout(500);
  ok('без ключа показывает вход', await page.isVisible('#gate'));
  await page.fill('#key', 'неверный');
  await page.click('#enter');
  await page.waitForTimeout(700);
  ok('неверный ключ не пускает и говорит об этом',
     /не подошёл/.test(await page.textContent('#gateErr')));
  await page.fill('#key', ADMIN);
  await page.click('#enter');
  await page.waitForTimeout(900);
  ok('с ключом открывается', await page.isVisible('#app'));
  ok('по умолчанию открывается полезный обзор', /Что требует внимания/.test(await page.textContent('#body')));
  ok('мобильная админка не создаёт горизонтальный скролл',
     await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.setViewportSize({width:360,height:800});
  ok('dashboard помещается на узком Android viewport',
     await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  const finalTabs=['dashboard','pending','drafts','approved','trainers','users','analytics','errors','campaigns','ai','pricing','payments','release'];
  for(const tabName of finalTabs){
    if(tabName!=='dashboard'){
      await page.click('#navOpen');
      await page.click('.nav-btn[data-tab="'+tabName+'"]');
      await page.waitForTimeout(120);
    }
    const fit=await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    ok('финальный mobile-fit: '+tabName,fit);
  }
  await page.click('#navOpen');
  await page.click('.nav-btn[data-tab="dashboard"]');
  await page.waitForTimeout(120);
  await page.click('#navOpen');
  await page.click('.nav-btn[data-tab="approved"]');
  await page.waitForTimeout(400);
  const listed = await page.textContent('#body');
  ok('на вкладке «В каталоге» видны программы', listed.includes(KEPT), KEPT);
  ok('production UI не показывает seed тестовых программ',!/Залить пять тестовых программ/.test(listed));
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await page.click('#navOpen');
  await page.click('.nav-btn[data-tab="trainers"]');
  await page.waitForTimeout(150);
  ok('смена раздела возвращает к началу страницы',(await page.evaluate(()=>window.scrollY))===0);
  await page.click('#navOpen');
  await page.click('.nav-btn[data-tab="approved"]');
  await page.waitForTimeout(120);
  await page.click('#navOpen');
  await page.click('.nav-btn[data-tab="trainers"]');
  await page.waitForTimeout(400);
  ok('на вкладке «Тренеры» видна активность',
     /активность/.test(await page.textContent('#body')));
  const rowMenuStyle=await page.locator('details.row-menu').first().evaluate(el=>{
    const st=getComputedStyle(el);
    return {borderTop:st.borderTopWidth,paddingTop:st.paddingTop,marginTop:st.marginTop};
  });
  ok('у меню ••• нет серой линии и лишнего отступа',
     rowMenuStyle.borderTop==='0px'&&rowMenuStyle.paddingTop==='0px'&&rowMenuStyle.marginTop==='0px',
     JSON.stringify(rowMenuStyle));
  await page.click('#navOpen');
  await page.click('.nav-btn[data-tab="users"]');
  await page.waitForTimeout(300);
  await page.fill('#userSearch',adminUser);
  const userCard=page.locator('.user-card').filter({hasText:adminUser}).first();
  await userCard.locator('details.row-menu summary').click();
  await userCard.locator('[data-premium]').click();
  ok('Premium выдаётся через inline-панель без prompt',await userCard.locator('[data-user-panel]').isVisible()&&/Ручной Premium/.test(await userCard.locator('[data-user-panel]').textContent()));
  await userCard.locator('[data-user-panel] [data-close]').click();
  await userCard.locator('details.row-menu summary').click();
  await userCard.locator('[data-code]').click();
  await page.waitForTimeout(150);
  ok('тестовый код показывается внутри карточки',await userCard.locator('[data-user-panel] code').isVisible());
  ok('пользователи на 360px не распирают viewport',await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  await page.click('#navOpen');
  await page.click('.nav-btn[data-tab="campaigns"]');
  await page.waitForTimeout(200);
  await page.fill('#campRuTitle','Новости');
  await page.fill('#campRuBody','Тестовая русская рассылка');
  await page.click('[data-camp-lang="en"]');
  await page.fill('#campEnTitle','News');
  await page.fill('#campEnBody','Test English campaign');
  ok('до preview массовая отправка заблокирована',await page.locator('#campSend').isDisabled());
  await page.click('#campPreview');
  await page.waitForFunction(() => !document.querySelector('#campSend').disabled);
  ok('после preview видны размеры аудитории и отправка доступна',/Проверено/.test(await page.textContent('#campPreviewState')));
  await page.fill('#campEnBody','Changed English campaign');
  ok('любое изменение снова блокирует отправку',await page.locator('#campSend').isDisabled());
  ok('рассылки на 360px не распирают viewport',await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  await page.click('#navOpen');
  await page.click('.nav-btn[data-tab="ai"]');
  await page.waitForTimeout(200);
  ok('AI явно тестируется без сохранения',/без сохранения/i.test(await page.textContent('#body')));
  ok('AI настройки на 360px не распирают viewport',await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  ok('результат AI-теста находится рядом с кнопками теста',
     await page.locator('#testText').evaluate(btn => !!(btn.parentElement && btn.parentElement.querySelector('#aiResult'))));

  await page.click('#navOpen');
  await page.click('.nav-btn[data-tab="payments"]');
  await page.waitForTimeout(250);
  ok('платежи показывают реальную готовность провайдеров',
     /не хватает серверных ключей|нет серверных ключей/.test(await page.textContent('#body')));
  await page.click('#paySettingsSave');
  await page.waitForTimeout(100);
  ok('невозможную платежную конфигурацию нельзя молча сохранить',
     /нужны|нужен/.test(await page.textContent('#paySettingsState')));
  ok('платежный экран на телефоне не распирает viewport',
     await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  ok('статус сохранения платежей находится рядом с кнопкой',
     await page.locator('#paySettingsSave').evaluate(btn => btn.parentElement && btn.parentElement.querySelector('#paySettingsState') !== null));
  await page.click('#navOpen');
  await page.click('.nav-btn[data-tab="analytics"]');
  await page.waitForTimeout(250);
  ok('аналитика умеет менять период 7/30/90 дней',
     await page.locator('#analyticsDays option').count()===3);
  ok('аналитика на 360px не распирает viewport',
     await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  await page.click('#navOpen');
  await page.click('.nav-btn[data-tab="errors"]');
  await page.waitForTimeout(250);
  ok('экран ошибок помещается на 360px',
     await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  ok('у диагностики есть быстрый переход в health',await page.locator('a[href="/api/health"]').count()===1);

  await page.evaluate(id=>{
    localStorage.setItem('adminEditingId',id);
    localStorage.setItem('adminTab','add');
  },mobileDraft.j.id);
  await page.reload({waitUntil:'load'});
  await page.waitForTimeout(500);
  ok('черновик открывается как редактор на телефоне',/Черновик программы/.test(await page.textContent('#pageTitle'))||await page.isVisible('#editorReviewCard'));
  ok('карта готовности редактора видна на мобильном',await page.isVisible('#editorReviewCard'));
  ok('карта готовности показывает RU, EN и медиа',/Русский/.test(await page.textContent('#editorReviewCard'))&&/English/.test(await page.textContent('#editorReviewCard'))&&/Фото упражнений/.test(await page.textContent('#editorReviewCard')));
  await page.fill('#fNameRu',(await page.inputValue('#fNameRu'))+' X');
  ok('редактор явно показывает несохранённые изменения',/несохранённые/i.test(await page.textContent('#programSaveState')));
  let leaveDialog='';
  page.once('dialog',async d=>{leaveDialog=d.message();await d.dismiss();});
  await page.click('#navOpen');
  await page.click('.nav-btn[data-tab="dashboard"]');
  await page.waitForTimeout(120);
  ok('из несохранённого редактора нельзя уйти случайно',/несохранённые изменения/i.test(leaveDialog)&&await page.isVisible('#fNameRu'),leaveDialog);
  ok('после отмены перехода мобильное меню закрывается',!(await page.locator('body').evaluate(el=>el.classList.contains('nav-open'))));
  ok('редактор на 360px не создаёт горизонтальный скролл',
     await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  await page.click('#navOpen');
  await page.click('.nav-btn[data-tab="add"]');
  await page.waitForTimeout(300);
  ok('у новой программы есть полноценный режим создания через ИИ',
     await page.isVisible('#aiCreateCard') && await page.isVisible('#fAiCreate'));
  ok('новая программа сначала предлагает черновик и отдельную публикацию',
     /черновик/i.test(await page.textContent('#fSave')) && await page.isVisible('#fPublish'));
  await page.fill('#aiCreateWish','Собери тестовую силовую программу');
  await page.check('input[data-equip-role="load"][value="dumbbell"]');
  await page.click('#fAiCreate');
  await page.waitForFunction(() => document.querySelector('#fNameRu')?.value === 'Тестовая программа'
    && document.querySelector('#fNameEn')?.value === 'EN Тестовая программа', null, {timeout: 15000});
  const ruTexts = JSON.parse(await page.inputValue('#fTextsRu'));
  const enTexts = JSON.parse(await page.inputValue('#fTextsEn'));
  ok('AI-create заполняет редактор программой V2 и вторым языком',
     ruTexts.stages.some(x => x.name === 'Приседания')
     && enTexts.stages.length === ruTexts.stages.length && enTexts.stages[1].name === 'EN Приседания',
     ruTexts.stages.map(x => x.name).join(', '));
  ok('состав программы виден карточками', (await page.locator('#exerciseCards .exercise-card').count()) === 4);
  let slots = await page.evaluate(() => [...document.querySelectorAll('#fPics .pic small')].map(x => x.textContent));
  ok('места под фото берутся из программы',
     slots.join(',') === 'Разминка суставов,Приседания,Отжимания от стены,Тяга гантели', slots.join(', '));
  // правка текстов исходного языка в JSON меняет подписи состава и фото
  ruTexts.stages[1].name = 'Глубокие приседания';
  await page.fill('#fTextsRu', JSON.stringify(ruTexts, null, 2));
  await page.waitForTimeout(200);
  slots = await page.evaluate(() => [...document.querySelectorAll('#fPics .pic small')].map(x => x.textContent));
  ok('правка текстов исходника видна сразу', slots[1] === 'Глубокие приседания', slots.join(', '));

  // ручной путь: Program DTO V2 без ИИ
  const dto = {contractVersion:2, program:{name:'Из чата', desc:'Ручной импорт.', progressionEvery:null, rotate:false, rotateDays:[],
    plans:[{days:['wed'], rounds:2, roundRest:60, exercises:['Выпады', 'Планка', 'Мост'].map(name => ({warmup:false, stages:[{
      name, desc:'', mistakes:'', type:'reps', value:'10', sets:2, perSide:false, rest:30, restAfter:null, muscles:['gl'],
      load:{type:'none', equipment:null, equipmentName:'', count:1, weight:0, levels:[], level:0}, supportEquipment:[],
      progression:{mode:'none', every:null, repsStep:null, repsMax:null, weightStep:null, weightMax:null, timeStep:null, timeMax:null},
      advance:'manual'}]}))}]}};
  await page.click('[data-create-mode="manual"]');
  await page.fill('#fDtoJson', JSON.stringify(dto));
  await page.click('#fDtoImport');
  await page.waitForFunction(() => document.querySelector('#fNameRu')?.value === 'Из чата');
  slots = await page.evaluate(() => [...document.querySelectorAll('#fPics .pic small')].map(x => x.textContent));
  ok('Program DTO V2 загружается вручную', slots.join(',') === 'Выпады,Планка,Мост', slots.join(', '));
  ok('второй язык подготовлен для ручного перевода', JSON.parse(await page.inputValue('#fTextsEn')).stages.length === 3);
  ok('обложке тоже есть место', await page.isVisible('#fCoverBox .ph'));
  ok('в админке есть отдельные RU и EN поля',
     await page.locator('#fNameRu').count() === 1 && await page.locator('#fNameEn').count() === 1);
  ok('есть ручная вставка перевода без ИИ', await page.isVisible('#fPasteToggle'));
  await page.screenshot({path: __dirname + '/shot-admin.png', fullPage: true});

  /* ---- доступ по подписке: решают здесь, а не тренер в заявке ---- */
  const made = await добавь({
    name: 'Платная ' + Math.random().toString(36).slice(2, 6),
    gives: 'Программа для проверки доступа по подписке, двадцать символов есть.',
    cat: 'power', level: 'Средний', min: 30,
    pro: true
  });
  ok('программа добавляется сразу премиумной', made.s === 200, made.j.id || made.j.error);

  const fromCat = await fetch(BASE + '/api/catalog').then(r => r.json());
  const proRow = (fromCat.items || []).find(x => x.id === made.j.id);
  ok('и каталог отдаёт метку', proRow && proRow.pro === true, String(proRow && proRow.pro));

  const opened = await api('pro', {id: made.j.id, pro: false});
  ok('её можно открыть всем одним действием', opened.s === 200 && opened.j.pro === false,
     String(opened.j.pro));
  const back = await fetch(BASE + '/api/catalog').then(r => r.json());
  ok('и каталог это видит',
     (back.items || []).find(x => x.id === made.j.id).pro === false);

  const edited = await api('edit', {id: made.j.id, item: {pro: true}});
  ok('правкой тоже переключается', edited.s === 200);
  const solo = await fetch(BASE + '/api/catalog?item=' + made.j.id).then(r => r.json());
  ok('и по одной программе метка приезжает', solo.item.pro === true, String(solo.item.pro));
  ok('без подписки премиум-программа не отдаётся', solo.item.locked === true && solo.item.program === null);
  const list = await fetch(BASE + '/api/catalog').then(r => r.json());
  ok('и в списке её состава нет', (list.items || []).find(x => x.id === made.j.id).program === null);
  await api('delete_draft',{id:mobileDraft.j.id});

  console.log('\npageerror:', errs.length ? errs : 'нет');
  if(errs.length) bad++;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
