/* Server push regression without external Firebase. */
process.env.ALLOW_MEMORY_STORE = '1';
require('../lib/product');
const crypto = require('crypto');
const { privateKey } = crypto.generateKeyPairSync('rsa', {modulusLength:2048});
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  project_id:'fit-test',
  client_email:'push-test@fit-test.iam.gserviceaccount.com',
  private_key:privateKey.export({type:'pkcs8',format:'pem'})
});

const { store } = require('../../../packages/core/server/store');
const { sendPushToAccountHash, pushInfo } = require('../../../packages/core/server/push');

let bad=0;
const ok=(name,cond,extra)=>{if(!cond)bad++;console.log((cond?'  ok  ':' ПЛОХО')+'  '+name+(extra==null?'':' → '+extra));};

(async()=>{
  const mh='push-test-account';
  await store.set('a:'+mh, JSON.stringify({
    email:'x@example.com',
    pushDevices:{
      good:{platform:'android',token:'good-token'},
      dead:{platform:'android',token:'dead-token'}
    }
  }));

  let oauth=0, sends=0;
  const realFetch=global.fetch;
  global.fetch=async (url,opts)=>{
    const u=String(url);
    if(u.includes('oauth2.googleapis.com/token')){
      oauth++;
      return {ok:true,status:200,json:async()=>({access_token:'test-access',expires_in:3600})};
    }
    if(u.includes('fcm.googleapis.com/')){
      sends++;
      const body=JSON.parse(String(opts&&opts.body||'{}'));
      const token=body&&body.message&&body.message.token;
      if(token==='dead-token') return {ok:false,status:404,text:async()=>'{"error":{"status":"NOT_FOUND","message":"UNREGISTERED"}}'};
      return {ok:true,status:200,text:async()=>''};
    }
    throw new Error('unexpected_url '+u);
  };
  try{
    ok('Firebase server config распознаётся', pushInfo().android===true);
    const sent=await sendPushToAccountHash(mh,{category:'trainer',title:'Test',body:'Body',data:{stage:'x'}});
    ok('FCM отправляет живой токен и удаляет UNREGISTERED', sent.sent===1&&sent.failed===1&&sent.removed===1, JSON.stringify(sent));
    const acc=JSON.parse(await store.get('a:'+mh));
    ok('мертвый push token удалён из account', !!acc.pushDevices.good&&!acc.pushDevices.dead, JSON.stringify(acc.pushDevices));
    ok('OAuth token переиспользуется внутри отправки', oauth===1&&sends===2, JSON.stringify({oauth,sends}));
  }finally{ global.fetch=realFetch; }
  process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
