// @ts-check
'use strict';
const {reject,DomainError}=require('./errors');
const {uuid}=require('./documents');
const {createAccessGuard}=require('./access-guard');
const {requireOwner}=require('./permissions');
const {interestState,INTEREST_ID}=require('./interest-model');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** @param {unknown} v @param {string[]} keys */
function shape(v,keys){if(!object(v)||Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k)))reject(422,'invalid_request');return v;}
/** @param {unknown} v @param {number} max @returns {string} */
function plain(v,max){if(typeof v!=='string'||!v.trim()||v.length>max||/[\x00-\x1f\x7f]/.test(v))reject(422,'invalid_request');return /** @type {string} */(v);}
/** @param {unknown} v @returns {string} */
function slug(v){const s=plain(v,48);if(!/^[a-z][a-z0-9-]{0,47}$/.test(s))reject(422,'invalid_request');return s;}
/** Admin-defined JSON is data only. Uniform bounded 0..4 weights, no expressions/eval.
 * @param {unknown} input @returns {import('./questionnaires').TestDefinition} */
function definition(input){
 const v=shape(input,['id','title','description','dimensions','questions']);slug(v.id);plain(v.title,160);plain(v.description,1200);
 if(!Array.isArray(v.dimensions)||v.dimensions.length<1||v.dimensions.length>4||!Array.isArray(v.questions)||v.questions.length<6||v.questions.length>12)reject(422,'invalid_request');
 const dimensions=/** @type {unknown[]} */(v.dimensions).map(d=>{const r=shape(d,['id','title','low','mid','high']);slug(r.id);plain(r.title,120);for(const k of ['low','mid','high'])plain(r[k],800);return r;});
 const ids=dimensions.map(d=>d.id);if(new Set(ids).size!==ids.length)reject(422,'invalid_request');
 const questions=/** @type {unknown[]} */(v.questions).map(q=>{const r=shape(q,['id','prompt','dimension','kind','options']);slug(r.id);plain(r.prompt,600);
  if(!ids.includes(r.dimension)||!['single','multi','scale'].includes(String(r.kind))||!Array.isArray(r.options)||r.options.length<2||r.options.length>6||r.kind==='scale'&&r.options.length!==5)reject(422,'invalid_request');
  const options=/** @type {unknown[]} */(r.options).map(o=>{const s=shape(o,['id','label','score']);slug(s.id);plain(s.label,240);if(typeof s.score!=='number'||!Number.isInteger(s.score)||s.score<0||s.score>4)reject(422,'invalid_request');return s;});
  if(new Set(options.map(o=>o.id)).size!==options.length||r.kind==='scale'&&options.some((o,i)=>o.score!==i))reject(422,'invalid_request');return r;
 });
 if(new Set(questions.map(q=>q.id)).size!==questions.length||ids.some(id=>questions.filter(q=>q.dimension===id).length<2)||Buffer.byteLength(JSON.stringify(v))>24000)reject(422,'invalid_request');
 return /** @type {import('./questionnaires').TestDefinition} */(v);
}
/** @param {unknown} input @returns {import('./questionnaires').Answers} */
function answers(input){if(!object(input)||Object.keys(input).length>12)reject(422,'invalid_request');for(const [k,v] of Object.entries(input)){slug(k);if(v!==null&&(!Array.isArray(v)||v.length<1||v.length>6||new Set(v).size!==v.length||!v.every(x=>typeof x==='string'&&/^[a-z][a-z0-9-]{0,47}$/.test(x))))reject(422,'invalid_request');}return /** @type {import('./questionnaires').Answers} */(input);}
/** @param {unknown} input @returns {import('./questionnaires').TestsCommand} */
function testsCommand(input){if(!object(input))reject(422,'invalid_request');const v=/** @type {Record<string,unknown>} */(input),action=v.action;
 if(action==='tests.mapPreview'){shape(v,['action','attemptId']);if(!uuid(v.attemptId))reject(422,'invalid_request');return /** @type {import('./questionnaires').TestsCommand} */(v);}
 if(action==='tests.mapApply'){shape(v,['action','attemptId','operationId','selected']);if(!uuid(v.attemptId)||!uuid(v.operationId)||!Array.isArray(v.selected)||v.selected.length<1||v.selected.length>6)reject(422,'invalid_request');const ids=/** @type {unknown[]} */(v.selected).map(s=>{const item=shape(s,['interestId','expectedRevision']);if(typeof item.interestId!=='string'||!INTEREST_ID.test(item.interestId)||item.expectedRevision!==0)reject(422,'invalid_request');return item.interestId;});if(new Set(ids).size!==ids.length)reject(422,'invalid_request');return /** @type {import('./questionnaires').TestsCommand} */(v);}
 if(action==='tests.list'){shape(v,['action']);return {action};}
 if(action==='tests.start'){shape(v,['action','testId','operationId']);slug(v.testId);if(!uuid(v.operationId))reject(422,'invalid_request');return /** @type {import('./questionnaires').TestsCommand} */(v);}
 if(action==='tests.read'){shape(v,['action','attemptId']);if(!uuid(v.attemptId))reject(422,'invalid_request');return /** @type {import('./questionnaires').TestsCommand} */(v);}
 if(action!=='tests.save'&&action!=='tests.complete'&&action!=='tests.delete')reject(422,'invalid_request');
 shape(v,action==='tests.delete'?['action','attemptId','operationId','expectedRevision']:['action','attemptId','operationId','expectedRevision','answers','position']);
 if(!uuid(v.attemptId)||!uuid(v.operationId)||typeof v.expectedRevision!=='number'||!Number.isSafeInteger(v.expectedRevision)||v.expectedRevision<1||v.expectedRevision>=Number.MAX_SAFE_INTEGER)reject(422,'invalid_request');
 if(action!=='tests.delete'){answers(v.answers);if(typeof v.position!=='number'||!Number.isInteger(v.position)||v.position<0||v.position>11)reject(422,'invalid_request');}
 return /** @type {import('./questionnaires').TestsCommand} */(v);
}
/** @param {import('./contracts').Command} c @returns {c is import('./questionnaires').TestsCommand} */
const isTestsCommand=c=>c.action.startsWith('tests.');
/** @param {import('./contracts').Transport} transport @param {import('./documents').DocumentsRepository} documents @returns {import('./questionnaires').TestsRepository} */
function createTestsRepository(transport,documents){const guard=createAccessGuard(documents);return {async execute(actor,input){requireOwner(actor,actor.accountHash);const c=testsCommand(input);if(c.action!=='tests.delete')await guard(actor);const result=await testRPC(transport,c.action==='tests.mapPreview'||c.action==='tests.mapApply'?'feture_test_map_command':'feture_test_command',{p_owner:actor.accountHash,p_command:c});return testsDTO(c,result);}};}
/** Whitelist transport output, including nested objects. Never forward owner or future columns.
 * @param {unknown} input @param {string[]} keys @returns {Record<string,unknown>} */
