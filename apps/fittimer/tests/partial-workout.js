/* Частичная тренировка: сделанное сохраняется, но не превращается в полное
   прохождение программы.

   Запуск:  node tests/dev-server.js 8124
            node tests/partial-workout.js */

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

(async () => {
  const b = await chromium.launch({executablePath: CHROME, args:['--no-sandbox']});
  const errs = [];
  const page = await (await b.newContext({viewport:{width:412,height:900}, locale:'ru-RU'})).newPage();
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', {waitUntil:'load'});
  await page.waitForTimeout(900);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(700); }

  await page.evaluate(async () => {
    const u = curUser(); u.gender = 'f'; u.age = 30; await saveUsers();
    const today = DAYS[(new Date().getDay() + 6) % 7];
    customPrograms.push({
      id:'partial-test', name:'Частичная проверка', active:true, progression:1,
      stats:{completions:0},
      plans:[{days:[today], rounds:1, roundRest:0, exercises:[
        {name:'Первое', type:'reps', value:'10', sets:1, rest:0, restAfter:0, progOn:true, repsStep:1},
        {name:'Второе', type:'reps', value:'10', sets:1, rest:0, restAfter:0, progOn:true, repsStep:1}
      ]}]
    });
    await savePrograms();
    openStart(customPrograms.find(x => x.id === 'partial-test'));
    $('btnStart').click();
  });
  await page.waitForTimeout(700);

  await page.evaluate(() => {
    // Первый рабочий шаг выполнен честно через новый семантический переход.
    while(state.steps[state.stepIdx] && state.steps[state.stepIdx].phase !== 'work') nextStep();
    completeStep();
    state.globalStart = Date.now() - 120000;
    state.pausedTotal = 0;
    exitWorkout();
  });
  await page.waitForTimeout(100);

  ok('в выходе есть «Закончить на сегодня»', await page.isVisible('#exitFinishToday'));
  await page.click('#exitFinishToday');
  await page.waitForTimeout(800);

  const snap = await page.evaluate(async () => {
    const h = stats.history[stats.history.length - 1] || {};
    const p = customPrograms.find(x => x.id === 'partial-test');
    const session = await sessionForProgram('partial-test');
    const week = weekPlanInfo();
    renderToday();
    return {
      screen:show._last,
      title:$('finTitle').textContent,
      ex:$('finEx').textContent,
      status:h.status,
      meaningful:h.meaningful,
      done:h.doneExercises,
      planned:h.plannedExercises,
      exercises:h.exercises,
      count:stats.count || 0,
      completions:(p.stats || {}).completions || 0,
      session:!!session,
      debt:week.debt.some(x => x.pid === 'partial-test'),
      partialTotal:week.partialTotal || 0,
      today:$('todayList').textContent.replace(/\s+/g,' ').trim()
    };
  });

  ok('открыт обычный экран результата', snap.screen === 'scrFinish', JSON.stringify(snap));
  ok('финал нейтральный — сделанное сохранено', snap.title === 'Сделанное сохранено', snap.title);
  ok('показан честный результат 1/2', snap.ex === '1/2', snap.ex);
  ok('история знает, что тренировка частичная', snap.status === 'partial' && snap.done === 1 && snap.planned === 2, JSON.stringify(snap));
  ok('в историю попало только реально выполненное упражнение',
    Array.isArray(snap.exercises) && snap.exercises.length === 1 && snap.exercises[0] === 'Первое',
    JSON.stringify(snap.exercises));
  ok('частичная не увеличивает полный счётчик и completions', snap.count === 0 && snap.completions === 0, JSON.stringify(snap));
  ok('один короткий выполненный подход не удерживает серию сам по себе', snap.meaningful === false, JSON.stringify(snap));
  ok('после «Закончить на сегодня» незавершённой сессии больше нет', !snap.session);
  ok('частичная закрывает долг недели, но остаётся частичной', !snap.debt && snap.partialTotal >= 1, JSON.stringify(snap));
  ok('на Сегодня видно «Частично», а не полную галочку', /Частично/.test(snap.today), snap.today);

  const override = await page.evaluate(() => {
    const last = stats.history[stats.history.length - 1];
    stats.history.push({
      id:'partial-test-full-override', d:last.d, pid:'partial-test', status:'full',
      sec:600, plan:0, exercises:['Первое','Второе']
    });
    const w = weekPlanInfo();
    const day = w.days.find(x => x.iso === last.d);
    return {full:day && day.full, part:day && day.part, done:w.doneTotal, partial:w.partialTotal};
  });
  ok('полный результат в тот же день сильнее частичного',
    override.full && !override.part && override.done >= 1 && override.partial === 0,
    JSON.stringify(override));

  ok('без ошибок в консоли', !errs.length, errs.join(' | '));

  await b.close();
  console.log(bad ? '\nПровалено: ' + bad : '\nВсё ок');
  process.exit(bad ? 1 : 0);
})();