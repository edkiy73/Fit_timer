/* Системные guards AI-генерации:
   - время программы обязательно, по умолчанию 10 минут и не снимается;
   - дефолты сами по себе не считаются запросом;
   - новое упражнение нельзя генерировать совсем без условий;
   - изображения нельзя генерировать без названия программы/упражнения;
   - в раздел картинок нельзя войти, пока есть безымянные сущности.

   Запуск:  node tests/dev-server.js 8124
            node tests/ai-generation-guards.js */

const { installV2Fixtures } = require('./helpers/v2-fixtures');
let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

(async () => {
  const b = await chromium.launch({executablePath: CHROME, args: ['--no-sandbox']});
  const errs = [];
  const page = await (await b.newContext({viewport: {width: 360, height: 800}, locale: 'ru-RU'})).newPage();
  await installV2Fixtures(page);
  page.on('pageerror', e => errs.push(String(e)));
  let imageCalls = 0;
  await page.route('**/api/ai', async route => {
    imageCalls++;
    await route.fulfill({status: 500, contentType: 'application/json', body: JSON.stringify({error:'unexpected_ai_call'})});
  });
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(800);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(500); }

  // Без пола и возраста экран ИИ сначала спрашивает анкету («Кто ты») — заполняем, как в остальных тестах.
  await page.evaluate(async () => { const u = curUser(); u.gender = 'f'; u.age = 30; await saveUsers(); });
  // Создание и правка через ИИ работают на AI Contract V2; без запроса человека ИИ не вызывается.
  await page.evaluate(async () => {
    customPrograms.push({id:'guard-edit', name:'Тестовая программа', plans:[{id:'guard-plan', days:['Пн'], rounds:1, roundRest:0,
      exercises:[v2ex('Присед', {value:10, rest:30})]}]});
    await savePrograms();
  });
  const closeModals = () => page.evaluate(() => document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open')));
  // Пустой запрос не тратит ИИ: «за меня» без условий просит описать задачу
  const guarded = async (name, open, re) => {
    await closeModals();
    await page.evaluate(open);
    await page.evaluate(() => $('aiSelf').click());
    await page.waitForTimeout(80);
    ok(name, re.test(await page.textContent('#dlgMsg')), await page.textContent('#dlgMsg'));
  };
  await guarded('программа без условий не генерируется', () => { initAIForm(); openAI('text'); }, /Выбери|Укажи|Расскажи|Опиши/);
  await guarded('упражнение без условий не генерируется', () => openExAI(), /Выбери|Укажи|Расскажи|Опиши/);
  await guarded('правка программы без задания не уходит', () => openEditAI(customPrograms.find(p => p.id === 'guard-edit')), /Напиши|Опиши|задани/);
  await guarded('правка упражнения без задания не уходит', () => { openBuilder('guard-edit'); openExEdAI(0); }, /Напиши|Опиши|задани/);
  await closeModals();
  ok('ни один из этих входов не обратился к ИИ', imageCalls === 0, imageCalls);

  await page.evaluate(async () => {
    await kvSet('account', JSON.stringify(Object.assign({}, account, {
      email: 'guard-test@example.com',
      syncToken: 'guard-test-token',
      sub: {plan:'year', until:'2099-01-01'}
    })));
    await loadAccount();
    await kvSet('deviceId', 'guard-test-device'); await loadIdentity();
    customPrograms.push({id:'guard-images', name:'', plans:[{days:['Пн'], rounds:1, roundRest:0,
      exercises:[v2ex('Присед', {value:10, rest:30})]}]});
    await savePrograms();
    openBuilder('guard-images');
  });
  await page.waitForTimeout(150);

  const noProgramWorkspace = await page.evaluate(() => openImages());
  ok('в раздел картинок нельзя войти без названия программы', noProgramWorkspace === false);
  ok('без названия программы показывается понятная причина',
    /назови программу/.test(await page.textContent('#dlgMsg')));
  await page.evaluate(() => document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open')));

  await page.evaluate(() => {
    $('bName').value = 'Тест';
    const next = JSON.parse(JSON.stringify(draft));
    next.name = 'Тест';
    FitExerciseV2.prescriptionOf(next.plans[0].exercises[0]).name = '';
    loadBuilderDraft(next, 0);
  });
  const unnamedExerciseWorkspace = await page.evaluate(() => openImages());
  ok('в раздел картинок нельзя войти с безымянным упражнением', unnamedExerciseWorkspace === false);
  ok('раздел картинок просит назвать все упражнения',
    /назови все упражнения/.test(await page.textContent('#dlgMsg')));
  await page.evaluate(() => document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open')));

  await page.evaluate(() => {
    const next = JSON.parse(JSON.stringify(draft));
    FitExerciseV2.prescriptionOf(next.plans[0].exercises[0]).name = 'Присед';
    loadBuilderDraft(next, 0);
  });
  ok('после названий раздел картинок открывается', await page.evaluate(() => openImages()) !== false);
  ok('экран картинок действительно открыт', await page.isVisible('#scrImages'));
  await page.evaluate(() => closeImages());
  await page.waitForTimeout(100);

  const blockedCover = await page.evaluate(async () => {
    $('bName').value = '';
    return await generateOneImageViaAI('cover', null, 'Обложка', ()=>{});
  });
  ok('обложка без названия программы блокируется общим генератором', blockedCover === false);
  ok('провайдер не вызывается для пустой обложки', imageCalls === 0, imageCalls);
  await page.evaluate(() => document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open')));

  const blockedExercise = await page.evaluate(async () => {
    $('bName').value = 'Тест';
    return await generateOneImageViaAI('ex', {name:'', desc:'', muscles:[]}, 'Упражнение', ()=>{});
  });
  ok('картинка без названия упражнения блокируется общим генератором', blockedExercise === false);
  ok('провайдер всё ещё не вызван', imageCalls === 0, imageCalls);

  ok('без ошибок в консоли', !errs.length, errs.join(' | '));
  await b.close();
  console.log(bad ? '\nПровалено: ' + bad : '\nВсё ок');
  process.exit(bad ? 1 : 0);
})();
