// @ts-check
'use strict';
// O03.1: server-derived, aggregate-only FetUre activity counters.
// NEVER accept an event name, account identifier, body, answers, link token,
// post ID, location, sensitive field, or URL from the browser.
const METRICS=Object.freeze({
 'tests.start':'test_started',
 'tests.complete':'test_completed',
 'interests.set':'map_updated',
 'interests.delete':'map_updated',
 'share.create':'share_created',
 'share.read':'share_opened',
 'posts.submit':'discussion_submitted'
});
const EVENTS=Object.freeze([...new Set(Object.values(METRICS))]);
const TTL=35*86400;
const KEY_PREFIX='feture:metrics:v1';
const TYPES=Object.freeze(['qa','other_verified']);
/** @param {string} day @param {string} cohort @param {string} event */
function key(day,cohort,event){return KEY_PREFIX+':'+day+':'+cohort+':'+event;}
/** @param {{incr:(key:string,ttl:number)=>Promise<unknown>;many:(keys:string[])=>Promise<unknown[]>}} store */
function createPrivateMetrics(store){
 return {
  /** Count ONLY completed authorized server actions. For retries, never double-count
   * actions with a verified server replay receipt. Browser fields are not read.
   * Counts represent actions, NOT unique humans or verified market cohorts.
   * @param {string} action @param {import('./contracts').Actor} actor @param {unknown} result */
  async record(action,actor,result){
   if(!Object.hasOwn(METRICS,action)||!actor.verifiedAdult||!result||typeof result!=='object')return;
   const r=/** @type {{replayed?:unknown;ok?:unknown}} */(result);
   if(r.replayed===true||r.ok===false)return;
   const cohort=actor.qaUntil?'qa':'other_verified';
   // Own server clock. No IDs, key derivation or client-provided values.
   const day=new Date().toISOString().slice(0,10);
   try{await store.incr(key(day,cohort,METRICS[/** @type {keyof typeof METRICS} */(action)]),TTL);}
   catch{/* Activity counters are optional; failed analytics never block the action. */}
  },
  /** Aggregated operator-only table. Counts between 1 and 4 suppressed; never
   * return daily rows, identifiers or timestamps for individual users.
   * @param {7|30} days */
  async summary(days){
   const today=new Date();const keys=[];
   for(let n=days-1;n>=0;n--){const day=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()-n)).toISOString().slice(0,10);
    for(const cohort of TYPES)for(const event of EVENTS)keys.push(key(day,cohort,event));
   }
   const raw=await store.many(keys);
   if(!Array.isArray(raw)||raw.length!==keys.length)throw new Error('metrics_unavailable');
   const output=Object.fromEntries(TYPES.map(v=>[v,Object.fromEntries(EVENTS.map(e=>[e,0]))]));
   let i=0;for(let d=0;d<days;d++)for(const cohort of TYPES)for(const event of EVENTS){
    const rawNumber=raw[i++];const n=rawNumber===null||rawNumber===undefined?0:Number(rawNumber);
    if(!Number.isSafeInteger(n)||n<0)throw new Error('metrics_unavailable');
    output[cohort][event]+=n;
   }
   return {days,events:EVENTS,cohorts:TYPES,counts:Object.fromEntries(TYPES.map(c=>[c,Object.fromEntries(EVENTS.map(e=>[e,output[c][e]===0?0:output[c][e]<5?null:output[c][e]]))]))};
  }
 };
}
module.exports={createPrivateMetrics,EVENTS};
