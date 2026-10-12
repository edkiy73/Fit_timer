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

test('W07 comparison API: adult guard, forged consent rejection and closed pending/active DTO',async()=>{
 const {createShareRepository}=require('../lib/feture/shares');
 const identity=identities.alice;await seed(identity);
 const actor=await authenticate(req(identity),store,async()=>new Date(Date.now()+3600000).toISOString());
 const unverified=await authenticate(req(identity),store);
 const id='00000000-0000-4000-8000-000000000001';
 const meta={id,linkId:id,role:'owner',state:'pending',revision:1,expiresAt:new Date(Date.now()+3600000).toISOString()};
 let reply={ok:true,comparison:meta,myItems:[{title:'Тема',stance:'curious'}],items:null};
 const calls=[];
 const repository=createShareRepository({configured:()=>true,request:async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});return new Response(JSON.stringify(reply));}},{requireCurrent:async()=>{}});
 const read={action:'share.compare.read',comparisonId:id};
 await assert.rejects(repository.execute(unverified,read),e=>e.code==='verification_required');assert.equal(calls.length,0);
 for(const extra of [{ownerHash:identity.hash},{reviewed:true},{guestSnapshot:[{title:'SECRET'}]}])assert.throws(()=>command({...read,...extra}),e=>e.status===422);
 assert.equal((await repository.execute(actor,read)).items,null);
 assert.equal(calls.at(-1).body.p_actor,identity.hash);
 reply={...reply,items:[{title:'SECRET',mine:'curious',theirs:'fantasy'}]};
 await assert.rejects(repository.execute(actor,read),e=>e.status===503);
 reply={...reply,comparison:{...meta,state:'active',revision:2}};
 assert.deepEqual((await repository.execute(actor,read)).items,reply.items);
 reply={...reply,items:[{title:'SECRET',mine:'curious',theirs:'fantasy',boundaryNote:'PRIVATE'}]};
 await assert.rejects(repository.execute(actor,read),e=>e.status===503);
 await assert.rejects(repository.execute({accountHash:identity.hash,verifiedAdult:true},read),e=>e.status===401);
});

test('C01 posts API: trusted actor, adult guard, forged publish and private DTO rejection',async()=>{
 const {createPostsRepository}=require('../lib/feture/posts');await seed(identities.alice);
 const actor=await authenticate(req(identities.alice),store,async()=>new Date(Date.now()+3600000).toISOString());
 const unverified=await authenticate(req(identities.alice),store),calls=[];
 const id='00000000-0000-4000-8000-000000000005';
 let entry={id,text:'Текст',kind:'text',authorLabel:'Имя',audience:'private',plannedAudience:'public',recipientCodes:[],state:'draft',revision:1,createdAt:'2026-10-11T00:00:00Z',updatedAt:'2026-10-11T00:00:00Z',publishedAt:null,mine:true};
 const repository=createPostsRepository({configured:()=>true,request:async(path,opts)=>{calls.push(JSON.parse(opts.body));return new Response(JSON.stringify({ok:true,entry,replayed:false}));}},{requireCurrent:async()=>{}});
 const save={action:'posts.save',id,operationId:id,expectedRevision:0,text:'Текст',kind:'text',authorLabel:'Имя',plannedAudience:'public',recipientCodes:[]};
 await assert.rejects(repository.execute(unverified,save),e=>e.code==='verification_required');assert.equal(calls.length,0);
 for(const extra of [{authorHash:'secret'},{state:'published'},{audience:'granted'},{testAnswers:[]}])assert.throws(()=>command({...save,...extra}),e=>e.status===422);
 assert.throws(()=>command({action:'posts.publish',id}),e=>e.status===422);
 assert.equal((await repository.execute(actor,save)).entry.mine,true);assert.equal(calls[0].p_actor,identities.alice.hash);
 entry={...entry,account_hash:'SECRET'};await assert.rejects(repository.execute(actor,save),e=>e.status===503);delete entry.account_hash;
 entry={...entry,mine:false};await assert.rejects(repository.execute(actor,{action:'posts.read',id}),e=>e.status===503);
 await assert.rejects(repository.execute({accountHash:identities.alice.hash,verifiedAdult:true},save),e=>e.status===401);
});

test('C02 muted feed: server-side prefiltered RPC with strict public DTO',async()=>{
 const {createPostsRepository}=require('../lib/feture/posts');
 await seed(identities.alice);
 const actor=await authenticate(req(identities.alice),store,async()=>new Date(Date.now()+3600000).toISOString());
 const unverified=await authenticate(req(identities.alice),store);
 const id='00000000-0000-4000-8000-000000000005',at='2026-10-12T09:00:00Z';
 let entry={id,text:'Публичная история',kind:'text',authorLabel:'Автор',audience:'public',plannedAudience:'public',
  recipientCodes:[],state:'published',revision:1,createdAt:at,updatedAt:at,publishedAt:at,mine:false};
 let result={ok:true,items:[entry],nextCursor:null},calls=[];
 const repository=createPostsRepository({configured:()=>true,request:async(path,options)=>{
  calls.push({path,body:JSON.parse(options.body)});return new Response(JSON.stringify(result));
 }},{requireCurrent:async()=>{}});
 await assert.rejects(repository.execute(unverified,{action:'posts.feed',cursor:null}),e=>e.code==='verification_required');
 assert.equal(calls.length,0);
 assert.equal((await repository.execute(actor,{action:'posts.feed',cursor:null})).items[0].id,id);
 assert.equal(calls[0].path,'/rest/v1/rpc/feture_post_feed_command');
 assert.equal(calls[0].body.p_actor,identities.alice.hash);
 result={...result,items:[{...entry,account_hash:'PRIVATE'}]};
 await assert.rejects(repository.execute(actor,{action:'posts.feed',cursor:null}),e=>e.status===503);
});

test('C03 catalogue API: verified actor only, exact DTO and no private owner/membership leaks',async()=>{
 const {createGroupsRepository,isGroupsCommand}=require('../lib/feture/groups');
 await seed(identities.alice);
 const adult=await authenticate(req(identities.alice),store,async()=>new Date(Date.now()+3600000).toISOString());
 const unverified=await authenticate(req(identities.alice),store);
 const id='00000000-0000-4000-8000-000000000005',at='2026-10-12T09:00:00Z';
 const group={id,slug:'sample-group',title:'Разговорный клуб',summary:'Открытая аннотация',rules:'Общие правила',visibility:'closed',publishedAt:at};
 let payload={ok:true,items:[group],nextCursor:null};
 const calls=[];
 const repository=createGroupsRepository({configured:()=>true,request:async(path,options)=>{
  calls.push({path,body:JSON.parse(options.body)});return new Response(JSON.stringify(payload));
 }},{requireCurrent:async()=>{}});
 for(const invalid of [{action:'groups.catalog',cursor:null,ownerHash:identities.bob.hash},
  {action:'groups.preview',id,accountHash:identities.bob.hash},
  {action:'groups.catalog',cursor:{at:'not a date',id}},
  {action:'groups.preview',id:'not-uuid'}])
 assert.throws(()=>command(invalid),e=>e.status===422);
 const list={action:'groups.catalog',cursor:null},preview={action:'groups.preview',id};
 assert.equal(isGroupsCommand(command(list)),true);
 await assert.rejects(repository.execute(unverified,list),e=>e.code==='verification_required');
 assert.equal(calls.length,0);
 assert.equal((await repository.execute(adult,list)).items[0].visibility,'closed');
 assert.equal(calls[0].path,'/rest/v1/rpc/feture_group_catalog_command');
 assert.equal(calls[0].body.p_actor,identities.alice.hash);
 assert.deepEqual(calls[0].body.p_command,list);
 payload={ok:true,entry:group};
 assert.equal((await repository.execute(adult,preview)).entry.title,'Разговорный клуб');
 payload={ok:true,entry:{...group,owner_hash:identities.bob.hash}};
 await assert.rejects(repository.execute(adult,preview),e=>e.status===503);
 payload={ok:true,items:[{...group,members:[identities.bob.hash]}],nextCursor:null};
 await assert.rejects(repository.execute(adult,list),e=>e.status===503);
 await assert.rejects(repository.execute({accountHash:identities.alice.hash,verifiedAdult:true},list),e=>e.status===401);
});

