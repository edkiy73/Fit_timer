/* Разбор текста, у которого потерялись переносы строк.

   Некоторые чаты с ИИ при копировании ответа склеивают всё в одну строку, и
   разбор ломался молча и целиком: первая строка съедала весь текст, программа
   получалась из одного названия без упражнений.

   Проверяем, что склеенный текст даёт РОВНО ТУ ЖЕ программу, что и целый, и что
   на нормальном тексте починка ничего не портит.

   Запуск:  node tests/dev-server.js 8124
            node tests/parse-flat.js */

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

const GOOD = `ПРОГРАММА: Сила дома
ЧЕРЕДОВАНИЕ: нет
ПРОГРЕССИЯ: 4

ДЕНЬ: Пн, Чт
КРУГИ: 3
ОТДЫХ МЕЖДУ КРУГАМИ: 90

УПРАЖНЕНИЕ: Разогрев
ФОРМАТ: время
ЗНАЧЕНИЕ: 60
ПОДХОДЫ: 1
РАЗМИНКА: да
ОТДЫХ: 20

УПРАЖНЕНИЕ: Приседания с гантелями
ФОРМАТ: повторения и вес
ЗНАЧЕНИЕ: 10
ПОДХОДЫ: 3
ВЕС: 8
ОТДЫХ: 60
ОТДЫХ ПОСЛЕ УПРАЖНЕНИЯ: 90
ШАГ ВЕСА: 2
ПОТОЛОК ВЕСА: 20
ЗАМЕНА: Приседания у стены

УПРАЖНЕНИЕ: Планка
ФОРМАТ: время
ЗНАЧЕНИЕ: 45
ПОДХОДЫ: 2
ОТДЫХ: 40
ШАГ ВРЕМЕНИ: 5`;

// как это приезжает из чата, потерявшего переносы
const FLAT = GOOD.replace(/\n+/g, ' ');
// то же самое, но маркдауном-списком и тоже одной строкой
const BULLETS = GOOD.split('\n').filter(Boolean).map(l => '- ' + l).join(' ');

(async () => {
  const b = await chromium.launch({executablePath: CHROME});
  const errs = [];
  const page = await (await b.newContext({viewport: {width: 412, height: 900}, locale: 'ru-RU'})).newPage();
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(2000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(1500); }

  // Слепок того, что важно: по нему и сравниваем целый текст со склеенным.
  const shot = (txt) => page.evaluate((t) => {
    const {program, errors} = parseProgramText(t);
    const pl = (program.plans || [])[0] || {};
    return {
      name: program.name, prog: program.progression, errors: errors.length,
      days: (pl.days || []).join(','), rounds: pl.rounds, roundRest: pl.roundRest,
      ex: (pl.exercises || []).map(e => ({
        n: e.name, t: e.type, v: e.value, sets: e.sets, rest: e.rest,
        after: e.restAfter == null ? null : e.restAfter,
        w: e.weight || 0, ws: e.wStep, wmax: e.weightMax, ts: e.timeStep,
        warm: !!e.warmup, swap: e.swapName || ''
      }))
    };
  }, txt);

  const good = await shot(GOOD);
  ok('целый текст разбирается', good.ex.length === 3 && !good.errors,
     `${good.ex.length} упражнения, ошибок ${good.errors}`);
  ok('и вообще всё на месте',
     good.name === 'Сила дома' && good.days === 'Пн,Чт' && good.rounds === 3
     && good.ex[0].warm && good.ex[1].ws === 2 && good.ex[1].after === 90
     && good.ex[1].swap === 'Приседания у стены' && good.ex[2].ts === 5,
     `${good.name} · ${good.days} · шаг веса ${good.ex[1].ws}`);

  const flat = await shot(FLAT);
  ok('склеенный в одну строку даёт ТО ЖЕ САМОЕ',
     JSON.stringify(flat) === JSON.stringify(good),
     flat.ex.length + ' упражнения против ' + good.ex.length);

  const bullets = await shot(BULLETS);
  ok('склеенный список с дефисами — тоже',
     JSON.stringify(bullets) === JSON.stringify(good),
     bullets.ex.length + ' упражнения');

  // Длинные ключи не должны резаться короткими: «ОТДЫХ ПОСЛЕ УПРАЖНЕНИЯ» содержит
  // «ОТДЫХ», и порядок в починке решает.
  ok('длинный ключ не разрезан коротким', flat.ex[1].after === 90, flat.ex[1].after);

  // Двоеточие внутри значения ключом не считается.
  const time = await page.evaluate(() => {
    const {program} = parseProgramText('ПРОГРАММА: Утро ВРЕМЯ: 07:30 ДНИ: Пн УПРАЖНЕНИЕ: Планка ФОРМАТ: время ЗНАЧЕНИЕ: 30 ПОДХОДЫ: 1 ОТДЫХ: 10');
    return {t: program.time, n: program.name, ex: (program.plans[0].exercises || []).length};
  });
  ok('время не путается с ключом', time.t === '07:30' && time.n === 'Утро' && time.ex === 1,
     `${time.n} в ${time.t}, упражнений ${time.ex}`);

  // Обычный текст с переносами починка трогать не должна вовсе.
  const same = await page.evaluate((t) => repairLines(t) === t, GOOD);
  ok('целый текст остаётся нетронутым', same);

  console.log('\npageerror: ' + (errs.length ? errs.join(' | ') : 'нет'));
  if(errs.length) bad += errs.length;
  await b.close();
  console.log(bad ? 'ПРОВАЛЕНО: ' + bad : 'всё сошлось');
  process.exit(bad ? 1 : 0);
})();
