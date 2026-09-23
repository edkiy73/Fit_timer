/* Точечная server-regression для AI-create в админке.
   Запуск: ADMIN_KEY=testadminkey123456 GEMINI_API_KEY=test AI_TEST_MODE=1
   node tests/dev-server.js 8124 && node tests/admin-ai-api.js */
const BASE=process.env.FIT_URL||'http://127.0.0.1:8124';
const ADMIN=process.env.ADMIN_KEY||'testadminkey123456';
const post=async body=>{
  const r=await fetch(BASE+'/api/admin',{
    method:'POST',
    headers:{'content-type':'application/json','x-admin-key':encodeURIComponent(ADMIN)},
    body:JSON.stringify(body)
  });
  let j={}; try{j=await r.json();}catch(_){}
  return {status:r.status,body:j};
};
let bad=0;
const ok=(name,v,extra)=>{if(!v)bad++;console.log((v?'  ok  ':' ПЛОХО')+'  '+name+(extra?' → '+extra:''));};

(async()=>{
  const before=(await post({action:'overview'})).body.settings;
  const testSettings=JSON.parse(JSON.stringify(before));
  testSettings.text.primary={provider:'gemini',model:'temporary-test-model'};
  testSettings.text.backup={provider:'gemini',model:'temporary-test-model'};
  const probe=await post({action:'test_ai',type:'text',settings:testSettings});
  ok('AI test accepts unsaved form settings',probe.status===200&&probe.body.model==='temporary-test-model',JSON.stringify(probe.body));
  const after=(await post({action:'overview'})).body.settings;
  ok('AI test does not mutate saved production settings',after.text.primary.model===before.text.primary.model,after.text.primary.model);

  const made=await post({
    action:'catalog_ai_create',lang:'ru',cat:'power',level:'Средний',min:30,days:3,
    equipment:'гантели',limitations:'без прыжков',focus:'спина',style:'strength',warmup:'yes',
    instruction:'тестовая программа'
  });
  ok('catalog_ai_create отвечает',made.status===200,JSON.stringify(made.body));
  ok('возвращается название',made.body.locale&&made.body.locale.name==='Тестовая программа',made.body.locale&&made.body.locale.name);
  ok('протокол содержит упражнение',/УПРАЖНЕНИЕ: Приседания/.test((made.body.locale&&made.body.locale.text)||''));

  const translated=await post({
    action:'translate_catalog',from:'ru',to:'en',locale:made.body.locale
  });
  ok('автоперевод второго языка отвечает',translated.status===200,JSON.stringify(translated.body));
  ok('второй язык заполнен',translated.body.locale&&translated.body.locale.name==='EN Test Program',translated.body.locale&&translated.body.locale.name);
  ok('структура протокола сохранена',/УПРАЖНЕНИЕ: Squats/.test((translated.body.locale&&translated.body.locale.text)||''));

  process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
