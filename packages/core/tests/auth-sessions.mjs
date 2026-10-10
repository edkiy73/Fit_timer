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