function pick(input,keys){if(!object(input)||keys.some(k=>!Object.hasOwn(input,k)))reject(503,'domain_unavailable');return Object.fromEntries(keys.map(k=>[k,input[k]]));}
/** @param {unknown} input */
function versionDTO(input){const v=pick(input,['id','testId','revision','definition','publishedAt']);
 if(!uuid(v.id)||typeof v.revision!=='number'||!Number.isSafeInteger(v.revision)||v.revision<1||typeof v.publishedAt!=='string'||!Number.isFinite(Date.parse(v.publishedAt)))reject(503,'domain_unavailable');
 const d=pick(v.definition,['id','title','description','dimensions','questions']);if(!Array.isArray(d.dimensions)||!Array.isArray(d.questions))reject(503,'domain_unavailable');
 d.dimensions=d.dimensions.map(x=>pick(x,['id','title','low','mid','high']));d.questions=d.questions.map(x=>{const q=pick(x,['id','prompt','dimension','kind','options']);if(!Array.isArray(q.options))reject(503,'domain_unavailable');q.options=q.options.map(o=>pick(o,['id','label','score']));return q;});
 try{v.definition=definition(d);}catch{return reject(503,'domain_unavailable');}if(v.testId!==d.id)reject(503,'domain_unavailable');return v;
}
/** A provider result is not authoritative merely because its fields exist:
 * interpretations must come from the pinned editorial version, never arbitrary
 * text in an unexpected backend response.
 * @param {unknown} input @param {import('./questionnaires').TestDefinition} definition
 * @param {import('./questionnaires').Answers} given */
