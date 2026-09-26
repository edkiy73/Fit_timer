/* Устаревший esm/main.js после нового деплоя.

   main.js называется одинаково во всех версиях, а куски, которые он подгружает,
   — с хешем в имени. Вкладка, которая держит main.js прошлого деплоя, просит
   куски, которых в новом уже нет: приложение не запускалось, и человек видел
   голую разметку без иконок и нижнего меню. Теперь страница один раз
   перезагружается и берёт свежий main.js; если кусок недоступен и после этого,
   второй перезагрузки нет — работает прежний запасной путь без зацикливания.
   Плюс заголовки: имена без хеша всегда перепроверяются, куски с хешем кешируются.

   Запуск:  node tests/dev-server.js 8124
            node tests/stale-deploy.js */

const fs = require('fs');
let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

async function run(b, failAlways){
  const page = await (await b.newContext({viewport: {width: 412, height: 900}, locale: 'ru-RU'})).newPage();
  let blocked = 0, loads = 0;
  // Считаем запросы самого документа: событие load первой загрузки может не
  // наступить, если перезагрузка случилась раньше него.
  page.on('request', req => { if(req.resourceType() === 'document') loads++; });
  await page.route('**/esm/chunks/app-*.js', route => {
    if(failAlways || blocked === 0){ blocked++; return route.fulfill({status: 404, body: 'gone'}); }
    return route.continue();
  });
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(5000);
  const state = await page.evaluate(() => ({
    booting: document.body.classList.contains('booting'),
    started: !!document.querySelector('.screen.on') && !!document.querySelector('.dock-btn svg, [data-icon] svg')
  }));
  await page.context().close();
  return {loads, blocked, ...state};
}

(async () => {
  const b = await chromium.launch({executablePath: CHROME});

  const once = await run(b, false);
  ok('после одной неудачи страница перезагружается и приложение стартует',
     once.loads === 2 && once.blocked === 1 && once.started && !once.booting, JSON.stringify(once));

  const always = await run(b, true);
  ok('если кусок недоступен и после перезагрузки — второй перезагрузки нет',
     always.loads === 2 && always.blocked === 2 && !always.booting, JSON.stringify(always));

  const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const header = src => ((vercel.headers.find(h => h.source === src) || {}).headers || [])
    .find(x => x.key === 'Cache-Control');
  ok('main.js и mobile.js всегда перепроверяются', /no-cache/.test((header('/esm/(main|mobile).js') || {}).value || ''));
  ok('куски с хешем кешируются надолго', /immutable/.test((header('/esm/chunks/(.*)') || {}).value || ''));

  await b.close();
  console.log(bad ? `\nПровалено: ${bad}` : '\nУстаревший деплой: ok');
  process.exit(bad ? 1 : 0);
})();
