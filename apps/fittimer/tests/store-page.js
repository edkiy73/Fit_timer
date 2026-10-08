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

  const open = async (txt, extra) => {
    catalogItem = Object.assign({id: 'utest01', by: '@lena.doma', cat: 'tone', level: 'Средний',
      min: 35, name: 'Проверка', gives: 'Описание программы для проверки состава.',
      text: txt, cover: null}, extra || {});
    await page.evaluate(async () => {
      await loadStoreServer();
      await openStoreItem('utest01');
    });
  };

  /* Каталог пока хранит программы старым текстовым протоколом, а он больше не
     превращается в программу (модель упражнения V2; docs/load-equipment-progression-plan-2026-10-08.md,
     PR 7 — перевод каталога). Поэтому состав по вариантам (подписи днями, своя
     нумерация, разминка по одной на вариант, сопротивление человеческим label)
     сейчас не рисуется вовсе — проверки этого вернутся вместе с V2-каталогом.
     Здесь держим то, что работает и сейчас: шапку страницы, отсутствие
     старой формы упражнений в составе и честный отказ при добавлении. */
  await open(TWO);
  await page.waitForTimeout(400);
  const two = await shot(page);
  const head = await page.evaluate(() => ({
    name: document.getElementById('siName').textContent,
    gives: document.getElementById('siGives').textContent,
    by: document.getElementById('siNick').textContent,
    buy: document.getElementById('siBuy').textContent
  }));
  ok('страница программы открылась с названием и описанием',
     head.name === 'Проверка' && /Описание программы/.test(head.gives), head.name);
  ok('автор подписан', head.by === '@lena.doma', head.by);
  ok('в шапке уровень и длительность',
     two.facts.includes('Средний') && two.facts.some(f => /^35 мин/.test(f)), two.facts.join(' · '));
  ok('старый текст не превращается в упражнения состава',
     two.rows.length === 0 && two.heads.length === 0, two.rows.length + '/' + two.heads.length);
  ok('кнопка предлагает добавить программу', /Добавить/.test(head.buy), head.buy);

  const before = await page.evaluate(() => customPrograms.length);
  await page.click('#siBuy');
  await page.waitForTimeout(300);
  const addMsg = await page.textContent('#dlgMsg');
  ok('добавление из каталога объясняет, что временно недоступно',
     /временно недоступна/.test(addMsg), addMsg.slice(0, 50));
  ok('и программа в профиль не попала',
     await page.evaluate(() => customPrograms.length) === before);
  await page.evaluate(() => document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open')));

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
  // Сам состав пока не рисуется (старый текстовый протокол, см. выше) — но замка нет.
  ok('с подпиской состав не закрыт заглушкой', unlocked.list && !unlocked.lock, unlocked.rows);

  console.log('\npageerror: ' + (errs.length ? errs.join(' | ') : 'нет'));
  if(errs.length) bad += errs.length;
  await b.close();
  console.log(bad ? 'ПРОВАЛЕНО: ' + bad : 'всё сошлось');
  process.exit(bad ? 1 : 0);
})();
