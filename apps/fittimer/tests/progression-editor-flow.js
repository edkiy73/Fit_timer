/* Полный сквозной тест ручного редактора прогрессии.
   Проверяет реальные UI-клики, а не только helper-функции:
   - новое ручное упражнение не включает progression само;
   - смена reps/time и типа нагрузки не включает её;
   - reps+weight предлагает double progression после явного включения;
   - частота упражнения сохраняется;
   - resistance использует понятные labels;
   - смена resistance-шкалы не переносит старый numeric ps.cur.level в новую шкалу;
   - мобильный selector нагрузки не создаёт горизонтальный overflow.

   Запуск:
     node tests/dev-server.js 8124
     node tests/progression-editor-flow.js
*/

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : ''));
};

(async () => {
  const browser = await chromium.launch({executablePath:CHROME, args:['--no-sandbox']});
  const errs = [];
  const page = await (await browser.newContext({viewport:{width:360,height:800}, locale:'ru-RU'})).newPage();
  page.on('pageerror', e => errs.push(String(e)));

  await page.goto(BASE + '/index.html', {waitUntil:'load'});
  await page.waitForFunction(() => typeof openBuilder === 'function' && document.querySelector('.screen.on'));
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(500); }

  await page.evaluate(async () => {
    const u = curUser();
    if(u){ u.gender = u.gender || 'f'; u.age = u.age || 30; await saveUsers(); }
    const p = {
      id:'progress-editor-audit',
      name:'Редактор прогрессии',
      desc:'',
      progression:4,
      stats:{completions:0},
      plans:[{days:['Пн'],rounds:1,roundRest:0,exercises:[]}]
    };
    const next = customPrograms.some(x=>x.id===p.id)
      ? customPrograms.map(x=>x.id===p.id ? p : x)
      : [...customPrograms,p];
    await kvSet(pk('customPrograms'), JSON.stringify(next));
    await loadData();
    await savePrograms();
    goTab('scrPrograms');
    openBuilder('progress-editor-audit');
  });
  await page.waitForTimeout(180);

  // Program-level setting — только default frequency, а не master switch.
  await page.click('#bSettingsToggle');
  await page.waitForTimeout(120);
  ok('общая частота программы открывается со значением 4',
    await page.inputValue('#bProgEvery') === '4', await page.inputValue('#bProgEvery'));
  const programFreqOptions = await page.$eval('#bProgEvery option', xs => xs.map(x=>({v:x.value,t:x.textContent.trim()})));
  ok('у программы можно убрать общий default без обещания выключить overrides',
    programFreqOptions.some(x => x.v === '0' && /Не задавать общую частоту/.test(x.t)),
    JSON.stringify(programFreqOptions));
  await page.selectOption('#bProgEvery','0');
  ok('изменение общей частоты сразу попадает в draft',
    await page.evaluate(() => draft.progression) === 0,
    String(await page.evaluate(() => draft.progression)));
  await page.click('#btnPsDone');
  await page.waitForTimeout(120);
  await page.evaluate(() => addExManual());
  await page.waitForTimeout(180);

  ok('новое ручное упражнение открыто', await page.isVisible('#scrExercise'));
  ok('новое ручное упражнение не прогрессирует само',
    !(await page.locator('#exProgOn').evaluate(el => el.classList.contains('on'))),
    await page.textContent('#exProgSum'));
  ok('сводка честно говорит, что роста нет', /не растёт/i.test(await page.textContent('#exProgSum')),
    await page.textContent('#exProgSum'));

  const loadLayout = await page.evaluate(() => {
    const seg = document.querySelector('#exLoadNone')?.parentElement;
    const buttons = seg ? [...seg.querySelectorAll('button')] : [];
    return {
      cls: seg ? seg.className : '',
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      segOverflow: seg ? seg.scrollWidth - seg.clientWidth : 999,
      labels: buttons.map(x=>x.textContent.trim())
    };
  });
  ok('три варианта нагрузки используют компактный seg3',
    /\bseg3\b/.test(loadLayout.cls), JSON.stringify(loadLayout));
  ok('селектор нагрузки не создаёт горизонтальный overflow на 360 px',
    loadLayout.docOverflow <= 1 && loadLayout.segOverflow <= 1,
    JSON.stringify(loadLayout));

  // Смена формата/нагрузки сама по себе НЕ должна включать progression.
  await page.click('#exLoadWeight');
  ok('выбор веса не включает progression',
    !(await page.locator('#exProgOn').evaluate(el => el.classList.contains('on'))));
  ok('поле веса появляется', await page.isVisible('#exWeightRow'));

  await page.click('#exTypeTime');
  ok('переход на время не включает progression',
    !(await page.locator('#exProgOn').evaluate(el => el.classList.contains('on'))));
  await page.click('#exTypeReps');
  ok('возврат на повторы не включает progression',
    !(await page.locator('#exProgOn').evaluate(el => el.classList.contains('on'))));

  await page.click('#exLoadLevelType');
  ok('выбор сопротивления не включает progression',
    !(await page.locator('#exProgOn').evaluate(el => el.classList.contains('on'))));
  ok('сопротивление показывает физическую шкалу', await page.isVisible('#exLevelRow'));

  // Возвращаемся к весу и осознанно включаем progression.
  await page.click('#exLoadWeight');
  await page.fill('#exName','Махи гантелей');
  await page.fill('#exValue','8-10');
  await page.fill('#exSets','3');
  await page.fill('#exWeight','5');
  await page.click('#exProgToggle');
  await page.click('#exProgOn');
  await page.waitForTimeout(100);

  ok('после явного включения progression активна',
    await page.locator('#exProgOn').evaluate(el => el.classList.contains('on')));
  ok('reps + weight по умолчанию = Повторы → вес',
    await page.inputValue('#exProgMode') === 'double_range',
    await page.inputValue('#exProgMode'));
  const missingFreqHint = await page.textContent('#exProgOnHint');
  ok('без program default редактор прямо просит выбрать частоту',
    /частота не задана/i.test(missingFreqHint), missingFreqHint);

  const weightModes = await page.$eval('#exProgMode option', xs => xs.map(x=>x.value));
  ok('ручной редактор даёт все осмысленные weight-режимы',
    weightModes.join(',') === 'double_range,weight,reps,parallel', weightModes.join(','));

  const doubleCeilingHint = await page.textContent('#exCeilingHint');
  ok('для «Повторы → вес» редактор прямо говорит, что максимум повторов обязателен',
    /максимум повторов обязателен/i.test(doubleCeilingHint), doubleCeilingHint);

  await page.selectOption('#exProgMode','weight');
  await page.dispatchEvent('#exProgMode','change');
  await page.waitForTimeout(30);
  const weightCeilingHint = await page.textContent('#exCeilingHint');
  ok('для простого роста веса максимум остаётся необязательным',
    /можно оставить пуст/i.test(weightCeilingHint), weightCeilingHint);

  await page.selectOption('#exProgMode','double_range');
  await page.dispatchEvent('#exProgMode','change');
  await page.waitForTimeout(30);

  await page.selectOption('#exProgEvery','2');
  await page.waitForTimeout(50);
  const hint = await page.textContent('#exProgOnHint');
  ok('после своей частоты подсказка говорит про предложение, а не автоматическое изменение',
    /предложим повышение/i.test(hint) && !/автомат/i.test(hint), hint);
  await page.fill('#exStepReps','1');
  await page.fill('#exMaxReps','14');
  await page.fill('#exStepWeight','1');
  await page.fill('#exMaxWeight','12');
  await page.click('#btnSaveEx');
  await page.waitForTimeout(200);

  const savedWeight = await page.evaluate(() => {
    const ex = draft.plans[0].exercises[0];
    return {
      progOn:ex.progOn, loadType:ex.loadType, progMode:ex.progMode, progEvery:ex.progEvery,
      value:ex.value, weight:ex.weight, repsStep:ex.repsStep, repsMax:ex.repsMax,
      wStep:ex.wStep, weightMax:ex.weightMax
    };
  });
  ok('весовая double progression сохраняется из обычного редактора',
    savedWeight.progOn === true
      && savedWeight.loadType === 'weight'
      && savedWeight.progMode === 'double_range'
      && savedWeight.progEvery === 2
      && savedWeight.value === '8-10'
      && savedWeight.weight === 5
      && savedWeight.repsStep === 1
      && savedWeight.repsMax === 14
      && savedWeight.wStep === 1
      && savedWeight.weightMax === 12,
    JSON.stringify(savedWeight));

  // Переводим то же упражнение на resistance полностью через UI.
  await page.evaluate(() => openExercise(0));
  await page.waitForTimeout(100);
  await page.click('#exLoadLevelType');
  ok('для reps + resistance предлагается Повторы → сопротивление',
    await page.inputValue('#exProgMode') === 'level',
    await page.inputValue('#exProgMode'));
  const levelCeilingHint = await page.textContent('#exCeilingHint');
  ok('для «Повторы → сопротивление» максимум повторов тоже обозначен обязательным',
    /максимум повторов обязателен/i.test(levelCeilingHint), levelCeilingHint);

  await page.click('[data-act="toggleExerciseLevelScale"]');
  await page.fill('#exLoadLevels','Лёгкое\nСреднее\nСильное');
  await page.dispatchEvent('#exLoadLevels','change');
  await page.selectOption('#exLoadLevel','1');
  await page.fill('#exValue','12-15');
  await page.selectOption('#exProgEvery','2');
  await page.fill('#exStepReps','2');
  await page.fill('#exMaxReps','18');
  await page.click('#btnSaveEx');
  await page.waitForTimeout(200);

  const savedLevel = await page.evaluate(() => {
    const ex = draft.plans[0].exercises[0];
    return {
      loadType:ex.loadType, progMode:ex.progMode, loadLevel:ex.loadLevel,
      levels:(ex.loadLevels||[]).map(x=>x.label||x.key),
      value:ex.value, repsStep:ex.repsStep, repsMax:ex.repsMax, progEvery:ex.progEvery
    };
  });
  ok('стандартная ручная resistance-шкала канонизируется и сохраняет текущую ступень',
    savedLevel.loadType === 'level'
      && savedLevel.progMode === 'level'
      && savedLevel.loadLevel === 1
      && savedLevel.levels.join('|') === 'light|medium|strong'
      && savedLevel.value === '12-15'
      && savedLevel.repsStep === 2
      && savedLevel.repsMax === 18
      && savedLevel.progEvery === 2,
    JSON.stringify(savedLevel));

  // Старый current level нельзя механически перенести в совершенно новую шкалу.
  await page.evaluate(() => {
    const ex = draft.plans[0].exercises[0];
    ex.ps = {n:1,cur:{reps:'16-18',level:2}};
    openExercise(0);
  });
  await page.waitForTimeout(100);
  await page.click('[data-act="toggleExerciseLevelScale"]');
  await page.fill('#exLoadLevels','Лёгкая X\nСредняя X\nТяжёлая X');
  await page.dispatchEvent('#exLoadLevels','change');
  await page.selectOption('#exLoadLevel','1');
  await page.click('#btnSaveEx');
  await page.waitForTimeout(200);

  const carried = await page.evaluate(() => {
    const ex = draft.plans[0].exercises[0];
    return {
      n:ex.ps && ex.ps.n,
      cur:ex.ps && ex.ps.cur,
      levels:(ex.loadLevels||[]).map(x=>x.label||x.key),
      loadLevel:ex.loadLevel
    };
  });
  ok('смена resistance-шкалы сохраняет счётчик, но сбрасывает несовместимый current level',
    carried.n === 1
      && carried.cur
      && carried.cur.level == null
      && carried.levels.join('|') === 'Лёгкая X|Средняя X|Тяжёлая X'
      && carried.loadLevel === 1,
    JSON.stringify(carried));

  // Сохраняем программу целиком и перечитываем из persisted customPrograms.
  await page.click('#btnSaveProgram');
  await page.waitForTimeout(350);
  const persisted = await page.evaluate(() => {
    const p = customPrograms.find(x=>x.id==='progress-editor-audit');
    const ex = p && p.plans[0] && p.plans[0].exercises[0];
    return ex ? {
      loadType:ex.loadType, progMode:ex.progMode, progEvery:ex.progEvery,
      loadLevel:ex.loadLevel, levels:(ex.loadLevels||[]).map(x=>x.label||x.key),
      n:ex.ps && ex.ps.n, cur:ex.ps && ex.ps.cur
    } : null;
  });
  ok('после сохранения программы resistance policy/state не теряются',
    persisted
      && persisted.loadType === 'level'
      && persisted.progMode === 'level'
      && persisted.progEvery === 2
      && persisted.loadLevel === 1
      && persisted.levels.join('|') === 'Лёгкая X|Средняя X|Тяжёлая X'
      && persisted.n === 1
      && persisted.cur
      && persisted.cur.level == null,
    JSON.stringify(persisted));

  ok('без ошибок в консоли', !errs.length, errs.join(' | '));

  await browser.close();
  console.log(bad ? '\nПРОВАЛЕНО: '+bad : '\nВсё сошлось');
  process.exit(bad ? 1 : 0);
})();
