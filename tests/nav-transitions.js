/* Полная матрица навигационных переходов.

Проверяет не только видимый экран, но и browser history/navStack. Главный инвариант:
после явного возврата старые глубокие экраны не должны оставаться за «Сегодня»
и воскресать следующим системным Back.

Запуск:
  node tests/dev-server.js 8124
  node tests/nav-transitions.js
*/

const { becomeTrainer } = require('./helpers/trainer-account');

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
const nap = (page, ms=350) => page.waitForTimeout(ms);

async function state(page){
  return page.evaluate(() => ({
    screen: (document.querySelector('.screen.on') || {}).id || '',
    historyScreen: history.state && history.state.scr || '',
    modal: !!document.querySelector('.modal.open'),
    depth: navDepth,
    stack: [...navStack]
  }));
}
async function aligned(page, label, expected){
  const s = await state(page);
  ok(label + ': видимый экран', s.screen === expected, JSON.stringify(s));
  ok(label + ': history совпадает с экраном', s.historyScreen === expected, JSON.stringify(s));
  ok(label + ': navStack заканчивается экраном', s.stack[s.stack.length - 1] === expected, JSON.stringify(s));
  return s;
}
async function seedProgram(page, id='nav-matrix'){
  await page.evaluate(async id => {
    const p = {
      id, name:'Навигация', desc:'', progression:0, stats:{completions:0},
      plans:[{days:['Пн'], rounds:1, roundRest:0, exercises:[
        {id:id+'-e1', name:'Присед', type:'reps', value:'10', sets:1, rest:30}
      ]}]
    };
    const at = customPrograms.findIndex(x => x.id === id);
    if(at >= 0) customPrograms[at] = p; else customPrograms.push(p);
    await savePrograms();
    renderMine();
  }, id);
}
async function newAppPage(ctx, opts={}){
  const page = await ctx.newPage();
  page.on('pageerror', e => opts.errs && opts.errs.push(String(e)));
  await page.goto('data:text/html,<title>nav-sentinel</title>');
  await page.goto(BASE + '/index.html', {waitUntil:'load'});
  await nap(page, 1000);
  if(!opts.keepOnboarding && await page.isVisible('#obStart')){
    await page.click('#obStart');
    await nap(page, 900);
  }
  if(!opts.keepOnboarding){
    // Навигационный тест не должен сам провоцировать обязательный вопрос профиля:
    // Builder/AI требуют пол и возраст и иначе whoModal закономерно перекрывает экран.
    await page.evaluate(async () => {
      const u = curUser();
      if(u){
        u.gender = u.gender || 'f';
        u.age = u.age || 30;
        await saveUsers();
      }
      goTab('scrMenu');
    });
    await nap(page);
    await aligned(page, 'нормализация старта', 'scrMenu');
  }
  return page;
}
async function homeThenExit(page, label){
  if((await state(page)).screen !== 'scrMenu'){
    await page.evaluate(() => goTab('scrMenu'));
    await nap(page, 900);
  }
  await aligned(page, label + ': Сегодня', 'scrMenu');
  await page.goBack({waitUntil:'load', timeout:5000}).catch(()=>{});
  await nap(page, 250);
  ok(label + ': Back с «Сегодня» выходит из приложения, а не в старый экран',
    page.url().startsWith('data:text/html'), page.url());
  await page.close();
}
async function scenario(ctx, name, fn, errs){
  const page = await newAppPage(ctx, {errs});
  console.log('\n— ' + name);
  try{ await fn(page); }
  catch(e){ bad++; console.log(' ПЛОХО  ' + name + ': исключение → ' + (e && e.stack || e)); }
  if(!page.isClosed()) await page.close();
}

