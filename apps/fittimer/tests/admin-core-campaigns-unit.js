/* Core Admin campaigns ownership and payload regression. */
let bad=0;
function ok(name,cond){
  if(!cond) bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name);
}

const accountHash='a'.repeat(32);
let pushed=null;
const data=new Map([
  ['a:'+accountHash,JSON.stringify({
    email:'test@example.com',
    locale:'ru',
    pushDevices:{phone:{token:'token',platform:'android'}}
  })]
]);

const storePath=require.resolve('../../../packages/core/server/store');
const pushPath=require.resolve('../../../packages/core/server/push');
const mailPath=require.resolve('../../../packages/core/server/mail');
const accountsPath=require.resolve('../../../packages/core/server/admin/accounts');

require.cache[storePath]={
  id:storePath,filename:storePath,loaded:true,
  exports:{store:{
    list:async key=>key==='a:all'?[accountHash]:[],
    get:async key=>data.get(key)??null,
    set:async(key,value)=>{data.set(key,String(value));return true;}
  }}
};
require.cache[pushPath]={
  id:pushPath,filename:pushPath,loaded:true,
  exports:{
    sendPushToAccountHash:async(_hash,message)=>{pushed=message;return {sent:1};},
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

const mod=require('../../../packages/core/server/admin/campaigns');

function response(){
  return {statusCode:0,body:'',setHeader(){},end(v){this.body=String(v||'');}};
}

(async()=>{
  ok('Core Admin owns campaign action',mod.ACTIONS.has('campaign_send'));
  ok('Core campaigns do not own FitTimer catalog actions',!mod.ACTIONS.has('catalog_ai_create'));

  let res=response();
  let handled=await mod.handleAdminCampaigns('catalog_ai_create',{},res);
  ok('campaign handler ignores product action',handled===false&&res.statusCode===0);

  res=response();
  handled=await mod.handleAdminCampaigns('campaign_send',{push:false,email:false},res);
  ok('campaign handler preserves channel validation',handled===true&&res.statusCode===400);

  res=response();
  pushed=null;
  handled=await mod.handleAdminCampaigns('campaign_send',{
    push:true,
    email:false,
    kind:'news',
    route:'/review',
    copy:{
      ru:{title:'Новости',body:'Есть обновление'},
      en:{title:'News',body:'There is an update'}
    }
  },res);
  const sent=JSON.parse(res.body||'{}');
  ok('campaign sends through shared push transport',handled===true&&res.statusCode===200&&sent.pushSent===1);
  ok('campaign keeps product deep link in generic push data',pushed&&pushed.data&&pushed.data.route==='/review');
  ok('campaign data stays product-neutral',pushed&&pushed.data.stage==='campaign'&&pushed.data.kind==='news');

  res=response();
  pushed=null;
  await mod.handleAdminCampaigns('campaign_send',{
    push:true,
    route:'https://evil.example/path',
    copy:{
      ru:{title:'Новости',body:'Есть обновление'},
      en:{title:'News',body:'There is an update'}
    }
  },res);
  ok('campaign rejects external route payloads',pushed&&pushed.data&&!Object.prototype.hasOwnProperty.call(pushed.data,'route'));

  process.exit(bad?1:0);
})().catch(e=>{
  console.error(e);
  process.exit(1);
});
