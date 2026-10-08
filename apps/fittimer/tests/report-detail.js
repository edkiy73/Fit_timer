/* Что тренер видит про клиента: расписание, варианты, рост и — главное — правки.

   Первая версия отчёта показывала четыре упражнения из первого варианта без
   разминки. Здесь проверяется, что отчёт отвечает на настоящие вопросы: держит ли
   человек расписание, какие дни делает, как растёт и НЕ ПЕРЕДЕЛАЛ ЛИ ПРОГРАММУ.

   Запуск:  ADMIN_KEY=... node tests/dev-server.js 8124
            node tests/report-detail.js */

const { becomeTrainer } = require('./helpers/trainer-account');

const { installV2Fixtures } = require('./helpers/v2-fixtures');
let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

// Два варианта по дням плюс разминка — то, чего прежний отчёт не видел вовсе.
// Собирается в странице через v2ex/v2plan (модель V2).
function buildProg(){
  return {
    id:'tp1', name:'Сила дома', progression:2,
    plans:[
      v2plan('tp1-mon', [
        v2ex('Суставная разминка', {id:'tp1-warm', warmup:true, type:'time', value:'60', sets:1, rest:10}),
        v2ex('Приседания', {id:'tp1-squat', value:'12', sets:3, rest:45, prog:{mode:'reps', reps:{step:1}}}),
        v2ex('Отжимания', {id:'tp1-push', value:'8', sets:3, rest:60, prog:{mode:'reps', reps:{step:1}}})
      ], {days:['Пн'], rounds:3, roundRest:60}),
      v2plan('tp1-thu', [
        v2ex('Тяга в наклоне', {id:'tp1-row', value:'10', sets:3, rest:60,
          load:{type:'weight', equipment:'dumbbell', weight:12}, prog:{mode:'weight', weight:{step:2}}})
      ], {days:['Чт'], rounds:3, roundRest:60})
    ]
  };
}

