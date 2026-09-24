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
  ok('без ошибок в консоли', !errs.length, errs.join(' | '));

  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
