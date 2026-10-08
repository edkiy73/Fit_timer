/* Действия над программой одинаковы на всех экранах, где она есть.

   Действие, доступное в списке и недоступное на странице программы (или наоборот),
   человек считает сломанным, а не «не предусмотренным здесь». Здесь проверяется,
   что «Дублировать» и «Предложить в каталог» есть в обоих меню, и что копия не
   наследует чужого: статистику, метку каталога, чужую ссылку.

   Запуск:  node tests/dev-server.js 8124
            node tests/program-actions.js */

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

(async () => {
  const b = await chromium.launch({executablePath: CHROME});
  const errs = [];
  const page = await (await b.newContext({viewport: {width: 412, height: 900}, locale: 'ru-RU'})).newPage();
  await installV2Fixtures(page);
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(2000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(1500); }

  await becomeTrainer(page, {handle: '@act.' + Math.random().toString(36).slice(2, 8)});
  await page.evaluate(async () => {
    const p = {
      id:'src1', name:'Проба', progression:0,
      plans:[{id:'src1-plan', days:['Пн'], rounds:2, roundRest:60, exercises:[
        v2ex('Приседания', {id:'src1-ex', value:'12', sets:3, rest:45, prog:{mode:'reps', reps:{step:2}},
          state:{count:2, current:{reps:'16'}}})
      ]}]
    };
    p.stats = {completions: 7};
    p.storeId = 'slim-tiho';        // как будто взята из каталога
    p.src = 'abcd1234';             // и пришла от тренера по ссылке
    p.by = '@someone';
    p.rotIdx = 1;                   // личная позиция очереди вариантов
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
    const own = {id:'own1', name:'Своя', plans:[{id:'own1-plan', days:['Пн'], rounds:1, roundRest:0,
      exercises:[v2ex('Планка', {type:'time', value:'40', sets:1, rest:20})]}]};
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
  const emptyState = st => !!st && st.count === 0
    && ['reps','weight','time','level'].every(k => st.current[k] === null);
  const copy = await page.evaluate(async () => {
    const p = customPrograms.find(x => x.id === 'src1');
    const c = await duplicateProgram(p);
    const ex = normPlans(c)[0].exercises[0] || {};
    const srcEx = normPlans(p)[0].exercises[0];
    return {name: c.name, ex: (normPlans(c)[0].exercises || []).length,
            completions: c.stats.completions, storeId: c.storeId, src: c.src, by: c.by,
            rotIdx:c.rotIdx, state:ex.progressState,
            sameStage: ex.stages && srcEx.stages && ex.stages[0].stageId === srcEx.stages[0].stageId,
            sameId: c.id === p.id, total: customPrograms.length};
  });
  ok('копия создана и названа понятно', /копия/.test(copy.name) && !copy.sameId, copy.name);
  ok('упражнения скопированы', copy.ex === 1);
  ok('счётчик пройденного обнулён', copy.completions === 0, String(copy.completions));
  ok('метка каталога не унаследована', copy.storeId === undefined);
  ok('чужая ссылка и тренер не унаследованы', copy.src === undefined && copy.by === undefined);
  ok('очередь и прогресс копии начинаются с нуля',
     copy.rotIdx === undefined && emptyState(copy.state), JSON.stringify(copy));
  ok('копия получает свои id этапов: история и имена этапов не пересекаются с оригиналом',
     copy.sameStage === false, JSON.stringify(copy));

  // ---- граница передачи ----
  const transfer = await page.evaluate(() => {
    const p = customPrograms.find(x => x.id === 'src1');
    const x = programTemplateCopy(p);
    const ex = normPlans(x)[0].exercises[0] || {};
    return {
      stats:x.stats, active:x.active, rotIdx:x.rotIdx, src:x.src, origEx:x.origEx,
      pub:x.pub, storeId:x.storeId, state:ex.progressState, by:x.by
    };
  });
  ok('шаблон для передачи не содержит состояния владельца',
     transfer.stats === undefined && transfer.rotIdx === undefined && transfer.src === undefined
       && transfer.storeId === undefined && emptyState(transfer.state),
     JSON.stringify(transfer));
  ok('обычная передача сохраняет только авторство, но не связь для отчётов',
     transfer.by === '@someone' && transfer.src === undefined, JSON.stringify(transfer));

  const transferWithProgress = await page.evaluate(() => {
    const p = customPrograms.find(x => x.id === 'src1');
    const x = programTemplateCopy(p, {includeProgress:true});
    const ex = normPlans(x)[0].exercises[0] || {};
    return {state:ex.progressState, stats:x.stats, rotIdx:x.rotIdx, src:x.src};
  });
  ok('передача с прогрессией сохраняет фактическую нагрузку упражнения',
     transferWithProgress.state && transferWithProgress.state.count === 2
       && transferWithProgress.state.current.reps === '16',
     JSON.stringify(transferWithProgress));
  ok('даже с прогрессией не передаются статистика, очередь и связь с тренером',
     transferWithProgress.stats === undefined && transferWithProgress.rotIdx === undefined
       && transferWithProgress.src === undefined,
     JSON.stringify(transferWithProgress));

  // Нагрузка и шкала сопротивления — часть шаблона, текущая ступень — личное состояние владельца.
  const resistanceTransfer = await page.evaluate(() => {
    const source = {
      name:'Резинки', plans:[{id:'band-plan', days:['Пн'],rounds:1,roundRest:0,exercises:[
        v2ex('Тяга резинки', {id:'band-1', value:'12-15',
          load:{type:'level', equipment:'band', levels:[{label:'Лёгкая'},{label:'Средняя'},{label:'Сильная'}], level:1},
          prog:{mode:'level', reps:{step:2, max:18}},
          state:{count:2, current:{reps:'16-18', level:2}}})
      ]}]
    };
    const copy = programTemplateCopy(source);
    const ex = normPlans(copy)[0].exercises[0];
    const p = FitExerciseV2.prescriptionOf(ex);
    return {load:p.load, mode:p.progression.mode, state:ex.progressState};
  });
  ok('шаблон сохраняет снаряд, шкалу сопротивления и базовую ступень',
    resistanceTransfer.load.type === 'level' && resistanceTransfer.load.equipment === 'band'
      && resistanceTransfer.mode === 'level' && resistanceTransfer.load.level === 1
      && resistanceTransfer.load.levels.map(x=>x.label).join('|') === 'Лёгкая|Средняя|Сильная',
    JSON.stringify(resistanceTransfer));
  ok('шаблон не передаёт чужую текущую ступень сопротивления',
    emptyState(resistanceTransfer.state), JSON.stringify(resistanceTransfer.state));

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
    ex.progressState = {count:9, current:{reps:'99', weight:null, time:null, level:null}};
    const file = new File([JSON.stringify({app:'fittimer',type:'program',v:1,program:p})],
      'program.json',{type:'application/json'});
    await importProgramFile(file);
    const got = customPrograms.find(x => x.name === 'Импорт без слежки');
    const gx = got && normPlans(got)[0].exercises[0];
    return got ? {
      src:got.src, origEx:got.origEx, rotIdx:got.rotIdx, completions:got.stats && got.stats.completions,
      state:gx && gx.progressState, by:got.by
    } : null;
  });
  ok('файловый импорт не может тайно включить отчёты тренеру',
     imported && imported.src === undefined && imported.origEx === undefined, JSON.stringify(imported));
  ok('файловый импорт не переносит чужой прогресс',
     imported && imported.rotIdx === undefined && imported.completions === 0 && emptyState(imported.state),
     JSON.stringify(imported));

  const importedProgress = await page.evaluate(async () => {
    const source = customPrograms.find(x => x.id === 'src1');
    const p = programTemplateCopy(source, {includeProgress:true});
    p.name = 'Импорт с прогрессией';
    const file = new File([JSON.stringify({app:'fittimer',type:'program',v:1,includeProgress:true,program:p})],
      'program-progress.json',{type:'application/json'});
    await importProgramFile(file);
    const got = customPrograms.find(x => x.name === 'Импорт с прогрессией');
    const ex = got && normPlans(got)[0].exercises[0];
    return got && ex ? {state:ex.progressState, completions:got.stats && got.stats.completions, src:got.src} : null;
  });
  ok('явный файловый экспорт с прогрессией продолжает с текущей нагрузки',
     importedProgress && importedProgress.state && importedProgress.state.count === 2
       && importedProgress.state.current.reps === '16',
     JSON.stringify(importedProgress));
  ok('при переносе прогрессии история и тренерская связь всё равно не копируются',
     importedProgress && importedProgress.completions === 0 && importedProgress.src === undefined,
     JSON.stringify(importedProgress));

  // Файл старого формата (плоское упражнение с ВЕС/trackWeight) после перехода на V2 не читается
  const legacyFile = await page.evaluate(async () => {
    document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
    const before = customPrograms.length;
    const p = {name:'Старый файл', plans:[{days:['Пн'],rounds:1,roundRest:0,exercises:[
      {name:'Жим', type:'reps', value:'10', weight:10, trackWeight:true}]}]};
    const file = new File([JSON.stringify({app:'fittimer',type:'program',v:1,program:p})],
      'old.json',{type:'application/json'});
    await importProgramFile(file);
    return {added:customPrograms.length - before, msg:$('dlgMsg').textContent};
  });
  ok('файл старого формата не импортируется и объясняет почему',
    legacyFile.added === 0 && /старом формате/.test(legacyFile.msg), JSON.stringify(legacyFile));

  const exportChoice = await page.evaluate(() => {
    const p = customPrograms.find(x => x.id === 'src1');
    shareProgramWithChoice(p);
    const modal = $('programExportChoiceModal');
    const labels = [...modal.querySelectorAll('.choice b')].map(x => x.textContent.trim());
    modal.classList.remove('open');
    return {open:modal.classList.contains('open'), labels};
  });
  ok('обычная ссылка сначала предлагает выбрать перенос прогрессии',
     exportChoice.labels.some(x => /текущей прогрессией/i.test(x))
       && exportChoice.labels.some(x => /без прогрессии/i.test(x)),
     JSON.stringify(exportChoice));

  // ---- обновление той же тренерской программы ----
  const trainerUpdate = await page.evaluate(() => {
    const press = (state) => v2ex('Жим', {id:'ex-a', value:'8-10',
      load:{type:'weight', equipment:'dumbbell', count:2, weight:20},
      prog:{mode:'double_range', reps:{step:1, max:14}, weight:{step:2}}, state});
    const existing = {
      id:'client-program', src:'same-link', rotate:true, rotIdx:1, active:false, stats:{completions:7},
      plans:[
        {id:'plan-a', days:[],rounds:1,roundRest:0,exercises:[press({count:2, current:{reps:'12-14', weight:22}})]},
        {id:'plan-b', days:[],rounds:1,roundRest:0,exercises:[
          v2ex('Тяга', {id:'ex-b', value:'10', prog:{mode:'reps', reps:{step:1}}, state:{count:1, current:{reps:'12'}}})
        ]}
      ]
    };
    // Тренер переставил варианты, изменил базу Тяги и добавил новое упражнение.
    // Даже если в сетевом JSON у упражнений есть чужой progressState, template-copy
    // обязан выбросить его до переноса локального состояния клиента.
    const raw = {
      id:'trainer-copy', rotate:true, rotIdx:99, stats:{completions:999},
      plans:[
        {id:'plan-b', days:[],rounds:1,roundRest:0,exercises:[
          v2ex('Тяга', {id:'ex-b', value:'8', prog:{mode:'reps', reps:{step:1}}, state:{count:99, current:{reps:'99'}}}),
          v2ex('Планка', {id:'ex-c', type:'time', value:'30', state:{count:99, current:{time:999}}})
        ]},
        {id:'plan-a', days:[],rounds:1,roundRest:0,exercises:[press({count:99, current:{reps:'99', weight:99}})]}
      ]
    };
    const incoming = programTemplateCopy(raw);
    carryLinkedProgramState(existing, incoming);
    const plans = normPlans(incoming);
    const b = plans[0].exercises.find(x=>x.id==='ex-b');
    const fresh = plans[0].exercises.find(x=>x.id==='ex-c');
    const a = plans[1].exercises.find(x=>x.id==='ex-a');
    return {
      id:incoming.id, completions:incoming.stats.completions, active:incoming.active, rotIdx:incoming.rotIdx,
      aState:a && a.progressState, bState:b && b.progressState, freshState:fresh && fresh.progressState
    };
  });
  ok('обновление тренера сохраняет статистику и локальные флаги клиента',
     trainerUpdate.id === 'client-program' && trainerUpdate.completions === 7 && trainerUpdate.active === false,
     JSON.stringify(trainerUpdate));
  ok('очередь ротации следует за тем же вариантом после перестановки',
     trainerUpdate.rotIdx === 0, JSON.stringify(trainerUpdate));
  ok('неизменённое упражнение сохраняет достигнутый диапазон и вес',
     trainerUpdate.aState && trainerUpdate.aState.count === 2
       && trainerUpdate.aState.current.reps === '12-14' && trainerUpdate.aState.current.weight === 22,
     JSON.stringify(trainerUpdate.aState));
  ok('изменённая тренером база — то же упражнение, но счётчик и текущая нагрузка начинаются заново',
     emptyState(trainerUpdate.bState), JSON.stringify(trainerUpdate.bState));
  ok('новое упражнение не наследует сетевой чужой прогресс',
     emptyState(trainerUpdate.freshState), JSON.stringify(trainerUpdate));

  const resistanceUpdate = await page.evaluate(() => {
    const band = (levels, state) => v2ex('Тяга резинки', {id:'band-1', value:'12-15',
      load:{type:'level', equipment:'band', levels, level:0},
      prog:{mode:'level', every:2, reps:{step:2, max:18}}, state});
    const existing = {id:'res-client', stats:{completions:3}, plans:[{id:'res-plan', days:['Пн'],rounds:1,roundRest:0,exercises:[
      band([{label:'A'},{label:'B'},{label:'C'}], {count:2, current:{reps:'16-18', level:1}})
    ]}]};
    const same = programTemplateCopy({plans:[{id:'res-plan', days:['Пн'],rounds:1,roundRest:0,exercises:[
      band([{label:'A'},{label:'B'},{label:'C'}])]}]});
    carryLinkedProgramState(existing, same);
    const changed = programTemplateCopy({plans:[{id:'res-plan', days:['Пн'],rounds:1,roundRest:0,exercises:[
      band([{label:'A'},{label:'X'},{label:'C'}])]}]});
    carryLinkedProgramState(existing, changed);
    return {same:normPlans(same)[0].exercises[0].progressState, changed:normPlans(changed)[0].exercises[0].progressState};
  });
  ok('обновление той же шкалы сопротивления сохраняет текущую ступень и повторы',
    resistanceUpdate.same && resistanceUpdate.same.count === 2
      && resistanceUpdate.same.current.level === 1 && resistanceUpdate.same.current.reps === '16-18',
    JSON.stringify(resistanceUpdate.same));
  ok('если текущей резинки больше нет в шкале, состояние уровня сбрасывается',
    emptyState(resistanceUpdate.changed), JSON.stringify(resistanceUpdate.changed));

  // ---- UX ручного редактора прогрессии ----
  const progressionEditor = await page.evaluate(async () => {
    const program = {
      id:'progression-editor-audit', name:'Редактор прогрессии', progression:0,
      plans:[{id:'audit-plan', days:['Пн'],rounds:1,roundRest:0,exercises:[
        v2ex('Махи', {id:'double-audit', value:'8-10', sets:3, rest:45,
          load:{type:'weight', equipment:'dumbbell', count:2, weight:5},
          prog:{mode:'double_range', reps:{step:1, max:14}, weight:{step:1, max:12}}}),
        v2ex('Тяга резинки', {id:'level-audit', value:'12-15', sets:3, rest:45,
          load:{type:'level', equipment:'band', levels:[{key:'light'},{key:'medium'},{key:'strong'},{key:'veryStrong'}], level:1},
          prog:{mode:'level', every:2, reps:{step:2, max:18}},
          state:{count:1, current:{reps:'12-15', level:2}}}),
        v2ex('Без автопрогрессии', {id:'off-audit', value:'10', sets:2, rest:45, prog:{mode:'none'}})
      ]}]
    };
    customPrograms.push(program);
    await savePrograms();

    openBuilder(program.id);
    addExManual();
    const manualDefault = {
      progOn:$('exProgOn').classList.contains('on'),
      summary:$('exProgSum').textContent.trim()
    };

    // Несохранённый новый exercise существует только в draft. Переоткрываем программу,
    // чтобы следующие проверки работали с исходными audit-упражнениями.
    openBuilder(program.id);
    openExercise(0);
    const weighted = {
      mode:$('exProgMode').value,
      modeHint:$('exProgModeHint').textContent.trim(),
      freqHint:$('exProgOnHint').textContent.trim(),
      seg3:$('exLoadNone').parentElement.classList.contains('seg3'),
      loadButtonHeight:$('exLoadNone').getBoundingClientRect().height,
      ceilingHint:$('exCeilingHint').textContent.trim(),
      equipVisible:!$('exEquipRow').classList.contains('hidden'),
      equip:$('exEquip').value,
      count:$('exEquipCount').value,
      weightLabel:$('exWeightLabel').textContent.trim()
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

    return {manualDefault,weighted,resistance,reordered,replaced,offBefore,offAfterLoad,offAfterMetric};
  });
  ok('новое ручное упражнение не включает прогрессию само',
    !progressionEditor.manualDefault.progOn
      && /(без прогрессии|не растёт)/i.test(progressionEditor.manualDefault.summary),
    JSON.stringify(progressionEditor.manualDefault));
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
  ok('редактор показывает снаряд, количество и вес одной единицы',
    progressionEditor.weighted.equipVisible && progressionEditor.weighted.equip === 'dumbbell'
      && progressionEditor.weighted.count === '2' && /одной/i.test(progressionEditor.weighted.weightLabel),
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
