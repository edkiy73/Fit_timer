/* FitTimer catalog CRUD boundary regression. */
let bad=0;
function ok(name,cond){
  if(!cond) bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name);
}

const storePath=require.resolve('../../../packages/core/server/store');
const aiPath=require.resolve('../../../packages/core/server/ai');
const pushPath=require.resolve('../../../packages/core/server/push');

require.cache[storePath]={
  id:storePath,filename:storePath,loaded:true,
  exports:{store:{
    get:async()=>null,
    set:async()=>true,
    list:async()=>[],
    many:async()=>[],
    pipe:async()=>[],
    push:async()=>1,
    removeFromList:async()=>1,
    incr:async()=>1
  }}
};
require.cache[aiPath]={
  id:aiPath,filename:aiPath,loaded:true,
  exports:{
    getSettings:async()=>({}),
    providerStatus:()=>({}),
    billingProviderStatus:()=>({})
  }
};
require.cache[pushPath]={
  id:pushPath,filename:pushPath,loaded:true,
  exports:{sendPushToAccountHash:async()=>({sent:0})}
};

const mod=require('../lib/admin/fittimer/catalog-admin');

(async()=>{
  const expected=[
    'overview','approve','reject','pro','ban','unban',
    'save_draft','publish_draft','delete_draft',
    'add','edit','remove','seed'
  ];
  ok('FitTimer Admin owns catalog/trainer CRUD actions',expected.every(x=>mod.ACTIONS.has(x)));
  ok('FitTimer catalog CRUD does not own Core Admin actions',
    !mod.ACTIONS.has('users_list')&&!mod.ACTIONS.has('analytics_stats'));

  const res={statusCode:0,body:'',setHeader(){},end(v){this.body=String(v||'');}};
  const handled=await mod.handleCatalogAdmin('users_list',{},res);
  ok('FitTimer catalog handler ignores Core action',handled===false&&res.statusCode===0);

  const checked=mod.checkItem({
    cat:'tone',
    level:'Новичок',
    sourceLocale:'ru',
    locales:{
      ru:{
        name:'Тест',
        gives:'Достаточно длинное описание результата программы.',
        text:'ПРОГРАММА: Тест\nОПИСАНИЕ ПРОГРАММЫ: Достаточно длинное описание результата программы.\nУПРАЖНЕНИЕ: Приседания\nОПИСАНИЕ: Контролируемое движение вниз и вверх.'
      }
    }
  },{requireBoth:false});
  ok('catalog validation still accepts a valid source-locale draft',checked.miss.length===0);

  process.exit(bad?1:0);
})().catch(e=>{
  console.error(e);
  process.exit(1);
});
