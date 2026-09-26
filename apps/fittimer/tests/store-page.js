/* Страница программы в каталоге: состав по вариантам.

   Одним списком он врал в трёх местах сразу: упражнения разных дней шли подряд и
   выглядели как одна тренировка, сквозная нумерация давала «шесть упражнений» там,
   где за раз делают три, а разминка, которая есть в каждом варианте, повторялась
   столько раз, сколько вариантов.

   Запуск:  node tests/dev-server.js 8124
            node tests/store-page.js */

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

const warm = `УПРАЖНЕНИЕ: Суставная разминка
ФОРМАТ: время
ЗНАЧЕНИЕ: 60
ПОДХОДЫ: 1
РАЗМИНКА: да
ОТДЫХ: 20`;

const TWO = `ПРОГРАММА: Верх и низ
ПРОГРЕССИЯ: 4

ДЕНЬ: Пн, Чт
КРУГИ: 3
ОТДЫХ МЕЖДУ КРУГАМИ: 90

${warm}

УПРАЖНЕНИЕ: Отжимания
ФОРМАТ: повторения
ЗНАЧЕНИЕ: 10
ПОДХОДЫ: 3
ОТДЫХ: 60

УПРАЖНЕНИЕ: Тяга гантели
ФОРМАТ: повторения и вес
ЗНАЧЕНИЕ: 12
ВЕС: 8
ПОДХОДЫ: 3
ОТДЫХ: 60
ШАГ ВЕСА: 2

ДЕНЬ: Вт, Пт
КРУГИ: 2
ОТДЫХ МЕЖДУ КРУГАМИ: 60

${warm}

УПРАЖНЕНИЕ: Приседания
ФОРМАТ: повторения
ЗНАЧЕНИЕ: 15
ПОДХОДЫ: 4
ОТДЫХ: 45`;

const ONE = `ПРОГРАММА: Просто круг
ДНИ: Ср
КРУГИ: 3
ОТДЫХ МЕЖДУ КРУГАМИ: 60

УПРАЖНЕНИЕ: Приседания
ФОРМАТ: повторения
ЗНАЧЕНИЕ: 12
ПОДХОДЫ: 3
ОТДЫХ: 45

УПРАЖНЕНИЕ: Планка
ФОРМАТ: время
ЗНАЧЕНИЕ: 40
ПОДХОДЫ: 3
ОТДЫХ: 40`;

const shot = page => page.evaluate(() => ({
  heads: [...document.querySelectorAll('#siList .si-plan')].map(h => ({
    title: h.childNodes[0].textContent.trim(),
    sub: (h.querySelector('span') || {}).textContent || ''
  })),
  rows: [...document.querySelectorAll('#siList .ex-row')].map(r => ({
    num: r.querySelector('.ex-thumb').textContent.trim(),
    name: r.querySelector('b').textContent.trim(),
    warm: r.classList.contains('warm')
  })),
  facts: [...document.querySelectorAll('#siFacts span')].map(e => e.textContent),
  count: document.getElementById('siCount').textContent
}));

(async () => {
  const b = await chromium.launch({executablePath: CHROME});
  const errs = [];
  const page = await (await b.newContext({viewport: {width: 412, height: 900}, locale: 'ru-RU'})).newPage();
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(2000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(1500); }

  const open = (txt, extra) => page.evaluate(({txt, extra}) => {
    storeServer = [Object.assign({id: 'utest01', by: '@lena.doma', cat: 'tone', level: 'Средний',
      min: 35, name: 'Проверка', gives: 'Описание программы для проверки состава.',
      text: txt, cover: null}, extra || {})];
    openStoreItem('utest01');
  }, {txt, extra});

  /* ---- два варианта ---- */
  await open(TWO);
  await page.waitForTimeout(400);
  const two = await shot(page);

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

  /* ---- премиум закрывает состав ---- */
  await open(ONE, {pro: true});
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

  await page.evaluate(() => { account.sub = {plan: 'year', until: '2099-01-01'}; });
  await open(ONE, {pro: true});
  await page.waitForTimeout(400);
  const unlocked = await page.evaluate(() => ({
    list: !document.getElementById('siList').classList.contains('hidden'),
    rows: document.querySelectorAll('#siList .ex-row').length
  }));
  ok('с подпиской состав открыт', unlocked.list && unlocked.rows === 2, unlocked.rows);

  console.log('\npageerror: ' + (errs.length ? errs.join(' | ') : 'нет'));
  if(errs.length) bad += errs.length;
  await b.close();
  console.log(bad ? 'ПРОВАЛЕНО: ' + bad : 'всё сошлось');
  process.exit(bad ? 1 : 0);
})();