function scoreDTO(input,definition,given){
 const r=pick(input,['answered','total','dimensions']);
 if(!Number.isSafeInteger(r.answered)||r.answered<0||r.total!==definition.questions.length
   ||r.answered>r.total||!Array.isArray(r.dimensions)||r.dimensions.length!==definition.dimensions.length)reject(503,'domain_unavailable');
 const seen=new Set();let counted=0;
 r.dimensions=r.dimensions.map(raw=>{
  const d=pick(raw,['id','answered','total','average','level','interpretation','questionIds']);
  const editorial=definition.dimensions.find(item=>item.id===d.id);
  const dimensionQuestions=definition.questions.filter(q=>q.dimension===d.id);
  const questions=dimensionQuestions.map(q=>q.id);
  if(!editorial||seen.has(d.id)||d.total!==questions.length||!Number.isSafeInteger(d.answered)
    ||d.answered<0||d.answered>d.total||!Array.isArray(d.questionIds)
    ||d.questionIds.length!==d.answered||new Set(d.questionIds).size!==d.questionIds.length
    ||d.questionIds.some(id=>typeof id!=='string'||!questions.includes(id)||given[id]===null||given[id]===undefined)
    ||questions.filter(id=>given[id]!==null&&given[id]!==undefined).length!==d.answered)
    reject(503,'domain_unavailable');
  seen.add(d.id);counted+=d.answered;
  const insufficient=d.answered<Math.ceil(questions.length/2);
  // Match SQL feture_test_score: each answered question contributes equally;
  // multi-select questions use the mean of their selected 0..4 weights.
  // LCM(1..6)=60 keeps intermediate sums integral before rounding to 2 decimals.
  let scaledScoreSum=0;
  for(const q of dimensionQuestions){
   const selected=given[q.id];
   if(selected===null||selected===undefined)continue;
   if(!Array.isArray(selected)||!selected.length||selected.length>q.options.length)reject(503,'domain_unavailable');
   let weights=0;
   for(const id of selected){
    const option=q.options.find(o=>o.id===id);
    if(!option)reject(503,'domain_unavailable');
    weights+=option.score;
   }
   scaledScoreSum+=weights*60/selected.length;
  }
  const expectedAverage=insufficient?null:Math.floor((scaledScoreSum*100)/(60*d.answered)+0.5)/100;
  const average=d.average;
  if(average!==expectedAverage)reject(503,'domain_unavailable');
  const level=average===null?'insufficient':average<1.5?'low':average<2.75?'mid':'high';
  const expected=level==='insufficient'
   ?'Пока мало ответов для вывода. Можно вернуться к этим вопросам позже.'
   :editorial[/** @type {'low'|'mid'|'high'} */(level)];
  if(d.level!==level||d.interpretation!==expected)reject(503,'domain_unavailable');
  return d;
 });
 if(counted!==r.answered)reject(503,'domain_unavailable');
 return r;
}
/** @param {unknown} input */
function attemptDTO(input){const a=pick(input,['id','version','status','answers','position','revision','result','updatedAt']);
 if(!uuid(a.id)||!['draft','completed'].includes(String(a.status))||typeof a.revision!=='number'||!Number.isSafeInteger(a.revision)||a.revision<1||typeof a.position!=='number'||!Number.isInteger(a.position)||a.position<0||a.position>11||typeof a.updatedAt!=='string'||!Number.isFinite(Date.parse(a.updatedAt)))reject(503,'domain_unavailable');a.version=versionDTO(a.version);
 try{a.answers=answers(a.answers);}catch{return reject(503,'domain_unavailable');}
 if(a.result!==null)a.result=scoreDTO(a.result,/** @type {import('./questionnaires').TestDefinition} */(a.version.definition),/** @type {import('./questionnaires').Answers} */(a.answers));if((a.status==='completed')!==(a.result!==null))reject(503,'domain_unavailable');return a;
}
/** Strict server projection for private attempt history. A malformed storage
 * response must fail closed instead of shipping an invalid 200 JSON payload.
 * Keep the metadata-only allowlist: no answers or owner identifiers in list.
 * @param {unknown} input */
