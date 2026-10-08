/* FitTimer catalog record boundary: program + language overlays, AI action ownership. */
let bad=0;
function ok(name,cond,extra){
  if(!cond) bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name+(extra!=null&&!cond?' → '+extra:''));
}

const aiPath=require.resolve('../../../packages/core/server/ai');
require.cache[aiPath]={
  id:aiPath,filename:aiPath,loaded:true,
  exports:{
    getSettings:async()=>({}),
    generate:async()=>({provider:'test',model:'test',fallback:false,text:''})
  }
};

const text=require('../lib/admin/fittimer/catalog-text');
const ai=require('../lib/admin/fittimer/catalog-ai');
const { catalogProgram, translated }=require('./helpers/catalog-program');

(async()=>{
  ok('FitTimer text module owns fitness catalog constants',
    text.GOALS.includes('tone')&&text.LEVELS.includes('Новичок'));
  ok('FitTimer AI module owns only catalog program/text actions',
    ['translate_catalog','catalog_ai_create','catalog_ai_edit','catalog_import_dto'].every(x=>ai.ACTIONS.has(x))
    && !ai.ACTIONS.has('catalog_ai_image')
    && !ai.ACTIONS.has('users_list'));

  const program=catalogProgram('Тест',['Приседания','Отжимания','Планка']);
  const norm=text.normalizeCatalog({sourceLocale:'ru',program,locales:{
    ru:{name:'Тест',gives:'Достаточно длинное описание результата программы.',texts:null}
  }});
  ok('source overlay is derived from the program',
    norm.locales.ru.texts.stages.length===3&&norm.locales.ru.texts.stages[0].name==='Приседания'&&norm.exCount===3);

  // правка текста исходного языка накладкой меняет саму программу
  const edited=text.normalizeCatalog({sourceLocale:'ru',program,locales:{ru:{name:'Тест',gives:'x',
    texts:{programName:'Тест 2',programDesc:'',stages:[{stageId:program.plans[0].exercises[0].stages[0].stageId,name:'Глубокие приседания',desc:'',mistakes:''}]}}}});
  ok('source overlay edit is applied to the program texts',
    edited.program.name==='Тест 2'&&edited.program.plans[0].exercises[0].stages[0].prescription.name==='Глубокие приседания'
    &&edited.locales.ru.texts.stages[0].name==='Глубокие приседания');

  const src=norm.locales.ru.texts;
  ok('EN without overlay is not ready',
    text.localeMiss({name:'Test',gives:'Long enough description of the result.',texts:null},src,'EN').includes('EN: тексты программы'));
  ok('complete EN overlay is ready',
    text.localeMiss({name:'Test',gives:'Long enough description of the result.',texts:translated(program,{})},src,'EN').length===0);
  ok('program problems are human-readable',
    text.programMiss(text.normalizeCatalog({program:null}))[0]==='программа'
    &&text.programMiss(text.normalizeCatalog({program:Object.assign({},program,{
      plans:[Object.assign({},program.plans[0],{exercises:program.plans[0].exercises.slice(0,2)})]})}))[0]==='хотя бы три упражнения');

  const c={};
  text.syncSourceFields(c,norm);
  ok('record keeps program + overlays, no text protocol',
    c.program&&c.locales.ru&&c.name==='Тест'&&c.exCount===3);

  const res={statusCode:0,body:'',setHeader(){},end(v){this.body=String(v||'');}};
  const handled=await ai.handleCatalogTextAI('users_list',{},res);
  ok('FitTimer catalog AI ignores Core Admin action',handled===false&&res.statusCode===0);

  process.exit(bad?1:0);
})().catch(e=>{
  console.error(e);
  process.exit(1);
});
