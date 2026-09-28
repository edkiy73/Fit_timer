'use strict';

process.env.ALLOW_MEMORY_STORE='1';
process.env.ADMIN_KEY='unmute-content-admin';

const assert=require('assert');
const Content=require('../lib/content-store');
const handler=require('../api/content');
const { store }=require('../../../packages/core/server/store');
const crypto=require('crypto');

function res(){
  return {statusCode:0,headers:{},body:'',setHeader(k,v){this.headers[k]=v;},end(v){this.body=v||'';}};
}
async function call(req){
  const out=res();
  await handler({headers:{},query:{},...req},out);
  let body={}; try{body=JSON.parse(out.body||'{}');}catch(_){}
  return {status:out.statusCode,body};
}

const sample={
  schemaVersion:1,id:'general-foundation',revision:1,slug:'general-foundation',
  title:{ru:'Общий английский A1–B1/B2'},
  description:{ru:'Первый основной сет'},
  level:{from:'a1',to:'b2',labels:[]},
  access:{mode:'entitlement',entitlement:'course.general-foundation',
    freePreview:{kind:'first-days',days:7,learnedContentStaysAvailable:true}},
  defaultRoadmapId:'main',
  roadmaps:[{id:'main',title:{ru:'Основной путь'},nodes:[
    {id:'d1',kind:'lesson',title:{ru:'День 1'},dayIndex:1,order:1,prerequisites:[],activityIds:['a1'],optional:false},
    {id:'d7',kind:'checkpoint',title:{ru:'День 7'},dayIndex:7,order:7,prerequisites:['d1'],activityIds:['a7'],optional:false},
    {id:'d8',kind:'lesson',title:{ru:'День 8'},dayIndex:8,order:8,prerequisites:['d7'],activityIds:['a8'],optional:false}
  ]}],
  activities:[
    {id:'a1',revision:1,type:'theory',tags:[],revisionProgress:'preserve',body:{ru:'one'},format:'text'},
    {id:'a7',revision:1,type:'text-input',tags:[],revisionProgress:'preserve',prompt:{ru:'seven'},answer:{accepted:['seven'],nearMiss:true,caseSensitive:false}},
    {id:'a8',revision:1,type:'text-input',tags:[],revisionProgress:'preserve',prompt:{ru:'eight'},answer:{accepted:['eight'],nearMiss:true,caseSensitive:false}}
  ]
};

(async()=>{
  Content.validateSet(sample);
  const put=await call({method:'POST',headers:{'x-admin-key':encodeURIComponent(process.env.ADMIN_KEY)},body:{action:'draft_put',set:sample}});
  assert.equal(put.status,200);

  const pub=await call({method:'POST',headers:{'x-admin-key':encodeURIComponent(process.env.ADMIN_KEY)},body:{action:'publish',id:'general-foundation'}});
  assert.equal(pub.status,200);
  assert.equal(pub.body.revision,1);

  const catalog=await call({method:'GET',query:{action:'catalog'}});
  assert.equal(catalog.status,200);
  assert.equal(catalog.body.catalog.sets[0].id,'general-foundation');

  const preview=await call({method:'GET',query:{action:'set',id:'general-foundation'}});
  assert.equal(preview.status,200);
  assert.equal(preview.body.access,'preview');
  assert.deepEqual(preview.body.set.activities.map(x=>x.id),['a1','a7']);
  assert.deepEqual(preview.body.set.roadmaps[0].nodes.map(x=>x.id),['d1','d7']);

  // Add a real account record owning the course, using the same auth shape as Core.
  const email='owner@example.com', deviceId='device-1', token='secret-token';
  const hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
  await store.pipe([['SET',`a:${hash(email).slice(0,32)}`,JSON.stringify({
    syncDevices:{[deviceId]:{h:hash(token)}},
    owned:{'course.general-foundation':{since:new Date().toISOString(),provider:'test'}}
  })]]);
  const full=await call({method:'GET',headers:{'x-fit-email':email,'x-fit-device':deviceId,'x-fit-token':token},query:{action:'set',id:'general-foundation'}});
  assert.equal(full.status,200);
  assert.equal(full.body.access,'full');
  assert.equal(full.body.set.activities.length,3);

  const draft=await Content.getDraft('general-foundation');
  draft.title.ru='Updated';
  await Content.putDraft(draft);
  const pub2=await Content.publish('general-foundation');
  assert.equal(pub2.revision,2);
  const oldRaw=await store.get(Content.keys.revisionKey('general-foundation',1));
  assert.equal(JSON.parse(oldRaw).title.ru,'Общий английский A1–B1/B2');

  const bad=JSON.parse(JSON.stringify(sample));
  bad.roadmaps[0].nodes[0].prerequisites=['d8'];
  bad.roadmaps[0].nodes[2].prerequisites=['d1'];
  bad.roadmaps[0].nodes[1].prerequisites=['d8'];
  assert.throws(()=>Content.validateSet(bad),/roadmap_cycle/);

  console.log('UnMute content DB tests passed');
})().catch(error=>{console.error(error);process.exit(1);});
