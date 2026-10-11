'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createPrivateMetrics,EVENTS}=require('../lib/feture/private-metrics');
const {createMetricsAdmin}=require('../lib/feture/private-metrics-admin');
function fixture(){
 const map=new Map(),writes=[];
 const store={
  async incr(key,ttl){writes.push({key,ttl});map.set(key,(map.get(key)||0)+1);return map.get(key);},
  async many(keys){return keys.map(key=>map.get(key)??null);}
 };
 return {metrics:createPrivateMetrics(store),writes,map};
}
const actor=Object.freeze({accountHash:'a'.repeat(32),verifiedAdult:true,qaUntil:'2026-10-13T00:00:00.000Z'});
test('O03 metrics: allowlisted action labels only; no answer, ID, text, URL or account hash in storage',async()=>{
 const {metrics,writes}=fixture();
 const privateData={answers:{private:'secret-answer'},text:'sensitive post',id:'unique-private-id',linkId:'secret-token',operationId:'private-operation',replayed:false};
 await metrics.record('posts.submit',actor,privateData);
 await metrics.record('posts.submit',actor,{...privateData,replayed:true});
 await metrics.record('posts.read',actor,privateData);
 await metrics.record('tests.save',actor,privateData);
 await metrics.record('posts.submit',{...actor,verifiedAdult:false},privateData);
 await metrics.record('posts.submit',actor,{...privateData,ok:false});
 assert.equal(writes.length,1);
 assert.match(writes[0].key,/^feture:metrics:v1:\d{4}-\d{2}-\d{2}:qa:discussion_submitted$/);
 assert.ok(!JSON.stringify(writes).includes('secret-answer'));
 for(const secret of [actor.accountHash,'private-operation','unique-private-id','secret-token','sensitive post'])assert.ok(!JSON.stringify(writes).includes(secret));
 assert.equal(writes[0].ttl,35*86400);
});
test('O03 summary: aggregated counts only, small values suppressed, QA not mixed with verified',async()=>{
 const {metrics}=fixture();
 assert.deepEqual([...EVENTS],['test_started','test_completed','map_updated','share_created','share_opened','discussion_submitted']);
 for(let n=0;n<5;n++)await metrics.record('tests.complete',actor,{replayed:false});
 await metrics.record('share.read',actor,{});
 await metrics.record('share.create',{accountHash:'b'.repeat(32),verifiedAdult:true},{});
 const v=await metrics.summary(7);
 assert.equal(v.counts.qa.test_completed,5);
 assert.equal(v.counts.qa.share_opened,null);
 assert.equal(v.counts.qa.test_started,0);
 assert.equal(v.counts.other_verified.share_created,null);
 assert.equal(JSON.stringify(v).includes('accountHash'),false);
 assert.equal(JSON.stringify(v).includes('2026-10'),false); // no individual dates
 assert.equal(Object.keys(v).sort().join(','),'cohorts,counts,days,events');
});
test('O03 missing/failed Redis counters cannot break user mutations, admin summary fails closed',async()=>{
 const failed=createPrivateMetrics({incr:async()=>{throw Error('secret store failure');},many:async()=>{throw Error('secret store failure');}});
 await assert.doesNotReject(failed.record('posts.submit',actor,{}));
 const fn=createMetricsAdmin(failed);
 const req={action:'feture.metrics.summary',days:7};
 const response=()=>({statusCode:0,headers:{},body:'',setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}});
 const res=response();assert.equal(await fn('feture.metrics.summary',req,res),true);
 assert.equal(res.statusCode,503);assert.deepEqual(res.body,{error:'metrics_unavailable'});
 const invalid=response();await fn('feture.metrics.summary',{...req,accountHash:'leak'},invalid);
 assert.equal(invalid.statusCode,422);
});
