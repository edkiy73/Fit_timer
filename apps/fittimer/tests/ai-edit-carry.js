/* AI-правка программы: у совпавших упражнений продолжается счётчик до проверки
   повышения (ex.ps.n), а сводка «было / стало» замечает изменение длительности
   в ЛЮБОМ варианте, а не только в первом.

   Запуск:  node tests/dev-server.js 8124
            node tests/ai-edit-carry.js */

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

(async () => {
  const b = await chromium.launch({executablePath: CHROME, args: ['--no-sandbox']});
  const errs = [];
  const page = await (await b.newContext({viewport: {width: 412, height: 900}, locale: 'ru-RU'})).newPage();
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(1000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(800); }
  // профиль нужен любому запросу к ИИ, иначе поверх всего встанет «Расскажи о себе»
  await page.evaluate(async () => { const u = curUser(); u.gender = 'f'; u.age = 30; await saveUsers(); });

  const r = await page.evaluate(async () => {
    const ex = (id, name, extra) => Object.assign({id, name, type:'reps', value:'10', sets:3, rest:60,
      progOn:true, trackWeight:false, repsStep:1}, extra || {});
    const p = {id:'ec', name:'Правка', progression:4, stats:{completions:6}, plans:[
      {days:['Пн'], rounds:1, roundRest:0, exercises:[ex('e1', 'Присед', {ps:{n:3, cur:{reps:'12'}}})]},
      {days:['Чт'], rounds:1, roundRest:0, exercises:[ex('e2', 'Отжимания', {ps:{n:1, cur:{}}})]}
    ]};
    customPrograms.push(p);
    await savePrograms();

    // «ответ ИИ»: та же программа, но четверговый вариант раздут подходами
    const edited = JSON.parse(JSON.stringify(p));
    edited.plans[1].exercises[0].sets = 15;
    const text = programToText(edited, {forEdit:true});

    editAIProg = p;
    $('aiResult').value = text;
    // итог правки показывается в общем диалоге (appAlert → #dlgMsg)
    await Promise.race([createEditedProgram(), new Promise(r => setTimeout(r, 1500))]);
    const msg = $('dlgMsg').textContent || '';

    const made = customPrograms.find(x => x.id !== 'ec' && /Правка/.test(x.name || ''));
    const plans = made ? normPlans(made) : [];
    const find = name => plans.flatMap(pl => pl.exercises || []).find(e => e.name === name);
    const sq = find('Присед'), pu = find('Отжимания');
    return {
      made: !!made, msg, text,
      sqN: sq && sq.ps && sq.ps.n, sqCur: sq && sq.ps && JSON.stringify(sq.ps.cur),
      sqReps: sq && progressedRepsRange(made.id, sq, made),
      puN: pu && pu.ps && pu.ps.n
    };
  });

  ok('правка создала новую версию программы', r.made, r.msg.slice(0, 120));
  ok('счётчик до проверки продолжается после правки', r.sqN === 3 && r.puN === 1, `Присед ${r.sqN}, Отжимания ${r.puN}`);
  ok('текущие значения не накладываются второй раз', r.sqCur === '{}' && r.sqReps === '12', `${r.sqCur} / ${r.sqReps}`);
  ok('сводка замечает изменение длительности во втором варианте', r.msg.includes('Время тренировки'), r.msg.replace(/\s+/g, ' ').slice(0, 200));
  // ---- двойная прогрессия: база не менялась — сохраняется и текущее число повторов ----
  const dual = await page.evaluate(async () => {
    const p = {id:'ecd', name:'Двойная', progression:3, stats:{completions:2}, plans:[
      {days:['Пн'], rounds:1, roundRest:0, exercises:[{id:'d1', name:'Жим гантелей', type:'reps', value:'8-12',
        sets:3, rest:60, progOn:true, trackWeight:true, weight:10, wStep:2, repsStep:1, repsMax:12, dualProg:true,
        ps:{n:2, cur:{reps:'10'}}}]}]};
    customPrograms.push(p);
    const edited = JSON.parse(JSON.stringify(p));
    edited.plans[0].exercises[0].rest = 90;   // правка отдыха — база та же
    editAIProg = p;
    $('aiResult').value = programToText(edited, {forEdit:true});
    await Promise.race([createEditedProgram(), new Promise(r => setTimeout(r, 1500))]);
    const made = customPrograms.find(x => x.id !== 'ecd' && /Двойная/.test(x.name || ''));
    const ex = made && normPlans(made)[0].exercises[0];
    return ex ? {n: ex.ps && ex.ps.n, reps: progressedRepsRange(made.id, ex, made), rest: ex.rest} : null;
  });
  ok('двойная прогрессия: после правки остаётся текущее число повторов', !!dual && dual.reps === '10' && dual.n === 2 && dual.rest === 90, JSON.stringify(dual));

  // ---- правка упражнения через ИИ открывает результат, а не оставляет на «Через ИИ» ----
  const exEdit = await page.evaluate(async () => {
    const p = {id:'exe', name:'Правка упражнения', progression:0, stats:{completions:0}, plans:[
      {days:['Пн'], rounds:1, roundRest:0, exercises:[{id:'x1', name:'Присед', type:'reps', value:'10', sets:3, rest:60}]}]};
    customPrograms.push(p);
    openBuilder('exe');
    openExEdAI(0);
    $('exeWish').value = 'сделай 15 повторений';
    $('aiResult').value = 'УПРАЖНЕНИЕ: Присед\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 15\nПОДХОДЫ: 3\nОТДЫХ: 60';
    await applyExEdit();
    await new Promise(r => setTimeout(r, 300));
    return {screen: show._last, wish: $('exeWish').value, value: curPlan().exercises[0].value,
      dialog: $('dlgMsg').textContent};
  });
  ok('после правки упражнения открыт его редактор', exEdit.screen === 'scrExercise', exEdit.screen);
  ok('упражнение обновлено, запрос очищен', exEdit.value === '15' && exEdit.wish === '', JSON.stringify(exEdit));
  ok('сообщение о правке на языке интерфейса', /Упражнение «Присед» обновлено/.test(exEdit.dialog), exEdit.dialog);

  // ---- ИИ не повторил описания неизменных упражнений — берём из исходника;
  //      строка ПОДХОДЫ уходит к ИИ всегда, даже при одном подходе ----
  const text = await page.evaluate(async () => {
    const p = {id:'ect', name:'Круговая', progression:0, stats:{completions:0}, plans:[
      {days:['Пн'], rounds:2, roundRest:60, exercises:[
        {id:'t1', name:'Приседания', desc:'Стопы на ширине плеч.', muscles:['glutes'], mistakes:'Колени внутрь.',
         type:'reps', value:'15', sets:1, rest:30},
        {id:'t2', name:'Отжимания', desc:'Корпус прямой.', type:'reps', value:'10', sets:1, rest:30}]}]};
    customPrograms.push(p);
    const sent = programToText(p, {forEdit:true});
    editAIProg = p;
    // ответ без описаний: первое упражнение то же, второе заменено на новое
    $('aiResult').value = 'ПРОГРАММА: Круговая\nДЕНЬ: Пн\nКРУГИ: 2\nОТДЫХ МЕЖДУ КРУГАМИ: 60\n\n'
      + 'УПРАЖНЕНИЕ: Приседания\nКОД: t1\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 12\nОТДЫХ: 30\n\n'
      + 'УПРАЖНЕНИЕ: Отжимания от стены\nОПИСАНИЕ: Ладони на стене.\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 12\nОТДЫХ: 30';
    await Promise.race([createEditedProgram(), new Promise(r => setTimeout(r, 1500))]);
    const made = customPrograms.find(x => x.id !== 'ect' && /Круговая/.test(x.name || ''));
    const exs = made ? normPlans(made)[0].exercises : [];
    return {sent, sq: exs[0] && {desc: exs[0].desc, muscles: exs[0].muscles, mistakes: exs[0].mistakes, value: exs[0].value},
      wall: exs[1] && exs[1].desc};
  });
  ok('ПОДХОДЫ отправляются даже при одном подходе', (text.sent.match(/^ПОДХОДЫ: 1$/gm) || []).length === 2);
  ok('описание неизменного упражнения взято из исходника',
     !!text.sq && text.sq.desc === 'Стопы на ширине плеч.' && text.sq.mistakes === 'Колени внутрь.' && text.sq.muscles.includes('glutes') && String(text.sq.value) === '12',
     JSON.stringify(text.sq));
  ok('у нового упражнения — его собственное описание', text.wall === 'Ладони на стене.', text.wall);

  // ---- «Изменить за меня» у упражнения → «Готово» возвращает в конструктор,
  //      а не на вкладку «Через ИИ» (запись окна ожидания в истории) ----
  for(let i = 0; i < 5 && await page.isVisible('#dlgOk'); i++){ await page.click('#dlgOk'); await page.waitForTimeout(200); }
  await page.evaluate(async () => {
    const p = {id:'exn', name:'Навигация', progression:0, stats:{completions:0}, plans:[
      {days:['Пн'], rounds:1, roundRest:0, exercises:[{id:'n1', name:'Присед', type:'reps', value:'10', sets:3, rest:60}]}]};
    customPrograms.push(p);
    premiumGate = () => true;
    callGemini = async () => 'УПРАЖНЕНИЕ: Присед\nФОРМАТ: время\nЗНАЧЕНИЕ: 40\nПОДХОДЫ: 3\nОТДЫХ: 60';
    openBuilder('exn');
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => openExercise(0));
  await page.waitForTimeout(300);
  await page.evaluate(() => { asTab(() => openExEdAI(0)); $('exeWish').value = 'на время'; });
  await page.waitForTimeout(300);
  await page.click('#aiSelf');
  await page.waitForTimeout(800);
  if(await page.isVisible('#dlgOk')) await page.click('#dlgOk');
  await page.waitForTimeout(500);
  const afterAi = await page.evaluate(() => ({screen: show._last, value: curPlan().exercises[0].value, type: curPlan().exercises[0].type}));
  ok('после «Изменить за меня» открыт редактор упражнения с результатом',
     afterAi.screen === 'scrExercise' && afterAi.type === 'time', JSON.stringify(afterAi));
  await page.click('#btnSaveEx');
  await page.waitForTimeout(600);
  const back = await page.evaluate(() => show._last);
  ok('«Готово» после правки через ИИ возвращает в конструктор', back === 'scrBuilder', back);

  // Регрессия: подтверждение «Выйти без сохранения» раньше отпускало код до того,
  // как служебная запись попапа снималась из history. Визуально мы уже были в
  // «Тренировках», но следующий тап по «Сегодня» возвращал старый конструктор.
  await page.click('#builderBackTop');
  await page.waitForTimeout(150);
  ok('выход из изменённой программы спрашивает подтверждение', await page.isVisible('#dlgOk'));
  await page.click('#dlgOk');
  await page.waitForTimeout(600);
  const afterLeave = await page.evaluate(() => ({
    screen: show._last,
    historyScreen: history.state && history.state.scr,
    depth: navDepth,
    stack: [...navStack]
  }));
  ok('после выхода без сохранения открыт список тренировок',
    afterLeave.screen === 'scrPrograms' && afterLeave.historyScreen === 'scrPrograms',
    JSON.stringify(afterLeave));

  await page.click('.dock-btn[data-scr="scrMenu"]');
  await page.waitForTimeout(600);
  const afterHome = await page.evaluate(() => ({
    screen: show._last,
    historyScreen: history.state && history.state.scr,
    depth: navDepth,
    stack: [...navStack]
  }));
  ok('после выхода без сохранения «Сегодня» не возвращает в редактор',
    afterHome.screen === 'scrMenu' && afterHome.historyScreen === 'scrMenu' && afterHome.depth === 0,
    JSON.stringify(afterHome));

  ok('без ошибок в консоли', !errs.length, errs.join(' | '));

  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
