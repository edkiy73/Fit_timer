/* Legacy progression migration must be one-shot and persistent.
   Seeds pre-per-exercise programs, runs the same migration hook used at boot,
   repeats it, reloads the app, and verifies no load is added twice. */

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra == null ? '' : '  → ' + extra));
};

(async()=>{
  const browser = await chromium.launch({headless:true, executablePath:CHROME, args:['--no-sandbox']});
  const errs = [];
  const page = await (await browser.newContext({viewport:{width:412,height:900},locale:'ru-RU'})).newPage();
  page.on('pageerror', e => errs.push(String(e)));

  await page.goto(BASE + '/index.html', {waitUntil:'load'});
  await page.waitForTimeout(700);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(500); }

  await page.evaluate(async()=>{
    const legacy = [
      {
        id:'legacy-reps', name:'Legacy reps', progression:2, stats:{completions:5},
        plans:[{days:['Пн'],rounds:1,roundRest:0,exercises:[{
          id:'legacy-reps-ex', name:'Присед', type:'reps', value:'10', sets:3, rest:45,
          progOn:true, trackWeight:false, repsStep:1, repsMax:20
        }]}]
      },
      {
        id:'legacy-dual', name:'Legacy dual', progression:2, stats:{completions:5},
        plans:[{days:['Вт'],rounds:1,roundRest:0,exercises:[{
          id:'legacy-dual-ex', name:'Жим', type:'reps', value:'8-10', sets:3, rest:60,
          progOn:true, trackWeight:true, weight:10, dualProg:true,
          repsStep:1, wStep:2, repsMax:20, weightMax:30
        }]}]
      }
    ];
    await kvSet(pk('customPrograms'), JSON.stringify(legacy));
    await loadData();
    applyProgressionAll();
    await new Promise(r=>setTimeout(r,120));
  });

  const snap = async()=> page.evaluate(()=>{
    const pick = id => {
      const p = customPrograms.find(x=>x.id===id);
      const ex = p && normPlans(p)[0].exercises[0];
      return p && ex ? {
        migrated:p.psMigrated,
        n:ex.ps && ex.ps.n,
        cur:ex.ps && ex.ps.cur,
        repsMax:ex.repsMax,
        dualRangeV:ex.dualRangeV
      } : null;
    };
    return {reps:pick('legacy-reps'), dual:pick('legacy-dual')};
  });

  const first = await snap();
  ok('legacy reps gets one-shot marker', first.reps && first.reps.migrated === true, JSON.stringify(first.reps));
  ok('legacy reps preserves old floor(completions/frequency) load and remainder',
    first.reps && first.reps.n === 1 && first.reps.cur && first.reps.cur.reps === '12',
    JSON.stringify(first.reps));
  ok('legacy double range converts ceiling and current range before applying old steps',
    first.dual && first.dual.migrated === true && first.dual.dualRangeV === 2
      && first.dual.repsMax === 22 && first.dual.n === 1
      && first.dual.cur && first.dual.cur.reps === '10-12' && first.dual.cur.kg === 10,
    JSON.stringify(first.dual));

  await page.evaluate(async()=>{
    applyProgressionAll();
    await new Promise(r=>setTimeout(r,120));
  });
  const second = await snap();
  ok('second migration call is idempotent', JSON.stringify(second) === JSON.stringify(first),
    JSON.stringify(second));

  await page.reload({waitUntil:'load'});
  await page.waitForTimeout(900);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(400); }
  const afterReload = await snap();
  ok('migration state persists across app reload without another step',
    JSON.stringify(afterReload) === JSON.stringify(first), JSON.stringify(afterReload));

  ok('без ошибок на странице', errs.length === 0, errs.join(' | '));
  await browser.close();
  console.log(bad ? '\nПРОВАЛЕНО: '+bad : '\nМиграция прогрессии: всё сошлось');
  process.exit(bad ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
