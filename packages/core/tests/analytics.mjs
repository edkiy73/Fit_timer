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
