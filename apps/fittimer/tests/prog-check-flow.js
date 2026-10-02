/* Пачка 4: нагрузка больше не растёт сама по достижении порога — экран финала
   спрашивает «Всё получилось? Нагрузку повысим», и решает человек. Отмеченное
   «тяжело» упражнение не растёт и снова попадёт в проверку на следующей
   тренировке; неотмеченное растёт сразу по нажатию «Да, повышаем».

   Запуск:  node tests/dev-server.js 8124
            node tests/prog-check-flow.js */

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
  const page = await (await b.newContext({viewport: {width: 412, height: 900}, locale: 'ru-RU'})).newPage();
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(1000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(800); }

  await page.evaluate(async () => {
    const u = curUser(); u.gender = 'f'; u.age = 30; await saveUsers();
    configureWorkoutTiming({prep: 0});
    const p = {id: 'pc', name: 'Проверка прогресса', progression: 1, stats: {completions: 0},
      plans: [{days: ['Пн'], rounds: 1, roundRest: 0, exercises: [
        {name: 'Присед', type: 'reps', value: '10', sets: 1, rest: 5, progOn: true, trackWeight: false, repsStep: 1}
      ]}]};
    await kvSet(pk('customPrograms'), JSON.stringify([...customPrograms, p]));
    await loadData();
    await savePrograms();
  });

  // reach=false — тренировку завершили, не дойдя до упражнения: оно не
  // считается выполненным и не участвует в проверке прогресса
  const run = async (reach = true) => {
    await page.evaluate(() => openStart(customPrograms.find(x => x.id === 'pc')));
    await page.click('#btnStart');
    await page.waitForSelector('#startModal.open');
    await page.click('#startFresh');
    await page.waitForFunction(() => state.live && state.steps.some(step => step.phase === 'work'));
    await page.evaluate((reach) => {
      const outcomes = {};
      state.steps.forEach((step, i) => {
        if(step.phase !== 'work') return;
        outcomes[workoutStepKey(step, i)] = reach ? 'done' : 'skipped';
      });
      startWorkout(0, 120 * 1000, {skipPrep:true, outcomes});
      finishWorkout();
      document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
    }, reach);
    await page.waitForTimeout(1200);
  };
  const reps = () => page.evaluate(() => {
    const ex = normPlans(customPrograms.find(x => x.id === 'pc'))[0].exercises[0];
    return getExProgValue('pc', ex, customPrograms.find(x => x.id === 'pc'), 'reps');
  });

  // ---- тренировка 0: до упражнения не дошли — счётчик не растёт, вопроса нет ----
  await run(false);
  ok('недостигнутое упражнение не попадает в проверку', !(await page.isVisible('#finProgCheck')));
  ok('счётчик недостигнутого упражнения не растёт', (await page.evaluate(() =>
    +((normPlans(customPrograms.find(x => x.id === 'pc'))[0].exercises[0].ps || {}).n || 0))) === 0);

  // ---- тренировка 1: порог достигнут (progression=1), нагрузка НЕ растёт сама ----
  await run();
  ok('нагрузка не выросла сама по достижении порога',
     (await reps()) === 10, 'reps=' + (await reps()));
  ok('экран финала предлагает повышение', await page.isVisible('#finProgCheck'));
  ok('карточки изменений видны сразу', await page.isVisible('#finProgCheckList'));
  const firstCard = await page.locator('.fpc-card').first().textContent();
  ok('карточка показывает упражнение и точное сейчас → будет',
    /Присед/.test(firstCard) && /10/.test(firstCard) && /11/.test(firstCard) && /→/.test(firstCard),
    firstCard);
  ok('главная кнопка говорит применить изменения',
    /Применить изменения/.test(await page.textContent('#finProgCheckYes')),
    await page.textContent('#finProgCheckYes'));

  // ---- оставляем упражнение без изменений и подтверждаем: рост не применяется ----
  ok('карточка исключения сначала aria-pressed=false',
    await page.locator('.fpc-card').first().getAttribute('aria-pressed') === 'false');
  await page.click('.fpc-card');
  ok('карточка исключения после нажатия aria-pressed=true',
    await page.locator('.fpc-card').first().getAttribute('aria-pressed') === 'true');
  ok('исключение явно подписано «Без изменений»',
    /Без изменений/.test(await page.locator('.fpc-card').first().textContent()));
  await page.click('#finProgCheckYes');
  await page.waitForTimeout(300);
  ok('оставленное без изменений упражнение не растёт', (await reps()) === 10, 'reps=' + (await reps()));
  ok('после подтверждения виден статус «готово»', await page.isVisible('#finProgCheckDone'));
  ok('карточки и кнопка скрыты после подтверждения', !(await page.isVisible('#finProgCheckAsk')));
  const firstDone = await page.textContent('#finProgCheckDone');
  ok('итог показывает сколько повышено и сколько оставлено',
    /Повышено:\s*0/.test(firstDone) && /Без изменений:\s*1/.test(firstDone), firstDone);

  // ---- тренировка 2: снова достигнут порог (счётчик не сбрасывался для «тяжело») ----
  await run();
  ok('проверка вернулась на следующей тренировке', await page.isVisible('#finProgCheck'));
  await page.click('#finProgCheckYes'); // на этот раз ничего не оставляем
  await page.waitForTimeout(300);
  ok('без исключения нагрузка растёт после «Применить изменения»',
     (await reps()) === 11, 'reps=' + (await reps()));
  const secondDone = await page.textContent('#finProgCheckDone');
  ok('итог подтверждает применённое повышение',
    /Повышено:\s*1/.test(secondDone) && /Без изменений:\s*0/.test(secondDone), secondDone);

  // ---- тренировка 3: порог ещё не достигнут (реплика упражнения сброшена, progression не 1) ----
  await page.evaluate(async () => {
    const p = customPrograms.find(x => x.id === 'pc');
    p.progression = 3;
    normPlans(p)[0].exercises[0].ps.n = 0;
    await savePrograms();
  });
  await run();
  ok('блок проверки не показывается, пока порог не достигнут', !(await page.isVisible('#finProgCheck')));

  // ---- полностью пройденная двойная прогрессия больше не спрашивает «повышаем?» ----
  await page.evaluate(async () => {
    const p = {id:'pc-terminal', name:'Финальный потолок', progression:1, stats:{completions:1},
      plans:[{days:['Пн'], rounds:1, roundRest:0, exercises:[{
        id:'term1', name:'Финальный жим', type:'reps', value:'8-10', sets:1, rest:5,
        progOn:true, trackWeight:true, weight:20, weightMax:20, wStep:2,
        repsStep:1, repsMax:20, dualProg:true, ps:{n:0, cur:{kg:20, reps:'18-20'}}
      }]}]};
    await kvSet(pk('customPrograms'), JSON.stringify([...customPrograms, p]));
    await loadData();
    await savePrograms();
    openStart(customPrograms.find(x => x.id === 'pc-terminal'));
  });
  await page.click('#btnStart');
  await page.waitForSelector('#startModal.open');
  await page.click('#startFresh');
  await page.waitForFunction(() => state.live && state.steps.some(step => step.phase === 'work'));
  await page.evaluate(() => {
    const outcomes = {};
    state.steps.forEach((step, i) => {
      if(step.phase === 'work') outcomes[workoutStepKey(step, i)] = 'done';
    });
    startWorkout(0, 120 * 1000, {skipPrep:true, outcomes});
    finishWorkout();
    document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  });
  await page.waitForTimeout(1000);
  const terminalState = await page.evaluate(() => {
    const ex = normPlans(customPrograms.find(x => x.id === 'pc-terminal'))[0].exercises[0];
    return {n:+((ex.ps || {}).n || 0), reps:progressedRepsRange('pc-terminal', ex, null), kg:getExWeight('pc-terminal', ex, null)};
  });
  ok('после полного потолка вопрос о повышении больше не появляется', !(await page.isVisible('#finProgCheck')));
  ok('после полного потолка счётчик проверки не копится',
     terminalState.n === 0 && terminalState.reps === '18-20' && terminalState.kg === 20,
     JSON.stringify(terminalState));

  // ---- resistance: финальный review показывает физические labels, а не level-index ----
  await page.evaluate(async () => {
    const p = {id:'pc-level', name:'Резинки', progression:1, stats:{completions:0},
      plans:[{days:['Пн'], rounds:1, roundRest:0, exercises:[{
        id:'band1', name:'Тяга резинки', type:'reps', value:'12-15', sets:1, rest:5,
        progOn:true, trackWeight:false, loadType:'level', progMode:'level',
        loadLevels:[{label:'Лёгкое'},{label:'Среднее'},{label:'Сильное'}],
        loadLevel:1, repsStep:2, repsMax:18,
        ps:{n:0,cur:{reps:'16-18',level:1}}
      }]}]};
    await kvSet(pk('customPrograms'), JSON.stringify([...customPrograms, p]));
    await loadData();
    await savePrograms();
    openStart(customPrograms.find(x => x.id === 'pc-level'));
  });
  await page.click('#btnStart');
  await page.waitForSelector('#startModal.open');
  await page.click('#startFresh');
  await page.waitForFunction(() => state.live && state.steps.some(step => step.phase === 'work'));
  await page.evaluate(() => {
    const outcomes = {};
    state.steps.forEach((step, i) => {
      if(step.phase === 'work') outcomes[workoutStepKey(step, i)] = 'done';
    });
    startWorkout(0, 120 * 1000, {skipPrep:true, outcomes});
    finishWorkout();
    document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  });
  await page.waitForTimeout(900);
  const resistanceCard = await page.locator('.fpc-card').first().textContent();
  ok('review resistance показывает Среднее → Сильное понятными словами',
    /Среднее/.test(resistanceCard) && /Сильное/.test(resistanceCard) && /→/.test(resistanceCard),
    resistanceCard);
  ok('review resistance не показывает технический level-index',
    !/level\s*\d/i.test(resistanceCard), resistanceCard);
  await page.click('#finProgCheckYes');
  await page.waitForTimeout(250);
  const resistanceApplied = await page.evaluate(() => {
    const ex = normPlans(customPrograms.find(x => x.id === 'pc-level'))[0].exercises[0];
    return {reps:ex.ps && ex.ps.cur && ex.ps.cur.reps, level:ex.ps && ex.ps.cur && ex.ps.cur.level};
  });
  ok('после подтверждения resistance реально переходит на следующий уровень и сбрасывает диапазон',
    resistanceApplied.level === 2 && resistanceApplied.reps === '12-15',
    JSON.stringify(resistanceApplied));

  // ---- находки с устройства: разминка с тем же id, два чипа подряд,
  //      тренировка короче 30 секунд ----
  await page.evaluate(async () => {
    const ex = (id, name, extra) => Object.assign({id, name, type:'reps', value:'10', sets:1, rest:5,
      progOn:true, trackWeight:false, repsStep:1}, extra || {});
    const p = {id:'pc2', name:'Два варианта', progression:1, stats:{completions:0}, plans:[
      {days:['Пн'], rounds:1, roundRest:0, exercises:[
        // старая копия: разминка унаследовала id основного упражнения
        ex('dup', 'Махи руками', {warmup:true, progOn:false}),
        ex('dup', 'Присед'), ex('e2', 'Отжимания')
      ]},
      {days:['Чт'], rounds:1, roundRest:0, exercises:[ex('e3', 'Выпады')]}
    ]};
    await kvSet(pk('customPrograms'), JSON.stringify([...customPrograms, p]));
    await loadData();
    await savePrograms();
  });
  const ids = await page.evaluate(() => normPlans(customPrograms.find(x => x.id === 'pc2'))[0].exercises.map(e => e.id));
  ok('повторяющийся id получает свой при сохранении', new Set(ids).size === ids.length, ids.join(','));

  await page.evaluate(() => {
    const p = customPrograms.find(x => x.id === 'pc2');
    openStart(p);
    const firstPlan = document.querySelector('#planRow .plan-chip[data-plan-idx="0"]');
    if(firstPlan) firstPlan.click();
  });
  await page.click('#btnStart');
  await page.waitForSelector('#startModal.open');
  await page.click('#startFresh');
  await page.waitForFunction(() => state.live && state.steps.some(step => step.phase === 'work'));
  await page.evaluate(() => {
    const outcomes = {};
    state.steps.forEach((step, i) => {
      if(step.phase === 'work') outcomes[workoutStepKey(step, i)] = 'done';
    });
    // короче 30 секунд: финал сначала спрашивает, засчитывать ли
    startWorkout(0, 10 * 1000, {skipPrep:true, outcomes});
    finishWorkout();
    document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  });
  await page.waitForTimeout(1200);
  ok('короткая тренировка: сначала вопрос «засчитать?»', await page.isVisible('#finQuick'));
  await page.click('#btnAgain');
  await page.waitForTimeout(400);
  ok('после «Засчитать» экран финала остаётся и спрашивает про повышение',
     await page.isVisible('#scrFinish') && await page.isVisible('#finProgCheck'));
  const names = await page.$$eval('.fpc-card .fpc-name', xs => xs.map(x => x.textContent));
  ok('в проверке основные упражнения, а не разминка', names.join('|') === 'Присед|Отжимания', names.join('|'));
  await page.click('.fpc-card >> nth=0');
  ok('после исключения список остаётся видимым', await page.isVisible('#finProgCheckList'));
  await page.click('.fpc-card >> nth=1');
  const marked = await page.$$eval('.fpc-card.act', xs => xs.length);
  ok('можно оставить два упражнения без изменений подряд', marked === 2, marked);

  ok('без ошибок в консоли', !errs.length, errs.join(' | '));

  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
