const { store } = require('./store');
const { mailInfo } = require('./mail');
const { pushInfo } = require('./push');
const { providerStatus, billingProviderStatus } = require('./ai');

function safeError(e){
  return String((e && e.message) || e || 'unknown_error').slice(0, 300);
}

async function timed(name, fn){
  const started = Date.now();
  try{
    const detail = await fn();
    return {name, ok:true, latencyMs:Date.now()-started, detail:detail || null};
  }catch(e){
    return {name, ok:false, latencyMs:Date.now()-started, error:safeError(e)};
  }
}

async function collectHealth(){
  const info = store.info();
  const mail = mailInfo();
  const push = pushInfo();
  const ai = providerStatus();
  const billing = billingProviderStatus();
  const probes = [];

  if(info.connected || info.memory){
    const storage = await timed('storage', async()=>{
      let steps = [];
      try{
        steps = await store.selfTest();
      }catch(e){
        steps = Array.isArray(e && e.steps) ? e.steps : [];
        throw Object.assign(new Error(safeError(e)), {steps});
      }
      return {steps};
    });
    probes.push(storage);

    probes.push(await timed('catalog', async()=>{
      const ids = await store.list('c:approved');
      if(ids.length) await store.get('c:' + ids[ids.length - 1]);
      return {items:ids.length};
    }));

    probes.push(await timed('accounts', async()=>{
      const ids = await store.list('a:all');
      return {indexed:ids.length};
    }));
  }else{
    probes.push(
      {name:'storage',ok:false,latencyMs:0,error:'not_configured'},
      {name:'catalog',ok:false,latencyMs:0,error:'storage_unavailable'},
      {name:'accounts',ok:false,latencyMs:0,error:'storage_unavailable'}
    );
  }

  const criticalOk = probes.every(x=>x.ok);
  const optionalWarnings = [];
  if(info.memory) optionalWarnings.push('Хранилище работает только в памяти процесса.');
  if(!mail.ready) optionalWarnings.push('Почта не настроена — вход по email-коду недоступен.');
  if(!ai.gemini && !ai.openai) optionalWarnings.push('Нет настроенного AI-провайдера.');
  if(!push.android && !push.ios) optionalWarnings.push('Push-уведомления не настроены.');

  const storageProbe = probes.find(x=>x.name==='storage') || null;
  const storageSteps = storageProbe && storageProbe.detail && Array.isArray(storageProbe.detail.steps)
    ? storageProbe.detail.steps : [];

  return {
    ok:criticalOk,
    status:criticalOk ? (optionalWarnings.length ? 'warning' : 'ok') : 'error',
    checkedAt:new Date().toISOString(),
    deployment:info.build,
    probes,
    storage:{
      status:storageProbe && storageProbe.ok ? 'ok' : 'error',
      mode:info.connected ? 'redis' : (info.memory ? 'memory' : 'none'),
      connected:!!info.connected,
      latencyMs:storageProbe ? storageProbe.latencyMs : null,
      steps:storageSteps,
      envSeen:info.seen || [],
      vars:info.vars || []
    },
    services:{
      ai:{configured:!!(ai.gemini || ai.openai),providers:ai},
      mail:{configured:!!mail.ready,testDomain:!!mail.testDomain,from:mail.from || null,envSeen:mail.seen || []},
      push:{configured:!!(push.android || push.ios),android:!!push.android,ios:!!push.ios,
        firebaseEnvSeen:push.firebaseVars || [],apnsEnvSeen:push.apnsVars || []},
      billing:{configured:!!(billing.google || billing.rustore || billing.yookassa),providers:billing}
    },
    warnings:optionalWarnings
  };
}

module.exports = { collectHealth };
