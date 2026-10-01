/* Сквозная синхронизация аккаунта: устройство A сохраняет профиль, программу
   и статистику; устройство B входит по той же почте и получает их.
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
  const page = await (await browser.newContext({viewport:{width:412,height:900},locale:'ru-RU'})).newPage();
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
    const seededPrograms = [{
      id:'sync-program', name:'Синхронная сила', time:'08:30', progression:2,
      stats:{completions:1}, plans:[{days:['Пн'],rounds:1,roundRest:0,exercises:[
        {name:'Приседания',type:'reps',value:'12',sets:2,rest:30,restAfter:45,weight:0}
      ]}]
    },{
      id:'sync-program-2', name:'Синхронная мобильность', time:'', progression:3,
      stats:{completions:0}, plans:[{days:['Ср'],rounds:1,roundRest:0,exercises:[
        {name:'Наклоны',type:'reps',value:'10',sets:1,rest:20}
      ]}]
    }];
    const seededStats = {totalSec:600,count:1,history:[{id:'h-a',d:'2026-09-17',t:8,pid:'sync-program',sec:600,plan:0}],
                         weights:[{d:'2026-09-17',w:61.2,waist:70}],wellness:[],badges:['first']};
    const seededPhotos = [{d:'2026-09-17',img:'data:image/png;base64,cGhvdG8='}];
    // Сеем профиль так, как он реально лежит на диске, и даём приложению загрузить его.
    // Старую скрытую поправку веса loadData обязан отбросить до синхронизации.
    await kvSet(pk('customPrograms'), JSON.stringify(seededPrograms));
    await kvSet(pk('stats'), JSON.stringify(seededStats));
    await kvSet(pk('progWeights'), JSON.stringify({'w_sync-program_приседания':-2}));
    await kvSet(pk('photos'), JSON.stringify(seededPhotos));
    await loadData();
    await loadPhotos();
    // loadData hydrates memory; save* records the sync documents/outbox exactly as
    // a real local edit would. Photos and legacy progWeights intentionally stay local.
    await savePrograms();
    await saveStats();

    const sent = await apiPost('/api/auth',{action:'send',email});
    const sub = {plan:'year',since:'2026-09-17',until:'2099-09-17',currency:'RUB',price:2990,autoRenew:true};
    const r = await apiPost('/api/auth',{action:'verify',email,code:sent.devCode,deviceId:identity.deviceId,sub});
    // Вход без ника не завершается: аккаунт сразу получает ник, как в приложении.
    await apiPost('/api/auth',{action:'set_handle',email,deviceId:identity.deviceId,syncToken:r.syncToken,
      handle:'@' + email.split('@')[0].replace(/[^a-z0-9]/g, '')});
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

  const got = await two.evaluate(async () => {
    const legacyWeights = JSON.parse(await kvGet(pk('progWeights')) || '{}');
    const localPhotos = JSON.parse(await kvGet(pk('photos')) || '[]');
    return {
      email:account.email, premium:isPremium(), users:users.map(u=>({name:u.name,photo:u.photo||null})),
      programs:customPrograms.map(p=>p.name), count:stats.count, history:stats.history.length,
      weight:stats.weights[0] && stats.weights[0].w,
      prog:Object.values(legacyWeights)[0], photos:localPhotos.length,
      state:$('accSync').textContent
    };
  });
  ok('второе устройство вошло в тот же аккаунт', got.email === MAIL, got.email);
  ok('подписка вернулась с аккаунтом', got.premium);
  ok('профиль вернулся без аватара', got.users.length === 1 && got.users[0].name === 'Лена' && !got.users[0].photo, JSON.stringify(got.users));
  ok('программа подтянулась', got.programs.includes('Синхронная сила'), got.programs.join(', '));
  ok('история и замеры подтянулись', got.count === 1 && got.history === 1 && got.weight === 61.2, JSON.stringify(got));
  ok('скрытая ручная поправка веса не вернулась', got.prog == null, got.prog);
  ok('фото-прогресс не ушёл на сервер', got.photos === 0, got.photos);
  ok('интерфейс прямо говорит о серверной копии', /сохранены на сервере/i.test(got.state), got.state);

  // Исторический profile-leak: старый клиент мог сохранить те же program ids уже
  // под другим profileId. На чистой установке это не должно воскресать как две
  // независимые копии программ. Уникальная программа второго профиля сохраняется.
  const DUP_PROFILE = 'sync-duplicate-profile';
  await two.evaluate(async dupId => {
    const originals = customPrograms.filter(p => p.id === 'sync-program' || p.id === 'sync-program-2');
    const unique = {
      id:'sync-unique', name:'Только второй профиль', plans:[{days:['Пт'],rounds:1,roundRest:0,exercises:[
        {name:'Планка',type:'time',value:30,sets:1,rest:20}
      ]}]
    };
    const later = new Date(Date.now() + 5000).toISOString();
    const docs = originals.map(p => ({
      key:'program:' + p.id, profileId:dupId, rev:1, at:later, schema:1,
      value:JSON.stringify(p)
    }));
    docs.push({key:'program:' + unique.id, profileId:dupId, rev:1, at:later, schema:1,
      value:JSON.stringify(unique)});
    docs.push({key:'index', profileId:dupId, rev:1, at:later, schema:1,
      value:JSON.stringify({order:['sync-program','sync-program-2','sync-unique']})});
    await apiPost('/api/sync',{
      action:'push', email:account.email, deviceId:identity.deviceId, token:account.syncToken,
      profiles:[{user:{id:dupId,name:'Лена 2',gender:'f',age:34,theme:'system',locale:'ru'},at:later}],
      docs
    });
  }, DUP_PROFILE);

  const three = await boot(browser, 'C', errors);
  await three.click('#obLogin');
  await three.fill('#loginEmail', MAIL);
  await three.click('#loginGo');
  await three.waitForTimeout(150);
  await three.click('#loginGo');
  await three.waitForTimeout(2200);

  const repairedLocal = await three.evaluate(async dupId => {
    const u = users.find(x => (x.profileId || x.id) === dupId);
    if(!u) return {found:false};
    const list = JSON.parse(await kvGet('customPrograms_' + u.id) || '[]');
    return {found:true, ids:list.map(p=>p.id), pending:JSON.parse(await kvGet('outbox_' + u.id) || '[]').map(x=>x.key)};
  }, DUP_PROFILE);
  ok('дубли старого profile-leak удалены из второго профиля локально',
    repairedLocal.found
      && !repairedLocal.ids.includes('sync-program')
      && !repairedLocal.ids.includes('sync-program-2'),
    JSON.stringify(repairedLocal));
  ok('уникальная программа второго профиля сохранена',
    repairedLocal.ids.includes('sync-unique'), repairedLocal.ids.join(','));

  await three.waitForTimeout(1800);
  const repairedRemote = await three.evaluate(async dupId => {
    const r = await apiPost('/api/sync',{
      action:'pull', email:account.email, deviceId:identity.deviceId, token:account.syncToken
    });
    const p = (r.profiles || []).find(x => x.user && x.user.id === dupId);
    const docs = (p && p.docs) || [];
    return {
      duplicate1:docs.find(d=>d.key==='program:sync-program'),
      duplicate2:docs.find(d=>d.key==='program:sync-program-2'),
      unique:docs.find(d=>d.key==='program:sync-unique'),
      order:JSON.parse((docs.find(d=>d.key==='index')||{}).value || '{"order":[]}')
    };
  }, DUP_PROFILE);
  ok('repair доехал на сервер tombstone-ами',
    repairedRemote.duplicate1 && repairedRemote.duplicate1.deleted
      && repairedRemote.duplicate2 && repairedRemote.duplicate2.deleted,
    JSON.stringify(repairedRemote));
  ok('серверный index после repair содержит только уникальную программу',
    repairedRemote.unique && !repairedRemote.unique.deleted
      && repairedRemote.order.order.includes('sync-unique')
      && !repairedRemote.order.order.includes('sync-program')
      && !repairedRemote.order.order.includes('sync-program-2'),
    JSON.stringify(repairedRemote));

  await two.evaluate(async()=>{
    stats.history.push({
      id:'h-b',d:'2026-09-18',t:8,pid:'sync-program',sec:720,plan:0,
      status:'partial',meaningful:true,doneExercises:2,plannedExercises:4,
      doneSteps:4,plannedSteps:8,exercises:['Присед','Жим']
    });
    // Заодно меняем расписание: уведомления на первом устройстве должны
    // пересобраться уже ПОСЛЕ того, как pull применил эту версию программы.
    const p = customPrograms.find(x=>x.id==='sync-program');
    if(p) p.time = '21:45';
    // Частичная активность добавляет время/историю, но не полный счётчик.
    stats.count=1; stats.totalSec=1320;
    await savePrograms();
    await saveStats();
  });
  await two.waitForTimeout(1700);
  await one.evaluate(()=>{
    globalThis.__notificationSyncRuns = [];
    setDataSyncPlatformHooks({
      applyThemeFor,
      getSyncNativeNotifications: () => async () => {
        const p = customPrograms.find(x=>x.id==='sync-program');
        globalThis.__notificationSyncRuns.push({
          user:currentUser,
          time:p && p.time,
          history:stats.history.length
        });
      }
    });
  });
  await one.evaluate(async()=>{ await accountSyncAdapter.pull(); });
  const merged = await one.evaluate(()=>{
    const h=stats.history.find(x=>x.id==='h-b')||{};
    const runs = globalThis.__notificationSyncRuns || [];
    return {
      n:stats.history.length,sec:stats.totalSec,count:stats.count,status:h.status,
      done:h.doneExercises,all:h.plannedExercises,
      programTime:(customPrograms.find(x=>x.id==='sync-program')||{}).time,
      notificationRun:runs[runs.length-1]||null
    };
  });
  ok('частичная тренировка со второго устройства вернулась на первое',
    merged.n === 2 && merged.sec === 1320 && merged.count === 1
    && merged.status === 'partial' && merged.done === 2 && merged.all === 4,
    JSON.stringify(merged));
  ok('после pull уведомления пересобираются уже из принятого серверного расписания',
    merged.programTime === '21:45'
      && merged.notificationRun
      && merged.notificationRun.time === '21:45'
      && merged.notificationRun.history === 2,
    JSON.stringify(merged.notificationRun));

  const denied = await one.evaluate(async email => {
    try{ await apiPost('/api/sync',{action:'pull',email,deviceId:identity.deviceId,token:'wrong'}); return false; }
    catch(e){ return e && e.code === 'bad_sync_token'; }
  }, MAIL);
  ok('данные нельзя прочитать по одной почте', denied);
  ok('в браузере нет ошибок', errors.length === 0, errors.join('\n'));

  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
