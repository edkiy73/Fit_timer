/* Страница программы в каталоге: состав по вариантам.

   Одним списком он врал в трёх местах сразу: упражнения разных дней шли подряд и
   выглядели как одна тренировка, сквозная нумерация давала «шесть упражнений» там,
   где за раз делают три, а разминка, которая есть в каждом варианте, повторялась
   столько раз, сколько вариантов.

   Запуск:  node tests/dev-server.js 8124
            node tests/store-page.js */

const { installV2Fixtures } = require('./helpers/v2-fixtures');
let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

const { catalogProgram } = require('./helpers/catalog-program');
const warm = {name:'Суставная разминка', warmup:true, type:'time', value:'60', sets:1, rest:20};

// Каталог отдаёт программу V2 уже на языке витрины
const TWO = catalogProgram('Верх и низ', [], {progressionEvery:4, plans:[
  {days:['mon', 'thu'], rounds:3, roundRest:90, exercises:[warm,
    {name:'Отжимания', value:'10', sets:3, rest:60},
    {name:'Тяга гантели', value:'12', sets:3, rest:60,
      load:{type:'weight', equipment:'dumbbell', equipmentName:'', count:1, weight:8, levels:[], level:0},
      progression:{mode:'weight', every:null, repsStep:null, repsMax:null, weightStep:2, weightMax:null, timeStep:null, timeMax:null}}]},
  {days:['tue', 'fri'], rounds:2, roundRest:60, exercises:[warm, {name:'Приседания', value:'15', sets:4, rest:45}]}
]});

const ONE = catalogProgram('Просто круг', [
  {name:'Приседания', value:'12', sets:3, rest:45},
  {name:'Планка', type:'time', value:'40', sets:3, rest:40},
  {name:'Выпады', value:'10', sets:3, rest:45}
], {days:['wed'], rounds:3});
// Состав «два упражнения» — проверка нумерации одного варианта без подписей
ONE.plans[0].exercises.pop();

const BAND = catalogProgram('Резинки', [
  {name:'Тяга резинки сверху', value:'12-15', sets:3, rest:60,
    load:{type:'level', equipment:'band', equipmentName:'', count:1, weight:0, levels:['light', 'medium', 'strong', 'veryStrong'], level:1},
    progression:{mode:'level', every:null, repsStep:2, repsMax:18, weightStep:null, weightMax:null, timeStep:null, timeMax:null}},
  'Приседания', 'Планка'
], {days:['wed'], rounds:1});
BAND.plans[0].exercises = BAND.plans[0].exercises.slice(0, 1);

const shot = page => page.evaluate(() => ({
  heads: [...document.querySelectorAll('#siList .si-plan')].map(h => ({
    title: h.childNodes[0].textContent.trim(),
    sub: (h.querySelector('span') || {}).textContent || ''
  })),
  rows: [...document.querySelectorAll('#siList .ex-row')].map(r => ({
    num: r.querySelector('.ex-thumb').textContent.trim(),
    name: r.querySelector('b').textContent.trim(),
    warm: r.classList.contains('warm'),
    meta: (r.querySelector('.ex-meta') || {}).textContent || ''
  })),
  facts: [...document.querySelectorAll('#siFacts span')].map(e => e.textContent),
  count: document.getElementById('siCount').textContent
}));

