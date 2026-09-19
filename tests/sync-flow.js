/* Сквозная синхронизация аккаунта: устройство A сохраняет профиль, программу,
   статистику и рабочие веса; устройство B входит по той же почте и получает их.
   Фото-прогресс и аватар профиля на сервер не уходят.

   Запуск: node tests/dev-server.js 8124
           node tests/sync-flow.js */

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const MAIL = 'sync-' + Math.random().toString(36).slice(2, 9) + '@example.com';
let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra == null ? '' : ' → ' + extra)); };

async function boot(browser, label, errors){
  const page = await (await browser.newContext({viewport:{width:412,height:900}})).newPage();
  page.on('pageerror', e => errors.push(label + ': ' + e));
  await page.goto(BASE + '/index.html', {waitUntil:'load'});
  await page.waitForTimeout(700);
  return page;
}

(async()=>{
  const errors = [];
  const browser = await chromium.launch({headless:true, executablePath:CHROME, args:['--no-sandbox']});
  const one = await boot(browser, 'A', errors);
  await one.click('#obStart');
  await one.waitForTimeout(500);

  await one.evaluate(async email => {
    const u = curUser();
    u.name = 'Лена';
    u.gender = 'f';
    u.age = 34;
    u.photo = 'data:image/png;base64,aGVsbG8=';
    u.syncAt = new Date().toISOString();
    await saveUsers();
    customPrograms = [{
      id:'sync-program', name:'Синхронная сила', time:'08:30', progression:2,
      stats:{completions:1}, plans:[{days:['Пн'],rounds:1,roundRest:0,exercises:[
        {name:'Приседания',type:'reps',value:'12',sets:2,rest:30,restAfter:45,weight:0}
      ]}]
    }];
    stats = {totalSec:600,count:1,history:[{id:'h-a',d:'2026-09-17',t:8,pid:'sync-program',sec:600,plan:0}],
             weights:[{d:'2026-09-17',w:61.2,waist:70}],wellness:[],badges:['first']};
    progWeights = {'w_sync-program_приседания':2};
    photos = [{d:'2026-09-17',img:'data:image/png;base64,cGhvdG8='}];
    await savePrograms(); await saveStats(); await saveProgWeights();
    await kvSet(pk('photos'), JSON.stringify(photos));

    const sent = await apiPost('/api/auth',{action:'send',email});
    const sub = {plan:'year',since:'2026-09-17',until:'2099-09-17',currency:'RUB',price:2990,autoRenew:true};
    const r = await apiPost('/api/auth',{action:'verify',email,code:sent.devCode,deviceId:identity.deviceId,sub});
    account.email=email; account.sub=r.sub; account.syncToken=r.syncToken;
    await saveAccount(); identity.email=email; await saveIdentity();
    await connectAccountSync();
  }, MAIL);

  const two = await boot(browser, 'B', errors);
  await two.click('#obLogin');
  await two.fill('#loginEmail', MAIL);
  await two.click('#loginGo');
  await two.waitForTimeout(150);
  await two.click('#loginGo');
  await two.waitForTimeout(1200);

  const got = await two.evaluate(() => ({
    email:account.email, premium:isPremium(), users:users.map(u=>({name:u.name,photo:u.photo||null})),
    programs:customPrograms.map(p=>p.name), count:stats.count, history:stats.history.length,
    weight:stats.weights[0] && stats.weights[0].w,
    prog:Object.values(progWeights)[0], photos:photos.length,
    state:$('accSync').textContent
  }));
  ok('второе устройство вошло в тот же аккаунт', got.email === MAIL, got.email);
  ok('подписка вернулась с аккаунтом', got.premium);
  ok('профиль вернулся без аватара', got.users.length === 1 && got.users[0].name === 'Лена' && !got.users[0].photo, JSON.stringify(got.users));
  ok('программа подтянулась', got.programs.includes('Синхронная сила'), got.programs.join(', '));
  ok('история и замеры подтянулись', got.count === 1 && got.history === 1 && got.weight === 61.2, JSON.stringify(got));
  ok('рабочий вес подтянулся', got.prog === 2, got.prog);
  ok('фото-прогресс не ушёл на сервер', got.photos === 0, got.photos);
  ok('интерфейс прямо говорит о серверной копии', /сохранены на сервере/i.test(got.state), got.state);

  await two.evaluate(async()=>{
    stats.history.push({id:'h-b',d:'2026-09-18',t:8,pid:'sync-program',sec:720,plan:0});
    stats.count=2; stats.totalSec=1320;
    await saveStats();
  });
  await two.waitForTimeout(1500);
  await one.evaluate(async()=>{ await accountSyncAdapter.pull(); });
  const merged = await one.evaluate(()=>({n:stats.history.length,sec:stats.totalSec}));
  ok('новая тренировка со второго устройства вернулась на первое', merged.n === 2 && merged.sec === 1320, JSON.stringify(merged));

  const denied = await one.evaluate(async email => {
    try{ await apiPost('/api/sync',{action:'pull',email,deviceId:identity.deviceId,token:'wrong'}); return false; }
    catch(e){ return e && e.code === 'bad_sync_token'; }
  }, MAIL);
  ok('данные нельзя прочитать по одной почте', denied);
  ok('в браузере нет ошибок', errors.length === 0, errors.join('\n'));

  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
