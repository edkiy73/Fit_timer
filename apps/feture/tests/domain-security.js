/* Stable privacy boundary: real Core account/device tokens, isolated process memory store.
   Transport fixtures exercise unauthorized access and DTO filtering without production secrets. */
'use strict';
process.env.ALLOW_MEMORY_STORE='1';
process.env.APPBASE_STORE='redis';
// This test process must never pick up credentials for a real remote store.
for(const key of ['KV_REST_API_URL','KV_REST_API_TOKEN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','REDIS_REST_URL','REDIS_REST_TOKEN','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'])delete process.env[key];
require('../lib/product');
const { test }=require('node:test');
const assert=require('node:assert/strict');
const { createHash }=require('node:crypto');
const { Readable }=require('node:stream');
const { store }=require('../../../packages/core/server/store');
const { authenticate }=require('../lib/feture/identity');
const { requireOwner,requireAdult }=require('../lib/feture/permissions');
const { createRepository }=require('../lib/feture/repository');
const { createHandler }=require('../lib/feture/handler');
const { command,cursorFor }=require('../lib/feture/validation');
const sha=value=>createHash('sha256').update(value).digest('hex');
const identities={alice:{email:'alice@example.com',device:'alice-device',token:'a-secret-device-token'},bob:{email:'bob@example.com',device:'bob-device',token:'b-secret-device-token'}};
for(const identity of Object.values(identities))identity.hash=sha(identity.email).slice(0,32);
async function seed(identity) {await store.set('a:'+identity.hash,JSON.stringify({email:identity.email,syncDevices:{[identity.device]:{h:sha(identity.token),at:new Date().toISOString()}}}));}
function req(identity,body={action:'profile.get'}) {
  const request=Readable.from([]);request.method='POST';request.body=body;
  request.headers=identity?{'x-fit-email':identity.email,'x-fit-device':identity.device,'x-fit-token':identity.token}:{};return request;
}
function response() {return {statusCode:0,headers:{},body:'',setHeader(name,value){this.headers[name]=value;},end(value){this.body=value;}};}
async function setup(options={}) {
  const calls=[],events=[];
  for(const identity of Object.values(identities))await seed(identity);
  const transport={configured:()=>true,request:async path=>{
    calls.push(path);if(options.failure)throw new Error('URL key email leaked DB detail');
    const selected=new URLSearchParams(path.split('?')[1]);
    const hash=selected.get('account_hash').slice(3);
    const row={account_hash:options.foreignRow?identities.bob.hash:hash,display_name:hash===identities.alice.hash?'Алиса':'Боб',about:'Личная запись владельца',created_at:'2026-10-10T00:00:00Z',updated_at:'2026-10-10T00:00:00Z',email:'never expose',syncToken:'never expose',dating_enabled:true};
    return new Response(JSON.stringify(options.empty?[]:[row]));
  }};
  const repository=createRepository(transport);
  const handler=createHandler({store,repository,cors:()=>false,quota:async()=>options.quota!==false,audit:event=>events.push(event)});
  const invoke=async request=>{const res=response();await handler(request,res);return {...res,json:JSON.parse(res.body)};};
  return {invoke,calls,events,repository};
}
test('guest and mismatched account/token never reach private transport',async()=>{
  const s=await setup();
  for(const identity of [null,{...identities.bob,token:identities.alice.token},{...identities.alice,device:'__proto__'},{...identities.alice,token:'wrong'}, {...identities.alice,email:'unknown@example.com'}]) {
    const result=await s.invoke(req(identity));assert.equal(result.statusCode,401);assert.equal(result.json.error,'auth_required');
  }
  assert.equal(s.calls.length,0);
});
test('client owner/role/age/query claims are rejected, not trusted',async()=>{
  const s=await setup();
  for(const extra of [{accountHash:identities.bob.hash},{ownerHash:identities.bob.hash},{email:identities.bob.email},{verifiedAdult:true},{role:'admin'},{select:'*'},{table:'appbase_kv'}]) {
    const result=await s.invoke(req(identities.alice,{action:'profile.get',...extra}));assert.equal(result.statusCode,422);
  }
  assert.equal(s.calls.length,0);
});
test('owner equality is enforced again in repository/permissions; fabricated actors fail',async()=>{
  const s=await setup();const actor=await authenticate(req(identities.alice),store);
  assert.throws(()=>requireOwner(actor,identities.bob.hash),error=>error.status===404);
  await assert.rejects(s.repository.getProfile({accountHash:identities.bob.hash,verifiedAdult:true}),error=>error.status===401);
  assert.equal(s.calls.length,0);
});
test('separate accounts read only their own fixed query and whitelist DTO',async()=>{
  const s=await setup();
  for(const [identity,name] of [[identities.alice,'Алиса'],[identities.bob,'Боб']]) {
    const result=await s.invoke(req(identity));assert.equal(result.statusCode,200);assert.equal(result.json.profile.displayName,name);
    assert.deepEqual(Object.keys(result.json.profile).sort(),['about','createdAt','displayName','updatedAt']);
    const path=s.calls.at(-1);assert.ok(path.startsWith('/rest/v1/feture_profiles?'));
    const query=new URLSearchParams(path.split('?')[1]);assert.equal(query.get('account_hash'),'eq.'+identity.hash);assert.equal(query.get('limit'),'1');assert.ok(!query.get('select').includes('*'));
    assert.equal(result.headers['Cache-Control'],'no-store');assert.ok(result.json.requestId);
  }
});
test('rotated/revoked device token fails on the next request',async()=>{
  const s=await setup();const identity=identities.alice;
  assert.equal((await s.invoke(req(identity))).statusCode,200);
  await store.set('a:'+identity.hash,JSON.stringify({email:identity.email,syncDevices:{}}));
  assert.equal((await s.invoke(req(identity))).statusCode,401);assert.equal(s.calls.length,1);
});
test('foreign DB rows and transport exceptions fail closed without leaking details',async()=>{
  for(const options of [{foreignRow:true},{failure:true}]) {
    const s=await setup(options);const result=await s.invoke(req(identities.alice));assert.equal(result.statusCode,503);
    assert.equal(result.json.error,'domain_unavailable');assert.ok(!result.body.includes('Личная'));assert.ok(!result.body.includes('leaked'));
  }
});
test('audit payload contains only allowlisted operational fields',async()=>{
  const s=await setup();await s.invoke(req(identities.alice));await s.invoke(req({...identities.alice,token:'wrong'}));
  for(const event of s.events)assert.deepEqual(Object.keys(event).sort(),['action','outcome','requestId']);
  const log=JSON.stringify(s.events);for(const secret of [identities.alice.email,identities.alice.token,identities.alice.hash,'Личная запись'])assert.ok(!log.includes(secret));
});
test('age gate rejects sensitive map reads regardless of caller age flags',async()=>{
  const s=await setup();const actor=await authenticate(req(identities.alice),store);
  assert.throws(()=>requireAdult(actor),error=>error.status===403);
  const result=await s.invoke(req(identities.alice,{action:'interests.list'}));assert.equal(result.statusCode,403);assert.equal(result.json.error,'verification_required');assert.equal(s.calls.length,0);
  await assert.rejects(s.repository.listInterests(actor,{limit:30,after:null}),error=>error.status===403);
  const mutation={action:'interests.set',interestId:'interest-1-1',operationId:'00000000-0000-4000-8000-000000000001',expectedRevision:0,state:{stance:'curious',experience:'none',boundary:'none',intensity:2}};
  assert.equal((await s.invoke(req(identities.alice,mutation))).statusCode,403);
  await assert.rejects(s.repository.mutateInterest(actor,mutation),error=>error.status===403);
  await assert.rejects(s.repository.mutateInterest({accountHash:identities.alice.hash,verifiedAdult:true},mutation),error=>error.status===401);
  assert.equal(s.calls.length,0);
});
test('body/page limits and cursor grammar cannot inject PostgREST filters',async()=>{
  const s=await setup();
  for(const body of [{action:'profile.get',padding:'x'.repeat(4096)},{action:'interests.list',limit:10000},{action:'interests.list',cursor:cursorFor('eq.any,or=(account_hash.neq.x)')},{action:'interests.list',cursor:42},{action:'profile.get',__proto__:{ownerHash:identities.bob.hash}}]) {
    const result=await s.invoke(req(identities.alice,body));assert.ok([413,422].includes(result.statusCode));
  }
  assert.equal(s.calls.length,0);
  assert.deepEqual(command({action:'interests.list',cursor:cursorFor('interest-2-12'),limit:50}),{action:'interests.list',limit:50,after:'interest-2-12'});
});
test('missing backend and quota refusal do not cause unbounded or fake successful reads',async()=>{
  const s=await setup({quota:false});const result=await s.invoke(req(identities.alice));assert.equal(result.statusCode,429);assert.equal(result.headers['Retry-After'],'60');assert.equal(s.calls.length,0);
  const actor=await authenticate(req(identities.alice),store);
  await assert.rejects(createRepository({configured:()=>false,request:async()=>{throw Error('must not call');}}).getProfile(actor),error=>error.status===503);
  assert.equal((await(await setup({empty:true})).invoke(req(identities.alice))).json.profile,null);
});

