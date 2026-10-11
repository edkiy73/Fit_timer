'use strict';
process.env.ALLOW_MEMORY_STORE='1';process.env.APPBASE_STORE='redis';
for(const key of ['KV_REST_API_URL','KV_REST_API_TOKEN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','REDIS_REST_URL','REDIS_REST_TOKEN','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'])delete process.env[key];
require('../lib/product');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');const {Readable}=require('node:stream');
const {store}=require('../../../packages/core/server/store');
const {createOperatorEndpoint}=require('../lib/feture/operators');
const sha=s=>createHash('sha256').update(s).digest('hex');
test('O02 operators: live Core session, server actor, key only bootstrap, revoke/failure closed',async()=>{
 const email='staff@example.com',token='staff-device-token',owner=sha(email).slice(0,32);
 const account={email,since:'2026-10-10T00:00:00Z',syncDevices:{device:{h:sha(token),at:new Date().toISOString()}}};
 await store.set('a:'+owner,JSON.stringify(account));
 let allowed=true,staffRole='manager';const calls=[];
 const transport={configured:()=>true,request:async(path,opts)=>{
  const input=JSON.parse(opts.body);calls.push({path,input});
  if(path.endsWith('feture_qa_adult_bound_admin'))return new Response(JSON.stringify(allowed?{ok:true,items:[],activeCount:0}:{ok:false,error:'forbidden'}));
  return new Response(JSON.stringify({ok:true,role:staffRole,initialized:true,items:[],events:[]}));
 }};
 const handler=createOperatorEndpoint({transport,accounts:store,cors:()=>false,quota:async()=>true});
 const run=async(body,headers={'x-fit-email':email,'x-fit-device':'device','x-fit-token':token})=>{
  const req=Readable.from([]);req.method='POST';req.headers=headers;req.body=body;
  const res={statusCode:0,setHeader(){},end(x){this.body=JSON.parse(x);}};
  await handler(req,res);return res;
 };
 process.env.ADMIN_KEY='bootstrap-secret';
 assert.equal((await run({action:'feture.qa.list'},{'x-admin-key':'bootstrap-secret'})).statusCode,401);
 assert.equal(calls.length,0);
 assert.equal((await run({action:'feture.qa.list'},{'x-fit-email':email,'x-fit-device':'device','x-fit-token':'forged'})).statusCode,401);
 assert.equal((await run({action:'feture.operators.bootstrap'})).statusCode,403);
 assert.equal((await run({action:'feture.qa.list',actor:'a'.repeat(32)})).statusCode,422);
 assert.equal((await run({action:'feture.qa.list'})).statusCode,200);
 assert.equal(calls.at(-1).input.p_actor,owner);
 assert.equal(calls.at(-1).input.p_generation,sha(owner+':'+account.since));
 allowed=false;
 assert.equal((await run({action:'feture.qa.list'})).statusCode,403);
 assert.equal((await run({action:'feture.operators.bootstrap'},{'x-fit-email':email,'x-fit-device':'device','x-fit-token':token,'x-admin-key':'bootstrap-secret'})).statusCode,200);
 assert.equal(calls.at(-1).input.p_bootstrap,true);
 assert.equal((await run({action:'feture.operators.status'})).statusCode,200);
 assert.equal(calls.at(-1).input.p_bootstrap,false);
 staffRole=null;
 assert.equal((await run({action:'feture.qa.grant',email:'missing@example.com',days:1,reviewed:true})).statusCode,403);
 assert.equal((await run({action:'feture.qa.grant',email,days:1,reviewed:true})).statusCode,403);
 assert.equal((await run({action:'feture.operators.set',email:'missing@example.com',role:'manager',expectedRevision:0})).statusCode,403);
 const count=calls.length;account.syncDevices={};await store.set('a:'+owner,JSON.stringify(account));
 assert.equal((await run({action:'feture.qa.list'})).statusCode,401);assert.equal(calls.length,count);
});