(async()=>{
  const browser = await chromium.launch({executablePath:CHROME});
  const errs = [];
  const ctx = await browser.newContext({viewport:{width:412,height:900}, locale:'ru-RU'});

  // Один раз создаём профиль/хранилище; следующие страницы в этом context уже без онбординга.
  const init = await newAppPage(ctx, {errs});
  await init.close();

  await scenario(ctx, 'корневые вкладки не копят историю', async page => {
    await page.evaluate(() => { goTab('scrPrograms'); goTab('scrStats'); goTab('scrAccount'); goTab('scrPrograms'); });
    await nap(page, 500);
    await aligned(page, 'последняя вкладка', 'scrPrograms');
    await homeThenExit(page, 'корневые вкладки');
  }, errs);

  await scenario(ctx, 'старт программы → назад', async page => {
    await seedProgram(page, 'nav-start');
    await page.evaluate(() => { goTab('scrPrograms'); openStart(customPrograms.find(x=>x.id==='nav-start')); });
    await nap(page);
    await aligned(page, 'экран старта', 'scrStart');
    await page.click('#startBackTop');
    await nap(page, 600);
    await aligned(page, 'назад со старта', 'scrPrograms');
    await homeThenExit(page, 'старт программы');
  }, errs);

  await scenario(ctx, 'каталог → назад', async page => {
    await page.evaluate(() => goTab('scrPrograms'));
    await nap(page);
    await page.click('#btnToStore');
    await nap(page, 500);
    await aligned(page, 'каталог', 'scrStore');
    await page.click('#storeBackTop');
    await nap(page, 600);
    await aligned(page, 'назад из каталога', 'scrPrograms');
    await homeThenExit(page, 'каталог');
  }, errs);

  await scenario(ctx, 'модалка создания → ручной конструктор → назад', async page => {
    await page.evaluate(() => goTab('scrPrograms'));
    await nap(page);
    await page.click('#btnAddProgram');
    await nap(page, 150);
    ok('модалка создания открыта', await page.isVisible('#createModal'));
    await page.click('#chManual');
    await nap(page, 500);
    await aligned(page, 'конструктор из модалки', 'scrBuilder');
    await page.click('#builderBackTop');
    await nap(page, 650);
    await aligned(page, 'назад из конструктора', 'scrPrograms');
    await homeThenExit(page, 'ручной конструктор');
  }, errs);

  await scenario(ctx, 'модалка создания → ИИ → назад', async page => {
    await page.evaluate(() => goTab('scrPrograms'));
    await nap(page);
    await page.click('#btnAddProgram');
    await nap(page, 120);
    await page.click('#chAI');
    await nap(page, 500);
    await aligned(page, 'ИИ из модалки', 'scrAI');
    await page.click('#aiBackTop');
    await nap(page, 650);
    await aligned(page, 'назад из ИИ', 'scrPrograms');
    await homeThenExit(page, 'создание через ИИ');
  }, errs);

  await scenario(ctx, 'системный Back закрывает модалку, а не экран', async page => {
    await page.evaluate(() => goTab('scrPrograms'));
    await nap(page);
    await page.click('#btnAddProgram');
    await nap(page, 150);
    await page.goBack();
    await nap(page, 450);
    await aligned(page, 'после системного Back модалки', 'scrPrograms');
    ok('модалка закрыта', !(await page.isVisible('#createModal')));
    await homeThenExit(page, 'системный Back модалки');
  }, errs);

  await scenario(ctx, 'конструктор → настройки → Готово → системный Back', async page => {
    await seedProgram(page, 'nav-settings');
    await page.evaluate(() => { goTab('scrPrograms'); openBuilder('nav-settings'); });
    await nap(page, 450);
    await page.click('#bSettingsToggle');
    await nap(page, 300);
    await aligned(page, 'настройки программы', 'scrProgSettings');
    await page.click('#btnPsDone');
    await nap(page, 500);
    await aligned(page, 'возврат из настроек', 'scrBuilder');
    await page.goBack();
    await nap(page, 550);
    await aligned(page, 'Back из конструктора после настроек', 'scrPrograms');
    await homeThenExit(page, 'настройки программы');
  }, errs);

  await scenario(ctx, 'новое упражнение → ИИ → назад не воскресит ИИ', async page => {
    await seedProgram(page, 'nav-new-ex');
    await page.evaluate(() => { goTab('scrPrograms'); openBuilder('nav-new-ex'); addExManual(); });
    await nap(page, 450);
    await aligned(page, 'новое упражнение', 'scrExercise');
    await page.click('#exModeTabs .tab[data-m="ai"]');
    await nap(page, 450);
    await aligned(page, 'ИИ нового упражнения', 'scrAI');
    await page.click('#aiBackTop');
    await nap(page, 550);
    await aligned(page, 'назад из ИИ нового упражнения', 'scrBuilder');
    await page.goBack();
    await nap(page, 300);
    ok('Back после нового упражнения спрашивает про несохранённое', await page.isVisible('#dlgOk'));
    await page.click('#dlgOk');
    await nap(page, 700);
    await aligned(page, 'Back после возврата из ИИ ведёт к тренировкам', 'scrPrograms');
    await homeThenExit(page, 'новое упражнение / ИИ');
  }, errs);

  await scenario(ctx, 'существующее упражнение → ИИ → назад', async page => {
    await seedProgram(page, 'nav-edit-ex');
    await page.evaluate(() => { goTab('scrPrograms'); openBuilder('nav-edit-ex'); openExercise(0); });
    await nap(page, 450);
    await page.click('#exModeTabs .tab[data-m="ai"]');
    await nap(page, 450);
    await aligned(page, 'ИИ существующего упражнения', 'scrAI');
    await page.click('#aiBackTop');
    await nap(page, 500);
    await aligned(page, 'назад из ИИ существующего упражнения', 'scrBuilder');
    await page.goBack();
    await nap(page, 300);
    ok('Back после редактирования спрашивает про несохранённое', await page.isVisible('#dlgOk'));
    await page.click('#dlgOk');
    await nap(page, 700);
    await aligned(page, 'Back после редактирования упражнения', 'scrPrograms');
    await homeThenExit(page, 'существующее упражнение / ИИ');
  }, errs);

  await scenario(ctx, 'несохранённый конструктор: Остаться / Выйти', async page => {
    await seedProgram(page, 'nav-dirty');
    await page.evaluate(() => { goTab('scrPrograms'); openBuilder('nav-dirty'); });
    await nap(page, 350);
    await page.fill('#bName', 'Навигация изменена');
    await page.goBack();
    await nap(page, 300);
    ok('системный Back спрашивает про несохранённое', await page.isVisible('#dlgCancel'));
    await page.click('#dlgCancel');
    await nap(page, 400);
    await aligned(page, 'после «Остаться»', 'scrBuilder');
    await page.goBack();
    await nap(page, 300);
    ok('повторный Back снова спрашивает', await page.isVisible('#dlgOk'));
    await page.click('#dlgOk');
    await nap(page, 700);
    await aligned(page, 'после «Выйти без сохранения»', 'scrPrograms');
    await homeThenExit(page, 'несохранённый конструктор');
  }, errs);

  await scenario(ctx, 'профиль из главной → назад в Другое', async page => {
    await page.evaluate(() => {
      goTab('scrMenu');
      const u = curUser();
      openUserEdit(u && u.id);
    });
    await nap(page, 350);
    await aligned(page, 'редактор профиля', 'scrUserEdit');
    await page.click('#ueBackTop');
    await nap(page, 600);
    await aligned(page, 'назад из профиля', 'scrAccount');
    await homeThenExit(page, 'редактор профиля');
  }, errs);

  await scenario(ctx, 'Другое → правила → назад', async page => {
    await page.evaluate(() => { goTab('scrAccount'); openLegal('privacy'); });
    await nap(page, 350);
    await aligned(page, 'правила', 'scrLegal');
    await page.click('#legalBackTop');
    await nap(page, 600);
    await aligned(page, 'назад из правил', 'scrAccount');
    await homeThenExit(page, 'правила из Другое');
  }, errs);

  await scenario(ctx, 'ИИ → подробности здоровья → назад в тот же ИИ', async page => {
    await page.evaluate(() => { goTab('scrPrograms'); initAIForm(); openAI('text'); pregnancyWarning(); });
    await nap(page, 250);
    ok('предупреждение беременности открыто', await page.isVisible('#dlgCancel'));
    await page.click('#dlgCancel');
    await nap(page, 450);
    await aligned(page, 'раздел здоровья', 'scrLegal');
    await page.click('#btnLegalDone');
    await nap(page, 500);
    await aligned(page, 'возврат из здоровья', 'scrAI');
    await page.click('#aiBackTop');
    await nap(page, 650);
    await aligned(page, 'выход из ИИ после здоровья', 'scrPrograms');
    await homeThenExit(page, 'здоровье из ИИ');
  }, errs);

  await scenario(ctx, 'каталог → карточка программы → назад', async page => {
    await page.evaluate(() => {
      goTab('scrPrograms');
      openStore('scrPrograms');
      storeServer = [{
        id:'nav-store-item', by:'@nav.trainer', cat:'tone', level:'Средний', min:20,
        name:'Навигация каталога', gives:'Проверка возврата из карточки.',
        cover:null,
        text:'ПРОГРАММА: Навигация каталога\\nДНИ: Пн\\nКРУГИ: 1\\n\\nУПРАЖНЕНИЕ: Планка\\nФОРМАТ: время\\nЗНАЧЕНИЕ: 30\\nПОДХОДЫ: 1\\nОТДЫХ: 20'
      }];
      openStoreItem('nav-store-item');
    });
    await nap(page, 450);
    await aligned(page, 'карточка каталога', 'scrStoreItem');
    await page.click('#siBackTop');
    await nap(page, 450);
    await aligned(page, 'назад к каталогу', 'scrStore');
    await page.click('#storeBackTop');
    await nap(page, 600);
    await aligned(page, 'назад из каталога после карточки', 'scrPrograms');
    await homeThenExit(page, 'карточка каталога');
  }, errs);

  await scenario(ctx, 'конструктор → картинки → Готово', async page => {
    await seedProgram(page, 'nav-images');
    await page.evaluate(() => {
      premiumGate = () => true;
      goTab('scrPrograms');
      openBuilder('nav-images');
      openImages();
    });
    await nap(page, 500);
    await aligned(page, 'картинки программы', 'scrImages');
    await page.click('#imgDone');
    await nap(page, 500);
    await aligned(page, 'возврат из картинок', 'scrBuilder');
    await page.goBack();
    await nap(page, 500);
    await aligned(page, 'Back после картинок', 'scrPrograms');
    await homeThenExit(page, 'картинки программы');
  }, errs);

  await scenario(ctx, 'страница тренера → назад к источнику', async page => {
    await page.evaluate(() => { goTab('scrPrograms'); openTrainer('@nav.public'); });
    await nap(page, 450);
    await aligned(page, 'страница тренера', 'scrTrainerPage');
    await page.click('#tpBackTop');
    await nap(page, 500);
    await aligned(page, 'назад со страницы тренера', 'scrPrograms');
    await homeThenExit(page, 'страница тренера');
  }, errs);

  await scenario(ctx, 'Другое → В каталоге → публикация → назад', async page => {
    await seedProgram(page, 'nav-publish');
    await page.evaluate(() => {
      const p = customPrograms.find(x => x.id === 'nav-publish');
      p.pub = {id:'nav-pub-id', status:'pending'};
      goTab('scrAccount');
      openMyCatalog();
      openPublish(p);
    });
    await nap(page, 450);
    await aligned(page, 'экран публикации', 'scrPublish');
    await page.click('#pubBackTop');
    await nap(page, 450);
    await aligned(page, 'назад в список публикаций', 'scrMyCatalog');
    await page.click('#mcBackTop');
    await nap(page, 600);
    await aligned(page, 'назад из списка публикаций', 'scrAccount');
    await homeThenExit(page, 'публикация');
  }, errs);

  await scenario(ctx, 'активная тренировка → упражнение → ИИ → тренировка', async page => {
    await seedProgram(page, 'nav-live-workout');
    await page.evaluate(() => {
      goTab('scrPrograms');
      const p = customPrograms.find(x => x.id === 'nav-live-workout');
      state.raw = p;
      state.planIdx = 0;
      state.current = {sourceId:p.id, title:p.name, cycle:[], warmup:[], rounds:1};
      state.steps = [{phase:'work', kind:'click', exName:'Присед', exId:'nav-live-workout-e1', title:'Присед', reps:'10'}];
      state.stepIdx = 0;
      state.live = true;
      state.paused = false;
      show('scrWork');
      editExerciseFromWorkout();
    });
    await nap(page, 500);
    await aligned(page, 'упражнение из тренировки', 'scrExercise');
    await page.click('#exModeTabs .tab[data-m="ai"]');
    await nap(page, 450);
    await aligned(page, 'ИИ из активной тренировки', 'scrAI');
    await page.click('#aiBackTop');
    await nap(page, 600);
    await aligned(page, 'возврат в активную тренировку', 'scrWork');

    await page.goBack();
    await nap(page, 450);
    await aligned(page, 'системный Back не бросает тренировку', 'scrWork');
    ok('системный Back на тренировке открывает выход', await page.isVisible('#exitModal'));
    await page.click('#exitDrop');
    await nap(page, 700);
    await aligned(page, 'выход без сохранения из тренировки', 'scrMenu');
    await homeThenExit(page, 'активная тренировка');
  }, errs);

  await scenario(ctx, 'ИИ добавляет упражнение → Builder без возврата в ИИ', async page => {
    await seedProgram(page, 'nav-ai-add');
    await page.evaluate(() => {
      goTab('scrPrograms');
      openBuilder('nav-ai-add');
    });
    // fillBuilder фиксирует исходный snapshot в setTimeout(0). В реальном UI человек
    // физически не успевает открыть ИИ раньше; тест обязан дать этому тика случиться,
    // иначе snapshot снимется уже ПОСЛЕ добавленного упражнения и programDirty() ложно
    // решит, что изменений нет.
    await nap(page, 80);
    const aiAdd = await page.evaluate(async () => {
      openExAI();
      const raw = ['УПРАЖНЕНИЕ: Выпады','ФОРМАТ: повторения','ЗНАЧЕНИЕ: 10','ПОДХОДЫ: 1','ОТДЫХ: 30'].join('\n');
      const verdict = FitAIProtocol.validateResponse('exercise.create', raw);
      $('aiResult').value = raw;
      await exaAddExercise();
      return {
        verdict,
        screen: show._last,
        historyScreen: history.state && history.state.scr,
        stack: [...navStack],
        dialog: $('dlg').classList.contains('open'),
        message: $('dlgMsg').textContent || ''
      };
    });
    ok('тестовый ответ ИИ валиден', !!(aiAdd.verdict && aiAdd.verdict.ok), JSON.stringify(aiAdd.verdict));
    ok('AI-добавление вернуло в Builder', aiAdd.screen === 'scrBuilder' && aiAdd.historyScreen === 'scrBuilder',
      JSON.stringify(aiAdd));
    await aligned(page, 'после добавления через ИИ', 'scrBuilder');
    ok('success-попап открыт уже поверх Builder', aiAdd.dialog && await page.isVisible('#dlgOk'), aiAdd.message);
    await page.click('#dlgOk');
    await nap(page, 650);
    await page.goBack();
    await nap(page, 300);
    ok('Back из изменённого Builder спрашивает о несохранённом', await page.isVisible('#dlgOk'));
    await page.click('#dlgOk');
    await nap(page, 650);
    await aligned(page, 'выход после AI-добавления', 'scrPrograms');
    await homeThenExit(page, 'AI-добавление упражнения');
  }, errs);

  await scenario(ctx, 'финал тренировки → Готово → Сегодня', async page => {
    await seedProgram(page, 'nav-finish');
    await page.evaluate(() => {
      goTab('scrPrograms');
      const p = customPrograms.find(x => x.id === 'nav-finish');
      openStart(p);
      state.current = customToProgram(p, 0);
      startWorkout();
      state.globalStart = Date.now() - 40000;
      finishWorkout();
    });
    await nap(page, 550);
    await aligned(page, 'экран результата', 'scrFinish');
    await page.click('#btnAgain');
    await nap(page, 700);
    await aligned(page, 'Готово с результата', 'scrMenu');
    await homeThenExit(page, 'финал тренировки');
  }, errs);

  await scenario(ctx, 'тренер → подопечный → назад', async page => {
    await page.evaluate(() => goTab('scrAccount'));
    await becomeTrainer(page, {handle:'@navmatrix.' + Math.random().toString(36).slice(2,7)});
    await page.evaluate(async () => {
      renderTrainerCard(); syncDockTabs(); goTab('scrTrainer');
      const c = await addClient();
      renderClients();
      openClient(clients.indexOf(c));
    });
    await nap(page, 500);
    await aligned(page, 'подопечный', 'scrClient');
    await page.click('#clBackTop');
    await nap(page, 500);
    await aligned(page, 'назад к подопечным', 'scrTrainer');
    await homeThenExit(page, 'подопечный');
  }, errs);

  // Отдельный чистый context: проверяем навигацию до создания первого профиля.
  console.log('\n— онбординг → правила → онбординг');
  const obCtx = await browser.newContext({viewport:{width:412,height:900}, locale:'ru-RU'});
  const obPage = await newAppPage(obCtx, {keepOnboarding:true, errs});
  ok('онбординг открыт', await obPage.isVisible('#obStart'));
  await obPage.click('#obLegal1');
  await nap(obPage, 350);
  await aligned(obPage, 'правила из онбординга', 'scrLegal');
  await obPage.click('#btnLegalDone');
  await nap(obPage, 450);
  await aligned(obPage, 'возврат в онбординг', 'scrOnboard');
  await obPage.click('#obStart');
  await nap(obPage, 900);
  await obPage.evaluate(() => goTab('scrMenu'));
  await nap(obPage, 450);
  await aligned(obPage, 'после завершения онбординга', 'scrMenu');
  await obPage.goBack({waitUntil:'load', timeout:5000}).catch(()=>{});
  await nap(obPage, 250);
  ok('Back после завершения онбординга не возвращает правила/онбординг',
    obPage.url().startsWith('data:text/html'), obPage.url());
  await obCtx.close();

  console.log('\npageerror:', errs.length ? errs : 'нет');
  if(errs.length) bad += errs.length;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'вся матрица переходов сошлась');
  await ctx.close();
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