function attemptSummaryDTO(input){
 const a=pick(input,['id','testId','title','status','revision','updatedAt']);
 if(!uuid(a.id)||typeof a.testId!=='string'||!/^[a-z][a-z0-9-]{0,47}$/.test(a.testId)
  ||typeof a.title!=='string'||!a.title.trim()||a.title.length>160||/[\x00-\x1f\x7f]/.test(a.title)
  ||!['draft','completed'].includes(a.status)
  ||typeof a.revision!=='number'||!Number.isSafeInteger(a.revision)||a.revision<1
  ||typeof a.updatedAt!=='string'||!Number.isFinite(Date.parse(a.updatedAt))
  ||!/^(?:\d{4}-\d\d-\d\d)T\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(a.updatedAt))
  reject(503,'domain_unavailable');
 return a;
}
/** @param {import('./questionnaires').TestsCommand} c @param {Record<string,unknown>} result */
function testsDTO(c,result){
 if(c.action==='tests.mapApply'){if(typeof result.replayed!=='boolean'||typeof result.applied!=='number'||!Number.isInteger(result.applied)||result.applied<1||result.applied>6)reject(503,'domain_unavailable');return {replayed:result.replayed,applied:result.applied};}
 if(c.action==='tests.mapPreview'){if(result.attemptId!==c.attemptId||!uuid(result.versionId)||!Array.isArray(result.items)||result.items.length>6)reject(503,'domain_unavailable');const items=result.items.map(v=>{const x=pick(v,['interestId','title','reason','dimensionId','available','blockedReason','next']);if(typeof x.interestId!=='string'||!INTEREST_ID.test(x.interestId)||typeof x.title!=='string'||x.title.length>160||typeof x.reason!=='string'||x.reason.length>600||typeof x.dimensionId!=='string'||typeof x.available!=='boolean'||x.blockedReason!==(x.available?null:'existing_choice'))reject(503,'domain_unavailable');let state;try{state=interestState(pick(x.next,['stance','experience','boundary','boundaryNote','intensity','visibility','useForDiscovery']));}catch{return reject(503,'domain_unavailable');}if(state.stance!=='curious'||state.experience!=='unspecified'||state.boundary!=='none'||state.boundaryNote!==null||state.intensity!==null||state.visibility!=='private'||state.useForDiscovery)reject(503,'domain_unavailable');return {...x,next:state};});if(new Set(items.map(x=>x.interestId)).size!==items.length)reject(503,'domain_unavailable');return {attemptId:result.attemptId,versionId:result.versionId,items};}
 if(c.action==='tests.delete'){if(result.deleted!==true)reject(503,'domain_unavailable');return {deleted:true};}
 if(c.action==='tests.list'){if(!Array.isArray(result.versions)||result.versions.length>30||!Array.isArray(result.attempts)||result.attempts.length>100)reject(503,'domain_unavailable');const attempts=result.attempts.map(attemptSummaryDTO);if(new Set(attempts.map(a=>a.id)).size!==attempts.length)reject(503,'domain_unavailable');return {versions:result.versions.map(versionDTO),attempts};}
 const attempt=attemptDTO(result.attempt);if(c.action!=='tests.start'&&attempt.id!==c.attemptId)reject(503,'domain_unavailable');if(result.replayed!==undefined&&typeof result.replayed!=='boolean')reject(503,'domain_unavailable');return {attempt,...(result.replayed===undefined?{}:{replayed:result.replayed})};
}
/** @param {import('./contracts').Transport} transport @param {string} name @param {Record<string,unknown>} body @returns {Promise<Record<string,unknown>>} */
async function testRPC(transport,name,body){if(!transport.configured())reject(503,'domain_unavailable');let result;try{const r=await transport.request('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),timeoutMs:8000});if(!r.ok)reject(503,'domain_unavailable');result=await r.json();}catch{return reject(503,'domain_unavailable');}
 if(!object(result))reject(503,'domain_unavailable');if(result.ok!==true){const e=result.error;if(e==='resource_not_found')reject(404,e);if(e==='revision_conflict'||e==='operation_conflict'||e==='attempt_completed'||e==='map_changed')throw new DomainError(409,e);if(e==='invalid_request'||e==='answers_incomplete'||e==='review_required')reject(422,String(e));if(e==='test_limit')reject(429,e);reject(503,'domain_unavailable');}const {ok,...value}=result;return value;
}
module.exports={definition,answers,testsCommand,isTestsCommand,createTestsRepository,testRPC};
