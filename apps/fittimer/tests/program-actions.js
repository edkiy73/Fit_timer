/* Действия над программой одинаковы на всех экранах, где она есть.

   Действие, доступное в списке и недоступное на странице программы (или наоборот),
   человек считает сломанным, а не «не предусмотренным здесь». Здесь проверяется,
   что «Дублировать» и «Предложить в каталог» есть в обоих меню, и что копия не
   наследует чужого: статистику, метку каталога, чужую ссылку.

   Запуск:  node tests/dev-server.js 8124
            node tests/program-actions.js */

const { becomeTrainer } = require('./helpers/trainer-account');

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

  await becomeTrainer(page, {handle: '@act.' + Math.random().toString(36).slice(2, 8)});
  await page.evaluate(async () => {
    const r = parseProgramText(`ПРОГРАММА: Проба
ДНИ: Пн
КРУГИ: 2
ОТДЫХ МЕЖДУ КРУГАМИ: 60

УПРАЖНЕНИЕ: Приседания
ФОРМАТ: повторения
ЗНАЧЕНИЕ: 12
ПОДХОДЫ: 3
ОТДЫХ: 45`);
    const p = r.program || r;
    p.id = 'src1';
    p.stats = {completions: 7};
    p.storeId = 'slim-tiho';        // как будто взята из каталога
    p.src = 'abcd1234';             // и пришла от тренера по ссылке
    p.by = '@someone';
    p.rotIdx = 1;                   // личная позиция очереди вариантов
    p.progStepsAdj = 3;             // старое локальное состояние прогрессии
    const ex = normPlans(p)[0].exercises[0];
    ex.ps = {n:2, cur:{reps:'16',kg:12}};
    ex.progFrom = 4;
    await kvSet(pk('customPrograms'), JSON.stringify([...customPrograms, p]));
    await loadData();
    await savePrograms();
  });

  // ---- меню на ЭКРАНЕ ПРОГРАММЫ ----
  const onStart = await page.evaluate(() => {
    const p = customPrograms.find(x => x.id === 'src1');
    openStart(p); buildStartMenu();
    return [...document.querySelectorAll('#startMenu button')].map(x => x.textContent.trim());
  });
  ok('на экране программы есть «Дублировать»', onStart.some(t => /Дублировать/.test(t)), onStart.join(' | '));

  // ---- меню в СПИСКЕ ----
  const inList = await page.evaluate(async () => {
    // Своя программа, не из каталога: у взятой из каталога предлагать нечего.
    const r = parseProgramText('ПРОГРАММА: Своя\nДНИ: Пн\nКРУГИ: 1\n\nУПРАЖНЕНИЕ: Планка\nФОРМАТ: время\nЗНАЧЕНИЕ: 40\nПОДХОДЫ: 1\nОТДЫХ: 20');
    const own = r.program || r; own.id = 'own1';
    await kvSet(pk('customPrograms'), JSON.stringify([...customPrograms, own]));
    await loadData();
    await savePrograms();
    goTab('scrPrograms');
    renderMine();
    const menus = [...document.querySelectorAll('#mineList .ctx-menu')];
    const last = menus[menus.length - 1];
    return last ? [...last.querySelectorAll('button')].map(x => x.textContent.trim()) : [];
  });
  ok('в списке есть «Дублировать»', inList.some(t => /Дублировать/.test(t)), inList.join(' | '));
  ok('в списке есть «Предложить в каталог»', inList.some(t => /каталог/.test(t)));

  // Реальный клик по ⋮ в списке программ. Раньше обработчик искал .mine-wrap,
  // хотя карточка называется .mine-card, поэтому меню вообще не открывалось.
  await page.evaluate(() => { goTab('scrPrograms'); renderMine(); });
  const ownCard = page.locator('#mineList .mine-card').filter({hasText:'Своя'}).first();
  await ownCard.locator('.more-btn').click();
  const programMore = await ownCard.evaluate(card => {
    const menu = card.querySelector('.ctx-menu');
    const more = card.querySelector('.more-btn');
    return {
      open:!!(menu && menu.classList.contains('open')),
      expanded:more && more.getAttribute('aria-expanded'),
      items:menu ? [...menu.querySelectorAll('button')].map(x => x.textContent.trim()) : []
    };
  });
  ok('⋮ в списке программ реально открывает меню',
     programMore.open && programMore.expanded === 'true', JSON.stringify(programMore));

  const order = await page.evaluate(() => {
    const p = customPrograms.find(x => x.id === 'own1');
    openStart(p); buildStartMenu();
    return [...document.querySelectorAll('#startMenu button')].map(x => x.textContent.trim());
  });
  ok('порядок пунктов одинаков в обоих меню',
     order.filter(t => /Дублировать|Поделиться|каталог/.test(t)).join('|')
     === inList.filter(t => /Дублировать|Поделиться|каталог/.test(t)).join('|'),
     order.filter(t => /Дублировать|Поделиться|каталог/.test(t)).join(' | '));

  // у программы ИЗ каталога предлагать нечего — она там уже есть
  const store = await page.evaluate(() => {
    const p = customPrograms.find(x => x.id === 'src1');
    openStart(p); buildStartMenu();
    return [...document.querySelectorAll('#startMenu button')].map(x => x.textContent.trim());
  });
  ok('у программы из каталога пункта «в каталог» нет', !store.some(t => /каталог/.test(t)));

  // ---- копия ----
  const copy = await page.evaluate(async () => {
    const p = customPrograms.find(x => x.id === 'src1');
    const c = await duplicateProgram(p);
    const ex = normPlans(c)[0].exercises[0] || {};
    return {name: c.name, ex: (normPlans(c)[0].exercises || []).length,
            completions: c.stats.completions, storeId: c.storeId, src: c.src, by: c.by,
            rotIdx:c.rotIdx, progStepsAdj:c.progStepsAdj, ps:ex.ps, progFrom:ex.progFrom,
            sameId: c.id === p.id, total: customPrograms.length};
  });
  ok('копия создана и названа понятно', /копия/.test(copy.name) && !copy.sameId, copy.name);
  ok('упражнения скопированы', copy.ex === 1);
  ok('счётчик пройденного обнулён', copy.completions === 0, String(copy.completions));
  ok('метка каталога не унаследована', copy.storeId === undefined);
  ok('чужая ссылка и тренер не унаследованы', copy.src === undefined && copy.by === undefined);
  ok('очередь и прогресс копии начинаются с нуля',
     copy.rotIdx === undefined && copy.progStepsAdj === undefined && copy.ps === undefined && copy.progFrom === undefined,
     JSON.stringify(copy));

  // ---- граница передачи ----
  const transfer = await page.evaluate(() => {
    const p = customPrograms.find(x => x.id === 'src1');
    const x = programTemplateCopy(p);
    const ex = normPlans(x)[0].exercises[0] || {};
    return {
      stats:x.stats, active:x.active, rotIdx:x.rotIdx, src:x.src, origEx:x.origEx,
      pub:x.pub, storeId:x.storeId, progStepsAdj:x.progStepsAdj, psMigrated:x.psMigrated,
      ps:ex.ps, progFrom:ex.progFrom, by:x.by
    };
  });
  ok('шаблон для передачи не содержит состояния владельца',
     transfer.stats === undefined && transfer.rotIdx === undefined && transfer.src === undefined
       && transfer.storeId === undefined && transfer.progStepsAdj === undefined
       && transfer.ps === undefined && transfer.progFrom === undefined,
     JSON.stringify(transfer));
  ok('обычная передача сохраняет только авторство, но не связь для отчётов',
     transfer.by === '@someone' && transfer.src === undefined, JSON.stringify(transfer));

  // Resistance policy — часть шаблона, а ps.cur.level — личное состояние владельца.
  const resistanceTransfer = await page.evaluate(() => {
    const source = {
      name:'Резинки', plans:[{days:['Пн'],rounds:1,roundRest:0,exercises:[{
        id:'band-1',name:'Тяга резинки',type:'reps',value:'12-15',
        loadType:'level',progMode:'level',
        loadLevels:[{label:'Лёгкая'},{label:'Средняя'},{label:'Сильная'}],
        loadLevel:1,repsStep:2,repsMax:18,
        ps:{n:2,cur:{reps:'16-18',level:2}}
      }]}]
    };
    const copy = programTemplateCopy(source);
    const ex = normPlans(copy)[0].exercises[0];
    return {
      loadType:ex.loadType, progMode:ex.progMode,
      levels:ex.loadLevels, loadLevel:ex.loadLevel, ps:ex.ps
    };
  });
  ok('шаблон сохраняет resistance policy и базовую ступень',
    resistanceTransfer.loadType === 'level'
      && resistanceTransfer.progMode === 'level'
      && resistanceTransfer.loadLevel === 1
      && resistanceTransfer.levels.map(x=>x.label).join('|') === 'Лёгкая|Средняя|Сильная',
    JSON.stringify(resistanceTransfer));
  ok('шаблон не передаёт чужую текущую resistance-ступень',
    resistanceTransfer.ps === undefined, JSON.stringify(resistanceTransfer.ps));

  // Файл может быть собран кем угодно. Даже если в него вручную положили src и
  // прогресс другого человека, импорт обязан превратить его в независимую копию.
  const imported = await page.evaluate(async () => {
    const p = JSON.parse(JSON.stringify(customPrograms.find(x => x.id === 'src1')));
    p.name = 'Импорт без слежки';
    p.src = 'malicious-link';
    p.origEx = [{p:0,n:'Приседания'}];
    p.rotIdx = 9;
    p.stats = {completions:99};
    const ex = normPlans(p)[0].exercises[0];
    ex.ps = {n:9,cur:{reps:'99'}};
    const file = new File([JSON.stringify({app:'fittimer',type:'program',v:1,program:p})],
      'program.json',{type:'application/json'});
    await importProgramFile(file);
    const got = customPrograms.find(x => x.name === 'Импорт без слежки');
    const gx = got && normPlans(got)[0].exercises[0];
    return got ? {
      src:got.src, origEx:got.origEx, rotIdx:got.rotIdx, completions:got.stats && got.stats.completions,
      ps:gx && gx.ps, by:got.by
    } : null;
  });
  ok('файловый импорт не может тайно включить отчёты тренеру',
     imported && imported.src === undefined && imported.origEx === undefined, JSON.stringify(imported));
  ok('файловый импорт не переносит чужой прогресс',
     imported && imported.rotIdx === undefined && imported.completions === 0 && imported.ps === undefined,
     JSON.stringify(imported));

  // ---- обновление той же тренерской программы ----
  const trainerUpdate = await page.evaluate(() => {
    const existing = {
      id:'client-program', src:'same-link', rotate:true, rotIdx:1, active:false,
      psMigrated:true, progStepsAdj:2, stats:{completions:7},
      plans:[
        {days:[],rounds:1,roundRest:0,exercises:[
          {id:'ex-a',name:'Жим',type:'reps',value:'8-10',weight:20,dualProg:true,
           ps:{n:2,cur:{reps:'12-14',kg:22}}}
        ]},
        {days:[],rounds:1,roundRest:0,exercises:[
          {id:'ex-b',name:'Тяга',type:'reps',value:'10',weight:0,
           ps:{n:1,cur:{reps:'12'}}}
        ]}
      ]
    };
    // Тренер переставил варианты, изменил базу Тяги и добавил новое упражнение.
    // Даже если в сетевом JSON у нового упражнения есть чужой ps, template-copy
    // обязан выбросить его до переноса локального состояния клиента.
    const raw = {
      id:'trainer-copy', rotate:true, rotIdx:99, stats:{completions:999}, psMigrated:false,
      plans:[
        {days:[],rounds:1,roundRest:0,exercises:[
          {id:'ex-b',name:'Тяга',type:'reps',value:'8',weight:0,ps:{n:99,cur:{reps:'99'}}},
          {id:'ex-c',name:'Планка',type:'time',value:'30',ps:{n:99,cur:{sec:999}}}
        ]},
        {days:[],rounds:1,roundRest:0,exercises:[
          {id:'ex-a',name:'Жим',type:'reps',value:'8-10',weight:20,dualProg:true,
           ps:{n:99,cur:{reps:'99',kg:99}}}
        ]}
      ]
    };
    const incoming = programTemplateCopy(raw);
    carryLinkedProgramState(existing, incoming);
    const plans = normPlans(incoming);
    const b = plans[0].exercises.find(x=>x.id==='ex-b');
    const fresh = plans[0].exercises.find(x=>x.id==='ex-c');
    const a = plans[1].exercises.find(x=>x.id==='ex-a');

    // Legacy link: сервер ещё не хранил exercise.id. Совпавшему по имени
    // упражнению возвращаем локальный стабильный id.
    const legacyOld = {
      id:'legacy-program', stats:{completions:2}, plans:[{days:['Пн'],rounds:1,roundRest:0,exercises:[
        {id:'legacy-local-id',name:'Приседания',type:'reps',value:'12',ps:{n:2,cur:{reps:'14'}}}
      ]}]
    };
    const legacyIncoming = programTemplateCopy({
      plans:[{days:['Пн'],rounds:1,roundRest:0,exercises:[
        {name:'Приседания',type:'reps',value:'12'}
      ]}]
    });
    carryLinkedProgramState(legacyOld, legacyIncoming);
    const legacyEx = normPlans(legacyIncoming)[0].exercises[0];

    return {
      id:incoming.id, completions:incoming.stats.completions, active:incoming.active,
      migrated:incoming.psMigrated, adj:incoming.progStepsAdj, rotIdx:incoming.rotIdx,
      aPs:a && a.ps, bPs:b && b.ps, freshPs:fresh && fresh.ps,
      legacyId:legacyEx && legacyEx.id, legacyPs:legacyEx && legacyEx.ps
    };
  });
  ok('обновление тренера сохраняет статистику и локальные флаги клиента',
     trainerUpdate.id === 'client-program' && trainerUpdate.completions === 7
       && trainerUpdate.active === false && trainerUpdate.migrated === true && trainerUpdate.adj === 2,
     JSON.stringify(trainerUpdate));
  ok('очередь ротации следует за тем же вариантом после перестановки',
     trainerUpdate.rotIdx === 0, JSON.stringify(trainerUpdate));
  ok('неизменённое упражнение сохраняет достигнутый диапазон и вес',
     trainerUpdate.aPs && trainerUpdate.aPs.n === 2
       && trainerUpdate.aPs.cur.reps === '12-14' && trainerUpdate.aPs.cur.kg === 22,
     JSON.stringify(trainerUpdate.aPs));
  ok('изменённая тренером база сохраняет счётчик, но сбрасывает старую текущую нагрузку',
     trainerUpdate.bPs && trainerUpdate.bPs.n === 1
       && Object.keys(trainerUpdate.bPs.cur || {}).length === 0,
     JSON.stringify(trainerUpdate.bPs));
  ok('новое упражнение не наследует сетевой чужой прогресс',
     trainerUpdate.freshPs === undefined, JSON.stringify(trainerUpdate));
  ok('legacy-обновление без exercise.id сохраняет локальный id и прогресс',
     trainerUpdate.legacyId === 'legacy-local-id'
       && trainerUpdate.legacyPs && trainerUpdate.legacyPs.cur.reps === '14',
     JSON.stringify(trainerUpdate));

  const resistanceUpdate = await page.evaluate(() => {
    const existing = {
      id:'res-client',stats:{completions:3},plans:[{days:['Пн'],rounds:1,roundRest:0,exercises:[{
        id:'band-1',name:'Тяга резинки',type:'reps',value:'12-15',
        loadType:'level',progMode:'level',
        loadLevels:[{label:'A'},{label:'B'},{label:'C'}],loadLevel:0,
        repsStep:2,repsMax:18,progEvery:2,
        ps:{n:2,cur:{reps:'16-18',level:1}}
      }]}]
    };
    const same = programTemplateCopy({
      plans:[{days:['Пн'],rounds:1,roundRest:0,exercises:[{
        id:'band-1',name:'Тяга резинки',type:'reps',value:'12-15',
        loadType:'level',progMode:'level',
        loadLevels:[{label:'A'},{label:'B'},{label:'C'}],loadLevel:0,
        repsStep:2,repsMax:18,progEvery:2
      }]}]
    });
    carryLinkedProgramState(existing, same);
    const sameEx = normPlans(same)[0].exercises[0];

    const changed = programTemplateCopy({
      plans:[{days:['Пн'],rounds:1,roundRest:0,exercises:[{
        id:'band-1',name:'Тяга резинки',type:'reps',value:'12-15',
        loadType:'level',progMode:'level',
        loadLevels:[{label:'A'},{label:'X'},{label:'C'}],loadLevel:0,
        repsStep:2,repsMax:18,progEvery:2
      }]}]
    });
    carryLinkedProgramState(existing, changed);
    const changedEx = normPlans(changed)[0].exercises[0];
    return {same:sameEx.ps, changed:changedEx.ps};
  });
  ok('обновление той же resistance-шкалы сохраняет текущий level и reps',
    resistanceUpdate.same && resistanceUpdate.same.n === 2
      && resistanceUpdate.same.cur.level === 1
      && resistanceUpdate.same.cur.reps === '16-18',
    JSON.stringify(resistanceUpdate.same));
  ok('смена resistance-шкалы сохраняет счётчик, но сбрасывает старый numeric level',
    resistanceUpdate.changed && resistanceUpdate.changed.n === 2
      && Object.keys(resistanceUpdate.changed.cur || {}).length === 0,
    JSON.stringify(resistanceUpdate.changed));

  // ---- UX ручного редактора прогрессии ----
  const progressionEditor = await page.evaluate(async () => {
    const program = {
      id:'progression-editor-audit', name:'Редактор прогрессии', progression:0,
      plans:[{days:['Пн'],rounds:1,roundRest:0,exercises:[
        {
          id:'double-audit',name:'Махи',type:'reps',value:'8-10',sets:3,rest:45,
          loadType:'weight',trackWeight:true,weight:5,progOn:true,progMode:'double_range',
          dualProg:true,repsStep:1,repsMax:14,wStep:1,weightMax:12,progEvery:null
        },
        {
          id:'level-audit',name:'Тяга резинки',type:'reps',value:'12-15',sets:3,rest:45,
          loadType:'level',progOn:true,progMode:'level',
          loadLevels:[{key:'light'},{key:'medium'},{key:'strong'},{key:'veryStrong'}],
          loadLevel:1,repsStep:2,repsMax:18,progEvery:2,
          ps:{n:1,cur:{reps:'12-15',level:2}}
        },
        {
          id:'off-audit',name:'Без автопрогрессии',type:'reps',value:'10',sets:2,rest:45,
          loadType:'none',progOn:false,progMode:'reps',repsStep:1,progEvery:null
        }
      ]}]
    };
    customPrograms.push(program);
    await savePrograms();

    openBuilder(program.id);
    openExercise(0);
    const weighted = {
      mode:$('exProgMode').value,
      modeHint:$('exProgModeHint').textContent.trim(),
      freqHint:$('exProgOnHint').textContent.trim(),
      seg3:$('exLoadNone').parentElement.classList.contains('seg3'),
      loadButtonHeight:$('exLoadNone').getBoundingClientRect().height
    };

    openExercise(1);
    const resistance = {
      baseValue:$('exLoadLevel').value,
      baseLabel:$('exLoadLevel').selectedOptions[0] && $('exLoadLevel').selectedOptions[0].textContent.trim(),
      nowHint:$('exNowHint').textContent.trim(),
      nowVisible:!$('exNowHint').classList.contains('hidden')
    };

    // Перестановка тех же физических ступеней должна сохранить и BASE, и CURRENT
    // по key/label, а не по старому numeric index.
    $('exLoadLevels').value = 'Очень сильное\nСильное\nСреднее\nЛёгкое';
    $('exLoadLevels').dispatchEvent(new Event('change',{bubbles:true}));
    const reordered = {
      baseLabel:$('exLoadLevel').selectedOptions[0] && $('exLoadLevel').selectedOptions[0].textContent.trim(),
      nowHint:$('exNowHint').textContent.trim(),
      nowVisible:!$('exNowHint').classList.contains('hidden')
    };

    // Полностью другая физическая шкала несовместима со старым current level:
    // BASE становится первой новой ступенью, текущая прогрессия уровня сбрасывается.
    $('exLoadLevels').value = 'Красная\nЧёрная';
    $('exLoadLevels').dispatchEvent(new Event('change',{bubbles:true}));
    const replaced = {
      baseLabel:$('exLoadLevel').selectedOptions[0] && $('exLoadLevel').selectedOptions[0].textContent.trim(),
      nowHint:$('exNowHint').textContent.trim(),
      nowVisible:!$('exNowHint').classList.contains('hidden')
    };

    openExercise(2);
    const offBefore = !$('exProgOn').classList.contains('on');
    $('exLoadWeight').click();
    const offAfterLoad = !$('exProgOn').classList.contains('on');
    $('exTypeTime').click();
    const offAfterMetric = !$('exProgOn').classList.contains('on');

    return {weighted,resistance,reordered,replaced,offBefore,offAfterLoad,offAfterMetric};
  });
  ok('«Повторы → вес» объясняет переход на вес и сброс диапазона',
    progressionEditor.weighted.mode === 'double_range'
      && /потолк/i.test(progressionEditor.weighted.modeHint)
      && /стартов/i.test(progressionEditor.weighted.modeHint),
    JSON.stringify(progressionEditor.weighted));
  ok('включённая прогрессия без общей частоты не называется отключённой',
    /Частота не задана/.test(progressionEditor.weighted.freqHint)
      && !/прогрессия отключена/i.test(progressionEditor.weighted.freqHint),
    progressionEditor.weighted.freqHint);
  ok('три типа нагрузки используют компактный mobile segment',
    progressionEditor.weighted.seg3, JSON.stringify(progressionEditor.weighted));
  ok('mobile selector нагрузки сохраняет нормальный touch-target',
    progressionEditor.weighted.loadButtonHeight >= 44,
    JSON.stringify(progressionEditor.weighted));
  ok('редактор resistance показывает базовую ступень отдельно от текущей',
    progressionEditor.resistance.baseValue === '1'
      && /Среднее/.test(progressionEditor.resistance.baseLabel)
      && progressionEditor.resistance.nowVisible
      && /Сильное/.test(progressionEditor.resistance.nowHint)
      && /12.?15/.test(progressionEditor.resistance.nowHint),
    JSON.stringify(progressionEditor.resistance));
  ok('перестановка той же resistance-шкалы сохраняет физические base/current ступени',
    /Среднее/.test(progressionEditor.reordered.baseLabel)
      && progressionEditor.reordered.nowVisible
      && /Сильное/.test(progressionEditor.reordered.nowHint),
    JSON.stringify(progressionEditor.reordered));
  ok('полная замена resistance-шкалы не переносит старый numeric current level',
    /Красная/.test(progressionEditor.replaced.baseLabel)
      && !progressionEditor.replaced.nowVisible,
    JSON.stringify(progressionEditor.replaced));
  ok('смена нагрузки и формата не включает выключенную прогрессию сама',
    progressionEditor.offBefore && progressionEditor.offAfterLoad && progressionEditor.offAfterMetric,
    JSON.stringify(progressionEditor));

  // у копии пункт «в каталог» уже есть — она своя
  const copyMenu = await page.evaluate(() => {
    const c = customPrograms[customPrograms.length - 1];
    openStart(c);
    buildStartMenu();
    return [...document.querySelectorAll('#startMenu button')].map(x => x.textContent.trim());
  });
  ok('копию уже можно предложить в каталог', copyMenu.some(t => /каталог/.test(t)));

  console.log('\npageerror:', errs.length ? errs : 'нет');
  if(errs.length) bad++;
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
