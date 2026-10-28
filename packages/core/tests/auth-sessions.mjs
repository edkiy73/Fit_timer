// Real Core handlers: logout, expiry, token rotation and concurrent stale account writes.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { createAuthClient } from '../dist/core/auth.js';
const require = createRequire(import.meta.url);
process.env.ALLOW_MEMORY_STORE = '1';
const auth = require('../template/api/auth');
const sync = require('../template/api/sync');
const { createAIHandler } = require('../server/ai-endpoint');
const { createBillingHandler } = require('../server/billing');
const { store } = require('../server/store');
const { validSession, SESSION_TTL } = require('../server/util');
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const email = 'session-lifecycle@example.com';
const accountKey = 'a:' + sha(email).slice(0, 32);
async function call(handler, body){
  const res = {statusCode:0,setHeader(){},end(raw){this.body=JSON.parse(raw);}};
  await handler({method:'POST',headers:{},query:{},body},res);
  return res;
}
async function signIn(deviceId){
  const sent = await call(auth,{action:'send',email});
  assert.equal(sent.statusCode,200);
  const verified = await call(auth,{action:'verify',email,code:sent.body.devCode,deviceId});
  assert.equal(verified.statusCode,200);
  assert.ok(Math.abs(Date.parse(verified.body.expiresAt)-Date.now()-SESSION_TTL*1000)<2000);
  return {email,deviceId,syncToken:verified.body.syncToken};
}
const A = await signIn('device-a'), B = await signIn('device-b');
const snapshot = await store.get(accountKey);
assert.equal((await call(auth,{action:'logout',...A,syncToken:'wrong'})).statusCode,403);
assert.equal((await call(auth,{action:'status',...A})).statusCode,200);
assert.equal((await call(auth,{action:'logout',...A})).statusCode,200);
assert.equal((await call(auth,{action:'logout',...A})).statusCode,200,'logout is idempotent');
// Simulate another account writer committing the snapshot it read before logout.
await store.set(accountKey,snapshot);
async function denied(credentials){
  assert.equal((await call(auth,{action:'status',...credentials})).statusCode,403);
  assert.equal((await call(auth,{action:'set_locale',locale:'en',...credentials})).statusCode,403);
  assert.equal((await call(sync,{action:'pull',...credentials,token:credentials.syncToken})).statusCode,403);
  const ai = await call(createAIHandler({get:()=>null}),{kind:'test',prompt:'x',...credentials});
  assert.equal(ai.statusCode,403);
  const bill = await call(createBillingHandler(),{action:'renewal',...credentials});
  assert.equal(bill.statusCode,403);
}
await denied(A);
assert.equal((await call(auth,{action:'status',...B})).statusCode,200,'other device survives logout');
const nextA = await signIn('device-a');
await denied(A);
assert.equal((await call(auth,{action:'status',...nextA})).statusCode,200,'OTP rotates token');
let acc = JSON.parse(await store.get(accountKey));
acc.syncDevices['device-b'].at = new Date(Date.now()-SESSION_TTL*1000-1).toISOString();
// Even a forged future deadline is capped by the original issuance time.
acc.syncDevices['device-b'].expiresAt = '2099-01-01T00:00:00Z';
await store.set(accountKey,JSON.stringify(acc));
await denied(B);
assert.equal(await validSession({h:sha('x')},'x'),false,'missing issuance fails closed');
assert.equal(await validSession({h:sha('x'),at:'invalid'},'x'),false);