test('deployed composition rejects guests and reports unavailable private backend',async()=>{
  const handler=require('../api/domain');
  const guest=response();await handler(req(null),guest);assert.equal(guest.statusCode,401);
  await seed(identities.alice);
  const signedIn=response();await handler(req(identities.alice),signedIn);assert.equal(signedIn.statusCode,503);
  assert.equal(JSON.parse(signedIn.body).error,'domain_unavailable');
});

test('global account quota survives IP/device changes; counter outage fails closed',async()=>{
  const handler=require('../api/domain');await seed(identities.alice);
  const key=`rl:feture-domain-account:${identities.alice.hash}:${Math.floor(Date.now()/60000)}`;
  await store.set(key,'120',65);
  const request=req(identities.alice);request.headers['x-forwarded-for']='198.51.100.10';
  const res=response();await handler(request,res);assert.equal(res.statusCode,429);
  const original=store.incr;store.incr=async()=>{throw Error('secret counter error');};
  try {const unavailable=response();await handler(req(identities.alice),unavailable);assert.equal(unavailable.statusCode,503);assert.equal(JSON.parse(unavailable.body).error,'quota_unavailable');}
  finally {store.incr=original;}
});

test('expired and tombstoned Core sessions cannot read FetUre even after stale account write',async()=>{
  const s=await setup(),identity=identities.alice,key='a:'+identity.hash;
  const snapshot=await store.get(key),account=JSON.parse(snapshot);
  account.syncDevices[identity.device].at=new Date(Date.now()-91*24*3600*1000).toISOString();
  await store.set(key,JSON.stringify(account));
  assert.equal((await s.invoke(req(identity))).statusCode,401);
  await store.set(key,snapshot);
  const revokedKey='session:revoked:'+sha(identity.token);
  await store.set(revokedKey,'1',60);
  try {
    await store.set(key,snapshot);
    assert.equal((await s.invoke(req(identity))).statusCode,401);
    assert.equal(s.calls.length,0);
  } finally {await store.del(revokedKey);}
});

