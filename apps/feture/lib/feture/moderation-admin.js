// @ts-check
'use strict';
const {createModerationRepository,queueItem}=require('./moderation');
const {uuid}=require('./documents');
const {reject,DomainError}=require('./errors');
/** Core invokes this only after its secret/quota/store checks. Shared key operator
 * is honestly labeled core-admin; individual staff attribution remains O02.
 * @param {import('./contracts').Transport} transport @param {import('./contracts').AccountStore} store */
function createModerationAdmin(transport,store){const repo=createModerationRepository(transport,store);
 /** @param {string} action @param {Record<string,unknown>} body @param {import('./contracts').Response} res */
 return async(action,body,res)=>{
  if(!['feture.moderation.queue','feture.moderation.decide','feture.moderation.decisionStatus'].includes(action))return false;
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
  try{let result;
   if(action==='feture.moderation.queue'){
    if(Object.keys(body).sort().join(',')!=='action,cursor,kind'||body.kind!=='cases'&&body.kind!=='appeals'||body.cursor!==null&&!uuid(body.cursor))reject(422,'invalid_request');
    const r=await repo.rpc('feture_moderation_queue',{p_kind:body.kind,p_after:body.cursor});if(!Array.isArray(r.items)||r.items.length>30||r.nextCursor!==null&&!uuid(r.nextCursor))reject(503,'moderation_unavailable');result={ok:true,items:r.items.map(queueItem),nextCursor:r.nextCursor};
   }else if(action==='feture.moderation.decisionStatus'){
    if(Object.keys(body).sort().join(',')!=='action,caseId,operationId'||!uuid(body.caseId)||!uuid(body.operationId))reject(422,'invalid_request');
    const r=await repo.rpc('feture_moderation_decision_status',{p_id:body.operationId,p_case:body.caseId});
    if(r.state!=='applied'&&r.state!=='unknown')reject(503,'moderation_unavailable');
    result={ok:true,state:r.state};
   }else{
    if(Object.keys(body).sort().join(',')!=='action,caseId,days,decision,expectedRevision,operationId,reason'||!uuid(body.caseId)||!uuid(body.operationId)||typeof body.expectedRevision!=='number'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1||typeof body.decision!=='string'||!['dismiss','hide','suspend','restore'].includes(body.decision)||typeof body.reason!=='string'||!['policy','abuse','age','illegal','insufficient','appeal'].includes(body.reason)||typeof body.days!=='number'||!Number.isInteger(body.days)||body.days<1||body.days>365)reject(422,'invalid_request');
    await repo.rpc('feture_moderation_decide',{p_id:body.operationId,p_case:body.caseId,p_expected:body.expectedRevision,p_action:body.decision,p_reason:body.reason,p_days:body.days});result={ok:true};
   }res.statusCode=200;res.end(JSON.stringify(result));
  }catch(e){const safe=e instanceof DomainError?e:new DomainError(503,'moderation_unavailable');res.statusCode=safe.status;res.end(JSON.stringify({error:safe.code}));}return true;
 };
}
module.exports={createModerationAdmin};
