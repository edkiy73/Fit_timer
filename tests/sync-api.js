/* Серверный протокол синхронизации без браузера.
   Запуск: node tests/dev-server.js 8124
           node tests/sync-api.js */

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const MAIL = 'sync-api-' + Math.random().toString(36).slice(2,8) + '@example.com';
let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra == null ? '' : ' → ' + extra)); };
async function post(path, body){
  const r = await fetch(BASE + path, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const j = await r.json();
  if(!r.ok) throw Object.assign(new Error(j.error), j, {status:r.status});
  return j;
}
async function get(path){
  const r = await fetch(BASE + path);
  const j = await r.json();
  if(!r.ok) throw Object.assign(new Error(j.error), j, {status:r.status});
  return j;
}
async function login(deviceId, sub, email = MAIL){
  const sent = await post('/api/auth',{action:'send',email});
  return post('/api/auth',{action:'verify',email,code:sent.devCode,deviceId,sub});
}

(async()=>{
  const sub = {plan:'year',since:'2026-09-17',until:'2099-09-17',currency:'RUB',price:2990,autoRenew:true};

  // Страница тренера — часть аккаунта, а не локальная сущность телефона.
  const trainerMail = 'trainer-api-' + Math.random().toString(36).slice(2,8) + '@example.com';
  const trainerDevice = 'trainer-device';
  const ta = await login(trainerDevice, null, trainerMail);
  const nick = '@account.' + Math.random().toString(36).slice(2,8);
  ok('новый аккаунт просит единый ник', ta.needsHandle === true && !ta.handle);
  const handle = await post('/api/auth', {
    action:'set_handle', email:trainerMail, deviceId:trainerDevice,
    syncToken:ta.syncToken, handle:nick
  });
  ok('ник закрепляется за основным аккаунтом', handle.handle === nick, handle.handle);
  let noTrainerYet = false;
  try{ await get('/api/trainer/' + encodeURIComponent(nick)); }
  catch(e){ noTrainerYet = e.status === 404; }
  ok('один ник ещё не создаёт тренера', noTrainerYet);
  const claimed = await post('/api/trainer/' + encodeURIComponent(nick), {
    email:trainerMail, deviceId:trainerDevice, token:ta.syncToken,
    trainer:{name:'Лена', about:'Первая версия', years:7}
  });
  ok('страница тренера создаётся только через аккаунт', !!claimed.trainerKey);
  await post('/api/trainer/' + encodeURIComponent(nick), {
    email:trainerMail, deviceId:trainerDevice, token:ta.syncToken,
    trainerKey:claimed.trainerKey, trainer:{name:'Лена', about:'Обновлено сразу', years:8}
  });
  const trainerPage = await get('/api/trainer/' + encodeURIComponent(nick));
  ok('повторное сохранение сразу меняет публичную страницу',
     trainerPage.about === 'Обновлено сразу' && trainerPage.years === 8,
     `${trainerPage.about}, стаж ${trainerPage.years}`);
  let accountRequired = false;
  try{ await post('/api/trainer/' + encodeURIComponent('@no.account'), {trainer:{name:'Без аккаунта'}}); }
  catch(e){ accountRequired = e.status === 401 && e.error === 'account_required'; }
  ok('без аккаунта тренерскую страницу завести нельзя', accountRequired);
  const again = await login('trainer-device-2', null, trainerMail);
  ok('единый ник возвращается при входе', again.handle === nick && !again.needsHandle, again.handle);

  // share не имеет права создавать тренера в обход подтверждённого аккаунта.
  let bypassBlocked = false;
  try{
    await post('/api/share',{
      program:{name:'Чужая',plans:[{days:['Пн'],exercises:[{name:'x'}]}]},
      by:'@ghost.' + Math.random().toString(36).slice(2,7),
      trainerKey:'fake',trainer:{name:'Самозванец'}
    });
  }catch(e){ bypassBlocked = e.status === 403 && e.error === 'no_trainer'; }
  ok('share не создаёт тренера без аккаунта', bypassBlocked);

  // Секрет отчётов у нового клиента идёт в заголовке, а не в URL.
  const shared = await post('/api/share',{
    program:{name:'Проверка ссылки',plans:[{days:['Пн'],exercises:[{name:'x'}]}]},
    by:nick,trainerKey:again.trainerKey || claimed.trainerKey,trainer:{name:'Лена'}
  });
  const reportRead = await fetch(BASE + '/api/p/' + shared.id,{
    headers:{'X-Fit-Link-Key':shared.key}
  });
  const reportBody = await reportRead.json();
  ok('ключ отчётов принимается из заголовка',
     reportRead.status === 200 && Array.isArray(reportBody.reports),
     reportRead.status + ' ' + JSON.stringify(reportBody));
  const badReportRead = await fetch(BASE + '/api/p/' + shared.id,{
    headers:{'X-Fit-Link-Key':'wrong'}
  });
  const badReportBody = await badReportRead.json();
  ok('неверный ключ отчётов не пускает',
     badReportRead.status === 403 && badReportBody.error === 'bad_key',
     badReportRead.status + ' ' + JSON.stringify(badReportBody));

  const a = await login('device-a', sub);
  const profile = {id:'profile-one',name:'Лена',gender:'f',age:34,theme:'dark',locale:'en',
    prepSec:7,readySec:4,sideSec:12,voiceVol:85,fxVol:65,
    photo:'data:image/png;base64,bm8='};
  const legacyProfile = {id:'profile-legacy',name:'Старый',gender:'m',birth:'1990-05-01',theme:'light'};
  const docs = [
    {profileId:profile.id,key:'stats',rev:1,at:'2026-09-17T10:00:00.000Z',schema:1,value:JSON.stringify({count:1,history:[{id:'h1',d:'2026-09-17',sec:600}]})},
    {profileId:profile.id,key:'program:p1',rev:1,at:'2026-09-17T10:00:00.000Z',schema:1,value:JSON.stringify({id:'p1',name:'Сила'})},
    {profileId:profile.id,key:'index',rev:1,at:'2026-09-17T10:00:00.000Z',schema:1,value:JSON.stringify({order:['p1']})},
    {profileId:'__account__',key:'trainer',rev:1,at:'2026-09-17T10:00:00.000Z',schema:1,
      value:JSON.stringify({on:true,handle:'@lena',name:'Лена'})},
    {profileId:'__account__',key:'clients',rev:1,at:'2026-09-17T10:00:00.000Z',schema:1,
      value:JSON.stringify([{id:'c1',name:'Маша',progs:[]}])},
    // Клиент такой документ не создаёт; сервер всё равно обязан его отфильтровать.
    {profileId:profile.id,key:'photos',rev:1,at:'2026-09-17T10:00:00.000Z',schema:1,value:'[{"img":"secret"}]'}
  ];
  await post('/api/sync',{action:'push',email:MAIL,deviceId:'device-a',token:a.syncToken,
    profiles:[{user:profile,at:'2026-09-17T10:00:00.000Z'},
      {user:legacyProfile,at:'2026-09-17T10:00:00.000Z'}],docs});

  const b = await login('device-b');
  const pulled = await post('/api/sync',{action:'pull',email:MAIL,deviceId:'device-b',token:b.syncToken});
  const p = pulled.profiles.find(x=>x.user.id===profile.id);
  const legacy = pulled.profiles.find(x=>x.user.id===legacyProfile.id);
  ok('профиль доступен на втором устройстве', p && p.user.name === 'Лена');
  ok('сервер хранит только полные годы', p && p.user.age === 34 && !('birth' in p.user), JSON.stringify(p && p.user));
  ok('язык профиля не теряется при синхронизации', p && p.user.locale === 'en', JSON.stringify(p && p.user));
  ok('отсчёты и уровни звука профиля не теряются при синхронизации',
     p && p.user.prepSec === 7 && p.user.readySec === 4 && p.user.sideSec === 12
       && p.user.voiceVol === 85 && p.user.fxVol === 65,
     JSON.stringify(p && p.user));
  ok('старый профиль мигрирован без точной даты', legacy && legacy.user.age >= 36 && !('birth' in legacy.user),
     JSON.stringify(legacy && legacy.user));
  ok('фото профиля не сохранено', p && !p.user.photo, JSON.stringify(p && p.user));
  ok('программа и статистика вернулись', p.docs.some(d=>d.key==='stats') && p.docs.some(d=>d.key==='program:p1'));
  ok('фото-прогресс сервер не принял', !p.docs.some(d=>d.key==='photos'), p.docs.map(d=>d.key).join(','));
  const trainerDoc = (pulled.accountDocs || []).find(d=>d.key==='trainer');
  const clientsDoc = (pulled.accountDocs || []).find(d=>d.key==='clients');
  ok('режим тренера синхронизируется на уровне аккаунта',
     trainerDoc && JSON.parse(trainerDoc.value).handle === '@lena');
  ok('подопечные синхронизируются на уровне аккаунта',
     clientsDoc && JSON.parse(clientsDoc.value)[0].name === 'Маша');

  // Два serverless-запроса одного аккаунта могут прийти одновременно. Оба документа
  // обязаны остаться в manifest: раньше read-modify-write мог потерять один из них.
  const raceAt = '2026-09-17T13:00:00.000Z';
  await Promise.all([
    post('/api/sync',{action:'push',email:MAIL,deviceId:'device-a',token:a.syncToken,profiles:[],docs:[
      {profileId:profile.id,key:'program:race-a',rev:1,at:raceAt,schema:1,
       value:JSON.stringify({id:'race-a',name:'Параллельная A'})}
    ]}),
    post('/api/sync',{action:'push',email:MAIL,deviceId:'device-b',token:b.syncToken,profiles:[],docs:[
      {profileId:profile.id,key:'program:race-b',rev:1,at:raceAt,schema:1,
       value:JSON.stringify({id:'race-b',name:'Параллельная B'})}
    ]})
  ]);
  const afterRace = await post('/api/sync',{action:'pull',email:MAIL,deviceId:'device-a',token:a.syncToken});
  const raceProfile = afterRace.profiles.find(x=>x.user.id===profile.id);
  ok('одновременные push не теряют документы',
     raceProfile && raceProfile.docs.some(d=>d.key==='program:race-a')
       && raceProfile.docs.some(d=>d.key==='program:race-b'),
     raceProfile && raceProfile.docs.map(d=>d.key).join(','));

  // Часы устройства не определяют победителя. Более высокая ревизия должна принятьcя,
  // даже если её timestamp выглядит намного старше уже сохранённой.
  await post('/api/sync',{action:'push',email:MAIL,deviceId:'device-a',token:a.syncToken,profiles:[],docs:[
    {profileId:profile.id,key:'program:clock',rev:2,at:'2035-01-01T00:00:00.000Z',schema:1,
     value:JSON.stringify({id:'clock',name:'Старшая дата'})}
  ]});
  await post('/api/sync',{action:'push',email:MAIL,deviceId:'device-b',token:b.syncToken,profiles:[],docs:[
    {profileId:profile.id,key:'program:clock',rev:3,at:'2020-01-01T00:00:00.000Z',schema:1,
     value:JSON.stringify({id:'clock',name:'Новая ревизия'})}
  ]});
  const afterClock = await post('/api/sync',{action:'pull',email:MAIL,deviceId:'device-a',token:a.syncToken});
  const clockProfile = afterClock.profiles.find(x=>x.user.id===profile.id);
  const clockDoc = clockProfile && clockProfile.docs.find(d=>d.key==='program:clock');
  ok('ревизия важнее неверных часов устройства',
     clockDoc && clockDoc.rev === 3 && JSON.parse(clockDoc.value).name === 'Новая ревизия',
     clockDoc && `rev=${clockDoc.rev}, at=${clockDoc.at}`);

  await post('/api/sync',{action:'push',email:MAIL,deviceId:'device-b',token:b.syncToken,
    profiles:[{user:{id:profile.id},at:'2026-09-17T12:00:00.000Z',deleted:true}],docs:[]});
  await post('/api/sync',{action:'push',email:MAIL,deviceId:'device-a',token:a.syncToken,
    profiles:[{user:profile,at:'2026-09-17T11:00:00.000Z'}],docs});
  const afterDelete = await post('/api/sync',{action:'pull',email:MAIL,deviceId:'device-a',token:a.syncToken});
  const tomb = afterDelete.profiles.find(x=>x.user.id===profile.id);
  ok('удалённый профиль не воскресает со старого устройства', tomb && tomb.deleted && tomb.docs.length === 0);

  let denied = false;
  try{ await post('/api/sync',{action:'pull',email:MAIL,deviceId:'device-b',token:'wrong'}); }
  catch(e){ denied = e.status === 403 && e.error === 'bad_sync_token'; }
  ok('одной почты недостаточно для чтения', denied);

  await post('/api/auth',{action:'forget',scope:'all',email:MAIL,deviceId:'device-b',syncToken:b.syncToken,links:[]});
  let gone = false;
  try{ await post('/api/sync',{action:'pull',email:MAIL,deviceId:'device-b',token:b.syncToken}); }
  catch(e){ gone = e.status === 403; }
  ok('удаление аккаунта отзывает доступ к серверной копии', gone);

  const free = await login('device-free');
  const freePull = await post('/api/sync',{action:'pull',email:MAIL,deviceId:'device-free',token:free.syncToken});
  ok('бесплатный аккаунт не получает Premium-профили из синхронизации',
     Array.isArray(freePull.profiles) && freePull.profiles.length === 0,
     JSON.stringify(freePull.profiles));
  ok('бесплатному аккаунту остаётся служебная синхронизация настроек уведомлений',
     Array.isArray(freePull.accountDocs)
       && freePull.accountDocs.every(d => d && d.key === 'notificationPrefs'),
     JSON.stringify(freePull.accountDocs));
  process.exit(bad ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
