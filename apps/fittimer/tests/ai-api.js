/* Серверный AI без внешнего провайдера.
   Запуск сервера:
   ADMIN_KEY=testadminkey123456 GEMINI_API_KEY=test AI_TEST_MODE=1 node tests/dev-server.js 8124 */
const BASE = process.env.FIT_URL || 'http://localhost:8124';
const ADMIN = process.env.ADMIN_KEY || 'testadminkey123456';
const MAIL = 'ai-' + Math.random().toString(36).slice(2,8) + '@example.com';
const post = async (path, body, headers) => {
  const r = await fetch(BASE + path, {method:'POST',headers:Object.assign({'content-type':'application/json'},headers),body:JSON.stringify(body)});
  const j = await r.json(); return {status:r.status,body:j};
};
let bad = 0;
const ok = (name, value) => { if(!value) bad++; console.log((value ? '  ok  ' : ' ПЛОХО') + '  ' + name); };

(async()=>{
  const sent = await post('/api/auth',{action:'send',email:MAIL});
  const sub = {plan:'month',since:'2026-09-19',until:'2099-09-19',currency:'RUB',price:399};
  const login = await post('/api/auth',{action:'verify',email:MAIL,code:sent.body.devCode,deviceId:'ai-device',sub});
  ok('Premium-вход создан', login.status === 200 && login.body.syncToken);

  const overview = await post('/api/admin',{action:'overview'},{'x-admin-key':encodeURIComponent(ADMIN)});
  ok('настройки доступны в общей админке', overview.status === 200 && overview.body.settings.retentionDays === 30);
  const settings = overview.body.settings;

  const adminCreate = await post('/api/admin',{
    action:'catalog_ai_create',lang:'ru',cat:'power',level:'Средний',min:30,days:3,
    availableLoadEquipment:['dumbbell'],limitations:'без прыжков',focus:'спина',style:'strength',warmup:'yes',
    instruction:'тестовая программа'
  },{'x-admin-key':encodeURIComponent(ADMIN)});
  ok('админка создаёт полную программу через ИИ (тот же контракт V2)',
    adminCreate.status === 200
    && adminCreate.body.locale
    && adminCreate.body.locale.name === 'Тестовая программа'
    && adminCreate.body.program && adminCreate.body.program.plans[0].exercises.length === 4
    && adminCreate.body.locale.texts.stages.some(s => s.name === 'Приседания'));

  settings.limits.heavy = 1;
  const saved = await post('/api/admin',{action:'save_settings',settings},{'x-admin-key':encodeURIComponent(ADMIN)});
  ok('лимиты сохраняются', saved.status === 200 && saved.body.settings.limits.heavy === 1);

  const auth = {email:MAIL,token:login.body.syncToken,deviceId:'ai-device'};
  // AI Contract V2: клиент присылает структурированный input, prompt и схему собирает сервер
  const legacy = await post('/api/ai',Object.assign({kind:'program.create',prompt:'Собери программу'},auth));
  ok('старый текстовый запрос отклоняется и не тратит лимит', legacy.status === 400 && legacy.body.error === 'contract_version_required');
  const input = {language:'Russian', task:'Тестовая программа на 2 дня', availableLoadEquipment:['dumbbell']};
  const one = await post('/api/ai',Object.assign({kind:'program.create',contractVersion:2,input},auth));
  ok('серверная генерация отвечает JSON по контракту', one.status === 200 && one.body.json
    && one.body.json.contractVersion === 2 && one.body.json.program.name === 'Тестовая программа');
  ok('ответ сообщает расход лимита', one.body.usage && one.body.usage.used === 1 && one.body.usage.limit === 1);
  const two = await post('/api/ai',Object.assign({kind:'program.create',contractVersion:2,input},auth));
  ok('месячный лимит защищает бюджет', two.status === 429 && two.body.error === 'ai_limit');
  const ex = {id:'ex_1', warmup:false, currentStageId:'mv_1', currentLoadReadOnly:{}, stages:[Object.assign({stageId:'mv_1'},
    one.body.json.program.plans[0].exercises[1].stages[0])]};
  const mod = await post('/api/ai',Object.assign({kind:'exercise.modify',contractVersion:2,
    input:{language:'Russian', task:'больше повторов', exercise:ex}},auth));
  ok('правка упражнения ссылается на этап по id', mod.status === 200
    && mod.body.json.exercise.stages[0].ref === 'mv_1' && mod.body.json.exercise.stages[0].replace.value === '15');
  const stranger = await post('/api/ai',{kind:'exercise.create',contractVersion:2,input:{task:'Упражнение'},email:MAIL,token:'wrong',deviceId:'ai-device'});
  ok('одной почты недостаточно', stranger.status === 403 && stranger.body.error === 'bad_sync_token');

  // настройки общие для тестового сервера: возвращаем лимит, чтобы следующие сценарии не упирались в 1/1
  settings.limits.heavy = 30;
  await post('/api/admin',{action:'save_settings',settings},{'x-admin-key':encodeURIComponent(ADMIN)});
  process.exit(bad ? 1 : 0);
})().catch(e=>{ console.error(e); process.exit(1); });
