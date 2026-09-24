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
    await saveSession();

    const saved = await loadSession();
    if(!saved || !(saved.stepDeadline > Date.now()) || saved.remaining !== 42){
      throw new Error('timer recovery fields were not saved');
    }

    openStart(p);
    state.planIdx = 0;
    renderPlanRow();
    renderStartInfo();
    return {savedStep:state.stepIdx};
  });
  ok('сессия сохранена на пятом упражнении', setup.savedStep >= 0, setup.savedStep);

  await page.click('#btnStart');
  await page.waitForTimeout(80);
  const before = await page.evaluate(() => ({
    selected:state.planIdx,
    pending:window.__pendingSession && window.__pendingSession.planIdx,
    resumeOpen:$('startResume') && !$('startResume').classList.contains('hidden'),
    summary:$('startResumeSub').textContent
  }));
  ok('до продолжения выбран сегодняшний вариант', before.selected === 0, before.selected);
  ok('кнопка продолжения хранит сохранённый вариант', before.pending === 1, before.pending);
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

  ok('без ошибок в консоли', !errs.length, errs.join(' | '));
  await b.close();
  console.log(bad ? '\nПровалено: ' + bad : '\nВсё ок');
  process.exit(bad ? 1 : 0);
})();