test('settings sync cannot return or overwrite obsolete sensitive documents, including premium pulls',async()=>{
  const handler=require('../api/sync'),identity=identities.alice;
  await seed(identity);
  const key='a:'+identity.hash,account=JSON.parse(await store.get(key));account.sub={until:'2099-01-01T00:00:00Z'};await store.set(key,JSON.stringify(account));
  const secret='private obsolete condition text',settingsKey='sa:'+identity.hash+':settings',oldKey='sa:'+identity.hash+':interest-map';
  const meta=storeKey=>({rev:1,at:new Date().toISOString(),schema:1,deviceId:identity.device,deleted:false,storeKey});
  await store.set(settingsKey,'{"locale":"ru"}');await store.set(oldKey,secret);
  await store.set('s:'+identity.hash,JSON.stringify({v:2,profiles:{old:{user:{id:'old',name:'obsolete private profile'},docs:{map:meta(oldKey)}}},accountDocs:{settings:meta(settingsKey),'interest-map':meta(oldKey)}}));
  const body=action=>({action,email:identity.email,deviceId:identity.device,token:identity.token});
  const pulled=response();await handler(req(identity,body('pull')),pulled);
  assert.equal(pulled.statusCode,200);const data=JSON.parse(pulled.body);
  assert.deepEqual(data.profiles,[]);assert.deepEqual(data.accountDocs.map(d=>d.key),['settings']);assert.ok(!pulled.body.includes(secret));
  const pushed=response();await handler(req(identity,{...body('push'),docs:[{profileId:'__account__',key:'interest-map',baseRev:1,rev:2,value:'new forbidden value'}]}),pushed);
  assert.equal(await store.get(oldKey),secret);
  const denied=response();await handler(req(null,{...body('pull'),token:'foreign-token'}),denied);assert.equal(denied.statusCode,403);
});

test('verification status is authenticated, read-only and cannot grant adult access',async()=>{
 const s=await setup();
 const result=await s.invoke(req(identities.alice,{action:'verification.status'}));
 assert.equal(result.statusCode,200);
 assert.deepEqual(result.json.status,{state:'unavailable',verifiedAdult:false,validUntil:null,reason:'provider_not_configured'});
 assert.equal(result.headers['Cache-Control'],'no-store');
 assert.equal((await s.invoke(req(null,{action:'verification.status'}))).statusCode,401);
 for(const extra of [{verifiedAdult:true},{ownerHash:identities.bob.hash},{role:'admin'}])assert.equal((await s.invoke(req(identities.alice,{action:'verification.status',...extra}))).statusCode,422);
 assert.equal((await s.invoke(req(identities.alice,{action:'verification.verify'}))).statusCode,422);
 assert.equal((await s.invoke(req(identities.alice,{action:'interests.list'}))).json.error,'verification_required');
 assert.throws(()=>require('../lib/feture/verification').verificationStatus({accountHash:identities.alice.hash,verifiedAdult:true}),error=>error.status===401);
 assert.equal(s.calls.length,0);
});
