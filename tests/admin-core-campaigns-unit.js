/* Core Admin campaigns ownership regression. */
let bad=0;
function ok(name,cond){
  if(!cond) bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name);
}

const storePath=require.resolve('../lib/store');
const pushPath=require.resolve('../lib/push');
const mailPath=require.resolve('../lib/mail');
const accountsPath=require.resolve('../lib/admin/core/accounts');

require.cache[storePath]={
  id:storePath,filename:storePath,loaded:true,
  exports:{store:{
    list:async()=>[],
    get:async()=>null,
    set:async()=>true
  }}
};
require.cache[pushPath]={
  id:pushPath,filename:pushPath,loaded:true,
  exports:{
    sendPushToAccountHash:async()=>({sent:0}),
    notificationPrefs:async()=>({})
  }
};
require.cache[mailPath]={
  id:mailPath,filename:mailPath,loaded:true,
  exports:{sendMail:async()=>true}
};
require.cache[accountsPath]={
  id:accountsPath,filename:accountsPath,loaded:true,
  exports:{ensureAccountIndex:async()=>0}
};

const mod=require('../lib/admin/core/campaigns');

(async()=>{
  ok('Core Admin owns campaign action',mod.ACTIONS.has('campaign_send'));
  ok('Core campaigns do not own FitTimer catalog actions',!mod.ACTIONS.has('catalog_ai_create'));

  const res={statusCode:0,body:'',setHeader(){},end(v){this.body=String(v||'');}};
  let handled=await mod.handleAdminCampaigns('catalog_ai_create',{},res);
  ok('campaign handler ignores product action',handled===false&&res.statusCode===0);

  handled=await mod.handleAdminCampaigns('campaign_send',{push:false,email:false},res);
  ok('campaign handler preserves channel validation',handled===true&&res.statusCode===400);

  process.exit(bad?1:0);
})().catch(e=>{
  console.error(e);
  process.exit(1);
});
