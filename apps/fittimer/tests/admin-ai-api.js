/* Точечная server-regression для ИИ в редакторе каталога: создание, правка, перевод,
   ручной импорт Program DTO V2.
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
  const before=(await post({action:'overview'})).body;
  ok('overview отдаёт справочник оборудования для формы генерации',
    Array.isArray(before.equipment)&&before.equipment.some(e=>e.id==='dumbbell'&&e.roles.includes('load')));
  const testSettings=JSON.parse(JSON.stringify(before.settings));
  testSettings.text.primary={provider:'gemini',model:'temporary-test-model'};
  testSettings.text.backup={provider:'gemini',model:'temporary-test-model'};
  const probe=await post({action:'test_ai',type:'text',settings:testSettings});
  ok('AI test accepts unsaved form settings',probe.status===200&&probe.body.model==='temporary-test-model',JSON.stringify(probe.body));
  const after=(await post({action:'overview'})).body.settings;
  ok('AI test does not mutate saved production settings',after.text.primary.model===before.settings.text.primary.model,after.text.primary.model);

  const made=await post({
    action:'catalog_ai_create',lang:'ru',cat:'power',level:'Средний',min:30,days:3,
    availableLoadEquipment:['dumbbell'],availableSupportEquipment:['mat'],
    limitations:'без прыжков',focus:'спина',style:'strength',warmup:'yes',instruction:'тестовая программа'
  });
  ok('catalog_ai_create отвечает',made.status===200,JSON.stringify(made.body).slice(0,200));
  const p=made.body.program;
  ok('возвращается программа V2 с id и без личного состояния',
    p&&p.plans[0].id&&p.plans[0].exercises.every(ex=>ex.id&&ex.stages.length&&ex.progressState.count===0&&!ex.media));
  ok('и накладка исходного языка снята с программы',
    made.body.locale&&made.body.locale.name==='Тестовая программа'
    &&made.body.locale.texts.stages.length===p.plans[0].exercises.reduce((n,ex)=>n+ex.stages.length,0));

  const translated=await post({action:'translate_catalog',from:'ru',to:'en',
    locale:Object.assign({},made.body.locale,{gives:'Полноценная тестовая программа для каталога.'})});
  ok('автоперевод второго языка отвечает',translated.status===200,JSON.stringify(translated.body).slice(0,200));
  const tl=translated.body.locale||{};
  ok('второй язык заполнен по тем же stageId',
    tl.name==='EN Тестовая программа'&&tl.texts&&tl.texts.stages.length===made.body.locale.texts.stages.length
    &&tl.texts.stages.every((s,i)=>s.stageId===made.body.locale.texts.stages[i].stageId),tl.name);
  const manual=await post({action:'translate_catalog',from:'ru',to:'en',promptOnly:true,
    locale:Object.assign({},made.body.locale,{gives:'Полноценная тестовая программа для каталога.'})});
  ok('для ручного перевода отдаётся тот же prompt со схемой',
    manual.status===200&&/SOURCE JSON: /.test(manual.body.prompt||'')&&/JSON Schema/.test(manual.body.prompt||''));

  const edited=await post({action:'catalog_ai_edit',mode:'program',lang:'ru',program:p,instruction:'добавь планку'});
  ok('правка программы через тот же program.modify',edited.status===200
    &&edited.body.program.plans[0].exercises.length===p.plans[0].exercises.length+1
    &&edited.body.program.plans[0].exercises[1].id===p.plans[0].exercises[1].id,JSON.stringify(edited.body).slice(0,160));
  const target=p.plans[0].exercises[1];
  const exEdit=await post({action:'catalog_ai_edit',mode:'exercise',lang:'ru',program:p,exerciseId:target.id,instruction:'больше повторов'});
  const changed=exEdit.body.program&&exEdit.body.program.plans[0].exercises.find(ex=>ex.id===target.id);
  ok('правка одного упражнения сохраняет его id и этап',exEdit.status===200&&changed
    &&changed.currentStageId===target.currentStageId&&changed.stages[0].prescription.value==='15');

  const dto={contractVersion:2,program:{name:'Из приложения',desc:'Скопирована как DTO.',progressionEvery:null,rotate:false,rotateDays:[],
    plans:[{days:['tue'],rounds:2,roundRest:60,exercises:['Приседания','Выпады','Планка'].map(name=>({warmup:false,stages:[{
      name,desc:'',mistakes:'',type:'reps',value:'10',sets:2,perSide:false,rest:30,restAfter:null,muscles:['le'],
      load:{type:'none',equipment:null,equipmentName:'',count:1,weight:0,levels:[],level:0},supportEquipment:[],
      progression:{mode:'none',every:null,repsStep:null,repsMax:null,weightStep:null,weightMax:null,timeStep:null,timeMax:null},
      advance:'manual'}]}))}]}};
  const imported=await post({action:'catalog_import_dto',lang:'ru',json:'```json\n'+JSON.stringify(dto)+'\n```'});
  ok('Program DTO V2 загружается без ИИ',imported.status===200&&imported.body.program.plans[0].days.join()==='Вт'
    &&imported.body.exCount===3,JSON.stringify(imported.body).slice(0,160));
  const broken=await post({action:'catalog_import_dto',lang:'ru',json:{contractVersion:1}});
  ok('чужой формат отклоняется',broken.status===400&&broken.body.error==='bad_program');

  process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
