/* Обзор перед тренировкой должен отвечать на три вопроса без запуска таймера:
   что сегодня делать, сколько это займёт и что изменилось с прошлого раза.

   Запуск:  node tests/dev-server.js 8124
            node tests/start-overview.js */

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
  const page = await (await b.newContext({viewport: {width: 412, height: 900}, locale: 'ru-RU'})).newPage();
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(2000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(1500); }

  await page.evaluate(async () => {
    const ex = (name, value, extra = {}) => Object.assign({
      name, type:'reps', value:String(value), sets:3, rest:45, restAfter:30,
      progOn:true, repsStep:1, trackWeight:false
    }, extra);
    const p = {
      id:'overview1', name:'Проверка обзора', active:true, progression:1,
      stats:{completions:2}, plans:[{id:'ov-plan', days:['Пн'], rounds:1, roundRest:60, exercises:[
        ex('Суставная разминка', 8, {warmup:true, sets:1,
          media:{kind:'img', data:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}}),
        ex('Приседания', 10, {id:'ov-squat'}),
        ex('Жим гантелей', 8, {trackWeight:true, weight:6, wStep:1, repsStep:0}),
        ex('Тяга в наклоне', 10), ex('Планка', 30, {type:'time', timeStep:5}),
        ex('Скручивания', 12)
      ]}]
    };
    const history = [...(stats.history || []), {pid:p.id, planId:'ov-plan', sec:31 * 60, at:Date.now() - 86400000,
      load:[{id:'ov-squat', reps:'11', sec:0, kg:0}]}];
    await kvSet(pk('customPrograms'), JSON.stringify([...customPrograms, p]));
    await kvSet(pk('stats'), JSON.stringify(Object.assign({}, stats, {history})));
    await loadData();
    openStart(customPrograms.find(x => x.id === p.id));
  });

  const before = await page.evaluate(() => ({
    summary:$('startOverviewSummary').textContent,
    change:$('startLoadChange').textContent.trim(),
    first:document.querySelector('#startOverviewList .ex-row')?.textContent || '',
    second:document.querySelectorAll('#startOverviewList .ex-row')[1]?.textContent || '',
    warmFirst:document.querySelector('#startOverviewList .ex-row .ex-meta .wm')?.textContent,
    photos:document.querySelectorAll('#startOverviewList .ex-thumb img').length,
    rests:[...document.querySelectorAll('#startOverviewList .ex-meta *')].some(x => /отдых/i.test(x.textContent)),
    rows:document.querySelectorAll('#startOverviewList .ex-row').length
  }));
  ok('сразу виден состав, объём и время', /6 упражнений/.test(before.summary) && /16 подходов/.test(before.summary) && /31 мин/.test(before.summary), before.summary);
  ok('изменение нагрузки объяснено', /Нагрузка выше в 1 упражнении/.test(before.change) && /было → сегодня/.test(before.change), before.change);
  ok('используются строки упражнений редактора', before.rows === 6 && /Приседания/.test(before.second), before.second);
  ok('разминка стоит первой и фото загружено', before.warmFirst === 'Разминка' && before.photos === 1, `${before.warmFirst} · ${before.photos}`);
  ok('отдых виден отдельной редактируемой меткой', before.rests);
  ok('показана сегодняшняя цель и точное изменение', /12 повторений/.test(before.second) && /было 11 → сегодня 12/.test(before.second), before.second);
  ok('при изменившейся нагрузке виден и срок следующего повышения', /Спросим о повышении через/.test(before.change), before.change);
  const kgChip = await page.evaluate(() => {
    const row = document.querySelectorAll('#startOverviewList .ex-row')[2];
    const chip = row && row.querySelector('[data-load-field="weight"]');
    return {chip: chip ? chip.textContent : '', icon: !!(chip && chip.querySelector('svg')),
      reps: row ? (row.querySelector('[data-load-field="reps"]')?.textContent || '') : ''};
  });
  ok("вес — отдельная метка-кнопка с карандашом", /\d+\s*кг/.test(kgChip.chip) && kgChip.icon, JSON.stringify(kgChip));
  ok('вес не дублируется в метке повторов', !/кг/.test(kgChip.reps), kgChip.reps);

  // Сохранение правки асинхронное (savePrograms → renderStartOverview): ждём, пока строка
  // перерисуется, а не читаем её сразу после клика.
  const overviewRowText = async (n, expected) => {
    const row = page.locator(`#startOverviewList .ex-row:nth-child(${n})`);
    for(let i = 0; i < 40; i++){
      const text = await row.textContent();
      if(expected.test(text)) return text;
      await page.waitForTimeout(50);
    }
    return row.textContent();
  };

  // Каждый параметр меняется по своей метке, без открытия полного редактора.
  const weightChip = '#startOverviewList .ex-row:nth-child(3) [data-load-field="weight"]';
  await page.click(weightChip);
  ok('тап по весу открывает общий редактор параметра', await page.isVisible('#startLoadModal'));
  await page.fill('#startLoadInput', '9');
  await page.click('[data-act="commitStartLoadEdit"]');
  const afterWeight = await overviewRowText(3, /9\s*кг/);
  ok('правка веса сразу обновляет обзор', /9\s*кг/.test(afterWeight), afterWeight);

  const repsChip = '#startOverviewList .ex-row:nth-child(2) [data-load-field="reps"]';
  await page.click(repsChip);
  await page.fill('#startLoadInput', '9-11');
  await page.click('[data-act="commitStartLoadEdit"]');
  const afterReps = await overviewRowText(2, /9[–-]11\s*повт/);
  ok('тап по повторам меняет только рабочие повторы', /9[–-]11\s*повт/.test(afterReps), afterReps);

  const setsChip = '#startOverviewList .ex-row:nth-child(2) [data-load-field="sets"]';
  await page.click(setsChip);
  await page.fill('#startLoadInput', '2');
  await page.click('[data-act="commitStartLoadEdit"]');
  const afterSets = await overviewRowText(2, /2\s*подход/);
  ok('тап по подходам меняет число подходов', /2\s*подход/.test(afterSets), afterSets);

  const restChip = '#startOverviewList .ex-row:nth-child(2) [data-load-field="rest"]';
  await page.click(restChip);
  await page.fill('#startLoadInput', '75');
  await page.click('[data-act="commitStartLoadEdit"]');
  const afterRest = await overviewRowText(2, /Отдых\s*75\s*сек/);
  ok('тап по отдыху меняет отдых', /Отдых\s*75\s*сек/.test(afterRest), afterRest);

  const legacy = await page.evaluate(async () => {
    const p = {
      id:'overview-legacy', name:'Старая история', active:true, progression:2,
      stats:{completions:9}, psMigrated:true,
      plans:[{id:'legacy-plan', days:['Пн'], rounds:1, roundRest:0, exercises:[{
        id:'legacy-ex', name:'Legacy reps', type:'reps', value:'8', sets:3, rest:45,
        progOn:true, trackWeight:false, repsStep:1,
        // Фактическая сегодняшняя нагрузка уже живёт в per-exercise state.
        ps:{n:1,cur:{reps:'15'}}
      }]}]
    };
    // Старая запись знает, что тренировка была, но load snapshot в той версии
    // ещё не сохранялся.
    const history = [...(stats.history || []), {
      id:'legacy-h', pid:p.id, planId:'legacy-plan', d:localISO(new Date(Date.now()-86400000)),
      sec:900, status:'full', exercises:['Legacy reps']
    }];
    await kvSet(pk('customPrograms'), JSON.stringify([...customPrograms, p]));
    await kvSet(pk('stats'), JSON.stringify(Object.assign({}, stats, {history})));
    await loadData();
    const live = customPrograms.find(x => x.id === p.id);
    const previous = previousWorkoutLoad(live, 0);
    openStart(live);
    return {
      previous,
      text:$('startLoadChange').textContent.trim(),
      row:document.querySelector('#startOverviewList .ex-row')?.textContent || ''
    };
  });
  ok('legacy история без snapshot не подделывает предыдущую нагрузку через completions',
    legacy.previous.first === false
      && legacy.previous.exact === false
      && legacy.previous.legacy === true
      && legacy.previous.rows.length === 0,
    JSON.stringify(legacy.previous));
  ok('для старой истории UI честно говорит, что сравнение недоступно',
    /Предыдущая нагрузка не сохранена/.test(legacy.text)
      && !/было\s*→\s*сегодня/.test(legacy.text)
      && !/^Без изменений/.test(legacy.text),
    legacy.text);
  ok('сегодняшняя per-exercise нагрузка при этом показывается без отката',
    /15 повторений/.test(legacy.row), legacy.row);

  // Сопротивление — полноценная ось нагрузки: обзор должен показать понятный label,
  // а переход на следующую ступень считать повышением даже если диапазон повторов
  // при этом сбросился вниз, как в double progression.
  const resistance = await page.evaluate(async () => {
    const p = {
      id:'overview-level', name:'Резинки', active:true, progression:2,
      stats:{completions:2}, plans:[{id:'level-plan', days:['Пн'], rounds:1, roundRest:0, exercises:[{
        id:'band-row', name:'Тяга резинки', type:'reps', value:'12-15', sets:3, rest:45,
        progOn:true, trackWeight:false, loadType:'level', progMode:'level',
        loadLevels:[{key:'light'},{key:'medium'},{key:'strong'}],
        loadLevel:1, repsStep:2, repsMax:18,
        ps:{n:0,cur:{reps:'12-15',level:2}}
      }]}]
    };
    const history = [...(stats.history || []), {
      id:'level-prev', pid:p.id, planId:'level-plan', d:localISO(new Date(Date.now()-86400000)),
      sec:900, status:'full', exercises:['Тяга резинки'],
      load:[{id:'band-row',reps:'16-18',sec:0,kg:0,level:1,levelKey:'medium',levelLabel:'Medium stale'}]
    }];
    await kvSet(pk('customPrograms'), JSON.stringify([...customPrograms, p]));
    await kvSet(pk('stats'), JSON.stringify(Object.assign({}, stats, {history})));
    await loadData();
    const live = customPrograms.find(x => x.id === p.id);
    const current = workoutLoadSnapshot(live, 0);
    const delta = loadDelta(history[history.length - 1].load[0], current[0]);
    openStart(live);
    return {
      current:current[0],
      delta,
      change:$('startLoadChange').textContent.trim(),
      row:document.querySelector('#startOverviewList .ex-row')?.textContent || ''
    };
  });
  ok('сопротивление сохраняет canonical key и текущий локализованный label',
    resistance.current.level === 2
      && resistance.current.levelKey === 'strong'
      && resistance.current.levelLabel === 'Сильное',
    JSON.stringify(resistance.current));
  ok('следующая ступень сопротивления считается повышением несмотря на сброс повторов',
    resistance.delta.dir === 'up'
      && /Сопротивление: было Среднее → сегодня Сильное/.test(resistance.delta.text)
      && !/Medium stale/.test(resistance.delta.text)
      && /Нагрузка выше/.test(resistance.change),
    JSON.stringify({delta:resistance.delta,change:resistance.change}));
  ok('обзор показывает физически понятное сопротивление, а не level 2',
    /Сильное/.test(resistance.row) && !/level\s*2/i.test(resistance.row),
    resistance.row);

  const effortChip = '#startOverviewList .ex-row [data-load-field="level"]';
  await page.click(effortChip);
  ok('тап по усилию открывает шкалу сопротивления', await page.isVisible('#startLoadModal')
    && await page.isVisible('#startLoadSelect'));
  await page.selectOption('#startLoadSelect', '0');
  await page.click('[data-act="commitStartLoadEdit"]');
  const afterEffort = await page.locator('#startOverviewList .ex-row').textContent();
  ok('усилие меняется так же, как вес', /Лёгкое/.test(afterEffort) && !/Сильное/.test(afterEffort), afterEffort);

  // Смена дней пересортировывает варианты (normPlans сортирует по дню недели).
  // История и «было → сегодня» обязаны остаться у своего варианта: раньше они
  // искали вариант по номеру и после пересортировки показывали чужую нагрузку.
  const reorder = await page.evaluate(async () => {
    const mkEx = (id, name) => ({id, name, type:'reps', value:'10', sets:1, rest:30,
      progOn:true, repsStep:1, trackWeight:false});
    const p = {
      id:'overview-reorder', name:'Два варианта', active:true, progression:2,
      stats:{completions:1}, plans:[
        {id:'plan-wed', days:['Ср'], rounds:1, roundRest:0, exercises:[mkEx('wed-ex', 'Среда')]},
        {id:'plan-fri', days:['Пт'], rounds:1, roundRest:0, exercises:[mkEx('fri-ex', 'Пятница')]}
      ]
    };
    const history = [...(stats.history || []), {
      id:'reorder-prev', pid:p.id, planId:'plan-fri', d:localISO(new Date(Date.now()-86400000)),
      sec:600, status:'full', exercises:['Пятница'],
      load:[{id:'fri-ex', reps:'8', sec:0, kg:0}]
    }];
    await kvSet(pk('customPrograms'), JSON.stringify([...customPrograms, p]));
    await kvSet(pk('stats'), JSON.stringify(Object.assign({}, stats, {history})));
    await loadData();
    const live = customPrograms.find(x => x.id === p.id);
    const before = normPlans(live).map(pl => pl.id);
    // пятничный вариант переезжает на понедельник и становится первым
    normPlans(live)[1].days = ['Пн'];
    const after = normPlans(live).map(pl => pl.id);
    const friIdx = after.indexOf('plan-fri'), wedIdx = after.indexOf('plan-wed');
    return {
      before, after,
      fri:previousWorkoutLoad(live, friIdx),
      wed:previousWorkoutLoad(live, wedIdx)
    };
  });
  ok('после смены дней варианты действительно пересортировались',
    reorder.before.join() === 'plan-wed,plan-fri' && reorder.after.join() === 'plan-fri,plan-wed',
    reorder.before.join() + ' → ' + reorder.after.join());
  ok('история осталась у своего варианта после пересортировки',
    reorder.fri.exact === true && reorder.fri.rows.length === 1 && reorder.fri.rows[0].id === 'fri-ex'
      && reorder.wed.exact !== true && reorder.wed.rows.length === 0,
    JSON.stringify({fri:reorder.fri, wed:reorder.wed}));

  // Полностью завершённая двойная прогрессия не должна обещать следующую
  // проверку нагрузки: повышать здесь уже нечего.
  const terminalText = await page.evaluate(async () => {
    const p = {
      id:'overview-terminal', name:'Финальный потолок', active:true, progression:1,
      stats:{completions:1}, plans:[{days:['Пн'], rounds:1, roundRest:0, exercises:[{
        id:'term-overview', name:'Финальный жим', type:'reps', value:'8-10', sets:3, rest:45,
        progOn:true, trackWeight:true, weight:20, weightMax:20, wStep:2,
        repsStep:1, repsMax:20, dualProg:true, ps:{n:1, cur:{kg:20, reps:'18-20'}}
      }]}]
    };
    await kvSet(pk('customPrograms'), JSON.stringify([...customPrograms, p]));
    await loadData();
    openStart(customPrograms.find(x => x.id === p.id));
    return $('startLoadChange').textContent.trim();
  });
  ok('на полном потолке нет обещания следующей проверки',
     !/Спросим о повышении через/.test(terminalText), terminalText);

  console.log('\npageerror:', errs.length ? errs : 'нет');
  if(errs.length) bad++;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
