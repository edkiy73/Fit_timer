/* Тренировка короче 30 секунд не записывается сразу: на экране результата человек
   решает — «Не засчитывать» (акцентная) или «Засчитать». Уход с экрана жестом
   «назад» засчитывает, как было всегда. Обычная тренировка записывается сразу.

   Запуск:  node tests/dev-server.js 8124
            node tests/quick-finish.js */

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
    customPrograms.push({id: 'pq', name: 'Проба', plans: [{days: ['Пн'], rounds: 1, roundRest: 0,
      exercises: [{name: 'Планка', type: 'time', value: 30, rest: 10}]}]});
    await savePrograms();
  });

  // тренировка длиной sec секунд, доведённая до экрана результата
  const run = async sec => {
    await page.evaluate(async sec => {
      openStart(customPrograms.find(x => x.id === 'pq'));
      $('btnStart').click();
      await new Promise(r => setTimeout(r, 500));
      state.globalStart = Date.now() - sec * 1000; state.pausedTotal = 0;
      finishWorkout();
      document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
    }, sec);
    await page.waitForTimeout(3200);
  };
  const snap = () => page.evaluate(() => ({
    hist: stats.history.length, count: stats.count,
    comp: (customPrograms.find(x => x.id === 'pq').stats || {}).completions || 0,
    quick: !$('finQuick').classList.contains('hidden'),
    keep: $('btnAgain').textContent, keepAccent: $('btnAgain').classList.contains('btn-primary'),
    title: $('finTitle').textContent, note: (stats.history.slice(-1)[0] || {}).note
  }));

  await run(3);
  let s = await snap();
  ok('короткая тренировка сразу не записана', s.hist === 0 && s.count === 0 && s.comp === 0, JSON.stringify(s));
  ok('показано, что это слишком быстро', s.quick && s.title === 'Тренировка завершена', s.title);
  ok('акцент на «Не засчитывать», «Засчитать» — вторичная', s.keep === 'Засчитать' && !s.keepAccent, s.keep);
  ok('«Поделиться» на месте', await page.isVisible('#btnShareResult'));
  await page.click('#btnDiscardResult'); await page.waitForTimeout(400);
  s = await snap();
  ok('«Не засчитывать» ничего не записывает', s.hist === 0 && s.count === 0 && s.comp === 0, JSON.stringify(s));

  await run(3);
  await page.click('#finNoteToggle');
  await page.fill('#finNote', 'случайно, но засчитай');
  await page.click('#btnAgain'); await page.waitForTimeout(400);
  s = await snap();
  ok('«Засчитать» записывает вместе с заметкой', s.hist === 1 && s.comp === 1 && s.note === 'случайно, но засчитай', JSON.stringify(s));

  await run(3);
  await page.goBack(); await page.waitForTimeout(700);
  s = await snap();
  ok('уход жестом «назад» засчитывает', s.hist === 2 && s.comp === 2, JSON.stringify(s));

  await run(120);
  s = await snap();
  ok('обычная тренировка записывается сразу', s.hist === 3 && !s.quick && s.keep === 'Готово' && s.keepAccent, JSON.stringify(s));

  ok('без ошибок в консоли', !errs.length, errs.join(' | '));
  await b.close();
  console.log(bad ? '\nПровалено: ' + bad : '\nВсё ок');
  process.exit(bad ? 1 : 0);
})();