test('C02 reaction API: actor-derived ownership and adult/consent guard',async()=>{
 const {createPostsRepository}=require('../lib/feture/posts');
 await seed(identities.alice);
 const actor=await authenticate(req(identities.alice),store,async()=>new Date(Date.now()+3600000).toISOString());
 const unverified=await authenticate(req(identities.alice),store);
 const id='00000000-0000-4000-8000-000000000009',calls=[];
 let response={ok:true,liked:true,likes:1,replayed:false};
 const repository=createPostsRepository({configured:()=>true,request:async(path,options)=>{calls.push({path,input:JSON.parse(options.body)});return new Response(JSON.stringify(response));}},{requireCurrent:async()=>{}});
 const toggle={action:'posts.reactionSet',id,kind:'like',active:true,operationId:id};
 for(const extra of [{accountHash:identities.bob.hash},{actor:identities.bob.hash},{likes:999},{kind:'heart'},{active:'true'}])
 assert.throws(()=>command({...toggle,...extra}),e=>e.status===422);
 await assert.rejects(repository.execute(unverified,toggle),e=>e.code==='verification_required');
 assert.equal(calls.length,0);
 assert.deepEqual(await repository.execute(actor,toggle),{liked:true,likes:1,replayed:false});
 assert.equal(calls[0].path,'/rest/v1/rpc/feture_post_reaction_command');
 assert.equal(calls[0].input.p_actor,identities.alice.hash);
 response={ok:true,liked:true,likes:1};
 assert.deepEqual(await repository.execute(actor,{action:'posts.reactionState',id}),{liked:true,likes:1});
 response={...response,accountHash:'leak'};
 await assert.rejects(repository.execute(actor,{action:'posts.reactionState',id}),e=>e.status===503);
 await assert.rejects(repository.execute({accountHash:identities.alice.hash,verifiedAdult:true},toggle),e=>e.status===401);
});

test('C02 comment API: protected reads, owner-bound pending writes, safe deletion without adult proof',async()=>{
 const {createPostsRepository}=require('../lib/feture/posts');
 await seed(identities.alice);
 const actor=await authenticate(req(identities.alice),store,async()=>new Date(Date.now()+3600000).toISOString());
 const unverified=await authenticate(req(identities.alice),store);
 const id='00000000-0000-4000-8000-000000000011',postId='00000000-0000-4000-8000-000000000012';
 let row={id,postId,parentId:null,text:'Привет',state:'pending',revision:1,mine:true,createdAt:'2026-10-12T09:00:00Z',updatedAt:'2026-10-12T09:00:00Z'};
 let reply=null;
 const calls=[];
 const repository=createPostsRepository({configured:()=>true,request:async(path,options)=>{
  calls.push({path,command:JSON.parse(options.body)});
  return new Response(JSON.stringify(reply??{ok:true,entry:row,replayed:false}));
 }},{requireCurrent:async()=>{}});
 const create={action:'comments.create',id,postId,parentId:null,operationId:id,text:'Привет'};
 for(const extra of [{accountHash:identities.bob.hash},{state:'published'},{parentId:postId,depth:2},{text:'\u0000SECRET'}])
 assert.throws(()=>command({...create,...extra}),e=>e.status===422);
 await assert.rejects(repository.execute(unverified,create),e=>e.code==='verification_required');
 assert.equal(calls.length,0);
 assert.equal((await repository.execute(actor,create)).entry.state,'pending');
 assert.equal(calls[0].path,'/rest/v1/rpc/feture_post_comment_command');
 assert.equal(calls[0].command.p_actor,identities.alice.hash);
 row={...row,account_hash:identities.bob.hash};
 await assert.rejects(repository.execute(actor,create),e=>e.status===503);
 delete row.account_hash;
 await assert.rejects(repository.execute(unverified,{action:'comments.read',id}),e=>e.code==='verification_required');
 row={...row,text:'',state:'deleted',revision:2};
 assert.deepEqual((await repository.execute(unverified,{action:'comments.delete',id,operationId:postId,expectedRevision:1})).entry.text,'');
 await assert.rejects(repository.execute({accountHash:identities.alice.hash,verifiedAdult:true},{action:'comments.delete',id,operationId:postId,expectedRevision:1}),e=>e.status===401);
 // Owner-only archive uses an authenticated Core session without an active adult proof.
 reply={ok:true,items:[{...row,state:'pending',text:'Свой комментарий'}],nextCursor:null};
 const personal=await repository.execute(unverified,{action:'comments.mine',postId,cursor:null});
 assert.equal(personal.items.length,1);
 assert.equal(personal.items[0].text,'Свой комментарий');
 assert.equal(calls.at(-1).path,'/rest/v1/rpc/feture_post_comment_mine');
 assert.equal(calls.at(-1).command.p_actor,identities.alice.hash);
 reply={ok:true,items:[{...row,mine:false,text:'Чужой комментарий'}],nextCursor:null};
 await assert.rejects(repository.execute(unverified,{action:'comments.mine',postId,cursor:null}),e=>e.status===503);

});

test('C02.4 public identity: Core ownership, explicit consent, revoke without adult proof',async()=>{
 const {createPostsRepository}=require('../lib/feture/posts');
 await seed(identities.alice);
 const verified=await authenticate(req(identities.alice),store,async()=>new Date(Date.now()+3600000).toISOString());
 const expired=await authenticate(req(identities.alice),store);
 const id='00000000-0000-4000-8000-000000000009';
 let reply={ok:true,enabled:false,publicAuthorId:null,replayed:false},calls=[];
 const repo=createPostsRepository({configured:()=>true,request:async(path,options)=>{
  calls.push({path,params:JSON.parse(options.body)});
  return new Response(JSON.stringify(reply));
 }},{requireCurrent:async()=>{}});
 const enable={action:'authors.enable',operationId:id,consent:true};
 for(const extra of [{accountHash:identities.bob.hash},{consent:false},{consent:'true'},{publicAuthorId:id},{profileId:id}])
 assert.throws(()=>command({...enable,...extra}),e=>e.status===422);
 assert.deepEqual(await repo.execute(expired,{action:'authors.status'}),{enabled:false,publicAuthorId:null,replayed:false});
 assert.equal(calls[0].path,'/rest/v1/rpc/feture_public_author_command');
 assert.equal(calls[0].params.p_actor,identities.alice.hash);
 await assert.rejects(repo.execute(expired,enable),e=>e.code==='verification_required');
 assert.equal(calls.length,1);
 reply={ok:true,enabled:true,publicAuthorId:id,replayed:false};
 assert.deepEqual(await repo.execute(verified,enable),{enabled:true,publicAuthorId:id,replayed:false});
 assert.equal(calls.at(-1).params.p_actor,identities.alice.hash);
 await assert.rejects(repo.execute(expired,{action:'authors.rotate',operationId:id}),e=>e.code==='verification_required');
 reply={ok:true,enabled:false,publicAuthorId:null,replayed:false};
 assert.equal((await repo.execute(expired,{action:'authors.disable',operationId:id})).enabled,false);
 assert.equal(calls.at(-1).params.p_actor,identities.alice.hash);
 reply={...reply,account_hash:'SECRET'};
 await assert.rejects(repo.execute(expired,{action:'authors.status'}),e=>e.status===503);
 assert.throws(()=>command({action:'authors.resolve',postId:id,accountHash:identities.bob.hash}),e=>e.status===422);
 await assert.rejects(repo.execute(expired,{action:'authors.resolve',postId:id}),e=>e.code==='verification_required');
 reply={ok:true,publicAuthorId:null};
 assert.deepEqual(await repo.execute(verified,{action:'authors.resolve',postId:id}),{publicAuthorId:null});
 assert.equal(calls.at(-1).path,'/rest/v1/rpc/feture_public_author_resolve');
 assert.equal(calls.at(-1).params.p_actor,identities.alice.hash);
 assert.equal(calls.at(-1).params.p_post_id,id);
 reply={ok:true,publicAuthorId:id,account_hash:'SECRET'};
 await assert.rejects(repo.execute(verified,{action:'authors.resolve',postId:id}),e=>e.status===503);
 await assert.rejects(repo.execute({accountHash:identities.alice.hash,verifiedAdult:true},{action:'authors.status'}),e=>e.status===401);
});

