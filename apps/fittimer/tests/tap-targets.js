/* Цели для пальца на узком телефоне (360 точек).

   Подпись строки с переключателем переключает его, как в системных настройках:
   сам тумблер 48×28, а пальцем чаще попадают в подпись. Поиск каталога ловит
   нажатие по всей высоте строки, а не только по строке текста. Заголовки
   раскрывающихся разделов в карточке — не ниже 44 точек, но вёрстка не сдвигается.

   Запуск:  node tests/dev-server.js 8124
            node tests/tap-targets.js */

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
  const page = await (await b.newContext({viewport: {width: 360, height: 740}, locale: 'ru-RU', hasTouch: true})).newPage();
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(2000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(1500); }

  // ---- подпись строки переключает тумблер ----
  await page.evaluate(() => goTab('scrAccount'));
  await page.waitForTimeout(400);
  await page.click('#moreTabs [data-more="sound"]');
  await page.waitForTimeout(400);
  const row = await page.evaluate(() => {
    const r = [...document.querySelectorAll('.screen.on .pref-row')].find(x => x.querySelector(':scope > .switch') && x.offsetParent);
    const sw = r.querySelector('.switch');
    const box = r.querySelector(':scope > span').getBoundingClientRect();
    return {id: sw.id, on: sw.classList.contains('on'), x: box.left + 10, y: box.top + box.height / 2};
  });
  const isOn = () => page.evaluate(id => document.getElementById(id).classList.contains('on'), row.id);
  await page.mouse.click(row.x, row.y);
  await page.waitForTimeout(300);
  ok('нажатие по подписи переключает тумблер', (await isOn()) === !row.on, row.id);
  await page.mouse.click(row.x, row.y);
  await page.waitForTimeout(300);
  ok('второе нажатие возвращает как было', (await isOn()) === row.on);

  // ---- поиск каталога: нажатие у края строки открывает ввод ----
  await page.evaluate(() => show('scrStore'));
  await page.waitForTimeout(400);
  const search = await page.evaluate(() => {
    const r = document.querySelector('.store-search').getBoundingClientRect();
    return {x: r.left + r.width / 2, y: r.top + 8};
  });
  await page.mouse.click(search.x, search.y);
  await page.waitForTimeout(200);
  ok('поиск ловит нажатие по всей высоте строки', await page.evaluate(() => document.activeElement && document.activeElement.id) === 'storeQuery');

  // ---- заголовки разделов редактора упражнения ----
  await page.evaluate(() => show('scrExercise'));
  await page.waitForTimeout(400);
  const heads = await page.evaluate(() => ['exProgToggle', 'exDetailsToggle'].map(id => {
    const el = document.getElementById(id);
    const r = el.getBoundingClientRect();
    return {id, h: Math.round(r.height), pad: getComputedStyle(el).paddingTop, margin: getComputedStyle(el).marginTop};
  }));
  ok('заголовок раздела — цель не ниже 44 точек', heads.every(h => h.h >= 44), JSON.stringify(heads));
  ok('отступ скомпенсирован отрицательным полем', heads.every(h => h.pad === '13px' && h.margin === '-13px'));

  ok('без ошибок на странице', !errs.length, errs.join(' | '));
  await b.close();
  console.log(bad ? `\nПровалено: ${bad}` : '\nЦели для пальца: ok');
  process.exit(bad ? 1 : 0);
})();
