/* Core Admin campaigns ownership regression. */
let bad=0;
function ok(name,cond){
  if(!cond) bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name);
}

const storePath=require.resolve('../../../packages/core/server/store');
const pushPath=require.resolve('../../../packages/core/server/push');
const mailPath=require.resolve('../../../packages/core/server/mail');
const accountsPath=require.resolve('../../../packages/core/server/admin/accounts');

let accountRaw=null;
let pushed=null;

require.cache[storePath]={
  id:storePath,filename:storePath,loaded:true,
  exports:{store:{
    list:async()=>[],
    get:async key=>key==='a:hash123'?accountRaw:null,
    set:async()=>true
  }}
};
require.cache[pushPath]={
  id:pushPath,filename:pushPath,loaded:true,
  exports:{
    sendPushToAccountHash:async(mh,message)=>{pushed={mh,message};return{sent:1,failed:0,removed:0};},
    notificationPrefs:async()=>({})
  }
};
require.cache[mailPath]={
  id:mailPath,filename:mailPath,loaded:true,
  exports:{sendMail:async()=>true}
};
require.cache[accountsPath]={
  id:accountsPath,filename:accountsPath,loaded:true,
  exports:{
    ensureAccountIndex:async()=>0,
    accountMail:v=>String(v||'').trim().toLowerCase(),
    accountHash:()=> 'hash123'
  }
};

const mod=require('../../../packages/core/server/admin/campaigns');

function response(){
  return {
    statusCode:0,body:'',headers:{},
    setHeader(k,v){this.headers[k]=v;},
    end(v){this.body=String(v||'');}
  };
}

(async()=>{
  ok('Core Admin owns campaign action',mod.ACTIONS.has('campaign_send'));
  ok('Core Admin owns targeted test push action',mod.ACTIONS.has('campaign_test_push'));
  ok('Core campaigns do not own FitTimer catalog actions',!mod.ACTIONS.has('catalog_ai_create'));

  let res=response();
  let handled=await mod.handleAdminCampaigns('catalog_ai_create',{},res);
  ok('campaign handler ignores product action',handled===false&&res.statusCode===0);

  res=response();
  handled=await mod.handleAdminCampaigns('campaign_send',{push:false,email:false},res);
  ok('campaign handler preserves channel validation',handled===true&&res.statusCode===400);

  res=response();
  handled=await mod.handleAdminCampaigns('campaign_test_push',{email:'nobody@example.com',title:'Test',body:'Body'},res);
  ok('test push requires an existing account',handled===true&&res.statusCode===404);

  accountRaw=JSON.stringify({email:'person@example.com',pushDevices:{phone:{token:'x',platform:'android'}}});
  res=response();pushed=null;
  handled=await mod.handleAdminCampaigns('campaign_test_push',{
    email:'PERSON@example.com',
    title:'Test title',
    body:'Test body',
    route:'/review'
  },res);
  const payload=JSON.parse(res.body||'{}');
  ok('targeted test push is sent',handled===true&&res.statusCode===200&&payload.sent===1);
  ok('targeted test push keeps product route in data',pushed&&pushed.message&&pushed.message.data.route==='/review');
  ok('targeted test push is product-neutral',pushed&&pushed.message&&pushed.message.data.stage==='admin_test');

  process.exit(bad?1:0);
})().catch(e=>{
  console.error(e);
  process.exit(1);
});