const memory = new Map();
let offline = false;
const client = createAuthClient({storage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>{memory.set(k,v);},removeItem:k=>{memory.delete(k);}},createDeviceId:()=> 'client-device',fetch:async (_url,init)=>{
  if(offline) throw new Error('offline');
  const response = await call(auth,JSON.parse(init.body));
  return {ok:response.statusCode<400,status:response.statusCode,json:async()=>response.body};
}});
await client.sendCode(email);
// Use a fresh code directly from the local handler; no real email is sent.
const code = (await call(auth,{action:'send',email})).body.devCode;
await client.verifyCode({email,code});
const clientFields = await client.authFields();
offline = true;
await assert.rejects(client.logout(),/offline/);
assert.ok(await client.getSession(),'failed remote logout retains session for retry');
assert.equal(await client.restoreSession(true),null);
assert.ok(await client.getSession(),'network restore failure preserves stored session');
offline = false;
await client.logout();
assert.equal(await client.getSession(),null);
assert.equal((await call(auth,{action:'status',...clientFields})).statusCode,403);
assert.equal(await client.getOrCreateDeviceId(),'client-device');
console.log('Core auth session lifecycle OK');

// A backend outage is not proof that the credentials are invalid.
const originalGet = store.get;
store.get = async key => {if(key===accountKey) throw new Error('store offline');return originalGet.call(store,key);};
try {
  assert.equal((await call(auth,{action:'logout',...nextA})).statusCode,503);
  assert.equal((await call(auth,{action:'status',...nextA})).statusCode,503);
} finally {store.get=originalGet;}
assert.equal((await call(auth,{action:'status',...nextA})).statusCode,200);

// Late responses cannot resurrect logout or wipe a newer identity.
async function race(pendingAction, work, result){
  let release, started;
  const ready = new Promise(resolve=>{started=resolve;});
  const local = new Map([['appbase.auth.session',JSON.stringify({...nextA,handle:'',locale:'ru',sub:null,premium:false,owned:[],fresh:false})]]);
  const api = createAuthClient({storage:{getItem:k=>local.get(k)??null,setItem:(k,v)=>{local.set(k,v);},removeItem:k=>{local.delete(k);}},createDeviceId:()=>nextA.deviceId,fetch:async (_url,init)=>{
    const body = JSON.parse(init.body);
    if(body.action===pendingAction){started();return new Promise(resolve=>{release=resolve;});}
    return {ok:true,status:200,json:async()=>body.action==='verify'?{ok:true,syncToken:'new-identity-token'}:{ok:true}};
  }});
  const pending = pendingAction==='status' ? (result.status===403?api.restoreSession(true):api.status()) : api.logout();
  await ready;
  await work(api);
  release({ok:result.status<400,status:result.status,json:async()=>result.body});
  await pending;
  return api.getSession();
}
assert.equal(await race('status',api=>api.logout(),{status:200,body:{ok:true,premium:true}}),null);
assert.equal((await race('logout',api=>api.verifyCode({email:'new@example.com',code:'123456'}),{status:200,body:{ok:true}})).email,'new@example.com');
assert.equal((await race('status',api=>api.verifyCode({email:'new@example.com',code:'123456'}),{status:403,body:{error:'bad_sync_token'}})).email,'new@example.com');

// Dispatch never contacts a push provider for a revoked or expired device.
const { sendPushToAccountHash } = require('../server/push');
acc = JSON.parse(snapshot);
acc.pushDevices = {'device-a':{platform:'android',token:'unused-push-token'},'device-b':{platform:'ios',token:'unused-push-token'}};
acc.syncDevices['device-b'].at = new Date(Date.now()-SESSION_TTL*1000-1).toISOString();
await store.set(accountKey,JSON.stringify(acc));
assert.deepEqual(await sendPushToAccountHash(sha(email).slice(0,32),{title:'Private update'}),{sent:0,failed:0,removed:0});
console.log('Core session outage/race/push regressions OK');