test('C02.4 relationship API: private owner, replay DTO, eligibility and removal after expiry',async()=>{
 const {createPostsRepository}=require('../lib/feture/posts');
 await seed(identities.alice);
 const verified=await authenticate(req(identities.alice),store,async()=>new Date(Date.now()+3600000).toISOString());
 const expired=await authenticate(req(identities.alice),store);
 const id='00000000-0000-4000-8000-000000000008',postId='00000000-0000-4000-8000-000000000009';
 let reply={ok:true,active:false},calls=[];
 const repo=createPostsRepository({configured:()=>true,request:async(path,opts)=>{
  calls.push({path,params:JSON.parse(opts.body)});
  return new Response(JSON.stringify(reply));
 }},{requireCurrent:async()=>{}});
 const state={action:'relationships.state',kind:'follow',postId,publicAuthorId:id};
 const set={action:'relationships.set',kind:'follow',postId,publicAuthorId:id,active:true,operationId:id};
 for(const extra of [{accountHash:identities.bob.hash},{kind:'something'},{profileId:id},{targetHash:identities.bob.hash},{postId:null}])
 assert.throws(()=>command({...set,...extra}),e=>e.status===422);
 await assert.rejects(repo.execute(expired,state),e=>e.code==='verification_required');
 await assert.rejects(repo.execute(expired,set),e=>e.code==='verification_required');
 await assert.rejects(repo.execute(expired,{action:'relationships.mine',kind:'follow',cursor:null}),e=>e.code==='verification_required');
 assert.equal(calls.length,0);
 assert.deepEqual(await repo.execute(verified,state),{active:false});
 assert.equal(calls[0].path,'/rest/v1/rpc/feture_author_relationship_command');
 assert.equal(calls[0].params.p_actor,identities.alice.hash);
 reply={ok:true,active:true,replayed:false};
 assert.deepEqual(await repo.execute(verified,set),{active:true,replayed:false});
 assert.equal(calls.at(-1).params.p_command.publicAuthorId,id);
 const remove={...set,postId:null,active:false};
 reply={ok:true,active:false,replayed:false};
 assert.deepEqual(await repo.execute(expired,remove),{active:false,replayed:false});
 assert.equal(calls.at(-1).params.p_actor,identities.alice.hash);
 assert.throws(()=>command({...remove,postId}),e=>e.status===422);
 reply={ok:true,items:[{id,at:'2026-10-12T09:00:00Z'}],nextCursor:null};
 assert.equal((await repo.execute(verified,{action:'relationships.mine',kind:'follow',cursor:null})).items[0].id,id);
 reply={...reply,viewer_hash:'SECRET'};
 await assert.rejects(repo.execute(verified,{action:'relationships.mine',kind:'follow',cursor:null}),e=>e.status===503);
 await assert.rejects(repo.execute({accountHash:identities.alice.hash,verifiedAdult:true},remove),e=>e.status===401);
});

test('C01 post reports: authenticated identity, adult submit and metadata-only own status',async()=>{
 const {createPostsRepository}=require('../lib/feture/posts');await seed(identities.alice);const actor=await authenticate(req(identities.alice),store,async()=>new Date(Date.now()+3600000).toISOString()),unverified=await authenticate(req(identities.alice),store);
 const id='00000000-0000-4000-8000-000000000008',report={id,postId:id,postRevision:3,reason:'privacy',state:'open',revision:1,createdAt:'2026-10-11T00:00:00Z',resolvedAt:null,resolution:null};let reply={ok:true,report,replayed:false};const calls=[];
 const repository=createPostsRepository({configured:()=>true,request:async(path,opts)=>{calls.push({path,body:JSON.parse(opts.body)});return new Response(JSON.stringify(reply));}},{requireCurrent:async()=>{}}),cmd={action:'posts.report',id,reportId:id,expectedRevision:3,reason:'privacy',note:'Private explanation'};
 await assert.rejects(repository.execute(unverified,cmd),e=>e.code==='verification_required');assert.equal(calls.length,0);for(const extra of [{reporterHash:identities.alice.hash},{snapshot:'PRIVATE'},{state:'resolved'}])assert.throws(()=>command({...cmd,...extra}),e=>e.status===422);
 assert.equal((await repository.execute(actor,cmd)).report.state,'open');assert.equal(calls[0].body.p_actor,identities.alice.hash);assert.equal(calls[0].path,'/rest/v1/rpc/feture_post_report_command');
 reply={ok:true,items:[report],nextCursor:null};assert.equal((await repository.execute(unverified,{action:'posts.reports',cursor:null})).items.length,1);
 reply={ok:true,items:[{...report,text:'HIDDEN PARENT'}],nextCursor:null};await assert.rejects(repository.execute(actor,{action:'posts.reports',cursor:null}),e=>e.status===503);
 await assert.rejects(repository.execute({accountHash:identities.alice.hash,verifiedAdult:true},cmd),e=>e.status===401);
});


