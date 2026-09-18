/* Обзор перед тренировкой должен отвечать на три вопроса без запуска таймера:
   что сегодня делать, сколько это займёт и что изменилось с прошлого раза.

   Запуск:  node tests/dev-server.js 8124
            node tests/start-overview.js */

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

(async () => {
  const b = await chromium.launch({executablePath: CHROME});
  const errs = [];
  const page = await (await b.newContext({viewport: {width: 412, height: 900}})).newPage();
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(2000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(1500); }

  await page.evaluate(() => {
    const ex = (name, value, extra = {}) => Object.assign({
      name, type:'reps', value:String(value), sets:3, rest:45, restAfter:30,
      progOn:true, repsStep:1, trackWeight:false
    }, extra);
    const p = {
      id:'overview1', name:'Проверка обзора', active:true, progression:1,
      stats:{completions:2}, plans:[{days:['Пн'], rounds:1, roundRest:60, exercises:[
        ex('Приседания', 10),
        ex('Жим гантелей', 8, {trackWeight:true, weight:6, wStep:1, repsStep:0}),
        ex('Тяга в наклоне', 10), ex('Выпады', 8), ex('Планка', 30, {type:'time', timeStep:5}),
        ex('Скручивания', 12)
      ]}]
    };
    customPrograms.push(p);
    stats.history.push({pid:p.id, plan:0, sec:31 * 60, at:Date.now() - 86400000,
      load:[{i:0, n:'Приседания', reps:'11', sec:0, kg:0}]});
    openStart(p);
  });

  const before = await page.evaluate(() => ({
    summary:$('startOverviewSummary').textContent,
    change:$('startLoadChange').textContent.trim(),
    first:document.querySelector('#startOverviewList .ex-row')?.textContent || '',
    rows:document.querySelectorAll('#startOverviewList .ex-row').length
  }));
  ok('сразу виден состав, объём и время', /6 упражнений/.test(before.summary) && /18 подходов/.test(before.summary) && /31 мин/.test(before.summary), before.summary);
  ok('изменение нагрузки объяснено', /Выше прошлого раза: 1 упражнение/.test(before.change), before.change);
  ok('используются строки упражнений редактора', before.rows === 6 && /Приседания/.test(before.first), before.first);
  ok('показана сегодняшняя цель и «было → сегодня»', /12 повторений/.test(before.first) && /11 → 12/.test(before.first), before.first);

  await page.click('#psPlus');
  const after = await page.locator('#startOverviewList .ex-row').first().textContent();
  ok('кнопка повышения сразу обновляет обзор', /13 повторений/.test(after), after);

  console.log('\npageerror:', errs.length ? errs : 'нет');
  if(errs.length) bad++;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
