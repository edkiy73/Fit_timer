/* Системная проверка переходов и browser history.
   Не проверяет внешний вид экранов — проверяет главный инвариант:
   show._last, history.state, navDepth и navStack всегда описывают одно и то же место.

   Запуск:
     node tests/dev-server.js 8124
     node tests/nav-transitions.js
*/

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : ''));
};
const pause = (page, ms=350) => page.waitForTimeout(ms);
const nav = page => page.evaluate(() => ({
  screen: show._last,
  state: history.state,
  depth: navDepth,
  stack: [...navStack],
  modals: [...document.querySelectorAll('.modal.open')].map(x => x.id)
}));
const good = (s, screen, depth, stackEnd) =>
  s.screen === screen
  && !!s.state && s.state.scr === screen
  && s.depth === depth
  && s.stack[s.stack.length - 1] === (stackEnd || screen);

async function boot(browser, errs){
  const page = await (await browser.newContext({viewport:{width:412,height:900}, locale:'ru-RU'})).newPage();
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', {waitUntil:'load'});
  await pause(page, 1800);
  if(await page.isVisible('#obStart')){
    await page.click('#obStart');
    await pause(page, 1200);
  }
  await page.evaluate(async () => {
    const u = curUser();
    if(u){ u.gender = 'm'; u.age = 35; await saveUsers(); }
    const p = {
      id:'nav-audit', name:'Навигация', progression:0, stats:{completions:0},
      plans:[{days:['Пн'], rounds:1, roundRest:0, exercises:[
        {id:'nav-ex-1', name:'Присед', type:'reps', value:'10', sets:1, rest:20}
      ]}]
    };
    const at = customPrograms.findIndex(x => x.id === p.id);
    if(at >= 0) customPrograms[at] = p; else customPrograms.push(p);
    await savePrograms();
    navDepth = 0;
    navStack = ['scrMenu'];
    history.replaceState({scr:'scrMenu', d:0}, '');
    show('scrMenu', false);
  });
  await pause(page, 200);
  return page;
}