test('C01 selected audience: strict codes, owner-only recipient projection and authenticated revocation without adult proof',async()=>{
 const {createPostsRepository}=require('../lib/feture/posts');await seed(identities.alice);
 const actor=await authenticate(req(identities.alice),store),id='00000000-0000-4000-8000-000000000015',code='00000000-0000-4000-8000-000000000016';
 let reply={ok:true,code,replayed:false};const calls=[];
 const repository=createPostsRepository({configured:()=>true,request:async(path,opts)=>{calls.push({path,body:JSON.parse(opts.body)});return new Response(JSON.stringify(reply));}},{requireCurrent:async()=>{throw new Error('guard_must_not_block_revocation');}});
 assert.equal((await repository.execute(actor,{action:'posts.address'})).code,code);
 assert.equal(calls[0].path,'/rest/v1/rpc/feture_post_address_command');assert.equal(calls[0].body.p_actor,identities.alice.hash);
 for(const cmd of [{action:'posts.address',accountHash:'secret'},{action:'posts.rotateAddress',operationId:id,recipientHash:'secret'},{action:'posts.save',id,operationId:id,expectedRevision:0,text:'Text',kind:'text',authorLabel:'Name',plannedAudience:'granted',recipientCodes:[code,code]}])assert.throws(()=>command(cmd),e=>e.status===422);
 const entry={id,text:'Text',kind:'text',authorLabel:'Name',audience:'granted',plannedAudience:'granted',recipientCodes:[],state:'published',revision:4,createdAt:'2026-10-11T00:00:00Z',updatedAt:'2026-10-11T00:00:00Z',publishedAt:'2026-10-11T00:00:00Z',mine:true};
 reply={ok:true,entry,replayed:false};assert.equal((await repository.execute(actor,{action:'posts.revokeRecipient',id,operationId:id,expectedRevision:3,code})).entry.revision,4);
 reply={ok:true,entry:{...entry,mine:false,recipientCodes:[code]}};await assert.rejects(repository.execute(actor,{action:'posts.read',id}),e=>e.status===503);
 await assert.rejects(repository.execute({accountHash:identities.alice.hash},{action:'posts.rotateAddress',operationId:id}),e=>e.status===401);
});

test('selected questionnaire copy rejects private/client-derived fields and closed server preview',async()=>{
 const {postCommand,createPostsRepository}=require('../lib/feture/posts');
 await seed(identities.alice);const actor=await authenticate(req(identities.alice),store,async()=>new Date(Date.now()+3600000).toISOString());
 const id='00000000-0000-4000-8000-000000003000';
 const base={action:'posts.fromTest',attemptId:id,versionId:id,expectedAttemptRevision:2,projectionHash:'a'.repeat(64),id,operationId:id,selected:['connection'],authorLabel:'Имя',plannedAudience:'public',recipientCodes:[],consent:true};
 assert.deepEqual(postCommand(base),base);
 for(const invalid of [{...base,consent:false},{...base,answers:{}},{...base,text:'raw'},{...base,selected:[]},{...base,selected:['connection','connection']},{...base,expectedAttemptRevision:0},{...base,recipientCodes:[id]},{...base,plannedAudience:'granted'}])assert.throws(()=>postCommand(invalid),e=>e.status===422);
 let reply={ok:true,preview:{attemptId:id,attemptRevision:2,versionId:id,projectionHash:'a'.repeat(64),items:[{id:'connection',title:'Связь',summary:'Выбранный вывод.'}]}};const paths=[];
 const repository=createPostsRepository({configured:()=>true,request:async(path)=>{paths.push(path);return new Response(JSON.stringify(reply));}},{requireCurrent:async()=>{}});
 const preview={action:'posts.testPreview',attemptId:id};assert.deepEqual((await repository.execute(actor,preview)).preview,reply.preview);assert.equal(paths[0],'/rest/v1/rpc/feture_test_share_command');
 reply={...reply,preview:{...reply.preview,answers:{private:['choice']}}};await assert.rejects(repository.execute(actor,preview),e=>e.status===503);
 await assert.rejects(repository.execute({accountHash:identities.alice.hash},preview),e=>e.status===401);
});

test('private photo upload strips metadata, freezes retries, checks access twice and never returns paths',async()=>{
 const sharp=require('sharp');const {normalizePhoto,createPhotoRepository,photoCommand,cleanupPhotoObjects}=require('../lib/feture/post-photos');
 const {readBody,MAX_BODY}=require('../lib/feture/validation');
 const original=await sharp({create:{width:1200,height:600,channels:3,background:'#cc3366'}}).withMetadata().jpeg().toBuffer();
 const normalized=await normalizePhoto(original.toString('base64')),meta=await sharp(normalized.data).metadata();
 assert.equal(meta.width,1024);assert.equal(meta.height,512);assert.equal(meta.exif,undefined);assert.equal(meta.icc,undefined);
 await assert.rejects(normalizePhoto(Buffer.from('<svg/>').toString('base64')),e=>e.code==='invalid_image');
 const id='00000000-0000-4000-8000-000000004000',operationId='00000000-0000-4000-8000-000000004002',cmd={action:'photo.put',id,operationId,expectedRevision:1,image:original.toString('base64'),consent:true};
 for(const changed of [{...cmd,consent:false},{...cmd,url:'https://foreign'},{...cmd,image:'not a base64 file'},{...cmd,accountHash:identities.bob.hash}])assert.throws(()=>photoCommand(changed),e=>e.status===422);
 await assert.rejects(readBody(req(identities.alice,{action:'profile.get',extra:'a'.repeat(MAX_BODY)})),e=>e.status===413);
 assert.equal((await readBody(req(identities.alice,{...cmd,image:'A'.repeat(20000)}))).action,'photo.put');
 await seed(identities.alice);const actor=await authenticate(req(identities.alice),store,async()=>new Date(Date.now()+3600000).toISOString());
 const entry={id,text:'Текст',kind:'text',authorLabel:'Имя',audience:'private',state:'draft',revision:2,createdAt:'2026-10-11T00:00:00Z',updatedAt:'2026-10-11T00:00:00Z',publishedAt:null,mine:true,plannedAudience:'public',recipientCodes:[]};
 const objectPath=id+'/'+operationId+'.jpg',descriptor={path:objectPath,hash:sha(normalized.data),bytes:normalized.data.length,width:1024,height:512};
 const calls=[];let replay=false,revoked=false,reads=0;
 const transport={configured:()=>true,request:async(path,options={})=>{calls.push({path,body:options.body});
  if(path==='/rest/v1/rpc/feture_post_photo_command'){const c=JSON.parse(options.body).p_command;if(c.action==='prepare')return new Response(JSON.stringify(replay?{ok:true,upload:false,entry}:{ok:true,upload:true,path:objectPath}));if(c.action==='attach'){replay=true;return new Response(JSON.stringify({ok:true,entry,replayed:false}));}if(c.action==='read'){reads++;return new Response(JSON.stringify(revoked&&reads===2?{ok:false,error:'resource_not_found'}:{ok:true,photo:descriptor}));}}
  if(path.includes('/storage/v1/object/authenticated/'))return new Response(normalized.data);
  if(path.startsWith('/storage/v1/object/')){assert.deepEqual(Buffer.from(options.body),normalized.data);return new Response('{}');}
  if(path.includes('feture_photo_gc'))return new Response('[]');return new Response('{}');
 }};
 const repository=createPhotoRepository(transport,{requireCurrent:async()=>{}});
 assert.equal((await repository.execute(actor,cmd)).entry.revision,2);const uploads=calls.filter(x=>x.path.startsWith('/storage/v1/object/')&&!x.path.includes('authenticated')).length;
 assert.equal((await repository.execute(actor,cmd)).replayed,true);assert.equal(calls.filter(x=>x.path.startsWith('/storage/v1/object/')&&!x.path.includes('authenticated')).length,uploads);
 const result=await repository.execute(actor,{action:'photo.read',id,revision:2});assert.equal(result.photo.mime,'image/jpeg');assert.equal(JSON.stringify(result).includes(objectPath),false);assert.equal(reads,2);
 reads=0;revoked=true;await assert.rejects(repository.execute(actor,{action:'photo.read',id,revision:2}),e=>e.status===404);
 await assert.rejects(repository.execute({...actor},cmd),e=>e.status===401);
 // A failed object erasure must retain its durable outbox item.
 const gcCalls=[];await cleanupPhotoObjects({configured:()=>true,request:async(path)=>{gcCalls.push(path);if(path.includes('?select='))return new Response(JSON.stringify([{object_path:objectPath}]));if(path.startsWith('/storage/'))return new Response('{}',{status:503});return new Response('{}');}});
 assert.equal(gcCalls.some(x=>x.startsWith('/rest/v1/feture_photo_gc?object_path=')),false);
});