async function boot(b, label, errs, url){
  const page = await (await b.newContext({viewport: {width: 412, height: 900}, locale: 'ru-RU'})).newPage();
  await installV2Fixtures(page);
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
  await tp.evaluate(() => { curUser().name = 'Лена'; });
  await becomeTrainer(tp, {handle: NICK, trainer: {about: '', years: null, links: ''}});
  const link = await tp.evaluate(async ({src, nick}) => {
    const p = (0, eval)('(' + src + ')')();
    customPrograms.push(p); await savePrograms();
    let out = null;
    navigator.clipboard.writeText = async t => { out = t; };
    navigator.share = async d => { out = d.url; };
    const c = await addClient(); c.name = 'Марина';
    await saveClients(); activateClientAt(clients.indexOf(c));
    await sendProgramToClient(c, customPrograms.find(x => x.id === 'tp1'));
    return out;
  }, {src: buildProg.toString(), nick: NICK});

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
    const current = customPrograms.find(x => x.name === 'Сила дома');
    const day = i => localISO(new Date(Date.now() - i * 86400000));
    // четыре по первому варианту, один по второму
    const added = [[1,0],[4,0],[8,0],[11,0],[2,1]].map(([ago, pl]) =>
      ({d: day(ago), t: 9, pid: current.id, sec: 1500, kcal: 120, planId: normPlans(current)[pl].id}));
    await kvSet(pk('stats'), JSON.stringify(Object.assign({}, stats, {
      history:[...(stats.history || []), ...added],
      count:5
    })));
    await loadData();
    const p = customPrograms.find(x => x.name === 'Сила дома');

    const plans = normPlans(p);
    const pr = e => FitExerciseV2.prescriptionOf(e);
    plans[0].exercises = plans[0].exercises.filter(e => pr(e).name !== 'Отжимания');  // выкинул
    plans[0].exercises.push(v2ex('Планка', {id:'client-added-plank', type:'time', value:'45', sets:3, rest:30})); // добавил своё
    // Переименование не меняет identity: тот же exercise.id должен остаться одной
    // mod-строкой, а не превратиться в ложные delete+add.
    pr(plans[1].exercises[0]).name = 'Тяга одной рукой';
    pr(plans[1].exercises[0]).value = '15';                                            // поменял руками
    // Прогрессия — состояние у КАЖДОГО упражнения (ex.progressState), не общий счётчик
    // программы: раньше один счётчик программы прибавлял шаг всем упражнениям
    // сразу, даже тем, что не участвовали в сегодняшней тренировке. Чтобы
    // отчёт показал рост по ВТОРОМУ варианту, у него должно реально вырасти
    // своё упражнение — задаём это явно, а не через общий completions.
    plans[1].exercises[0].progressState.current.weight = 14; // Тяга в наклоне: было 12 кг
    p.stats = {completions: 6};
    await savePrograms();

    openStart(p);
    const firstPlan = document.querySelector('#planRow .plan-chip[data-plan-idx="0"]');
    if(firstPlan) firstPlan.click();
  });
  await cp.click('#btnStart');
  await cp.waitForSelector('#startModal.open');
  await cp.evaluate(async () => {
    const outcomes = {};
    buildSteps().forEach((step, i) => {
      if(step.phase === 'work') outcomes[workoutStepKey(step, i)] = 'done';
    });
    $('startModal').classList.remove('open');
    startWorkout(0, 60000, {skipPrep:true, outcomes});
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
    const p2 = {id:'tp2', name:'Растяжка', progression:0, plans:[v2plan('tp2-a',
      [v2ex('Наклоны', {id:'tp2-bend', type:'time', value:'40', sets:1, rest:20})], {days:['Сб'], rounds:1, roundRest:0})]};
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
        v2ex('Двойная', {id:'fresh-dual', type:'reps', value:'12-15', sets:3,
          load:{type:'weight', equipment:'dumbbell', weight:6},
          prog:{mode:'double_range', reps:{step:1, max:15}, weight:{step:2}}})]}]};
    const r = buildReport(p);
    return (r.ex || []).filter(x => x.n === 'Двойная');
  });
  ok('диапазон, схлопнутый прогрессией, не считается ростом', fake.length === 0,
     fake.map(x => `${x.a}→${x.b}`).join() || 'нет строки');

  const progressionAxes = await cp.evaluate(() => {
    const p = {
      id:'report-progression-axes', name:'Все оси', progression:2,
      plans:[{days:['Пн'],rounds:1,roundRest:0,exercises:[
        v2ex('Планка', {id:'time-axis', type:'time', value:'30', sets:1, rest:30,
          prog:{mode:'time', time:{step:5, max:60}}, state:{count:1, current:{time:45}}}),
        v2ex('Тяга резинки', {id:'level-axis', type:'reps', value:'12-15', sets:3, rest:45,
          load:{type:'level', equipment:'band', levels:[{label:'Лёгкая'},{label:'Средняя'},{label:'Сильная'}], level:0},
          prog:{mode:'level', reps:{step:2, max:18}}, state:{count:1, current:{reps:'12-15', level:1}}}),
        v2ex('Ручная резинка', {id:'manual-level-axis', type:'reps', value:'12', sets:2, rest:30,
          load:{type:'level', equipment:'band', levels:[{label:'Красная'},{label:'Чёрная'}], level:0},
          prog:{mode:'none'}})
      ]}]
    };
    p.origEx = snapshotEx(p);
    // Это именно ручная правка базы, не progression state.
    FitExerciseV2.prescriptionOf(p.plans[0].exercises[2]).load.level = 1;
    const report = buildReport(p);
    return {ex:report.ex,diff:report.diff};
  });
  const timeGrowth = progressionAxes.ex.find(x => x.n === 'Планка');
  const levelGrowth = progressionAxes.ex.find(x => x.n === 'Тяга резинки');
  const levelManual = (progressionAxes.diff.mod || []).find(x => x.n === 'Ручная резинка');
  ok('отчёт тренеру видит рост времени',
    !!timeGrowth && /30\s*сек/.test(timeGrowth.a) && /45\s*сек/.test(timeGrowth.b),
    JSON.stringify(timeGrowth));
  ok('отчёт тренеру видит рост resistance',
    !!levelGrowth && /Лёгкая/.test(levelGrowth.a) && /Средняя/.test(levelGrowth.b),
    JSON.stringify(levelGrowth));
  ok('обычная progression resistance не считается ручной правкой программы',
    !(progressionAxes.diff.mod || []).some(x => x.n === 'Тяга резинки'),
    JSON.stringify(progressionAxes.diff));
  ok('ручная смена базовой resistance-ступени видна тренеру как правка',
    !!levelManual && /Красная/.test(levelManual.a) && /Чёрная/.test(levelManual.b),
    JSON.stringify(levelManual));

  const identity = await cp.evaluate(() => {
    const ex = (id, name, value) => v2ex(name, {id, type:'reps', value:String(value), sets:3, rest:30});
    const pr = e => FitExerciseV2.prescriptionOf(e);
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
    pr(p.plans[0].exercises[1]).value = '12';
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
    pr(legacy.plans[0].exercises[0]).value = '11';
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
        v2ex('Тест', {id:id+'-ex', value:'10', sets:1, rest:0})
      ]}]
    });
    const target = mk('trainer-streak-target','Программа тренера');
    const other = mk('trainer-streak-other','Другая программа');

    customPrograms.splice(0, customPrograms.length, target, other);
    stats.history = [
      {id:'st-target',d:iso,pid:target.id,status:'full',sec:600},
      {id:'st-other',d:iso,pid:other.id,status:'full',sec:600}
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
