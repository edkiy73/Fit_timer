/* Регрессия менеджера уведомлений:
   - несколько программ одного дня не превращаются в пачку одинаковых пушей;
   - одинаковое время группируется;
   - дубли "старт" и отдельные +2ч missed больше не создаются;
   - выполненные/сохранённые программы исключаются из общих digest;
   - engagement не конкурирует с тренировочным днём;
   - пассивные уведомления имеют защитный дневной budget.

   Запуск:  node tests/dev-server.js 8124
            node tests/notifications.js */

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

(async () => {
  const b = await chromium.launch({executablePath: CHROME, args:['--no-sandbox']});
  const errs = [];
  const page = await (await b.newContext({viewport:{width:412,height:900}, locale:'ru-RU'})).newPage();
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', {waitUntil:'load'});
  await page.waitForTimeout(900);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(500); }

  const result = await page.evaluate(() => {
    const now = new Date();
    now.setHours(7, 0, 0, 0);
    const iso = localISO(now);
    const day = DAYS[(now.getDay() + 6) % 7];
    const p = (id, name, time='') => ({
      id, name, active:true, progression:0,
      plans:[{days:[day], time, rounds:1, roundRest:0, exercises:[]}]
    });
    const reset = list => {
      customPrograms.splice(0, customPrograms.length, ...list);
      stats.history = [];
    };
    const todayOnly = items => items.filter(x => notifyDayKey(new Date(x.at)) === iso);
    const stages = items => items.map(x => x.extra && x.extra.stage);
    const prefs = {workouts:true, progress:true, trainer:true, offers:true};

    reset([p('one','Одна')]);
    const one = todayOnly(buildWorkoutNotificationCandidates(now, prefs, new Set()));

    reset(Array.from({length:5},(_,i)=>p('u'+i,'Без времени '+(i+1))));
    const fiveUntimed = todayOnly(buildWorkoutNotificationCandidates(now, prefs, new Set()));

    reset(Array.from({length:5},(_,i)=>p('s'+i,'Вместе '+(i+1),'18:00')));
    const fiveSame = todayOnly(buildWorkoutNotificationCandidates(now, prefs, new Set()));

    reset(['10:00','12:00','14:00','16:00','18:00'].map((time,i)=>p('d'+i,'Разное '+(i+1),time)));
    const fiveDifferent = todayOnly(buildWorkoutNotificationCandidates(now, prefs, new Set()));

    reset(Array.from({length:5},(_,i)=>p('p'+i,'Частично '+(i+1))));
    stats.history = [{d:iso,pid:'p0'}];
    const partial = todayOnly(buildWorkoutNotificationCandidates(now, prefs, new Set()));

    stats.history = [];
    const blocked = new Set([iso+'|p0']);
    const savedBlocked = todayOnly(buildWorkoutNotificationCandidates(now, prefs, blocked));

    // День с тренировкой: engagement и Premium не должны спорить с workout digest.
    const workoutAt = notifyAt(now,20,0).toISOString();
    const engagementAt = notifyAt(now,19,0).toISOString();
    const offerAt = notifyAt(now,18,0).toISOString();
    const collision = limitNotificationCandidates([
      {at:workoutAt,title:'work',body:'',priority:65,extra:{stage:'missed-summary',category:'workouts'}},
      {at:engagementAt,title:'return',body:'',priority:30,engagement:true,extra:{stage:'inactive',category:'workouts'}},
      {at:offerAt,title:'premium',body:'',priority:10,engagement:true,extra:{stage:'premium',category:'offers'}}
    ]);

    // Защитный budget: произвольных пассивных касаний не больше трёх в сутки.
    customPrograms.splice(0, customPrograms.length);
    const passive = limitNotificationCandidates(Array.from({length:5},(_,i)=>({
      at:new Date(now.getTime() + (10+i) * 60000).toISOString(),
      title:'passive '+i, body:'', priority:20-i, extra:{stage:'x'+i,category:'offers'}
    })));

    return {
      one:{len:one.length,stages:stages(one)},
      fiveUntimed:{len:fiveUntimed.length,stages:stages(fiveUntimed),titles:fiveUntimed.map(x=>x.title),ids:fiveUntimed.map(x=>x.extra.programIds||[])},
      fiveSame:{len:fiveSame.length,stages:stages(fiveSame),titles:fiveSame.map(x=>x.title),ids:fiveSame.map(x=>x.extra.programIds||[])},
      fiveDifferent:{len:fiveDifferent.length,stages:stages(fiveDifferent)},
      partial:{titles:partial.map(x=>x.title),ids:partial.map(x=>x.extra.programIds||[])},
      savedBlocked:{titles:savedBlocked.map(x=>x.title),ids:savedBlocked.map(x=>x.extra.programIds||[])},
      collision:collision.map(x=>x.extra.stage),
      passive:passive.length
    };
  });

  ok('одна программа без времени = утро + один вечерний reminder',
    result.one.len === 2 && result.one.stages.includes('today') && result.one.stages.includes('missed'),
    JSON.stringify(result.one));

  ok('5 программ без времени схлопываются в 2 digest, а не 10 пушей',
    result.fiveUntimed.len === 2
      && result.fiveUntimed.stages.includes('today-summary')
      && result.fiveUntimed.stages.includes('missed-summary')
      && result.fiveUntimed.ids.every(x=>x.length===5),
    JSON.stringify(result.fiveUntimed));

  ok('5 программ на одно время = один -15 reminder + один вечерний digest',
    result.fiveSame.len === 2
      && result.fiveSame.stages.includes('before-summary')
      && result.fiveSame.stages.includes('missed-summary')
      && !result.fiveSame.stages.includes('start')
      && result.fiveSame.ids.every(x=>x.length===5),
    JSON.stringify(result.fiveSame));

  ok('разные явные времена сохраняют отдельные -15 reminders, но без дублей start/+2h',
    result.fiveDifferent.len === 6
      && result.fiveDifferent.stages.filter(x=>x==='before').length === 5
      && result.fiveDifferent.stages.filter(x=>x==='missed-summary').length === 1
      && !result.fiveDifferent.stages.includes('start'),
    JSON.stringify(result.fiveDifferent));

  ok('выполненная программа исчезает из общих digest',
    result.partial.ids.every(x=>x.length===4 && !x.includes('p0')),
    JSON.stringify(result.partial));

  ok('сохранённая незавершённая программа исключается из общего расписания',
    result.savedBlocked.ids.every(x=>x.length===4 && !x.includes('p0')),
    JSON.stringify(result.savedBlocked));

  ok('engagement и Premium не конкурируют с тренировочным днём',
    result.collision.length === 1 && result.collision[0] === 'missed-summary',
    JSON.stringify(result.collision));

  ok('защитный budget режет пассивные касания до трёх в сутки',
    result.passive === 3, result.passive);

  ok('без ошибок страницы', !errs.length, errs.join(' | '));
  await b.close();
  console.log(bad ? '\nПровалено: ' + bad : '\nВсё ок');
  process.exit(bad ? 1 : 0);
})();