test('photo staff-review consent stays owner-only metadata and withdrawal survives closed adult/legal gates',async()=>{
 const {createPhotoRepository,photoCommand}=require('../lib/feture/post-photos');
 const id='00000000-0000-4000-8000-000000004000',operationId='00000000-0000-4000-8000-000000004100';
 const status={postId:id,postRevision:3,revision:1,active:true,hasPhoto:true};
 const grant={action:'photo.reviewConsent',id,operationId,expectedRevision:3,expectedConsentRevision:0,consent:true,consentVersion:'photo-staff-review-v1'};
 for(const invalid of [{...grant,consent:false},{...grant,consentVersion:'other'},Object.fromEntries(Object.entries(grant).filter(([k])=>k!=='consentVersion')),{...grant,path:'foreign.jpg'},{...grant,contentHash:'a'.repeat(64)},{...grant,owner:identities.bob.hash},{...grant,expectedConsentRevision:-1}])assert.throws(()=>photoCommand(invalid),e=>e.status===422);
 await seed(identities.alice);const calls=[];let contaminated=false;
 const transport={configured:()=>true,request:async(path,options)=>{const payload=JSON.parse(options.body);calls.push({path,payload});assert.equal(path,'/rest/v1/rpc/feture_photo_review_command');assert.equal(payload.p_actor,identities.alice.hash);
  const c=payload.p_command;return new Response(JSON.stringify({ok:true,reviewConsent:{...status,active:c.action==='consent',...(contaminated?{contentHash:'SECRET'}:{})},...(c.action==='status'?{}:{replayed:false})}));}};
 const documents={requireCurrent:async()=>{}};const photos=createPhotoRepository(transport,documents);
 const actor=await authenticate(req(identities.alice),store,async()=>new Date(Date.now()+3600000).toISOString());
 assert.equal((await photos.execute(actor,grant)).reviewConsent.active,true);
 const closedActor=await authenticate(req(identities.alice),store);
 const revoke={action:'photo.reviewRevoke',id,operationId,expectedConsentRevision:1};
 assert.equal((await photos.execute(closedActor,revoke)).reviewConsent.active,false);
 assert.equal((await photos.execute(closedActor,{action:'photo.reviewStatus',id})).reviewConsent.postId,id);
 await assert.rejects(photos.execute(closedActor,grant),e=>e.code==='verification_required');
 await assert.rejects(createPhotoRepository(transport,{requireCurrent:async()=>{throw Object.assign(new Error('closed'),{code:'consent_required'});}}).execute(actor,grant),e=>e.code==='consent_required');
 await assert.rejects(photos.execute({...actor},grant),e=>e.status===401);
 const handler=createHandler({store,repository:createRepository(transport),photos,cors:()=>false,quota:async()=>true});
 const res=response();await handler(req(identities.alice,{action:'photo.reviewStatus',id}),res);assert.equal(res.statusCode,200);assert.equal(res.headers['Cache-Control'],'no-store');
 assert.deepEqual(Object.keys(JSON.parse(res.body).reviewConsent).sort(),['active','hasPhoto','postId','postRevision','revision']);
 contaminated=true;await assert.rejects(photos.execute(closedActor,{action:'photo.reviewStatus',id}),e=>e.status===503);
 assert.equal(calls.some(c=>c.path.includes('/storage/')),false);
});

test('staff photo read rechecks consent/role after bounded Storage I/O and only projects JPEG bytes',async()=>{
 const {postReview}=require('../lib/feture/post-review');
 const id='00000000-0000-4000-8000-000000004000',op='00000000-0000-4000-8000-000000004002';
 await store.set('a:'+identities.alice.hash,JSON.stringify({email:identities.alice.email,since:'2026-10-10T00:00:00Z',syncDevices:{[identities.alice.device]:{h:sha(identities.alice.token),at:new Date().toISOString()}}}));
 const actor=await authenticate(req(identities.alice),store),body={action:'feture.posts.photo',id,revision:3};
 const jpeg=Buffer.from([255,216,255,224,1,2,3,4]);
 const descriptor={path:id+'/'+op+'.jpg',hash:sha(jpeg),bytes:jpeg.length,width:2,height:3,consentRevision:1};
 for(const scenario of ['ok','initial_forbidden','second_forbidden','second_resource_not_found','second_review_required','changed_consent','oversize','hash','mime']){
  let reads=0,storage=0,cancelled=0;
  const transport={configured:()=>true,request:async(path,options)=>{
   if(path==='/rest/v1/rpc/feture_staff_photo_read'){
    reads++;assert.deepEqual(JSON.parse(options.body),{p_actor:actor.accountHash,p_generation:actor.accountGeneration,p_id:id,p_revision:3});
    if(scenario==='initial_forbidden'||reads===2&&scenario.startsWith('second_'))return new Response(JSON.stringify({ok:false,error:scenario==='initial_forbidden'?'forbidden':scenario.slice(7)}));
    return new Response(JSON.stringify({ok:true,photo:{...descriptor,...(reads===2&&scenario==='changed_consent'?{consentRevision:3}:{})}}));
   }
   storage++;assert.equal(path,'/storage/v1/object/authenticated/feture-post-photos/'+descriptor.path);
   const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(scenario==='oversize'?Buffer.alloc(jpeg.length+1):scenario==='hash'?Buffer.alloc(jpeg.length):jpeg));if(!['oversize','mime'].includes(scenario))controller.close();},cancel(){cancelled++;}});
   return new Response(stream,{headers:{'content-type':scenario==='mime'?'text/html':'image/jpeg'}});
  }};
  if(scenario==='ok'){
   const result=await postReview(transport,actor,body);assert.deepEqual(result,{ok:true,photo:{mime:'image/jpeg',image:jpeg.toString('base64'),width:2,height:3}});assert.equal(reads,2);assert.equal(JSON.stringify(result).includes(descriptor.path),false);
  }else{await assert.rejects(postReview(transport,actor,body),e=>[403,404,409,503].includes(e.status));if(scenario==='initial_forbidden')assert.equal(storage,0);if(['oversize','mime'].includes(scenario))assert.equal(cancelled,1);}
 }
 await assert.rejects(postReview({configured:()=>true,request:()=>{throw new Error('must not reach transport');}},actor,{...body,path:'foreign'}),e=>e.status===422);
});

test('staff response bodies have finite deadlines, byte limits and cancellation',async()=>{
 const {readBoundedBody}=require('../lib/feture/staff-photo-read');
 let cancelled=0;
 const stalled=new Response(new ReadableStream({cancel(){cancelled++;}}));
 await assert.rejects(readBoundedBody(stalled,16,20),/body_deadline/);assert.equal(cancelled,1);
 const oversized=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(17));},cancel(){cancelled++;}}));
 await assert.rejects(readBoundedBody(oversized,16,100),e=>e.status===503);assert.equal(cancelled,2);
});


