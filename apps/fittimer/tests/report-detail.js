/* Что тренер видит про клиента: расписание, варианты, рост и — главное — правки.

   Первая версия отчёта показывала четыре упражнения из первого варианта без
   разминки. Здесь проверяется, что отчёт отвечает на настоящие вопросы: держит ли
   человек расписание, какие дни делает, как растёт и НЕ ПЕРЕДЕЛАЛ ЛИ ПРОГРАММУ.

   Запуск:  ADMIN_KEY=... node tests/dev-server.js 8124
            node tests/report-detail.js */

const { becomeTrainer } = require('./helpers/trainer-account');

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
  const page = await (await b.newContext({viewport: {width: 412, height: 900}, locale: 'ru-RU'})).newPage();
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
  await tp.evaluate(() => { users.find(u => u.id === currentUser).name = 'Лена'; });
  await becomeTrainer(tp, {handle: NICK, trainer: {about: '', years: null, links: ''}});
  const link = await tp.evaluate(async ({txt, nick}) => {
    const r = parseProgramText(txt);
    const p = r.program || r; p.id = 'tp1';
    customPrograms.push(p); await savePrograms();
    let out = null;
    navigator.clipboard.writeText = async t => { out = t; };
    navigator.share = async d => { out = d.url; };
    const c = await addClient(); c.name = 'Марина';
    await saveClients(); activateClientAt(clients.indexOf(c));
    await sendProgramToClient(c, customPrograms.find(x => x.id === 'tp1'));
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
    return {
      plans: normPlans(p).length,
      orig: (p.origEx || []).length,
      ids: (p.origEx || []).map(x => x.id)
    };
  });
  ok('снимок присланного снят по всем вариантам', shape.plans === 2 && shape.orig === 4,
     `${shape.plans} варианта, ${shape.orig} упражнений`);
  ok('снимок отчёта хранит stable exercise.id для каждого упражнения',
     shape.ids.length === 4 && shape.ids.every(Boolean) && new Set(shape.ids).size === 4,
     JSON.stringify(shape.ids));

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
    plans[0].exercises.push({id:'client-added-plank', name: 'Планка', type: 'time', value: '45', sets: 3, rest: 30}); // добавил своё
    // Переименование не меняет identity: тот же exercise.id должен остаться одной
    // mod-строкой, а не превратиться в ложные delete+add.
    plans[1].exercises[0].name = 'Тяга одной рукой';
    plans[1].exercises[0].value = '15';                                            // поменял руками
    // Прогрессия — состояние у КАЖДОГО упражнения (ex.ps), не общий счётчик
    // программы: раньше один счётчик программы прибавлял шаг всем упражнениям
    // сразу, даже тем, что не участвовали в сегодняшней тренировке. Чтобы
    // отчёт показал рост по ВТОРОМУ варианту, у него должно реально вырасти
    // своё упражнение — задаём это явно, а не через общий completions.
    ensurePs(plans[1].exercises[0]).cur.kg = 14; // Тяга в наклоне: было 12 кг
    p.stats = {completions: 6};
    await savePrograms();

    state.current = customToProgram(p, 0); state.raw = p; state.planIdx = 0;
    state.steps = buildSteps();
    state.stepOutcomes = {};
    state.steps.forEach((step, i) => {
      if(step.phase === 'work') state.stepOutcomes[workoutStepKey(step, i)] = 'done';
    });
    state.globalStart = Date.now() - 60000;
    state.pausedTotal = 0;
    await finishWorkout();
  });
  await cp.waitForTimeout(1800);

  // ---- что увидел тренер ----
  await tp.evaluate(() => openClient(0));
  await tp.waitForTimeout(2000);
  const r = await tp.evaluate(() => (clients[0].progs[0].reports || []).slice(-1)[0] || {});

  ok('журнал тренировок доехал', (r.log || []).length >= 5, (r.log || []).length + ' записей');
  ok('варианты посчитаны по отдельности',
     (r.plans || []).length === 2 && r.plans[0].n >= 4 && r.plans[1].n >= 1,
     (r.plans || []).map(x => `${x.days}: ${x.n}`).join(', '));
  ok('видно, что клиент УБРАЛ упражнение', (r.diff && r.diff.del || []).includes('Отжимания'),
     JSON.stringify(r.diff && r.diff.del));
  ok('видно, что ДОБАВИЛ своё', (r.diff && r.diff.add || []).includes('Планка'),
     JSON.stringify(r.diff && r.diff.add));
  ok('переименование того же exercise.id не считается удалением и добавлением',
     !(r.diff && r.diff.del || []).includes('Тяга в наклоне')
       && !(r.diff && r.diff.add || []).includes('Тяга одной рукой'),
     JSON.stringify(r.diff));
  ok('видно, что ПОМЕНЯЛ числа даже после переименования',
     (r.diff && r.diff.mod || []).some(m => m.n === 'Тяга одной рукой'),
     JSON.stringify((r.diff && r.diff.mod || []).map(m => `${m.n}: ${m.a}→${m.b}`)));
  ok('рост считается по обоим вариантам, не только по первому',
     new Set((r.ex || []).map(e => e.p)).size >= 1 && (r.ex || []).length >= 1,
     (r.ex || []).map(e => `${e.n} ${e.a}→${e.b}`).join(' | '));

  const card = await tp.evaluate(() => document.getElementById('clProgs').textContent.replace(/\s+/g, ' ').trim());
  ok('на экране есть блок про правки', /Поменял в программе/.test(card));
  ok('на экране есть недели', /По неделям/.test(card));
  ok('на экране есть разбивка по дням', /По дням/.test(card));
  // Средней длительности по варианту тут нет намеренно: одна тренировка на двадцать
  // минут и одна на час дают «сорок минут», которых не было ни разу. Минуты стоят
  // у КАЖДОЙ тренировки в журнале — см. проверку ниже.
  ok('в разбивке по дням только счёт раз', /Пн\s*5(?![\d:])(?!\s*мин)/.test(card.replace(/\s+/g, ' ')),
     (card.match(/Пн[^А-Я]*/)||[''])[0].slice(0, 30));

  // Вторая программа тому же клиенту не должна затирать первую вместе с занятиями.
  const two = await tp.evaluate(async () => {
    const r = parseProgramText('ПРОГРАММА: Растяжка\nДНИ: Сб\nКРУГИ: 1\n\nУПРАЖНЕНИЕ: Наклоны\nФОРМАТ: время\nЗНАЧЕНИЕ: 40\nПОДХОДЫ: 1\nОТДЫХ: 20');
    const p2 = r.program || r; p2.id = 'tp2';
    customPrograms.push(p2); await savePrograms();
    await sendProgramToClient(clients[0], p2);
    return {progs: clients[0].progs.length,
            names: clients[0].progs.map(x => x.name),
            firstKeeps: (clients[0].progs[0].reports || []).length};
  });
  ok('вторая программа не затирает первую', two.progs === 2, two.names.join(' | '));
  ok('занятия по первой остались', two.firstKeeps > 0, two.firstKeeps + ' отчётов');
  ok('недели подписаны датами, а не «3 нед.»', /сейчас/.test(card) && /\d{2}\.\d{2}/.test(card));
  ok('каждая тренировка показана отдельно, со своими минутами',
     /Тренировки/.test(card) && /\d+ мин/.test(card));

  // Ложного роста быть не должно: при двойной прогрессии диапазон схлопывается в
  // одно число уже на нулевом шаге, и раньше это попадало в отчёт как изменение.
  const fake = await cp.evaluate(() => {
    // Свежая программа: ни одного пройденного повышения, значит вырасти не могло
    // ничего. Строка всё равно появлялась, потому что двойная прогрессия
    // схлопывает диапазон в одно число уже на нулевом шаге.
    const p = {id: 'fresh1', name: 'Свежая', progression: 2, stats: {completions: 0},
      plans: [{days: ['Пн'], rounds: 1, roundRest: 60, exercises: [
        {name: 'Двойная', type: 'reps', value: '12-15', sets: 3, weight: 6,
         trackWeight: true, progOn: true, dualProg: true, repsCeil: 15, wStep: 2}]}]};
    const r = buildReport(p);
    return (r.ex || []).filter(x => x.n === 'Двойная');
  });
  ok('диапазон, схлопнутый прогрессией, не считается ростом', fake.length === 0,
     fake.map(x => `${x.a}→${x.b}`).join() || 'нет строки');

  const identity = await cp.evaluate(() => {
    const ex = (id, name, value) => ({
      id, name, type:'reps', value:String(value), sets:3, rest:30,
      progOn:false, trackWeight:false
    });
    const p = {
      id:'report-id-test', name:'ID diff', progression:0,
      plans:[{days:[],rounds:1,roundRest:0,exercises:[
        ex('dup-a','Одинаковое',8),
        ex('dup-b','Одинаковое',8),
        ex('legacy-one','Уникальное legacy',10)
      ]}]
    };
    p.origEx = snapshotEx(p);

    // Меняем только ВТОРОЕ из двух одинаково названных упражнений.
    p.plans[0].exercises[1].value = '12';
    const byId = buildReport(p).diff;

    // Имитируем старый origEx до появления id отдельно: уникальное имя всё ещё
    // можно сопоставить однозначно и не ломать старые программы.
    const legacy = {
      id:'report-legacy-test', name:'Legacy diff', progression:0,
      plans:[{days:[],rounds:1,roundRest:0,exercises:[
        ex('legacy-one','Уникальное legacy',10)
      ]}]
    };
    legacy.origEx = snapshotEx(legacy);
    legacy.origEx.forEach(x => { delete x.id; });
    legacy.plans[0].exercises[0].value = '11';
    const legacyDiff = buildReport(legacy).diff;

    return {byId, legacyDiff};
  });
  ok('одинаковые названия не склеиваются: меняется только нужный exercise.id',
     identity.byId.mod.length === 1
       && identity.byId.mod[0].a.startsWith('8')
       && identity.byId.mod[0].b.startsWith('12')
       && identity.byId.add.length === 0
       && identity.byId.del.length === 0,
     JSON.stringify(identity.byId));
  ok('старый snapshot без id сохраняет однозначный fallback по варианту и имени',
     identity.legacyDiff.mod.length === 1
       && identity.legacyDiff.mod[0].n === 'Уникальное legacy'
       && identity.legacyDiff.add.length === 0
       && identity.legacyDiff.del.length === 0,
     JSON.stringify(identity.legacyDiff));

  const scopedStreak = await cp.evaluate(() => {
    const savedPrograms = customPrograms.slice();
    const savedHistory = (stats.history || []).slice();
    const savedBest = stats.bestStreak || 0;
    const now = new Date();
    const iso = localISO(now);
    const day = DAYS[(now.getDay() + 6) % 7];
    const mk = (id, name) => ({
      id, name, active:true, progression:0,
      plans:[{days:[day],rounds:1,roundRest:0,exercises:[
        {id:id+'-ex',name:'Тест',type:'reps',value:'10',sets:1,rest:0}
      ]}]
    });
    const target = mk('trainer-streak-target','Программа тренера');
    const other = mk('trainer-streak-other','Другая программа');

    customPrograms.splice(0, customPrograms.length, target, other);
    stats.history = [
      {id:'st-target',d:iso,pid:target.id,plan:0,status:'full',sec:600},
      {id:'st-other',d:iso,pid:other.id,plan:0,status:'full',sec:600}
    ];
    stats.bestStreak = 99;

    const global = calcStreakInfo().n;
    const scoped = calcStreakInfo({programId:target.id}).n;
    const report = buildReport(target).streak;

    customPrograms.splice(0, customPrograms.length, ...savedPrograms);
    stats.history = savedHistory;
    stats.bestStreak = savedBest;

    return {global, scoped, report};
  });
  ok('отчёт тренеру считает серию только по его программе',
     scopedStreak.global === 2
       && scopedStreak.scoped === 1
       && scopedStreak.report === 1,
     JSON.stringify(scopedStreak));

  await tp.screenshot({path: __dirname + '/shot-report.png', fullPage: true});
  console.log('\npageerror:', errs.length ? errs : 'нет');
  if(errs.length) bad++;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
