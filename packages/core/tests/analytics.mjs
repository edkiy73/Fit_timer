import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createAnalyticsEngine}=require('../server/analytics-core.js');

function memoryStore(){
  const values=new Map();
  return {
    async get(key){return values.get(key)??null;},
    async set(key,value){values.set(key,String(value));},
    async del(key){values.delete(key);},
    async incr(key){
      const next=Number(values.get(key)||0)+1;
      values.set(key,String(next));
      return next;
    },
    async many(keys){return keys.map(key=>values.get(key)??null);},
    async scan(prefix){return [...values.keys()].filter(key=>key.startsWith(prefix.replace('*','')));},
    async pipe(commands){
      const out=[];
      for(const command of commands){
        const [op,key,value,...rest]=command;
        if(op!=='SET')throw new Error('unsupported_pipe_op');
        const nx=rest.includes('NX');
        if(nx&&values.has(key)){out.push(null);continue;}
        values.set(key,String(value));
        out.push('OK');
      }
      return out;
    },
    values
  };
}

const store=memoryStore();
const engine=createAnalyticsEngine({
  store,
  events:['lesson_completed.first'],
  dayTtl:1000,
  deviceTtl:1000,
  uniqueTtl:1000,
  idempotencyTtl:1000
});

const body={
  event:'lesson_completed.first',
  eventId:'completion:lesson:run-123',
  deviceId:'device-demo',
  platform:'web',
  locale:'ru',
  premium:false
};

const first=await engine.recordAnalytics(body);
const duplicate=await engine.recordAnalytics(body);
assert.equal(first.ok,true);
assert.equal(duplicate.duplicate,true);

const day=new Date().toISOString().slice(0,10);
assert.equal(store.values.get('analytics:event:'+day+':lesson_completed.first'),'1');

const another=await engine.recordAnalytics({...body,eventId:'completion:lesson:run-456'});
assert.equal(another.ok,true);
assert.equal(store.values.get('analytics:event:'+day+':lesson_completed.first'),'2');

console.log('analytics idempotency: ok');

// Funnel and D1/D7/D30 retention: steps counted per new device, retention over active days.
{
  const store=memoryStore();
  const engine=createAnalyticsEngine({
    store,
    events:['install','day_done','purchase.a','purchase.b'],
    funnel:[
      {id:'install',events:['install']},
      {id:'day_done',events:['day_done']},
      {id:'purchase',events:['purchase.a','purchase.b']},
      {id:'ignored',events:['not_an_event']}
    ]
  });
  await engine.recordAnalytics({event:'install',deviceId:'device-one',platform:'android'});
  await engine.recordAnalytics({event:'day_done',deviceId:'device-one',platform:'android'});
  await engine.recordAnalytics({event:'purchase.b',deviceId:'device-one',platform:'android'});
  await engine.recordAnalytics({event:'install',deviceId:'device-two',platform:'web'});
  const dayMs=86400000, iso=ms=>new Date(ms).toISOString();
  const today=Date.parse(new Date().toISOString().slice(0,10));
  // An older device: first seen 8 days ago, came back the next day, not on day 7.
  store.values.set('analytics:device:old',JSON.stringify({
    firstSeen:iso(today-8*dayMs+3600000),lastSeen:iso(today-7*dayMs),platform:'ios',locale:'ru',
    events:{install:iso(today-8*dayMs+3600000)},
    days:[iso(today-8*dayMs).slice(0,10),iso(today-7*dayMs).slice(0,10)]
  }));
  const stats=await engine.analyticsStats(30);
  assert.deepEqual(stats.funnel,[{id:'install',devices:3},{id:'day_done',devices:1},{id:'purchase',devices:1}]);
  assert.deepEqual(stats.retention,{d1:{eligible:1,returned:1},d7:{eligible:1,returned:0},d30:{eligible:0,returned:0}});
  const rec=JSON.parse(store.values.get([...store.values.keys()].find(key=>key.startsWith('analytics:device:')&&key!=='analytics:device:old')));
  assert.deepEqual(rec.days,[new Date().toISOString().slice(0,10)]);
  console.log('analytics funnel and retention: ok');
}