test('E01b owner-only event RPC uses authenticated Core actor and strict DTO',async()=>{
 const {createEventsRepository,ownerDto}=require('../lib/feture/events');
 const {eventCommand}=require('../lib/feture/event-contract');
 const identity=identities.alice;await seed(identity);
 const actor=await authenticate(req(identity),store,async()=>new Date(Date.now()+86400000).toISOString());
 const draft={
  title:'Private workshop',summary:'',description:'Discussion',conditions:'18+',
  format:'online',visibility:'private',startsAt:'2026-11-01T18:00:00+08:00',
  endsAt:'2026-11-01T20:00:00+08:00',timeZone:'Asia/Makassar',
  language:'ru',city:'',publicLocation:'',privateLocation:null,
  privateJoinUrl:'https://meet.example.org/secret',ticketUrl:null,price:null
 };
 const id='00000000-0000-4000-8000-000000000001';
 const input={action:'events.save',id,operationId:'00000000-0000-4000-8000-000000000002',expectedRevision:0,draft};
 const entry={id,revision:1,state:'draft',draft,createdAt:'2026-10-12T13:00:00.123456+00:00',updatedAt:'2026-10-12T13:00:00.123456+00:00'};
 const calls=[],consents=[];
 const transport={configured:()=>true,request:async(path,opts)=>{
  calls.push({path,body:JSON.parse(opts.body)});
  return new Response(JSON.stringify({ok:true,entry,replayed:false}));
 }};
 const documents={requireCurrent:async(a)=>{consents.push(a.accountHash);}};
 const events=createEventsRepository(transport,documents);
 assert.deepEqual((await events.execute(actor,input)).entry,entry);
 assert.equal(calls.length,1);
 assert.equal(calls[0].path,'/rest/v1/rpc/feture_event_owner_command');
 assert.equal(calls[0].body.p_actor,identity.hash);
 assert.deepEqual(calls[0].body.p_command,input);
 assert.equal(consents.length,1);
 assert.deepEqual(Object.keys(ownerDto(entry)).sort(),['createdAt','draft','id','revision','state','updatedAt']);
 assert.throws(()=>ownerDto({...entry,ownerHash:'other'}),e=>e.code==='domain_unavailable');
 await assert.rejects(events.execute({accountHash:identity.hash,verifiedAdult:true},input),e=>e.status===401);
 await assert.rejects(events.execute(actor,{...input,ownerHash:identities.bob.hash}),e=>e.status===422);
 await assert.rejects(events.execute(actor,{action:'events.catalog',cursor:null,ownerHash:identities.bob.hash}),e=>e.status===422);
 assert.equal(calls.length,1);
 const unverified=await authenticate(req(identity),store);
 await assert.rejects(events.execute(unverified,input),e=>e.status===403);
 const denied=createEventsRepository(transport,{requireCurrent:async()=>{throw Object.assign(new Error('consent_required'),{status:403,code:'consent_required'});}});
 await assert.rejects(denied.execute(actor,input),e=>e.status===403);
 assert.equal(calls.length,1);
 assert.equal(eventCommand(input).action,'events.save');
 const submit={action:'events.submit',id,operationId:'00000000-0000-4000-8000-000000000009',expectedRevision:1};
 const deniedPublish=createEventsRepository({configured:()=>true,request:async(path)=>new Response(JSON.stringify({ok:true,entry,replayed:false}))},documents);
 await assert.rejects(deniedPublish.execute(actor,submit),e=>e.status===503);
 assert.equal(eventCommand(submit).action,'events.submit');
});
test('E01b PostgreSQL owner/ACL/CAS contract (isolated PGlite)',async()=>{
 await (await import('./events-owner-postgres.mjs')).runEventOwnersPostgres();
});


test('M01 detail opens: Core verified actor, no client owner or upstream details',async()=>{
 const {createPostViewsRepository,postViewCommand}=require('../lib/feture/post-views');
 const account=identities.alice;await seed(account);
 const actor=await authenticate(req(account),store,async()=>new Date(Date.now()+3600000).toISOString());
 const id='00000000-0000-4000-8000-000000000010',request={action:'posts.viewOpen',id};
 let payload={ok:true,hidden:true,uniqueDailyOpens:null};const calls=[];
 const transport={configured:()=>true,request:async(path,options)=>{
  calls.push({path,body:JSON.parse(options.body)});
  return new Response(JSON.stringify(payload));
 }};
 const views=createPostViewsRepository(transport,{requireCurrent:async()=>{}});
 assert.deepEqual(await views.execute(actor,request),{hidden:true,uniqueDailyOpens:null});
 assert.equal(calls[0].path,'/rest/v1/rpc/feture_post_view_open');
 assert.deepEqual(calls[0].body,{p_actor:account.hash,p_id:id});
 assert.throws(()=>postViewCommand({...request,ownerHash:'b'.repeat(32)}),e=>e.status===422);
 const n=calls.length;
 await assert.rejects(views.execute({...actor},request),e=>e.status===401);
 assert.equal(calls.length,n);
 payload={ok:true,hidden:false,uniqueDailyOpens:5};
 assert.deepEqual(await views.execute(actor,request),{hidden:false,uniqueDailyOpens:5});
 payload={ok:true,hidden:false,uniqueDailyOpens:5,viewer:'not_allowed'};
 await assert.rejects(views.execute(actor,request),e=>e.status===503);
 payload={ok:false,error:'resource_not_found'};
 await assert.rejects(views.execute(actor,request),e=>e.status===404);
});


test('E02b cancellation is owner-only, private DTO and available after consent expiry',async()=>{
 const {createEventsRepository}=require('../lib/feture/events');
 const identity=identities.alice;await seed(identity);
 const actor=await authenticate(req(identity),store);
 const id='00000000-0000-4000-8000-000000000071';
 const command={action:'events.cancel',id,operationId:'00000000-0000-4000-8000-000000000072',expectedRevision:3};
 const calls=[];
 let result={ok:true,event:{id,state:'cancelled',revision:4},replayed:false};
 const transport={configured:()=>true,request:async(path,opts)=>{
  calls.push({path,body:JSON.parse(opts.body)});return new Response(JSON.stringify(result));
 }};
 const events=createEventsRepository(transport,{requireCurrent:async()=>{throw new Error('expired consent must not prevent cancellation')}});
 assert.deepEqual(await events.execute(actor,command),{event:{id,state:'cancelled',revision:4},replayed:false});
 assert.equal(calls[0].path,'/rest/v1/rpc/feture_event_cancel_command');
 assert.deepEqual(calls[0].body,{p_actor:identity.hash,p_command:command});
 assert.equal(calls.length,1);
 const n=calls.length;
 await assert.rejects(events.execute({accountHash:identity.hash},command),e=>e.status===401);
 await assert.rejects(events.execute(actor,{...command,ownerHash:identities.bob.hash}),e=>e.status===422);
 assert.equal(calls.length,n);
 result={ok:true,event:{id,state:'cancelled',revision:4},replayed:true,privateJoinUrl:'https://unsafe.example'};
 await assert.rejects(events.execute(actor,command),e=>e.status===503);
 result={ok:false,error:'resource_not_found'};
 await assert.rejects(events.execute(actor,command),e=>e.status===404);
});


