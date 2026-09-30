/* Регрессия: незавершённая тренировка должна продолжаться в сохранённом
   варианте программы, а ручной выбор упражнения всегда начинает его с первого
   подхода/стороны/круга.

   Запуск:  node tests/dev-server.js 8124
            node tests/workout-resume.js */

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
  await page.waitForTimeout(700);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(500); }

  const setup = await page.evaluate(async () => {
    const ex = (name, sets = 1) => ({name, type:'reps', value:'10', sets, rest:0, restAfter:0});
    const p = {
      id:'resume-variant-test', name:'Проверка продолжения', active:true, progression:0,
      plans:[
        {days:['Пн'], rounds:1, roundRest:0, exercises:Array.from({length:5},(_,i)=>ex('Пн ' + (i+1)))},
        {days:['Вт'], rounds:2, roundRest:0, exercises:[
          ex('Вт 1'), ex('Вт 2'), ex('Вт 3'), ex('Вт 4'), ex('Вт 5', 3)
        ]}
      ]
    };
    customPrograms.push(p);
    await savePrograms();

    state.raw = p;
    state.planIdx = 1;
    state.current = customToProgram(p, 1);
    state.steps = buildSteps();
    state.stepIdx = state.steps.findIndex(s =>
      s.phase === 'work' && s.title === 'Вт 5' && (s.setNo || 1) === 1 && s.round === 1);
    state.startLoad = workoutLoadSnapshot(p, 1);
    state.globalStart = Date.now() - 90000;
    state.pausedTotal = 0;
    state.paused = false;
    state.stepDeadline = Date.now() + 42000;
    state.remaining = 42;
    prepSec = 0;
    state.workoutSessionId = 'test-session-inactivity';
    state.stepOutcomes = {};
    const firstDone = state.steps.findIndex(x => x.phase === 'work');
    state.stepOutcomes[workoutStepKey(state.steps[firstDone], firstDone)] = 'done';
    await saveSession();

    const saved = await loadSession();
    if(!saved || !(saved.stepDeadline > Date.now()) || saved.remaining !== 42){
      throw new Error('timer recovery fields were not saved');
    }
    if(saved.sessionId !== 'test-session-inactivity'){
      throw new Error('workout session id was not saved for inactivity reminder');
    }
    if(!saved.outcomes || !Object.values(saved.outcomes).includes('done')){
      throw new Error('per-step workout outcome was not saved');
    }
    if(!saved.workout || !saved.workoutSig){
      throw new Error('workout structure snapshot was not saved');
    }
    // The saved resume point below is a reps step; keep that session realistic after
    // separately proving that timer recovery fields persist.
    state.stepDeadline = 0;
    state.remaining = 0;
    await saveSession();

    openStart(p);
    state.planIdx = 0;
    renderPlanRow();
    renderStartInfo();
    return {savedStep:state.stepIdx};
  });
  ok('сессия сохранена на пятом упражнении', setup.savedStep >= 0, setup.savedStep);

  const stableOutcomeKey = await page.evaluate(() => {
    const step = {phase:'work',exId:'stable-ex',exName:'Стабильное',round:2,setNo:3,side:1};
    const stableA = workoutStepKey(step, 4);
    const stableB = workoutStepKey(step, 99);
    const old = {'stable-ex|2|3|1|17':'done'};
    const migrated = normalizeWorkoutOutcomes(old, [
      {phase:'rest',kind:'timer',seconds:30},
      step
    ]);
    const nameLegacy = normalizeWorkoutOutcomes({'Стабильное|2|3|1|42':'skipped'}, [step]);
    return {stableA, stableB, migrated, nameLegacy};
  });
  ok('ключ результата не зависит от абсолютного индекса шага',
    stableOutcomeKey.stableA === 'stable-ex|2|3|1'
      && stableOutcomeKey.stableA === stableOutcomeKey.stableB,
    JSON.stringify(stableOutcomeKey));
  ok('старый outcome с другим index мигрирует в стабильный ключ',
    stableOutcomeKey.migrated['stable-ex|2|3|1'] === 'done'
      && Object.keys(stableOutcomeKey.migrated).length === 1,
    JSON.stringify(stableOutcomeKey.migrated));
  ok('legacy outcome по имени тоже не теряется после появления exercise.id',
    stableOutcomeKey.nameLegacy['stable-ex|2|3|1'] === 'skipped',
    JSON.stringify(stableOutcomeKey.nameLegacy));

  await page.click('#btnStart');
  await page.waitForTimeout(80);
  const before = await page.evaluate(() => ({
    selected:state.planIdx,
    resumeOpen:$('startResume') && !$('startResume').classList.contains('hidden'),
    summary:$('startResumeSub').textContent
  }));
  ok('до продолжения выбран сегодняшний вариант', before.selected === 0, before.selected);
  ok('продолжение доступно', before.resumeOpen, before.summary);

  await page.click('#startResume');
  await page.waitForTimeout(30);
  const resumed = await page.evaluate(() => ({
    planIdx:state.planIdx,
    title:state.steps[state.stepIdx] && state.steps[state.stepIdx].title
  }));
  ok('продолжили именно вторничный вариант',
    resumed.planIdx === 1 && resumed.title === 'Вт 5', JSON.stringify(resumed));
  ok('сохранённое место не превратилось в упражнение понедельника', resumed.title !== 'Пн 5', resumed.title);

  const nativeResumed = await page.evaluate(async () => {
    // Имитируем уничтоженный WebView: живого workout state больше нет, но session осталась.
    tearDownWorkout();
    prepSec = 5; // notification recovery должна миновать обычный предстартовый countdown
    const ok = await resumeWorkoutFromNativeNotification();
    return {
      ok,
      live:state.live,
      screen:show._last,
      planIdx:state.planIdx,
      title:state.steps[state.stepIdx] && state.steps[state.stepIdx].title,
      prepOpen:$('prepOverlay').classList.contains('on')
    };
  });
  ok('тап системного уведомления восстанавливает сохранённую тренировку',
    nativeResumed.ok && nativeResumed.live && nativeResumed.screen === 'scrWork',
    JSON.stringify(nativeResumed));
  ok('native recovery возвращает тот же вариант и шаг',
    nativeResumed.planIdx === 1 && nativeResumed.title === 'Вт 5',
    JSON.stringify(nativeResumed));
  ok('native recovery не запускает повторный предстартовый countdown',
    !nativeResumed.prepOpen, JSON.stringify(nativeResumed));

  // Сохранённая тренировка — уже начатая работа, а не ссылка на текущую версию
  // программы. После сохранения полностью меняем состав программы и убеждаемся,
  // что «Продолжить» открывает старые шаги, а не новую тренировку под старым stepIdx.
  const changedSetup = await page.evaluate(async () => {
    tearDownWorkout();
    const p = {
      id:'resume-structure-test', name:'Версия тренировки', active:true, progression:0,
      plans:[{days:['Ср'], rounds:1, roundRest:0, exercises:[
        {id:'snap-a',name:'Старое A',type:'reps',value:'8',sets:1,rest:0,restAfter:0},
        {id:'snap-b',name:'Старое B',type:'reps',value:'9',sets:1,rest:0,restAfter:0},
        {id:'snap-c',name:'Старое C',type:'reps',value:'10',sets:1,rest:0,restAfter:0}
      ]}]
    };
    customPrograms.push(p);
    await savePrograms();

    state.raw = p; state.planIdx = 0; state.current = customToProgram(p, 0);
    state.steps = buildSteps();
    state.stepIdx = state.steps.findIndex(s => s.phase === 'work' && s.exId === 'snap-b');
    state.startLoad = workoutLoadSnapshot(p, 0);
    state.globalStart = Date.now() - 45000; state.pausedTotal = 0; state.paused = false;
    state.workoutSessionId = 'session-structure-snapshot';
    state.stepOutcomes = {};
    const first = state.steps.findIndex(s => s.phase === 'work' && s.exId === 'snap-a');
    state.stepOutcomes[workoutStepKey(state.steps[first], first)] = 'done';
    await saveSession();

    const saved = await sessionForProgram(p.id);
    const savedSig = saved && saved.workoutSig;
    const savedNames = saved && saved.workout
      ? [...saved.workout.warmup, ...saved.workout.cycle].filter(s=>s.phase==='work').map(s=>s.exName)
      : [];

    // Та же программа теперь совсем другая: другой порядок, удалён B, добавлен X,
    // увеличено число подходов. Старый абсолютный stepIdx здесь уже означал бы иное.
    p.plans[0].exercises = [
      {id:'snap-c',name:'Новое C',type:'reps',value:'20',sets:2,rest:0,restAfter:0},
      {id:'snap-x',name:'Новое X',type:'reps',value:'30',sets:1,rest:0,restAfter:0},
      {id:'snap-a',name:'Новое A',type:'reps',value:'40',sets:1,rest:0,restAfter:0}
    ];
    await savePrograms();
    openStart(p);
    prepSec = 0;
    return {savedSig, savedNames, savedStep:saved && saved.stepIdx};
  });
  ok('сессия хранит отпечаток и исходный состав тренировки',
    !!changedSetup.savedSig
      && changedSetup.savedNames.join('|') === 'Старое A|Старое B|Старое C',
    JSON.stringify(changedSetup));

  await page.click('#btnStart');
  await page.waitForTimeout(80);
  const changedModal = await page.evaluate(() => ({
    resumeOpen:$('startResume') && !$('startResume').classList.contains('hidden'),
    summary:$('startResumeSub').textContent
  }));
  ok('после изменения программы старая сессия всё ещё предлагается к продолжению',
    changedModal.resumeOpen, changedModal.summary);

  await page.click('#startResume');
  await page.waitForTimeout(30);
  const changedResume = await page.evaluate(() => ({
    title:state.steps[state.stepIdx] && state.steps[state.stepIdx].title,
    names:state.steps.filter(s=>s.phase==='work').map(s=>s.title),
    total:state.steps.filter(s=>s.phase==='work').length,
    currentSig:workoutSessionSignature(state.current)
  }));
  ok('«Продолжить» возвращает на старое упражнение, а не на новый stepIdx',
    changedResume.title === 'Старое B', JSON.stringify(changedResume));
  ok('вся продолженная тренировка остаётся сохранённой версией',
    changedResume.total === 3
      && changedResume.names.join('|') === 'Старое A|Старое B|Старое C'
      && !changedResume.names.some(x=>/Новое/.test(x)),
    JSON.stringify(changedResume));
  ok('продолженная версия имеет тот же отпечаток, что сохранённая',
    changedResume.currentSig === changedSetup.savedSig,
    JSON.stringify({saved:changedSetup.savedSig,current:changedResume.currentSig}));

  await page.evaluate(async () => {
    tearDownWorkout();
    await clearSession('session-structure-snapshot', 'resume-structure-test');
  });

  const choices = await page.evaluate(() => {
    tearDownWorkout();
    const p = customPrograms.find(x => x.id === 'resume-variant-test');
    state.raw = p;
    state.planIdx = 1;
    state.current = customToProgram(p, 1);
    state.steps = buildSteps();
    return workStepChoices().map(c => {
      const s = state.steps[c.idx];
      return {label:c.label, meta:c.meta, setNo:s.setNo || 1, side:s.side || 1, round:s.round};
    });
  });
  ok('в выборе каждое упражнение показано один раз',
    choices.length === 5, choices.map(x=>x.label).join(', '));
  ok('выбор всегда ведёт на первый подход/сторону/круг',
    choices.every(x => x.setNo === 1 && x.side === 1 && x.round === 1),
    JSON.stringify(choices));
  ok('в попапе нет подходов и кругов',
    choices.every(x => !/подход|круг|сторон/i.test(x.meta || '')),
    choices.map(x=>x.meta).join(' | '));

  const duplicateNames = await page.evaluate(() => {
    tearDownWorkout();
    const p = {
      id:'duplicate-name-live-test', name:'Одинаковые названия', active:true, progression:0,
      plans:[{days:[],rounds:1,roundRest:0,exercises:[
        {id:'dup-a',name:'Одинаковое',type:'reps',value:'8',sets:1,rest:0,restAfter:0},
        {id:'dup-b',name:'Одинаковое',type:'reps',value:'15',sets:1,rest:0,restAfter:0}
      ]}]
    };
    customPrograms.push(p);
    state.raw = p; state.planIdx = 0; state.current = customToProgram(p, 0);
    state.steps = buildSteps();
    state.stepIdx = state.steps.findIndex(s => s.phase === 'work' && s.exId === 'dup-b');

    const step = state.steps[state.stepIdx];
    const byId = liveExercise(step.exId, step.exName);
    const ambiguousLegacy = liveExercise('', step.exName);

    // Имитируем AI replacement именно второго из двух одноимённых упражнений.
    const replacement = {
      id:'dup-b-new',name:'Заменённое второе',type:'reps',value:'6',sets:1,rest:0,restAfter:0
    };
    p.plans[0].exercises[1] = replacement;
    const touched = refreshLiveSteps('dup-b', 'Одинаковое', replacement);
    const work = state.steps.filter(s => s.phase === 'work').map(s => ({
      id:s.exId,name:s.exName,reps:s.reps
    }));

    return {
      byId:byId && {idx:byId.idx,id:byId.ex.id,value:byId.ex.value},
      ambiguousLegacy:!!ambiguousLegacy,
      touched,
      work
    };
  });
  ok('редактирование выбирает нужное из одинаково названных упражнений по exercise.id',
    duplicateNames.byId && duplicateNames.byId.idx === 1
      && duplicateNames.byId.id === 'dup-b' && duplicateNames.byId.value === '15',
    JSON.stringify(duplicateNames));
  ok('legacy поиск по одному названию не выбирает случайное упражнение при дубле',
    duplicateNames.ambiguousLegacy === false, JSON.stringify(duplicateNames));
  ok('AI-замена обновляет только упражнение с нужным id',
    duplicateNames.touched
      && duplicateNames.work.length === 2
      && duplicateNames.work[0].id === 'dup-a'
      && duplicateNames.work[0].name === 'Одинаковое'
      && duplicateNames.work[1].id === 'dup-b-new'
      && duplicateNames.work[1].name === 'Заменённое второе',
    JSON.stringify(duplicateNames.work));

  const isolation = await page.evaluate(async () => {
    tearDownWorkout();
    const a = customPrograms.find(x => x.id === 'resume-variant-test');
    const b = {
      id:'resume-other-test', name:'Другая тренировка', active:true, progression:0,
      plans:[{days:['Ср'], rounds:1, roundRest:0, exercises:[{name:'Другое',type:'reps',value:'10',sets:1,rest:0,restAfter:0}]}]
    };
    customPrograms.push(b);
    await savePrograms();

    state.raw = b; state.planIdx = 0; state.current = customToProgram(b, 0);
    state.steps = buildSteps(); state.stepIdx = 0; state.startLoad = workoutLoadSnapshot(b,0);
    state.globalStart = Date.now() - 10000; state.pausedTotal = 0; state.paused = false;
    state.workoutSessionId = 'session-b'; state.stepOutcomes = {};
    await saveSession();

    const aBefore = await sessionForProgram(a.id);
    const bBefore = await sessionForProgram(b.id);
    const both = await loadSessions();
    await clearSession('session-b', b.id);
    const aAfter = await sessionForProgram(a.id);
    const bAfter = await sessionForProgram(b.id);
    return {aBefore:!!aBefore, bBefore:!!bBefore, both:both.map(x=>x.sessionId), aAfter:!!aAfter, bAfter:!!bAfter};
  });
  ok('две незавершённые тренировки реально хранятся одновременно',
    isolation.aBefore && isolation.bBefore && isolation.both.includes('test-session-inactivity') && isolation.both.includes('session-b'),
    JSON.stringify(isolation));
  ok('сессия другой программы не затирает сохранённую тренировку',
    isolation.aBefore && isolation.aAfter, JSON.stringify(isolation));
  ok('удаление сессии ограничено выбранной тренировкой',
    !isolation.bAfter && isolation.aAfter, JSON.stringify(isolation));

  ok('без ошибок в консоли', !errs.length, errs.join(' | '));
  await b.close();
  console.log(bad ? '\nПровалено: ' + bad : '\nВсё ок');
  process.exit(bad ? 1 : 0);
})();