(async () => {
  const b = await chromium.launch({executablePath: CHROME});
  const errs = [];
  const page = await (await b.newContext({viewport: {width: 412, height: 900}, locale: 'ru-RU'})).newPage();
  await installV2Fixtures(page);
  page.on('pageerror', e => errs.push(String(e)));
  let catalogItem = null;
  await page.route('**/api/catalog*', async route => {
    const u = new URL(route.request().url());
    const body = u.searchParams.get('item')
      ? {item: catalogItem}
      : {items: catalogItem ? [catalogItem] : []};
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(body)});
  });
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(2000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(1500); }

  const open = async (program, extra) => {
    catalogItem = Object.assign({id: 'utest01', by: '@lena.doma', cat: 'tone', level: 'Средний',
      min: 35, name: 'Проверка', gives: 'Описание программы для проверки состава.',
      program, locale: 'ru', exCount: 0, cover: null}, extra || {});
    await page.evaluate(async () => {
      await loadStoreServer();
      await openStoreItem('utest01');
    });
  };

  /* ---- два варианта ---- */
  await open(TWO);
  await page.waitForTimeout(400);
  const two = await shot(page);
  const head = await page.evaluate(() => ({
    name: document.getElementById('siName').textContent,
    gives: document.getElementById('siGives').textContent,
    by: document.getElementById('siNick').textContent
  }));
  ok('страница программы открылась с названием и описанием',
     head.name === 'Проверка' && /Описание программы/.test(head.gives), head.name);
  ok('автор подписан', head.by === '@lena.doma', head.by);
  ok('в шапке уровень и длительность',
     two.facts.includes('Средний') && two.facts.some(f => /^35 мин/.test(f)), two.facts.join(' · '));

  ok('варианты подписаны днями', two.heads.length === 2
     && two.heads[0].title === 'Пн, Чт' && two.heads[1].title === 'Вт, Пт',
     two.heads.map(h => h.title).join(' | '));
  ok('у варианта сказано, сколько в нём и сколько кругов',
     /3 упражнения/.test(two.heads[0].sub) && /3 круга/.test(two.heads[0].sub),
     two.heads[0].sub);

  const warms = two.rows.filter(r => r.warm);
  ok('разминка по одной на вариант, а не подряд', warms.length === 2, warms.length);
  ok('и стоит первой в своём варианте',
     two.rows[0].warm && two.rows[3].warm && !two.rows[1].warm,
     two.rows.map(r => r.warm ? 'р' : '·').join(''));

  ok('нумерация СВОЯ у каждого варианта',
     two.rows.map(r => r.num).join(',') === ',1,2,,1',
     two.rows.map(r => r.num || '(разминка)').join(','));
  ok('вес снаряда виден в составе', /8 кг/.test(two.rows[2].meta), two.rows[2].meta);

  ok('в шапке дни всей программы, а не первого варианта',
     two.facts.some(f => f === 'Пн, Вт, Чт, Пт'), two.facts.join(' · '));
  ok('и сказано, что вариантов два', two.facts.some(f => /2 варианта/.test(f)),
     two.facts.join(' · '));
  ok('в заголовке состава — варианты, а не сумма упражнений',
     two.count === '2 варианта', two.count);

  /* ---- один вариант: заголовков нет ---- */
  await open(ONE);
  await page.waitForTimeout(400);
  const one = await shot(page);
  ok('у одного варианта подписи нет вовсе', one.heads.length === 0, one.heads.length);
  ok('и в заголовке снова упражнения', one.count === '2 упражнения', one.count);
  ok('нумерация сквозная', one.rows.map(r => r.num).join(',') === '1,2',
     one.rows.map(r => r.num).join(','));

  /* ---- resistance видно в каталоге человеческим label ---- */
  await open(BAND);
  await page.waitForTimeout(400);
  const band = await shot(page);
  ok('каталог показывает базовое сопротивление, а не номер уровня',
    band.rows.length === 1
      && /Среднее/.test(band.rows[0].meta)
      && !/level\s*1/i.test(band.rows[0].meta),
    band.rows[0] && band.rows[0].meta);

  /* ---- премиум закрывает состав ---- */
  await open(ONE, {pro: true, exCount: 2});
  await page.waitForTimeout(400);
  const locked = await page.evaluate(() => ({
    list: !document.getElementById('siList').classList.contains('hidden'),
    lock: !document.getElementById('siLock').classList.contains('hidden'),
    txt: document.getElementById('siLockTxt').textContent,
    tag: document.getElementById('siLabels').textContent
  }));
  ok('без подписки состав закрыт заглушкой', !locked.list && locked.lock);
  ok('и сказано, что внутри', /2 упражнения/.test(locked.txt), locked.txt.slice(0, 40));
  ok('метка «Премиум» стоит', /Премиум/.test(locked.tag), locked.tag);

  await page.evaluate(async () => {
    await kvSet('account', JSON.stringify(Object.assign({}, account, {
      email: 'store-test@example.com',
      syncToken: 'store-test-token',
      sub: {plan: 'year', until: '2099-01-01'}
    })));
    await loadAccount();
    await kvSet('deviceId', 'store-test-device');
  });
  await open(ONE, {pro: true, exCount: 2});
  await page.waitForTimeout(400);
  const unlocked = await page.evaluate(() => ({
    list: !document.getElementById('siList').classList.contains('hidden'),
    lock: !document.getElementById('siLock').classList.contains('hidden'),
    rows: document.querySelectorAll('#siList .ex-row').length
  }));
  ok('с подпиской состав открыт', unlocked.list && !unlocked.lock && unlocked.rows === 2, unlocked.rows);

  console.log('\npageerror: ' + (errs.length ? errs.join(' | ') : 'нет'));
  if(errs.length) bad += errs.length;
  await b.close();
  console.log(bad ? 'ПРОВАЛЕНО: ' + bad : 'всё сошлось');
  process.exit(bad ? 1 : 0);
})();
