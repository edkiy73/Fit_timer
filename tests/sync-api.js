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
async function login(deviceId, sub){
  const sent = await post('/api/auth',{action:'send',email:MAIL});
  return post('/api/auth',{action:'verify',email:MAIL,code:sent.devCode,deviceId,sub});
}

(async()=>{
  const sub = {plan:'year',since:'2026-09-17',until:'2099-09-17',currency:'RUB',price:2990,autoRenew:true};
  const a = await login('device-a', sub);
  const profile = {id:'profile-one',name:'Лена',gender:'f',birth:'1992-05-10',theme:'dark',photo:'data:image/png;base64,bm8='};
  const docs = [
    {profileId:profile.id,key:'stats',rev:1,at:'2026-09-17T10:00:00.000Z',schema:1,value:JSON.stringify({count:1,history:[{id:'h1',d:'2026-09-17',sec:600}]})},
    {profileId:profile.id,key:'program:p1',rev:1,at:'2026-09-17T10:00:00.000Z',schema:1,value:JSON.stringify({id:'p1',name:'Сила'})},
    {profileId:profile.id,key:'index',rev:1,at:'2026-09-17T10:00:00.000Z',schema:1,value:JSON.stringify({order:['p1']})},
    // Клиент такой документ не создаёт; сервер всё равно обязан его отфильтровать.
    {profileId:profile.id,key:'photos',rev:1,at:'2026-09-17T10:00:00.000Z',schema:1,value:'[{"img":"secret"}]'}
  ];
  await post('/api/sync',{action:'push',email:MAIL,deviceId:'device-a',token:a.syncToken,
    profiles:[{user:profile,at:'2026-09-17T10:00:00.000Z'}],docs});

  const b = await login('device-b');
  const pulled = await post('/api/sync',{action:'pull',email:MAIL,deviceId:'device-b',token:b.syncToken});
  const p = pulled.profiles[0];
  ok('профиль доступен на втором устройстве', p && p.user.name === 'Лена');
  ok('фото профиля не сохранено', p && !p.user.photo, JSON.stringify(p && p.user));
  ok('программа и статистика вернулись', p.docs.some(d=>d.key==='stats') && p.docs.some(d=>d.key==='program:p1'));
  ok('фото-прогресс сервер не принял', !p.docs.some(d=>d.key==='photos'), p.docs.map(d=>d.key).join(','));

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
  let premiumOnly = false;
  try{ await post('/api/sync',{action:'pull',email:MAIL,deviceId:'device-free',token:free.syncToken}); }
  catch(e){ premiumOnly = e.status === 402 && e.error === 'premium_required'; }
  ok('бесплатный аккаунт не открывает серверную синхронизацию', premiumOnly);
  process.exit(bad ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
