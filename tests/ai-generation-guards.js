/* Системные guards AI-генерации:
   - время программы обязательно, по умолчанию 10 минут и не снимается;
   - дефолты сами по себе не считаются запросом;
   - новое упражнение нельзя генерировать совсем без условий;
   - изображения нельзя генерировать без названия программы/упражнения;
   - в раздел картинок нельзя войти, пока есть безымянные сущности.

   Запуск:  node tests/dev-server.js 8124
            node tests/ai-generation-guards.js */

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
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(800);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(500); }

  await page.evaluate(() => openAI('text'));
  await page.waitForTimeout(150);

  const initialDuration = await page.evaluate(() => {
    const active = document.querySelector('#qDur .day-chip.act');
    return active ? active.textContent.trim() : '';
  });
  ok('время по умолчанию — 10 минут', initialDuration === '10 мин', initialDuration);

  await page.click('#qDur .day-chip.act');
  const durationAfterRepeat = await page.evaluate(() => {
    const active = document.querySelector('#qDur .day-chip.act');
    return active ? active.textContent.trim() : '';
  });
  ok('обязательное время нельзя снять повторным нажатием', durationAfterRepeat === '10 мин', durationAfterRepeat);
  ok('есть короткий вариант 5 минут', await page.evaluate(() =>
    [...document.querySelectorAll('#qDur .day-chip')].some(x => x.textContent.trim() === '5 мин')));

  const emptyProgram = await page.evaluate(() => aiCreateProgramGuard());
  ok('дефолтные значения не считаются заполненным запросом программы', emptyProgram === false);
  ok('пустой запрос программы объясняется пользователю',
    /хотя бы одно пожелание/.test(await page.textContent('#dlgMsg')));
  await page.evaluate(() => document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open')));

  await page.click('#qGoal .day-chip');
  ok('одной выбранной цели достаточно для генерации программы',
    await page.evaluate(() => aiCreateProgramGuard()) === true);

  await page.evaluate(() => openExAI());
  await page.waitForTimeout(150);
  const emptyExercise = await page.evaluate(() => aiCreateExerciseGuard());
  ok('пустой запрос нового упражнения блокируется', emptyExercise === false);
  ok('пустой запрос упражнения объясняется пользователю',
    /хотя бы одно пожелание/.test(await page.textContent('#dlgMsg')));
  await page.evaluate(() => document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open')));

  await page.click('#exaMuscles .day-chip');
  ok('одного условия упражнения достаточно',
    await page.evaluate(() => aiCreateExerciseGuard()) === true);

  await page.evaluate(async () => {
    window.premiumGate = () => true;
    window.__imageCalls = 0;
    window.callGeminiImage = async () => { __imageCalls++; throw new Error('provider must not be called by guard tests'); };
    customPrograms.push({id:'guard-images', name:'', plans:[{days:['Пн'], rounds:1, roundRest:0,
      exercises:[{name:'Присед', type:'reps', value:10, rest:30}]}]});
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
    draft.name = 'Тест';
    draft.plans[0].exercises[0].name = '';
  });
  const unnamedExerciseWorkspace = await page.evaluate(() => openImages());
  ok('в раздел картинок нельзя войти с безымянным упражнением', unnamedExerciseWorkspace === false);
  ok('раздел картинок просит назвать все упражнения',
    /назови все упражнения/.test(await page.textContent('#dlgMsg')));
  await page.evaluate(() => document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open')));

  await page.evaluate(() => { draft.plans[0].exercises[0].name = 'Присед'; });
  ok('после названий раздел картинок открывается', await page.evaluate(() => openImages()) !== false);
  ok('экран картинок действительно открыт', await page.isVisible('#scrImages'));
  await page.evaluate(() => closeImages());
  await page.waitForTimeout(100);

  const blockedCover = await page.evaluate(async () => {
    $('bName').value = '';
    draft.name = '';
    return await generateOneImageViaAI('cover', null, 'Обложка', ()=>{});
  });
  ok('обложка без названия программы блокируется общим генератором', blockedCover === false);
  ok('провайдер не вызывается для пустой обложки', await page.evaluate(() => __imageCalls) === 0);
  await page.evaluate(() => document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open')));

  const blockedExercise = await page.evaluate(async () => {
    $('bName').value = 'Тест';
    draft.name = 'Тест';
    return await generateOneImageViaAI('ex', {name:'', desc:'', muscles:[]}, 'Упражнение', ()=>{});
  });
  ok('картинка без названия упражнения блокируется общим генератором', blockedExercise === false);
  ok('провайдер всё ещё не вызван', await page.evaluate(() => __imageCalls) === 0);

  ok('без ошибок в консоли', !errs.length, errs.join(' | '));
  await b.close();
  console.log(bad ? '\nПровалено: ' + bad : '\nВсё ок');
  process.exit(bad ? 1 : 0);
})();