test('C01 review endpoint: personal session/generation, exact action and closed review DTO',async()=>{
 const email='reviewer@example.com',token='review-token',owner=sha(email).slice(0,32),since='2026-10-11T00:00:00Z';await store.set('a:'+owner,JSON.stringify({email,since,syncDevices:{device:{h:sha(token),at:since}}}));
 let reply={ok:true,items:[],nextCursor:null};const calls=[];
 const endpoint=createOperatorEndpoint({accounts:store,transport:{configured:()=>true,request:async(path,opts)=>{calls.push({path,body:JSON.parse(opts.body)});return new Response(JSON.stringify(reply));}},cors:()=>false,quota:async()=>true});
 const run=async(body,headers={'x-fit-email':email,'x-fit-device':'device','x-fit-token':token})=>{const req=Readable.from([]);req.method='POST';req.body=body;req.headers=headers;const res={statusCode:0,setHeader(){},end(x){this.data=JSON.parse(x);}};await endpoint(req,res);return res;};
 const queue={action:'feture.posts.queue',cursor:null};assert.equal((await run(queue,{'x-admin-key':'bootstrap-secret'})).statusCode,401);assert.equal(calls.length,0);
 assert.equal((await run({...queue,p_actor:owner})).statusCode,422);assert.equal(calls.length,0);
 assert.equal((await run(queue)).statusCode,200);assert.equal(calls[0].path,'/rest/v1/rpc/feture_post_review_command');assert.equal(calls[0].body.p_actor,owner);assert.equal(calls[0].body.p_generation,sha(owner+':'+since));
 reply={ok:false,error:'forbidden'};assert.equal((await run(queue)).statusCode,403);
 reply={ok:true,items:[{id:'00000000-0000-4000-8000-000000000001',text:'Открытый текст',authorLabel:'Имя',kind:'text',state:'pending',revision:1,submittedAt:since,privateAnswers:['SECRET']}],nextCursor:null};assert.equal((await run(queue)).statusCode,503);
 await store.del('a:'+owner);const n=calls.length;assert.equal((await run(queue)).statusCode,401);assert.equal(calls.length,n);
});

test('C01 report review: closed staff context/audit and personal generation',async()=>{
 const email='complaint-reviewer@example.com',token='complaint-token',owner=sha(email).slice(0,32),since='2026-10-11T00:00:00Z';await store.set('a:'+owner,JSON.stringify({email,since,syncDevices:{device:{h:sha(token),at:since}}}));
 const id='00000000-0000-4000-8000-000000000009',report={id,postId:id,postRevision:3,reason:'privacy',state:'open',revision:1,createdAt:since,resolvedAt:null,resolution:null,note:'CONFIDENTIAL',context:null};let reply={ok:true,items:[report],nextCursor:null};const calls=[];
 const endpoint=createOperatorEndpoint({accounts:store,transport:{configured:()=>true,request:async(path,opts)=>{calls.push({path,body:JSON.parse(opts.body)});return new Response(JSON.stringify(reply));}},cors:()=>false,quota:async()=>true});
 const run=async(body)=>{const req=Readable.from([]);req.method='POST';req.body=body;req.headers={'x-fit-email':email,'x-fit-device':'device','x-fit-token':token};const res={statusCode:0,setHeader(){},end(x){this.data=JSON.parse(x);}};await endpoint(req,res);return res;};
 const queue={action:'feture.posts.reports',cursor:null};assert.equal((await run(queue)).statusCode,200);assert.equal(calls[0].body.p_generation,sha(owner+':'+since));assert.equal(calls[0].path,'/rest/v1/rpc/feture_post_report_review');
 reply={ok:true,items:[{...report,reporter_hash:owner}],nextCursor:null};assert.equal((await run(queue)).statusCode,503);
 reply={ok:true,items:[{...report,context:{text:'Text',authorLabel:'Name',revision:4}}],nextCursor:null};assert.equal((await run(queue)).statusCode,503);
 reply={ok:true,items:[{id,reportId:id,action:'hide',reason:'privacy',revision:2,at:since,note:'CONFIDENTIAL'}],nextCursor:null};assert.equal((await run({action:'feture.posts.reportAudit',cursor:null})).statusCode,503);
 reply={ok:false,error:'forbidden'};assert.equal((await run(queue)).statusCode,403);
});
