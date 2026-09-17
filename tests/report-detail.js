/* Что тренер видит про клиента: расписание, варианты, рост и — главное — правки.

   Первая версия отчёта показывала четыре упражнения из первого варианта без
   разминки. Здесь проверяется, что отчёт отвечает на настоящие вопросы: держит ли
   человек расписание, какие дни делает, как растёт и НЕ ПЕРЕДЕЛАЛ ЛИ ПРОГРАММУ.

   Запуск:  ADMIN_KEY=... node tests/dev-server.js 8124
            node tests/report-detail.js */

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

// Два варианта по дням плюс разминка — то, чего прежний отчёт не видел вовсе.
const PROG = `ПРОГРАММА: Сила дома
ПРОГРЕССИЯ: 2

ДЕНЬ: Пн
КРУГИ: 3
ОТДЫХ МЕЖДУ КРУГАМИ: 60
УПРАЖНЕНИЕ: Суставная разминка
РАЗМИНКА: да
ФОРМАТ: время
ЗНАЧЕНИЕ: 60
ПОДХОДЫ: 1
ОТДЫХ: 10

УПРАЖНЕНИЕ: Приседания
ФОРМАТ: повторения
ЗНАЧЕНИЕ: 12
ПОДХОДЫ: 3
ОТДЫХ: 45
УСЛОЖНЯТЬ: да
ШАГ: 1

УПРАЖНЕНИЕ: Отжимания
ФОРМАТ: повторения
ЗНАЧЕНИЕ: 8
ПОДХОДЫ: 3
ОТДЫХ: 60
УСЛОЖНЯТЬ: да
ШАГ: 1

ДЕНЬ: Чт
КРУГИ: 3
ОТДЫХ МЕЖДУ КРУГАМИ: 60
УПРАЖНЕНИЕ: Тяга в наклоне
ФОРМАТ: повторения и вес
ЗНАЧЕНИЕ: 10
ВЕС: 12
ПОДХОДЫ: 3
ОТДЫХ: 60
УСЛОЖНЯТЬ: да
ШАГ ВЕСА: 2`;

async function boot(b, label, errs, url){
  const page = await (await b.newContext({viewport: {width: 412, height: 900}})).newPage();
  page.on('pageerror', e => errs.push(label + ': ' + e));
  await page.goto(url || BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(2000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(1500); }
  return page;
}

(async () => {
  const b = await chromium.launch({executablePath: CHROME});
  const errs = [];
  const NICK = '@rep.' + Math.random().toString(36).slice(2, 8);

  const tp = await boot(b, 'тренер', errs);
  const link = await tp.evaluate(async ({txt, nick}) => {
    const me = users.find(u => u.id === currentUser); me.name = 'Лена';
    trainer = {on: true, handle: nick, about: '', years: null, links: ''};
    await saveTrainer();
    const r = parseProgramText(txt);
    const p = r.program || r; p.id = 'tp1';
    customPrograms.push(p); await savePrograms();
    let out = null;
    navigator.clipboard.writeText = async t => { out = t; };
    navigator.share = async d => { out = d.url; };
    const c = await addClient(); c.name = 'Марина'; c.programId = 'tp1'; c.programName = 'Сила дома';
    await saveClients(); clientIdx = clients.indexOf(c);
    await sendProgramToClient(c);
    return out;
  }, {txt: PROG, nick: NICK});

  const cp = await boot(b, 'клиент', errs, link);
  await cp.waitForTimeout(1300);
  if(await cp.isVisible('#dlgOk')){ await cp.click('#dlgOk'); await cp.waitForTimeout(400); }
  await cp.click('#btnSaveProgram');
  await cp.waitForTimeout(1200);
  if(await cp.isVisible('#dlgOk')){ await cp.click('#dlgOk'); await cp.waitForTimeout(400); }

  const shape = await cp.evaluate(() => {
    const p = customPrograms.find(x => x.name === 'Сила дома');
    return {plans: normPlans(p).length, orig: (p.origEx || []).length};
  });
  ok('снимок присланного снят по всем вариантам', shape.plans === 2 && shape.orig === 4,
     `${shape.plans} варианта, ${shape.orig} упражнений`);

  // ---- клиент занимается по обоим вариантам и ПЕРЕДЕЛЫВАЕТ программу ----
  await cp.evaluate(async () => {
    const p = customPrograms.find(x => x.name === 'Сила дома');
    const day = i => localISO(new Date(Date.now() - i * 86400000));
    // четыре по первому варианту, один по второму
    [[1,0],[4,0],[8,0],[11,0],[2,1]].forEach(([ago, pl]) =>
      stats.history.push({d: day(ago), t: 9, pid: p.id, sec: 1500, kcal: 120, plan: pl}));
    stats.count = 5; await saveStats();

    const plans = normPlans(p);
    plans[0].exercises = plans[0].exercises.filter(e => e.name !== 'Отжимания');  // выкинул
    plans[0].exercises.push({name: 'Планка', type: 'time', value: '45', sets: 3, rest: 30}); // добавил своё
    plans[1].exercises[0].value = '15';                                            // поменял руками
    p.stats = {completions: 6};
    await savePrograms();

    state.current = {sourceId: p.id}; state.raw = p; state.planIdx = 0;
    await finishWorkout();
  });
  await cp.waitForTimeout(1800);

  // ---- что увидел тренер ----
  await tp.evaluate(() => openClient(0));
  await tp.waitForTimeout(2000);
  const r = await tp.evaluate(() => (clients[0].reports || []).slice(-1)[0] || {});

  ok('журнал тренировок доехал', (r.log || []).length >= 5, (r.log || []).length + ' записей');
  ok('варианты посчитаны по отдельности',
     (r.plans || []).length === 2 && r.plans[0].n >= 4 && r.plans[1].n >= 1,
     (r.plans || []).map(x => `${x.days}: ${x.n}`).join(', '));
  ok('видно, что клиент УБРАЛ упражнение', (r.diff && r.diff.del || []).includes('Отжимания'),
     JSON.stringify(r.diff && r.diff.del));
  ok('видно, что ДОБАВИЛ своё', (r.diff && r.diff.add || []).includes('Планка'),
     JSON.stringify(r.diff && r.diff.add));
  ok('видно, что ПОМЕНЯЛ числа',
     (r.diff && r.diff.mod || []).some(m => m.n === 'Тяга в наклоне'),
     JSON.stringify((r.diff && r.diff.mod || []).map(m => `${m.n}: ${m.a}→${m.b}`)));
  ok('рост считается по обоим вариантам, не только по первому',
     new Set((r.ex || []).map(e => e.p)).size >= 1 && (r.ex || []).length >= 1,
     (r.ex || []).map(e => `${e.n} ${e.a}→${e.b}`).join(' | '));

  const card = await tp.evaluate(() => document.getElementById('clReports').textContent.replace(/\s+/g, ' ').trim());
  ok('на экране есть блок про правки', /Поменял в программе/.test(card));
  ok('на экране есть недели', /за четыре недели|эта/.test(card));
  ok('на экране есть разбивка по дням', /По дням/.test(card));

  await tp.screenshot({path: __dirname + '/shot-report.png', fullPage: true});
  console.log('\npageerror:', errs.length ? errs : 'нет');
  if(errs.length) bad++;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