test('E04a RSVP: strict actor-derived intent, private status and withdrawal after expiry',async()=>{
 const {createEventsRepository}=require('../lib/feture/events');
 const user=identities.alice;await seed(user);
 const adult=await authenticate(req(user),store,async()=>new Date(Date.now()+3600000).toISOString());
 const unverified=await authenticate(req(user),store);
 const id='00000000-0000-4000-8000-000000000073';
 const command={action:'events.rsvpSet',id,operationId:'00000000-0000-4000-8000-000000000074',
  status:'going',visibleToAttendees:false};
 let response={ok:true,status:'going',visibleToAttendees:false,
  counts:{interested:null,going:null},replayed:false};
 const calls=[],guard=[];
 const transport={configured:()=>true,request:async(path,opts)=>{
  calls.push({path,body:JSON.parse(opts.body)});
  return new Response(JSON.stringify(response));
 }};
 const repository=createEventsRepository(transport,{requireCurrent:async actor=>{guard.push(actor.accountHash)}});
 assert.deepEqual(await repository.execute(adult,command),
  {status:'going',visibleToAttendees:false,counts:{interested:null,going:null},replayed:false});
 assert.equal(calls[0].path,'/rest/v1/rpc/feture_event_rsvp_command');
 assert.deepEqual(calls[0].body,{p_actor:user.hash,p_command:command});
 assert.equal(guard.length,1);
 const status={action:'events.rsvpStatus',id};
 response={ok:true,status:'none',visibleToAttendees:false,counts:{interested:null,going:null},replayed:false};
 assert.equal((await repository.execute(adult,status)).status,'none');
 const baseline=calls.length;
 for(const payload of [{...command,ownerHash:identities.bob.hash},
   {...command,visibleToAttendees:'true'},{...command,status:'declined',visibleToAttendees:true},
   {...status,accountHash:user.hash}])
  await assert.rejects(repository.execute(adult,payload),err=>err.status===422);
 await assert.rejects(repository.execute(unverified,command),err=>err.status===403);
 assert.equal(calls.length,baseline);
 response={ok:true,status:'withdrawn',visibleToAttendees:false,counts:{interested:null,going:null},replayed:false};
 const withdraw={...command,operationId:'00000000-0000-4000-8000-000000000075',status:'withdrawn'};
 const withoutCurrent=createEventsRepository(transport,{requireCurrent:async()=>{throw new Error('expired consent')}});
 assert.equal((await withoutCurrent.execute(unverified,withdraw)).status,'withdrawn');
 response={ok:true,status:'going',visibleToAttendees:true,
  counts:{interested:2,going:4},replayed:false};
 await assert.rejects(repository.execute(adult,command),err=>err.status===503);
 response={...response,counts:{interested:5,going:5},privateLocation:'do not show'};
 await assert.rejects(repository.execute(adult,command),err=>err.status===503);
 response={ok:false,error:'resource_not_found'};
 await assert.rejects(repository.execute(adult,command),err=>err.status===404);
});


test('E03a public event catalogue: strict DTO, Core age/consent and safe deep-link',async()=>{
 const {createEventsRepository,publicCardDto}=require('../lib/feture/events');
 const user=identities.alice;await seed(user);
 const adult=await authenticate(req(user),store,async()=>new Date(Date.now()+3600000).toISOString());
 const unverified=await authenticate(req(user),store);
 const id='00000000-0000-4000-8000-000000000081';
 const entry={id,revision:1,title:'Public workshop',summary:'Online learning',
  description:'Detailed session',conditions:'Adults and mutual respect',
  format:'online',startsAt:'2026-11-01T18:00:00+08:00',
  endsAt:'2026-11-01T20:00:00+08:00',
  timeZone:'Asia/Makassar',language:'ru',city:'',publicLocation:'',
  price:null,hasExternalTickets:true};
 let response={ok:true,items:[entry],nextCursor:null};
 const calls=[];
 const repository=createEventsRepository({configured:()=>true,request:async(path,options)=>{
  calls.push({path,body:JSON.parse(options.body)});
  return new Response(JSON.stringify(response));
 }},{requireCurrent:async()=>{}});
 const list={action:'events.catalog',cursor:null},preview={action:'events.preview',id};
 assert.deepEqual((await repository.execute(adult,list)).items,[entry]);
 assert.equal(calls[0].path,'/rest/v1/rpc/feture_event_catalog_command');
 assert.equal(calls[0].body.p_actor,user.hash);
 response={ok:true,entry};
 assert.deepEqual((await repository.execute(adult,preview)).entry,entry);
 for(const bad of [{action:'events.preview',id,ownerHash:identities.bob.hash},
  {action:'events.catalog',cursor:null,privateVenue:true},
  {action:'events.preview',id:'not-uuid'}])
  await assert.rejects(repository.execute(adult,bad),e=>e.status===422);
 const n=calls.length;
 await assert.rejects(repository.execute(unverified,list),e=>e.status===403);
 assert.equal(calls.length,n);
 response={ok:true,entry:{...entry,privateJoinUrl:'https://example.org/secret'}};
 await assert.rejects(repository.execute(adult,preview),e=>e.status===503);
 assert.throws(()=>publicCardDto({...entry,ownerHash:'private'}),e=>e.status===503);
 response={ok:false,error:'resource_not_found'};
 await assert.rejects(repository.execute(adult,preview),e=>e.status===404);
});


test('E04b Core attendance: exact commands, adult gate and withdrawal without renewed consent',async()=>{
 const {createEventsRepository}=require('../lib/feture/events');
 const person=identities.alice;await seed(person);
 const adult=await authenticate(req(person),store,async()=>new Date(Date.now()+3600000).toISOString());
 const unverified=await authenticate(req(person),store);
 const id='00000000-0000-4000-8000-000000000088';
 const status={action:'events.attendanceStatus',id};
 const pending={action:'events.attendanceRequest',id,operationId:'00000000-0000-4000-8000-000000000089'};
 const withdraw={...pending,action:'events.attendanceWithdraw',operationId:'00000000-0000-4000-8000-000000000090'};
 const calls=[],guard=[];
 let payload={ok:true,state:'none',replayed:false};
 const transport={configured:()=>true,request:async(path,opts)=>{
  calls.push({path,body:JSON.parse(opts.body)});return new Response(JSON.stringify(payload));
 }};
 const repo=createEventsRepository(transport,{requireCurrent:async actor=>{guard.push(actor.accountHash)}});
 assert.deepEqual(await repo.execute(adult,status),{state:'none',replayed:false});
 assert.equal(calls[0].path,'/rest/v1/rpc/feture_event_attendance_command');
 assert.deepEqual(calls[0].body,{p_actor:person.hash,p_command:status});
 payload={ok:true,state:'pending',replayed:false};
 assert.deepEqual(await repo.execute(adult,pending),{state:'pending',replayed:false});
 assert.equal(guard.length,2);
 const before=calls.length;
 for(const bad of [{...pending,ownerHash:identities.bob.hash},
   {...status,privateLocation:'guess'},
   {...pending,operationId:'bad'}])
  await assert.rejects(repo.execute(adult,bad),err=>err.status===422);
 await assert.rejects(repo.execute(unverified,pending),err=>err.status===403);
 assert.equal(calls.length,before);
 const noConsent=createEventsRepository(transport,{requireCurrent:async()=>{throw new Error('revoked')}});
 payload={ok:true,state:'withdrawn',replayed:false};
 assert.deepEqual(await noConsent.execute(unverified,withdraw),{state:'withdrawn',replayed:false});
 assert.equal(calls.at(-1).path,'/rest/v1/rpc/feture_event_attendance_command');
 payload={ok:true,state:'pending',replayed:true,privateJoinUrl:'secret'};
 await assert.rejects(repo.execute(adult,status),err=>err.status===503);
 payload={ok:false,error:'resource_not_found'};
 await assert.rejects(repo.execute(adult,status),err=>err.status===404);
});


