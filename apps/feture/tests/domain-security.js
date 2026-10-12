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
