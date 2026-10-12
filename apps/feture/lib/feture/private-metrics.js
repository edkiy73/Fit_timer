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
// 35 days TTL can overlap 36 UTC calendar dates at a time. Fixed allowlists
// guarantee predictable key cardinality even if traffic grows sharply.
const MAX_ACTIVE_KEYS=(Math.ceil(TTL/86400)+1)*TYPES.length*EVENTS.length;
const MAX_READ_KEYS=30*TYPES.length*EVENTS.length;
const THRESHOLD_KEY='FETURE_O03_WARN_WEEKLY_EVENTS';
/** Server-managed configuration, never accepted from the browser.
 * Invalid configuration must be visible as invalid, not silently ignored. */
function weeklyThreshold(){
 const raw=process.env[THRESHOLD_KEY];
 if(raw===undefined||raw==='')return {status:'not_configured',threshold:null};
 if(!/^[1-9]\d{0,8}$/.test(raw))return {status:'invalid_configuration',threshold:null};
 const value=Number(raw);if(value<100)return {status:'invalid_configuration',threshold:null};
 return {status:'configured',threshold:value};
}
/** @param {number} n */
const hideSmall=n=>n===0?0:n<5?null:n;
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
   const emptyGroups=()=>Object.fromEntries(TYPES.map(v=>[v,Object.fromEntries(EVENTS.map(e=>[e,0]))]));
   const output=emptyGroups(),weekOutput=emptyGroups();
   let i=0,weekActions=0,windowActions=0;
   for(let d=0;d<days;d++)for(const cohort of TYPES)for(const event of EVENTS){
    const rawNumber=raw[i++];const n=rawNumber===null||rawNumber===undefined?0:Number(rawNumber);
    if(!Number.isSafeInteger(n)||n<0)throw new Error('metrics_unavailable');
    output[cohort][event]+=n;
    windowActions+=n;
    if(d>=days-7){weekActions+=n;weekOutput[cohort][event]+=n;}
    if(!Number.isSafeInteger(output[cohort][event])||!Number.isSafeInteger(windowActions)||!Number.isSafeInteger(weekActions))throw new Error('metrics_unavailable');
   }
   // A visible total must not let an operator subtract a published >=5
   // cohort/event count from the total to recover a protected 1..4 cell.
   const hasSmall=/** @param {Record<string,Record<string,number>>} groups */(groups)=>
    TYPES.some(cohort=>EVENTS.some(event=>groups[cohort][event]>0&&groups[cohort][event]<5));
   const weekHasSmall=hasSmall(weekOutput);
   let weekLower=0,weekUpper=0;
   for(const cohort of TYPES)for(const event of EVENTS){
    const n=weekOutput[cohort][event];
    weekLower+=n>0&&n<5?1:n;
    weekUpper+=n>0&&n<5?4:n;
   }
   if(!Number.isSafeInteger(weekLower)||!Number.isSafeInteger(weekUpper))throw new Error('metrics_unavailable');
   const setting=weeklyThreshold();
   // The warning itself must not reveal a hidden small value at the
   // threshold boundary. Only report outcomes certain across 1..4.
   const status=setting.status==='configured'
    ?weekLower>=/** @type {number} */(setting.threshold)?'warning'
     :weekUpper</** @type {number} */(setting.threshold)?'within_threshold':'suppressed'
    :setting.status;
   return {days,events:EVENTS,cohorts:TYPES,
    counts:Object.fromEntries(TYPES.map(c=>[c,Object.fromEntries(EVENTS.map(e=>[e,hideSmall(output[c][e])]))])),
    operations:{windowCount:hasSmall(output)?null:hideSmall(windowActions),weekCount:weekHasSmall?null:hideSmall(weekActions),
     observedWindowDays:days,retentionDays:35,maxActiveCounterKeys:MAX_ACTIVE_KEYS,readKeys:keys.length,maxReadKeys:MAX_READ_KEYS,
     threshold:setting.threshold,status}};
  }
 };
}
module.exports={createPrivateMetrics,EVENTS};