test('E04b2 owner attendance queue: trusted actor, cursor and strict request projection',async()=>{
 const {createEventsRepository,requestQueueDto}=require('../lib/feture/events');
 const person=identities.alice;await seed(person);
 const adult=await authenticate(req(person),store,async()=>new Date(Date.now()+3600000).toISOString());
 const unverified=await authenticate(req(person),store);
 const id='00000000-0000-4000-8000-000000000091';
 const requestId='00000000-0000-4000-8000-000000000092';
 const entry={requestId,requestedAt:'2026-10-12T15:00:00.123456+00:00',state:'pending'};
 let response={ok:true,items:[entry],nextCursor:null};const calls=[];
 const repository=createEventsRepository({configured:()=>true,request:async(path,options)=>{
  calls.push({path,body:JSON.parse(options.body)});return new Response(JSON.stringify(response));
 }},{requireCurrent:async()=>{}});
 const command={action:'events.attendanceRequests',id,cursor:null};
 assert.deepEqual((await repository.execute(adult,command)).items,[entry]);
 assert.equal(calls[0].path,'/rest/v1/rpc/feture_event_attendance_owner_queue');
 assert.deepEqual(calls[0].body,{p_actor:person.hash,p_command:command});
 assert.deepEqual(requestQueueDto(entry),entry);
 const baseline=calls.length;
 for(const invalid of [{...command,ownerHash:identities.bob.hash},
   {...command,cursor:{at:'bad',id}},
   {...command,actorHash:'c'.repeat(32)}])
  await assert.rejects(repository.execute(adult,invalid),e=>e.status===422);
 await assert.rejects(repository.execute(unverified,command),e=>e.status===403);
 assert.equal(calls.length,baseline);
 response={ok:true,items:[{...entry,actorHash:'secret'}],nextCursor:null};
 await assert.rejects(repository.execute(adult,command),e=>e.status===503);
 response={ok:false,error:'resource_not_found'};
 await assert.rejects(repository.execute(adult,command),e=>e.status===404);
});


test('E04b2b owner decision: trusted Core generation and minimal approve/decline receipt',async()=>{
 const {createEventsRepository}=require('../lib/feture/events');
 const user=identities.alice;await seed(user);
 const since=new Date().toISOString();
 await store.set('a:'+user.hash,JSON.stringify({email:user.email,since,
  syncDevices:{[user.device]:{h:sha(user.token),at:since}}}));
 const actor=await authenticate(req(user),store,async()=>new Date(Date.now()+3600000).toISOString());
 const unverified=await authenticate(req(user),store);
 const id='00000000-0000-4000-8000-000000000095';
 const requestId='00000000-0000-4000-8000-000000000096';
 const action={action:'events.attendanceDecide',id,requestId,
   operationId:'00000000-0000-4000-8000-000000000097',
   expectedRevision:1,decision:'approve',reason:'reviewed'};
 let response={ok:true,request:{requestId,state:'approved',revision:2},replayed:false};
 const calls=[],guard=[];
 const transport={configured:()=>true,request:async(path,opts)=>{
  calls.push({path,body:JSON.parse(opts.body)});
  return new Response(JSON.stringify(response));
 }};
 const events=createEventsRepository(transport,{requireCurrent:async a=>{guard.push(a.accountHash)}});
 assert.equal(actor.accountGeneration.length,64);
 assert.deepEqual(await events.execute(actor,action),{request:{requestId,state:'approved',revision:2},replayed:false});
 assert.equal(calls[0].path,'/rest/v1/rpc/feture_event_attendance_owner_decide');
 assert.deepEqual(calls[0].body,{p_actor:user.hash,p_generation:actor.accountGeneration,p_command:action});
 assert.equal(guard.length,1);
 const n=calls.length;
 for(const bad of [{...action,actorHash:user.hash},{...action,requestId:'bad'},
   {...action,expectedRevision:0},{...action,decision:'decline',reason:'reviewed'},
   {...action,decision:'approve',reason:'capacity'}])
  await assert.rejects(events.execute(actor,bad),err=>err.status===422);
 await assert.rejects(events.execute(unverified,action),err=>err.status===403);
 await assert.rejects(events.execute({...actor,accountGeneration:undefined},action),err=>err.status===401); // A forged actor loses Core's session trust marker.
 const withoutGeneration=await authenticate(req(user),store,async()=>new Date(Date.now()+3600000).toISOString());
 assert.equal(withoutGeneration.accountGeneration.length,64);
 assert.equal(calls.length,n);
 response={ok:true,request:{requestId,state:'approved',revision:2,privateJoinUrl:'secret'},replayed:false};
 await assert.rejects(events.execute(actor,action),err=>err.status===503);
 response={ok:false,error:'revision_conflict'};
 await assert.rejects(events.execute(actor,action),err=>err.status===409);
 response={ok:false,error:'resource_not_found'};
 await assert.rejects(events.execute(actor,action),err=>err.status===404);
});


test('E04c owner roster: Core actor and strict no-account no-private-nickname projection',async()=>{
 const {createEventsRepository,attendeeDto,attendeeCountsDto}=require('../lib/feture/events');
 const identity=identities.alice;await seed(identity);
 const adult=await authenticate(req(identity),store,async()=>new Date(Date.now()+3600000).toISOString());
 const unverified=await authenticate(req(identity),store);
 const eid='00000000-0000-4000-8000-000000000091';
 const item={participationId:'00000000-0000-4000-8000-000000000092',
  kind:'rsvp',status:'going',updatedAt:'2026-10-12T15:00:00.123456+00:00',
  displayName:null};
 const counts={interested:0,going:1,rsvpDeclined:1,
  requestsPending:2,requestsApproved:0,requestsDeclined:3};
 const action={action:'events.attendees',id:eid,cursor:null};
 const calls=[];let reply={ok:true,items:[item],counts,nextCursor:null};
 const api=createEventsRepository({configured:()=>true,request:async(path,opts)=>{
  calls.push({path,body:JSON.parse(opts.body)});return new Response(JSON.stringify(reply));
 }},{requireCurrent:async()=>{}});
 assert.deepEqual(await api.execute(adult,action),{items:[item],counts,nextCursor:null});
 assert.equal(calls[0].path,'/rest/v1/rpc/feture_event_owner_attendees');
 assert.deepEqual(calls[0].body,{p_actor:identity.hash,p_command:action});
 assert.deepEqual(attendeeDto(item),item);
 assert.deepEqual(attendeeCountsDto(counts),counts);
 const before=calls.length;
 for(const bad of [{...action,ownerHash:identities.bob.hash},
   {...action,cursor:{at:'yesterday',id:eid}},
   {...action,viewerId:'private'}])
  await assert.rejects(api.execute(adult,bad),e=>e.status===422);
 await assert.rejects(api.execute(unverified,action),e=>e.status===403);
 assert.equal(calls.length,before);
 reply={ok:true,items:[{...item,actorHash:identity.hash}],counts,nextCursor:null};
 await assert.rejects(api.execute(adult,action),e=>e.status===503);
 reply={ok:true,items:[{...item,status:'declined'}],counts,nextCursor:null};
 await assert.rejects(api.execute(adult,action),e=>e.status===503);
 reply={ok:true,items:[item],counts:{...counts,going:-1},nextCursor:null};
 await assert.rejects(api.execute(adult,action),e=>e.status===503);
 reply={ok:false,error:'resource_not_found'};
 await assert.rejects(api.execute(adult,action),e=>e.status===404);
});