// AuthStorage can be asynchronous: logout waits for an already-started verification commit.
let releaseWrite, announceWrite;
const writeStarted = new Promise(resolve=>{announceWrite=resolve;});
const asyncLocal = new Map();
const storageCalls = [];
const asyncClient = createAuthClient({storage:{getItem:k=>asyncLocal.get(k)??null,setItem:async (k,v)=>{
  if(k==='appbase.auth.session'){announceWrite();await new Promise(resolve=>{releaseWrite=resolve;});}
  asyncLocal.set(k,v);
},removeItem:k=>{asyncLocal.delete(k);}},createDeviceId:()=> 'async-device',fetch:async (_url,init)=>{
  const body=JSON.parse(init.body);storageCalls.push(body);
  return {ok:true,status:200,json:async()=>body.action==='verify'?{ok:true,syncToken:'async-token'}:{ok:true}};
}});
const writing = asyncClient.verifyCode({email,code:'123456'});
await writeStarted;
const signout = asyncClient.logout();
releaseWrite();
await Promise.all([writing,signout]);
assert.equal(await asyncClient.getSession(),null);
assert.equal(storageCalls.at(-1).action,'logout');
assert.equal(storageCalls.at(-1).syncToken,'async-token');
console.log('Core async storage logout regression OK');

const unconfirmedLocal = new Map([['appbase.auth.session',JSON.stringify({...nextA,handle:'',locale:'ru',sub:null,premium:false,owned:[],fresh:false})]]);
const unconfirmed = createAuthClient({storage:{getItem:k=>unconfirmedLocal.get(k)??null,setItem:(k,v)=>{unconfirmedLocal.set(k,v);},removeItem:k=>{unconfirmedLocal.delete(k);}},fetch:async()=>({ok:true,status:200,json:async()=>({})})});
await assert.rejects(unconfirmed.logout(),/logout_unconfirmed/);
assert.ok(await unconfirmed.getSession(),'empty successful HTTP response does not prove server logout');
console.log('Core logout confirmation regression OK');

