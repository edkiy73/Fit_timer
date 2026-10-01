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
    configureWorkoutTiming({prep: 0});
    openStart(customPrograms.find(x => x.id === 'partial-test'));
  });
  await page.click('#btnStart');
  await page.waitForSelector('#startModal.open');
  await page.click('#startFresh');
  await page.waitForFunction(() => state.live && state.steps.some(step => step.phase === 'work'));

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

  ok('полностью выполненное упражнение внутри частичной попало в проверку прогрессии',
    await page.isVisible('#finProgCheck'));
  await page.click('#finProgCheckToggle');
  const progChips = await page.evaluate(() => [...document.querySelectorAll('.fpc-chip')].map(x => x.textContent.trim()));
  ok('в проверке прогрессии только реально завершённое упражнение',
    progChips.length === 1 && progChips[0] === 'Первое', progChips.join('|'));
  await page.click('#finProgCheckYes');
  await page.waitForTimeout(200);
  const progValues = await page.evaluate(() => {
    const p = customPrograms.find(x => x.id === 'partial-test');
    const ex = normPlans(p)[0].exercises;
    return {
      first:getExProgValue('partial-test', ex[0], p, 'reps'),
      second:getExProgValue('partial-test', ex[1], p, 'reps')
    };
  });
  ok('завершённое упражнение выросло, незавершённое — нет',
    progValues.first === 11 && progValues.second === 10, JSON.stringify(progValues));
  ok('после «Закончить на сегодня» незавершённой сессии больше нет', !snap.session);
  ok('частичная закрывает долг недели, но остаётся частичной', !snap.debt && snap.partialTotal >= 1, JSON.stringify(snap));
  ok('на Сегодня видно «Частично», а не полную галочку', /Частично/.test(snap.today), snap.today);

  const override = await page.evaluate(() => {
    const last = stats.history[stats.history.length - 1];
    restoreStatsState(Object.assign({}, stats, {history:[...(stats.history || []), {
      id:'partial-test-full-override', d:last.d, pid:'partial-test', status:'full',
      sec:600, plan:0, exercises:['Первое','Второе']
    }]}));
    const w = weekPlanInfo();
    const day = w.days.find(x => x.iso === last.d);
    return {full:day && day.full, part:day && day.part, done:w.doneTotal, partial:w.partialTotal};
  });
  ok('полный результат в тот же день сильнее частичного',
    override.full && !override.part && override.done >= 1 && override.partial === 0,
    JSON.stringify(override));

  const streakConsistency = await page.evaluate(() => {
    const savedPrograms = JSON.parse(JSON.stringify(customPrograms));
    const savedHistory = JSON.parse(JSON.stringify(stats.history || []));
    const savedBest = stats.bestStreak || 0;
    const todayDate = new Date();
    const yesterdayDate = new Date(todayDate);
    yesterdayDate.setDate(todayDate.getDate() - 1);
    const today = DAYS[(todayDate.getDay() + 6) % 7];
    const yesterday = DAYS[(yesterdayDate.getDay() + 6) % 7];
    const todayIso = localISO(todayDate);
    const yesterdayIso = localISO(yesterdayDate);
    const p = (id, days) => ({
      id, name:id, active:true,
      plans:[{days,rounds:1,roundRest:0,exercises:[]}]
    });

    customPrograms.splice(0, customPrograms.length,
      p('slot-a',[today]),
      p('slot-b',[today]),
      p('slot-partial',[yesterday]),
      p('extra-workout',[])
    );
    restoreStatsState(Object.assign({}, stats, {
      history:[
        {id:'sa',d:todayIso,pid:'slot-a',status:'full',sec:600},
        {id:'sb',d:todayIso,pid:'slot-b',status:'full',sec:600},
        // meaningful=true раньше ошибочно давал +1 к серии, хотя weekPlanInfo
        // считает такой слот лишь закрытым частично.
        {id:'sp',d:yesterdayIso,pid:'slot-partial',status:'partial',meaningful:true,sec:500},
        {id:'sx',d:yesterdayIso,pid:'extra-workout',status:'full',sec:300}
      ],
      bestStreak:0
    }));

    const currentWeek = weekPlanInfo(todayDate);
    const partialWeek = weekPlanInfo(yesterdayDate);
    const streak = calcStreakInfo();

    // Без расписания meaningful partial остаётся обычным днём активности —
    // это прежняя fallback-семантика, её этой унификацией не меняем.
    customPrograms.splice(0, customPrograms.length, p('free',[]));
    restoreStatsState(Object.assign({}, stats, {
      history:[{id:'free-p',d:todayIso,pid:'free',status:'partial',meaningful:true,sec:500}]
    }));
    const noPlan = calcStreakInfo();

    customPrograms.splice(0, customPrograms.length, ...savedPrograms);
    restoreStatsState(Object.assign({}, stats, {history:savedHistory,bestStreak:savedBest}));

    const todayState = currentWeek.days.find(x => x.iso === todayIso) || {};
    const partialState = partialWeek.days.find(x => x.iso === yesterdayIso) || {};
    return {
      streak,
      noPlan,
      weekDone:todayState.done,
      weekPlanned:todayState.planned,
      partialClosed:partialState.closed,
      partialDone:partialState.done,
      partialCount:partialState.partial,
      extra:partialWeek.extraTotal
    };
  });

  ok('серия считает плановые слоты, поэтому две полные программы в день дают +2',
    streakConsistency.weekPlanned === 2
      && streakConsistency.weekDone === 2
      && streakConsistency.streak.n === 2,
    JSON.stringify(streakConsistency));
  ok('meaningful partial закрывает слот, но не увеличивает серию',
    streakConsistency.partialClosed >= 1
      && streakConsistency.partialDone === 0
      && streakConsistency.partialCount >= 1
      && streakConsistency.streak.n === 2,
    JSON.stringify(streakConsistency));
  ok('тренировка сверх плана не увеличивает серию по плану',
    streakConsistency.extra >= 1 && streakConsistency.streak.n === 2,
    JSON.stringify(streakConsistency));
  ok('без расписания meaningful partial по-прежнему считается днём активности',
    streakConsistency.noPlan.byPlan === false && streakConsistency.noPlan.n === 1,
    JSON.stringify(streakConsistency.noPlan));

  ok('без ошибок в консоли', !errs.length, errs.join(' | '));

  await b.close();
  console.log(bad ? '\nПровалено: ' + bad : '\nВсё ок');
  process.exit(bad ? 1 : 0);
})();