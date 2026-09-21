const crypto=require('crypto');
const http2=require('http2');
const {store}=require('./store');
const b64url=v=>Buffer.from(v).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const json64=v=>b64url(JSON.stringify(v));
function firebaseAccount(){
  let raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'';
  if(!raw&&process.env.FIREBASE_SERVICE_ACCOUNT_BASE64){try{raw=Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,'base64').toString('utf8');}catch(_){}}
  if(!raw)return null;
  try{const a=JSON.parse(raw);return a.project_id&&a.client_email&&a.private_key?a:null;}catch(_){return null;}
}
function apnsConfig(){
  const keyId=process.env.APNS_KEY_ID||'',teamId=process.env.APNS_TEAM_ID||'';
  const privateKey=String(process.env.APNS_PRIVATE_KEY||'').replace(/\\n/g,'\n');
  const bundleId=process.env.APNS_BUNDLE_ID||'ru.fittimer.app';
  return keyId&&teamId&&privateKey?{keyId,teamId,privateKey,bundleId,sandbox:process.env.APNS_USE_SANDBOX==='1'}:null;
}
let googleToken=null;
async function googleAccessToken(){
  const a=firebaseAccount(); if(!a)throw new Error('firebase_not_configured');
  const now=Math.floor(Date.now()/1000);
  if(googleToken&&googleToken.exp>now+60)return {token:googleToken.token,projectId:a.project_id};
  const input=json64({alg:'RS256',typ:'JWT'})+'.'+json64({iss:a.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const assertion=input+'.'+b64url(crypto.sign('RSA-SHA256',Buffer.from(input),a.private_key));
  const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}).toString()});
  const data=await res.json().catch(()=>({}));
  if(!res.ok||!data.access_token)throw Object.assign(new Error('firebase_auth_failed'),{status:res.status,detail:data});
  googleToken={token:data.access_token,exp:now+(+data.expires_in||3600)};
  return {token:googleToken.token,projectId:a.project_id};
}
const stringData=data=>Object.fromEntries(Object.entries(data||{}).filter(([,v])=>v!=null).map(([k,v])=>[String(k),typeof v==='string'?v:JSON.stringify(v)]));
async function sendAndroid(token,message){
  const a=await googleAccessToken();
  const res=await fetch('https://fcm.googleapis.com/v1/projects/'+encodeURIComponent(a.projectId)+'/messages:send',{method:'POST',headers:{Authorization:'Bearer '+a.token,'Content-Type':'application/json'},body:JSON.stringify({message:{token,notification:{title:String(message.title||'Fit Timer'),body:String(message.body||'')},data:stringData(message.data),android:{priority:'high',notification:{sound:'default'}}}})});
  if(!res.ok){
    const detail=await res.text().catch(()=> '');
    const invalid=res.status===404 || /UNREGISTERED|registration-token-not-registered/i.test(detail);
    throw Object.assign(new Error('fcm_failed'),{status:res.status,detail,invalidToken:invalid});
  }
}
let apnsJwt=null;
function apnsToken(){
  const c=apnsConfig(); if(!c)throw new Error('apns_not_configured');
  const now=Math.floor(Date.now()/1000);
  if(apnsJwt&&apnsJwt.at>now-2700)return {token:apnsJwt.token,config:c};
  const input=json64({alg:'ES256',kid:c.keyId})+'.'+json64({iss:c.teamId,iat:now});
  const sig=crypto.sign('sha256',Buffer.from(input),{key:c.privateKey,dsaEncoding:'ieee-p1363'});
  apnsJwt={token:input+'.'+b64url(sig),at:now}; return {token:apnsJwt.token,config:c};
}
function sendIos(token,message){return new Promise((resolve,reject)=>{
  let a;try{a=apnsToken();}catch(e){reject(e);return;}
  const client=http2.connect(a.config.sandbox?'https://api.sandbox.push.apple.com':'https://api.push.apple.com');
  let status=0,body='',done=false; const finish=(e,v)=>{if(done)return;done=true;try{client.close();}catch(_){}e?reject(e):resolve(v);};
  client.on('error',e=>finish(e));
  const req=client.request({':method':'POST',':path':'/3/device/'+encodeURIComponent(token),authorization:'bearer '+a.token,'apns-topic':a.config.bundleId,'apns-push-type':'alert','apns-priority':'10'});
  req.on('response',h=>{status=+h[':status']||0;});req.setEncoding('utf8');req.on('data',c=>body+=c);req.on('end',()=>{
    if(status>=200&&status<300)return finish(null,{ok:true});
    const invalid=status===410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/i.test(body);
    finish(Object.assign(new Error('apns_failed'),{status,detail:body,invalidToken:invalid}));
  });
  req.end(JSON.stringify({aps:{alert:{title:String(message.title||'Fit Timer'),body:String(message.body||'')},sound:'default'},fit:stringData(message.data)}));
});}
async function notificationPrefs(mh){try{const m=JSON.parse(await store.get('s:'+mh)||'{}'),d=m.accountDocs&&m.accountDocs.notificationPrefs;if(!d||d.deleted||!d.storeKey)return{};return JSON.parse(await store.get(d.storeKey)||'{}')||{};}catch(_){return{};}}
async function sendPushToAccountHash(mh,message){
  let acc=null;try{acc=JSON.parse(await store.get('a:'+mh));}catch(_){} if(!acc)return{sent:0};
  const prefs=await notificationPrefs(mh),cat=String(message.category||'trainer'); if(prefs[cat]===false)return{sent:0,skipped:true};
  const entries=Object.entries(acc.pushDevices||{}).filter(([,d])=>d&&d.token);let sent=0,failed=0,removed=0,dirty=false;
  for(const [deviceId,d] of entries){
    try{d.platform==='ios'?await sendIos(d.token,message):await sendAndroid(d.token,message);sent++;}
    catch(e){
      failed++;
      if(e&&e.invalidToken){delete acc.pushDevices[deviceId];removed++;dirty=true;}
    }
  }
  if(dirty)await store.set('a:'+mh,JSON.stringify(acc));
  return{sent,failed,removed};
}
module.exports={sendPushToAccountHash,notificationPrefs};