// Sessions list, sign out one device, sign out everywhere but here; email change moves the whole account.
{
  const { createAuthHandler } = require('../server/auth-core');
  const analytics = require('../template/lib/app-analytics');
  const plain = auth;
  const withChange = createAuthHandler({analytics, emailChange:true});
  const mail = 'sessions-list@example.com', key = 'a:' + sha(mail).slice(0, 32);
  async function enter(handler, address, deviceId, ua){
    const sent = await call(handler,{action:'send',email:address});
    const res = {statusCode:0,setHeader(){},end(raw){this.body=JSON.parse(raw);}};
    await handler({method:'POST',headers:{'user-agent':ua},query:{},body:{action:'verify',email:address,code:sent.body.devCode,deviceId,platform:'web'}},res);
    assert.equal(res.statusCode,200);
    return {email:address,deviceId,syncToken:res.body.syncToken};
  }
  const mac = await enter(plain, mail, 'dev-mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Chrome/130.0 Safari/537.36');
  const phone = await enter(plain, mail, 'dev-phone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
  const tablet = await enter(plain, mail, 'dev-tab', 'Mozilla/5.0 (Linux; Android 15) Firefox/131.0');
  const listed = await call(plain,{action:'sessions',...mac});
  assert.equal(listed.statusCode,200);
  assert.equal(listed.body.sessions.length,3);
  assert.equal(listed.body.sessions[0].current,true,'this device first');
  assert.equal(listed.body.sessions[0].label,'Chrome · Mac');
  assert.deepEqual(listed.body.sessions.slice(1).map(s=>s.label).sort(),['Android','iPhone']);
  assert.ok(listed.body.sessions.every(s=>/^[0-9a-f]{16}$/.test(s.id)&&!JSON.stringify(s).includes('dev-')),'device ids never leave the server');
  assert.equal((await call(plain,{action:'sessions',...mac,syncToken:'wrong'})).statusCode,403);
  const phoneId = listed.body.sessions.find(s=>s.label==='iPhone').id;
  assert.equal((await call(plain,{action:'session_revoke',...mac,target:listed.body.sessions[0].id})).statusCode,400,'own session ends with logout');
  assert.equal((await call(plain,{action:'session_revoke',...mac,target:'0000000000000000'})).statusCode,404);
  assert.equal((await call(plain,{action:'session_revoke',...mac,target:phoneId})).statusCode,200);
  assert.equal((await call(plain,{action:'status',...phone})).statusCode,403,'revoked device is out');
  assert.equal((await call(plain,{action:'status',...tablet})).statusCode,200);
  const others = await call(plain,{action:'sessions_revoke_others',...mac});
  assert.equal(others.body.revoked,1);
  assert.equal((await call(plain,{action:'status',...tablet})).statusCode,403);
  assert.equal((await call(plain,{action:'status',...mac})).statusCode,200,'this device stays');
  assert.equal((await call(plain,{action:'sessions',...mac})).body.sessions.length,1);

  // Email change: off unless the product opts in; the code goes to the new address; the account moves.
  assert.equal((await call(plain,{action:'email_change_send',...mac,newEmail:'moved@example.com'})).statusCode,400);
  const other = await enter(plain, 'taken@example.com', 'dev-x', '');
  assert.equal((await call(withChange,{action:'email_change_send',...mac,newEmail:'taken@example.com'})).statusCode,409);
  assert.equal((await call(withChange,{action:'email_change_send',...mac,newEmail:mail})).statusCode,400);
  assert.equal((await call(withChange,{action:'email_change_send',...mac,newEmail:'x'})).statusCode,400);
  assert.equal((await call(withChange,{action:'email_change_send',...mac,syncToken:'bad',newEmail:'moved@example.com'})).statusCode,403);
  const acc0 = JSON.parse(await store.get(key));acc0.handle='@mover';await store.set(key,JSON.stringify(acc0));await store.set('h:@mover',sha(mail).slice(0,32));
  const sent = await call(withChange,{action:'email_change_send',...mac,newEmail:'Moved@Example.com'});
  assert.equal(sent.statusCode,200);
  assert.equal((await call(withChange,{action:'email_change_verify',...mac,newEmail:'other@example.com',code:sent.body.devCode})).statusCode,410,'code is for that address only');
  assert.equal((await call(withChange,{action:'email_change_verify',...mac,newEmail:'moved@example.com',code:'000000'})).statusCode,403);
  assert.equal((await call(plain,{action:'status',...mac})).statusCode,200,'old address works until confirmed');
  const done = await call(withChange,{action:'email_change_verify',...mac,newEmail:'moved@example.com',code:sent.body.devCode});
  assert.equal(done.statusCode,200);
  assert.equal(done.body.email,'moved@example.com');
  assert.equal(await store.get(key),null,'old record gone');
  const moved = JSON.parse(await store.get('a:' + sha('moved@example.com').slice(0, 32)));
  assert.equal(moved.email,'moved@example.com');
  assert.equal(moved.keyHash,sha(mail).slice(0,32),'first hash kept for product data');
  assert.equal(await store.get('h:@mover'),sha('moved@example.com').slice(0,32));
  assert.equal((await call(plain,{action:'status',...mac,email:'moved@example.com'})).statusCode,200,'same device session under the new address');
  assert.notEqual((await call(plain,{action:'status',...mac})).statusCode,200,'old address no longer signs in');
  assert.equal((await call(plain,{action:'status',...other})).statusCode,200);

  // Client: the stored session follows the new address.
  const local = new Map();
  const c = createAuthClient({storage:{getItem:k=>local.get(k)??null,setItem:(k,v)=>{local.set(k,v);},removeItem:k=>{local.delete(k);}},createDeviceId:()=>'dev-client',fetch:async (_u,init)=>{
    const r = await call(withChange,JSON.parse(init.body));return {ok:r.statusCode<400,status:r.statusCode,json:async()=>r.body};}});
  const code1 = (await call(withChange,{action:'send',email:'client-move@example.com'})).body.devCode;
  await c.verifyCode({email:'client-move@example.com',code:code1});
  assert.equal((await c.sessions()).length,1);
  const s1 = await c.changeEmailStart('client-new@example.com');
  const after = await c.changeEmailConfirm('client-new@example.com',String(s1.devCode));
  assert.equal(after.email,'client-new@example.com');
  assert.equal((await c.getSession()).email,'client-new@example.com');
  assert.equal(await c.revokeOtherSessions(),0);
  console.log('Core sessions list / revoke / email change OK');
}