(async()=>{
  const b = await chromium.launch({executablePath:CHROME});
  const errs = [];

  // ---- корневые разделы: каждый Back возвращает сразу на Сегодня ----
  {
    const page = await boot(b, errs);
    for(const id of ['scrPrograms','scrStats','scrAccount']){
      await page.evaluate(id => goTab(id), id);
      await pause(page);
      let s = await nav(page);
      ok('корневой переход ' + id + ' синхронен', good(s,id,1), JSON.stringify(s));
      await page.goBack(); await pause(page);
      s = await nav(page);
      ok('Back из ' + id + ' ведёт сразу на Сегодня', good(s,'scrMenu',0), JSON.stringify(s));
    }
    await page.close();
  }

  // ---- попап -> новый экран: служебная modal-запись не остаётся под экраном ----
  {
    const page = await boot(b, errs);
    await page.evaluate(() => goTab('scrPrograms')); await pause(page);
    await page.evaluate(() => $('createModal').classList.add('open')); await pause(page,150);
    await page.click('#chManual'); await pause(page,500);
    let s = await nav(page);
    ok('Новая → Вручную открывает чистый Builder history', good(s,'scrBuilder',2) && s.modals.length===0, JSON.stringify(s));
    await page.goBack(); await pause(page);
    s = await nav(page);
    ok('один Back из Builder возвращает в Тренировки', good(s,'scrPrograms',1), JSON.stringify(s));
    await page.goBack(); await pause(page);
    s = await nav(page);
    ok('следующий Back уже ведёт на Сегодня, без призрака попапа', good(s,'scrMenu',0), JSON.stringify(s));
    await page.close();
  }

  // ---- системный Back + «Остаться»: стек текущего экрана обязан сохраниться ----
  {
    const page = await boot(b, errs);
    await page.evaluate(() => { goTab('scrPrograms'); openBuilder('nav-audit'); });
    await pause(page,500);
    await page.fill('#bName', 'Навигация изменена');
    await page.goBack(); await pause(page,250);
    ok('dirty Builder спрашивает перед системным Back', await page.isVisible('#dlgCancel'));
    await page.click('#dlgCancel'); await pause(page,450);
    let s = await nav(page);
    ok('«Остаться» сохраняет Builder в navStack', good(s,'scrBuilder',2), JSON.stringify(s));

    await page.click('#bSettingsToggle'); await pause(page,300);
    s = await nav(page);
    ok('после «Остаться» настройки ложатся поверх Builder', good(s,'scrProgSettings',3), JSON.stringify(s));
    await page.click('#psBackTop'); await pause(page,400);
    s = await nav(page);
    ok('назад из настроек снимает ровно один уровень', good(s,'scrBuilder',2), JSON.stringify(s));

    await page.click('#builderBackTop'); await pause(page,180);
    if(await page.isVisible('#dlgOk')) await page.click('#dlgOk');
    await pause(page,500);
    s = await nav(page);
    ok('выход без сохранения после этого возвращает в Тренировки', good(s,'scrPrograms',1), JSON.stringify(s));
    await page.close();
  }

  // ---- то же для редактора упражнения ----
  {
    const page = await boot(b, errs);
    await page.evaluate(() => { goTab('scrPrograms'); openBuilder('nav-audit'); openExercise(0); });
    await pause(page,400);
    await page.fill('#exName', 'Присед изменён');
    await page.goBack(); await pause(page,220);
    ok('dirty Exercise спрашивает перед системным Back', await page.isVisible('#dlgCancel'));
    await page.click('#dlgCancel'); await pause(page,400);
    let s = await nav(page);
    ok('«Остаться» сохраняет Exercise в полном стеке', good(s,'scrExercise',3), JSON.stringify(s));
    await page.click('#btnSaveEx'); await pause(page,450);
    s = await nav(page);
    ok('Готово после отменённого Back возвращает ровно в Builder', good(s,'scrBuilder',2), JSON.stringify(s));
    await page.close();
  }

  // ---- dirty AI: системный и собственный Back не расходятся ----
  {
    const page = await boot(b, errs);
    await page.evaluate(() => { goTab('scrPrograms'); initAIForm(); openAI('text'); });
    await pause(page,350);
    await page.fill('#qNote', 'проверка навигации');
    await page.goBack(); await pause(page,220);
    ok('dirty AI спрашивает перед системным Back', await page.isVisible('#dlgCancel'));
    await page.click('#dlgCancel'); await pause(page,400);
    let s = await nav(page);
    ok('«Остаться» сохраняет AI в history', good(s,'scrAI',2), JSON.stringify(s));
    await page.click('#aiBackTop'); await pause(page,180);
    if(await page.isVisible('#dlgOk')) await page.click('#dlgOk');
    await pause(page,500);
    s = await nav(page);
    ok('собственный Back AI возвращает в Тренировки', good(s,'scrPrograms',1), JSON.stringify(s));
    await page.close();
  }

  // ---- редактор профиля: тот же leave-guard ----
  {
    const page = await boot(b, errs);
    await page.evaluate(() => { goTab('scrAccount'); openUserEdit(currentUser); });
    await pause(page,350);
    await page.fill('#ueName', 'Навигация профиль');
    await page.goBack(); await pause(page,220);
    ok('dirty Profile спрашивает перед системным Back', await page.isVisible('#dlgCancel'));
    await page.click('#dlgCancel'); await pause(page,400);
    let s = await nav(page);
    ok('«Остаться» сохраняет Profile в стеке', good(s,'scrUserEdit',2), JSON.stringify(s));
    await page.click('#btnSaveUser'); await pause(page,550);
    s = await nav(page);
    ok('сохранение профиля возвращает в Другое без хвоста', good(s,'scrAccount',1), JSON.stringify(s));
    await page.close();
  }

  // ---- вложенные попапы: каждый Back закрывает один, потом уходит с экрана ----
  {
    const page = await boot(b, errs);
    await page.evaluate(() => goTab('scrPrograms')); await pause(page);
    await page.evaluate(() => {
      $('createModal').classList.add('open');
      window.__navDlg = appDialog('Поверх попапа', {confirm:true});
    });
    await pause(page,200);
    let s = await nav(page);
    ok('два попапа действительно открыты', s.modals.includes('createModal') && s.modals.includes('dlg'), JSON.stringify(s));

    await page.goBack(); await pause(page,350);
    s = await nav(page);
    ok('первый Back закрывает только верхний попап', s.screen==='scrPrograms' && s.modals.length===1 && s.modals[0]==='createModal' && s.state && s.state.m===1, JSON.stringify(s));

    await page.goBack(); await pause(page,450);
    s = await nav(page);
    ok('второй Back закрывает нижний попап и убирает sentinel', good(s,'scrPrograms',1) && s.modals.length===0 && !s.state.m, JSON.stringify(s));

    await page.goBack(); await pause(page,400);
    s = await nav(page);
    ok('третий Back уже уходит на Сегодня, без пустого шага', good(s,'scrMenu',0), JSON.stringify(s));
    await page.close();
  }

  // ---- каталог -> карточка -> тренер -> назад по одному уровню ----
  {
    const page = await boot(b, errs);
    const txt = 'ПРОГРАММА: Каталог\nДНИ: Пн\nКРУГИ: 1\n\nУПРАЖНЕНИЕ: Планка\nФОРМАТ: время\nЗНАЧЕНИЕ: 30\nПОДХОДЫ: 1\nОТДЫХ: 20';
    await page.evaluate(async txt => {
      goTab('scrPrograms');
      storeFrom = 'scrPrograms';
      storeServer = [{id:'nav-store',by:'@nav.trainer',cat:'tone',level:'Средний',min:10,name:'Каталог',gives:'Тест',text:txt,cover:null}];
      show('scrStore');
      await openStoreItem('nav-store');
    }, txt);
    await pause(page,450);
    let s = await nav(page);
    ok('карточка каталога — следующий уровень после каталога', good(s,'scrStoreItem',3), JSON.stringify(s));

    await page.evaluate(() => openTrainer('@nav.trainer')); await pause(page,250);
    s = await nav(page);
    ok('страница тренера запоминает карточку как источник', good(s,'scrTrainerPage',4), JSON.stringify(s));
    await page.click('#tpBackTop'); await pause(page,400);
    s = await nav(page);
    ok('назад от тренера возвращает в карточку', good(s,'scrStoreItem',3), JSON.stringify(s));
    await page.click('#siBackTop'); await pause(page,400);
    s = await nav(page);
    ok('назад из карточки возвращает в каталог', good(s,'scrStore',2), JSON.stringify(s));
    await page.click('#storeBackTop'); await pause(page,450);
    s = await nav(page);
    ok('назад из каталога возвращает в Тренировки', good(s,'scrPrograms',1), JSON.stringify(s));
    await page.close();
  }

  // ---- экран старта возвращает именно в тот root, откуда его открыли ----
  {
    const page = await boot(b, errs);
    await page.evaluate(() => { goTab('scrPrograms'); openStart(customPrograms.find(x=>x.id==='nav-audit')); });
    await pause(page,300);
    await page.click('#startBackTop'); await pause(page,450);
    let s = await nav(page);
    ok('Start из Тренировок возвращается в Тренировки', good(s,'scrPrograms',1), JSON.stringify(s));

    // goTab('scrMenu') из корневой вкладки использует history.go(), то есть
    // переход асинхронный. В реальном UI следующий тап возможен только после него.
    await page.evaluate(() => goTab('scrMenu'));
    await pause(page,450);
    await page.evaluate(() => openStart(customPrograms.find(x=>x.id==='nav-audit')));
    await pause(page,300);
    await page.click('#startBackTop'); await pause(page,450);
    s = await nav(page);
    ok('Start с Сегодня возвращается на Сегодня', good(s,'scrMenu',0), JSON.stringify(s));
    await page.close();
  }

  // ---- глубокий экран -> другой root: старый стек должен физически схлопнуться ----
  {
    const page = await boot(b, errs);
    const baseLen = await page.evaluate(() => history.length);
    await page.evaluate(() => { goTab('scrPrograms'); openBuilder('nav-audit'); });
    await pause(page,350);
    await page.evaluate(() => goTab('scrAccount'));
    await pause(page,600);
    let s = await nav(page);
    const collapsedLen = await page.evaluate(() => history.length);
    ok('из глубины в другой root приходит с чистым стеком', good(s,'scrAccount',1), JSON.stringify(s));
    ok('старый deep forward-хвост обрезан новым root push', collapsedLen === baseLen + 1, baseLen + ' → ' + collapsedLen);
    await page.goBack(); await pause(page,400);
    s = await nav(page);
    ok('один Back после deep→root ведёт на Сегодня', good(s,'scrMenu',0), JSON.stringify(s));
    await page.close();
  }

  // ---- картинки программы — обычный вложенный экран Builder ----
  {
    const page = await boot(b, errs);
    await page.evaluate(() => { goTab('scrPrograms'); openBuilder('nav-audit'); openImages(); });
    await pause(page,350);
    let s = await nav(page);
    ok('Картинки открываются поверх Builder', good(s,'scrImages',3), JSON.stringify(s));
    await page.click('#imgBackTop'); await pause(page,400);
    s = await nav(page);
    ok('назад из Картинок возвращает ровно в Builder', good(s,'scrBuilder',2), JSON.stringify(s));
    await page.close();
  }

  // ---- legal, client, catalog status screens: динамические источники возврата ----
  {
    const page = await boot(b, errs);
    await page.evaluate(() => { goTab('scrAccount'); openLegal('privacy'); });
    await pause(page,300);
    await page.click('#legalBackTop'); await pause(page,400);
    let s = await nav(page);
    ok('Правила возвращают в Другое', good(s,'scrAccount',1), JSON.stringify(s));

    await page.evaluate(async () => {
      trainer.on = true; syncDockTabs();
      goTab('scrTrainer');
      const c = await addClient(); c.name = 'Навигация';
      openClient(clients.indexOf(c));
    });
    await pause(page,350);
    s = await nav(page);
    ok('карточка подопечного открывается поверх Подопечных', good(s,'scrClient',2), JSON.stringify(s));
    await page.click('#clBackTop'); await pause(page,400);
    s = await nav(page);
    ok('назад из подопечного возвращает в Подопечные', good(s,'scrTrainer',1), JSON.stringify(s));

    await page.evaluate(() => {
      const p = customPrograms.find(x=>x.id==='nav-audit');
      p.pub = {id:'nav-pub', status:'pending', draft:{cat:'tone',level:'Средний',gives:'Тест'}};
      goTab('scrAccount'); switchMoreTab('coach'); openMyCatalog();
    });
    await pause(page,300);
    await page.evaluate(() => openPublish(customPrograms.find(x=>x.id==='nav-audit')));
    await pause(page,250);
    s = await nav(page);
    ok('статус публикации открывается поверх «В каталоге»', good(s,'scrPublish',3), JSON.stringify(s));
    await page.click('#pubBackTop'); await pause(page,400);
    s = await nav(page);
    ok('назад из публикации возвращает в «В каталоге»', good(s,'scrMyCatalog',2), JSON.stringify(s));
    await page.click('#mcBackTop'); await pause(page,450);
    s = await nav(page);
    ok('назад из «В каталоге» возвращает во вкладку тренера', good(s,'scrAccount',1), JSON.stringify(s));
    await page.close();
  }

  // ---- обычный Finish -> Готово: старые Work/Start не остаются под Сегодня ----
  {
    const page = await boot(b, errs);
    await page.evaluate(async () => {
      openStart(customPrograms.find(x=>x.id==='nav-audit'));
      $('btnStart').click();
      await new Promise(r => setTimeout(r, 500));
      state.globalStart = Date.now() - 120000;
      state.pausedTotal = 0;
      finishWorkout();
    });
    await pause(page,900);
    let s = await nav(page);
    ok('обычная тренировка приходит на Finish', s.screen === 'scrFinish', JSON.stringify(s));
    await page.click('#btnAgain'); await pause(page,650);
    s = await nav(page);
    ok('Готово с Finish схлопывает Start/Work и ведёт на Сегодня', good(s,'scrMenu',0), JSON.stringify(s));
    await page.close();
  }

  // ---- системный Back во время тренировки: попап, затем чистый выход на Сегодня ----
  {
    const page = await boot(b, errs);
    await page.evaluate(() => {
      openStart(customPrograms.find(x=>x.id==='nav-audit'));
      $('btnStart').click();
    });
    await pause(page,700);
    let s = await nav(page);
    ok('тренировка запущена', s.screen==='scrWork', JSON.stringify(s));
    await page.goBack(); await pause(page,300);
    s = await nav(page);
    ok('Back во время тренировки не уходит, а открывает выход', s.screen==='scrWork' && s.modals.includes('exitModal'), JSON.stringify(s));
    await page.click('#exitDrop'); await pause(page,650);
    s = await nav(page);
    ok('завершить без сохранения ведёт на Сегодня без modal-хвоста', good(s,'scrMenu',0) && s.modals.length===0, JSON.stringify(s));
    await page.close();
  }

  // ---- первый запуск: Onboarding сам является корнем history ----
  {
    const ctx = await b.newContext({viewport:{width:412,height:900}, locale:'ru-RU'});
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(BASE + '/index.html', {waitUntil:'load'});
    await pause(page,1800);
    let s = await nav(page);
    ok('Onboarding записан как корень history', good(s,'scrOnboard',0), JSON.stringify(s));

    await page.click('#obLegal1'); await pause(page,350);
    s = await nav(page);
    ok('Правила с Onboarding лежат одним уровнем выше', good(s,'scrLegal',1), JSON.stringify(s));
    await page.goBack(); await pause(page,450);
    s = await nav(page);
    ok('системный Back из Правил возвращает в Onboarding', good(s,'scrOnboard',0), JSON.stringify(s));

    await page.click('#obLegal1'); await pause(page,300);
    await page.click('#legalBackTop'); await pause(page,450);
    s = await nav(page);
    ok('собственная кнопка Назад из Правил тоже возвращает в Onboarding', good(s,'scrOnboard',0), JSON.stringify(s));
    await ctx.close();
  }

  console.log('\npageerror:', errs.length ? errs : 'нет');
  if(errs.length) bad++;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'все переходы сошлись');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
