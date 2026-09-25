/* FitTimer catalog text boundary regression. */
let bad=0;
function ok(name,cond){
  if(!cond) bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name);
}

const aiPath=require.resolve('../lib/ai');
require.cache[aiPath]={
  id:aiPath,filename:aiPath,loaded:true,
  exports:{
    getSettings:async()=>({}),
    generate:async()=>({provider:'test',model:'test',fallback:false,text:''})
  }
};

const text=require('../lib/admin/fittimer/catalog-text');
const ai=require('../lib/admin/fittimer/catalog-ai');

(async()=>{
  ok('FitTimer text module owns fitness catalog constants',
    text.GOALS.includes('tone')&&text.LEVELS.includes('Новичок'));
  ok('FitTimer AI module owns only text catalog actions',
    ['translate_catalog','catalog_ai_create','catalog_ai_edit'].every(x=>ai.ACTIONS.has(x))
    && !ai.ACTIONS.has('catalog_ai_image')
    && !ai.ACTIONS.has('users_list'));

  const sample=[
    'ПРОГРАММА: Тест',
    'ОПИСАНИЕ ПРОГРАММЫ: Достаточно длинное описание тестовой программы для проверки.',
    'УПРАЖНЕНИЕ: Приседания',
    'ОПИСАНИЕ: Контролируемое движение вниз и вверх.',
    'ОШИБКИ: Колени внутрь.'
  ].join('\n');

  const fields=text.translationFieldsFromText(sample);
  ok('protocol parser extracts program and exercises',
    fields.programName==='Тест'&&fields.exercises.length===1&&fields.exercises[0].name==='Приседания');

  const shape=text.protocolShape(sample);
  ok('protocol shape hides user-visible translated text',
    shape.some(x=>x==='ПРОГРАММА:<text>')&&shape.some(x=>x==='УПРАЖНЕНИЕ:<text>'));

  const res={statusCode:0,body:'',setHeader(){},end(v){this.body=String(v||'');}};
  const handled=await ai.handleCatalogTextAI('users_list',{},res);
  ok('FitTimer catalog AI ignores Core Admin action',handled===false&&res.statusCode===0);

  process.exit(bad?1:0);
})().catch(e=>{
  console.error(e);
  process.exit(1);
});
