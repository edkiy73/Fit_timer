/* Этапы движения (movement chain) и компактная история V2.
   - на потолке этапа с переходом «предложить на потолке» финал предлагает следующий этап;
   - после подтверждения тот же слот (exercise.id) идёт со следующим этапом, прогресс с нуля;
   - история хранит компактные строки {s, c, …}, имя этапа — один раз в stats.stageNames;
   - «было → сегодня» не сравнивает разные этапы (нет ложной ↑/↓);
   - редактор: добавить этап, «Перейти сейчас», удалить этап.

   Запуск:  node tests/dev-server.js 8124
            node tests/movement-chain-flow.js */

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
  const page = await (await b.newContext({viewport: {width: 412, height: 900}, locale: 'ru-RU'})).newPage();
  await installV2Fixtures(page);
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(1000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(800); }

  await page.evaluate(async () => {
    const u = curUser(); u.gender = 'f'; u.age = 30; await saveUsers();
    configureWorkoutTiming({prep: 0});
    const p = {id:'mc', name:'Цепочка', progression:1, stats:{completions:0},
      plans:[{id:'mc-plan', days:['Пн'], rounds:1, roundRest:0, exercises:[
        v2ex('Отжимания от стены', {id:'mc-ex', value:'10', sets:1, rest:5,
          prog:{mode:'reps', reps:{step:1, max:12}}, advance:'ceiling',
          state:{count:0, current:{reps:'12'}},
          stages:[{name:'Отжимания с колен', value:'6', sets:1, rest:5, prog:{mode:'reps', reps:{step:1, max:10}}}]})
      ]}]};
    await kvSet(pk('customPrograms'), JSON.stringify([...customPrograms, p]));
    await loadData();
    await savePrograms();
  });
  const live = () => page.evaluate(() => {
    const ex = normPlans(customPrograms.find(x => x.id === 'mc'))[0].exercises[0];
    return {id:ex.id, stage:ex.currentStageId, name:FitExerciseV2.prescriptionOf(ex).name,
      count:ex.progressState.count, reps:ex.progressState.current.reps};
  });

  const run = async () => {
    await page.evaluate(() => openStart(customPrograms.find(x => x.id === 'mc')));
    await page.click('#btnStart');
    await page.waitForSelector('#startModal.open');
    await page.click('#startFresh');
    await page.waitForFunction(() => state.live && state.steps.some(step => step.phase === 'work'));
    await page.evaluate(() => {
      const outcomes = {};
      state.steps.forEach((step, i) => { if(step.phase === 'work') outcomes[workoutStepKey(step, i)] = 'done'; });
      startWorkout(0, 120 * 1000, {skipPrep:true, outcomes});
      finishWorkout();
      document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
    });
    await page.waitForTimeout(1200);
  };

  // ---- потолок этапа: финал предлагает следующий этап ----
  await run();
  ok('финал предлагает переход', await page.isVisible('#finProgCheck'));
  const card = await page.locator('.fpc-card').first().textContent();
  ok('карточка показывает «этап → следующий этап»', /Отжимания от стены.*→.*Отжимания с колен/.test(card), card);
  ok('сам по себе этап не сменился', (await live()).name === 'Отжимания от стены');
  await page.click('#finProgCheckYes');
  await page.waitForTimeout(300);
  const after = await live();
  ok('слот тот же, этап следующий', after.id === 'mc-ex' && after.stage === 'mc-ex-s2' && after.name === 'Отжимания с колен',
    JSON.stringify(after));
  ok('прогресс нового этапа с нуля', after.count === 0 && after.reps == null, JSON.stringify(after));

  // ---- компактная история ----
  const hist = await page.evaluate(() => ({
    row:(stats.history[stats.history.length - 1].load || [])[0],
    names:stats.stageNames
  }));
  ok('строка истории компактная', hist.row && hist.row.s === 'mc-ex-s1' && hist.row.c === 'n' && hist.row.r === '12'
    && !('id' in hist.row) && !('kg' in hist.row), JSON.stringify(hist.row));
  ok('имя этапа и exId — в реестре один раз', hist.names && hist.names['mc-ex-s1']
    && hist.names['mc-ex-s1'].e === 'mc-ex' && hist.names['mc-ex-s1'].n === 'Отжимания от стены', JSON.stringify(hist.names));

  // ---- «было → сегодня»: прошлый раз был другой этап — сравнения нет ----
  const cmp = await page.evaluate(() => {
    const p = customPrograms.find(x => x.id === 'mc');
    const prev = previousWorkoutLoad(p, 0);
    return {exact:prev.exact, row:prev.rows[0]};
  });
  ok('другой этап не сравнивается с прошлым', cmp.row === null, JSON.stringify(cmp));

  // ---- тот же этап на следующей тренировке сравнивается ----
  await run();
  await page.evaluate(() => document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open')));
  const cmp2 = await page.evaluate(() => {
    const p = customPrograms.find(x => x.id === 'mc');
    const prev = previousWorkoutLoad(p, 0);
    return prev.rows[0] && {stage:prev.rows[0].stageId, id:prev.rows[0].id, reps:prev.rows[0].reps};
  });
  ok('тот же этап находит прошлую нагрузку', cmp2 && cmp2.stage === 'mc-ex-s2' && cmp2.id === 'mc-ex' && cmp2.reps === '6',
    JSON.stringify(cmp2));

  // ---- редактор этапов ----
  await page.evaluate(() => { openBuilder('mc'); openExercise(0, false); });
  await page.waitForTimeout(200);
  await page.click('#exChainToggle');
  ok('список этапов показывает оба', (await page.locator('#exChainList .stage-row').count()) === 2);
  ok('сводка показывает текущий этап', /этап 2 из 2/.test(await page.textContent('#exChainSum')),
    await page.textContent('#exChainSum'));
  await page.click('#exStageAdd');
  ok('новый этап открыт с пустым названием', (await page.inputValue('#exName')) === '');
  await page.fill('#exName', 'Отжимания от пола');
  ok('третий этап в списке', (await page.locator('#exChainList .stage-row').count()) === 3);
  // назад к первому этапу и «Перейти сейчас»: подтверждение показывает базу этапа
  await page.locator('#exChainList .stage-row').first().click();
  ok('форма показывает первый этап', (await page.inputValue('#exName')) === 'Отжимания от стены');
  await page.click('#exStageCurrent');
  await page.waitForSelector('#dlg.open, .modal.open');
  const msg = await page.textContent('#dlgMsg');
  ok('подтверждение показывает, с чего начнёшь', /Отжимания от стены/.test(msg) && /10/.test(msg), msg);
  await page.click('#dlgOk');
  await page.waitForTimeout(100);
  await page.click('#btnSaveEx');
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() => {
    const ex = draft.plans[0].exercises[0];
    return {n:ex.stages.length, cur:ex.currentStageId, third:ex.stages[2] && ex.stages[2].prescription.name,
      count:ex.progressState.count};
  });
  ok('сохранены три этапа, текущий — первый', saved.n === 3 && saved.cur === 'mc-ex-s1' && saved.third === 'Отжимания от пола',
    JSON.stringify(saved));
  ok('смена этапа обнулила прогресс', saved.count === 0);

  ok('без ошибок в консоли', !errs.length, errs.join(' | '));
  await b.close();
  console.log(bad ? '\nПровалено: ' + bad : '\nВсё ок');
  process.exit(bad ? 1 : 0);
})();
