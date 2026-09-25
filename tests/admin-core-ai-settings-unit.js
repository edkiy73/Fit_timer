/* Core Admin AI settings ownership regression. */
let bad=0;
function ok(name,cond){
  if(!cond) bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name);
}

const storePath=require.resolve('../lib/store');
const aiPath=require.resolve('../lib/ai');

require.cache[storePath]={
  id:storePath,filename:storePath,loaded:true,
  exports:{store:{set:async()=>true}}
};
require.cache[aiPath]={
  id:aiPath,filename:aiPath,loaded:true,
  exports:{
    getSettings:async()=>({}),
    sanitizeSettings:x=>x||{},
    generate:async(type)=>({
      provider:'test',
      model:'test-model',
      fallback:false,
      text:type==='text'?'работает':''
    })
  }
};

const mod=require('../lib/admin/core/ai-settings');

(async()=>{
  ok('Core Admin owns AI settings actions',
    ['save_settings','test_ai'].every(x=>mod.ACTIONS.has(x)));
  ok('Core AI settings do not own catalog actions',
    !mod.ACTIONS.has('catalog_ai_create')&&!mod.ACTIONS.has('translate_catalog'));

  const res={statusCode:0,body:'',setHeader(){},end(v){this.body=String(v||'');}};
  let handled=await mod.handleAdminAISettings('catalog_ai_create',{},res);
  ok('AI settings handler ignores product action',handled===false&&res.statusCode===0);

  handled=await mod.handleAdminAISettings('test_ai',{type:'text'},res);
  ok('generic AI connectivity test remains available',handled===true&&res.statusCode===200);

  process.exit(bad?1:0);
})().catch(e=>{
  console.error(e);
  process.exit(1);
});
