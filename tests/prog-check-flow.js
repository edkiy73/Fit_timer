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
    customPrograms.push({id: 'pc', name: 'Проверка прогресса', progression: 1, stats: {completions: 0},
      plans: [{days: ['Пн'], rounds: 1, roundRest: 0, exercises: [
        {name: 'Присед', type: 'reps', value: '10', sets: 1, rest: 5, progOn: true, trackWeight: false, repsStep: 1}
      ]}]});
    await savePrograms();
  });

  // reach=false — тренировку завершили, не дойдя до упражнения: оно не
  // считается выполненным и не участвует в проверке прогресса
  const run = async (reach = true) => {
    await page.evaluate(async (reach) => {
      openStart(customPrograms.find(x => x.id === 'pc'));
      $('btnStart').click();
      await new Promise(r => setTimeout(r, 500));
      state.reachedEx = new Set();
      if(reach) normPlans(customPrograms.find(x => x.id === 'pc'))[0].exercises.forEach(ex => state.reachedEx.add(ex.name));
      state.globalStart = Date.now() - 120 * 1000; state.pausedTotal = 0;
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
  ok('экран финала спрашивает про повышение', await page.isVisible('#finProgCheck'));
  ok('список упражнений свёрнут по умолчанию', !(await page.isVisible('#finProgCheckList')));

  await page.click('#finProgCheckToggle');
  ok('«где-то было тяжело» разворачивает список', await page.isVisible('#finProgCheckList'));
  const chipText = await page.textContent('.fpc-chip');
  ok('в списке названо нужное упражнение', /Присед/.test(chipText), chipText);

  // ---- отмечаем «тяжело» и подтверждаем: рост не применяется ----
  await page.click('.fpc-chip');
  await page.click('#finProgCheckYes');
  await page.waitForTimeout(300);
  ok('отмеченное «тяжело» упражнение не растёт', (await reps()) === 10, 'reps=' + (await reps()));
  ok('после подтверждения виден статус «готово»', await page.isVisible('#finProgCheckDone'));
  ok('кнопка «Да, повышаем» скрыта после подтверждения', !(await page.isVisible('#finProgCheckAsk')));

  // ---- тренировка 2: снова достигнут порог (счётчик не сбрасывался для «тяжело») ----
  await run();
  ok('проверка вернулась на следующей тренировке', await page.isVisible('#finProgCheck'));
  await page.click('#finProgCheckYes'); // на этот раз ничего не отмечаем
  await page.waitForTimeout(300);
  ok('без отметки «тяжело» нагрузка растёт по «Да, повышаем»',
     (await reps()) === 11, 'reps=' + (await reps()));

  // ---- тренировка 3: порог ещё не достигнут (реплика упражнения сброшена, progression не 1) ----
  await page.evaluate(async () => {
    const p = customPrograms.find(x => x.id === 'pc');
    p.progression = 3;
    normPlans(p)[0].exercises[0].ps.n = 0;
    await savePrograms();
  });
  await run();
  ok('блок проверки не показывается, пока порог не достигнут', !(await page.isVisible('#finProgCheck')));

  ok('без ошибок в консоли', !errs.length, errs.join(' | '));

  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
