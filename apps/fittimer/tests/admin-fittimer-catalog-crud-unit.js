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

  const { catalogProgram, translated }=require('./helpers/catalog-program');
  const program=catalogProgram('Тест',['Приседания','Отжимания','Планка']);
  const item={
    cat:'tone',level:'Новичок',sourceLocale:'ru',program,
    locales:{ru:{name:'Тест',gives:'Достаточно длинное описание результата программы.'}}
  };
  const checked=mod.checkItem(item,{requireBoth:false});
  ok('catalog validation accepts a valid source-locale draft',checked.miss.length===0,checked.miss.join(', '));
  const both=mod.checkItem(item,{requireBoth:true});
  ok('publishing requires the second language overlay',both.miss.some(x=>/^EN:/.test(x)),both.miss.join(', '));
  const ready=mod.checkItem(Object.assign({},item,{locales:Object.assign({},item.locales,{
    en:{name:'Test',gives:'Long enough description of the program result.',texts:translated(program,{})}
  })}),{requireBoth:true});
  ok('RU + EN overlays make the record publishable',ready.miss.length===0,ready.miss.join(', '));
  const noProgram=mod.checkItem({cat:'tone',level:'Новичок',locales:{ru:{name:'Тест',gives:'Достаточно длинное описание.'}}});
  ok('a record without a program is not ready',noProgram.miss.includes('программа'),noProgram.miss.join(', '));
  const media=mod.pics({v:2,items:[{id:'e1',p:0,i:1,n:'x',data:'data:image/png;base64,AAAA'}]});
  ok('media stays v2 keyed by exercise id',media.v===2&&media.items[0].id==='e1');
  ok('legacy name→picture maps are not accepted',mod.pics({'Приседания':'data:image/png;base64,AAAA'}).items.length===0);

  process.exit(bad?1:0);
})().catch(e=>{
  console.error(e);
  process.exit(1);
});
