// @ts-check
'use strict';
const {definition,testRPC}=require('./questionnaires');
const {DomainError,reject}=require('./errors');
/** Core admin auth occurs before this product handler.
 * @param {import('./contracts').Transport} transport */
function createTestsAdmin(transport){
 /** @param {string} action @param {Record<string,unknown>} body @param {import('./contracts').Response} res */
 return async(action,body,res)=>{if(!['feture.tests.list','feture.tests.save','feture.tests.publish','feture.tests.retire'].includes(action))return false;
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');try{
  const keys=action.endsWith('.list')?['action']:action.endsWith('.save')?['action','definition','expectedRevision']:action.endsWith('.publish')?['action','testId','revision','reviewed']:['action','testId','revision'];
  if(Object.keys(body).sort().join(',')!==keys.sort().join(','))reject(422,'invalid_request');
  if(action.endsWith('.save')){definition(body.definition);if(typeof body.expectedRevision!=='number'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)reject(422,'invalid_request');}
  else if(!action.endsWith('.list')){if(typeof body.testId!=='string'||!/^[a-z][a-z0-9-]{0,47}$/.test(body.testId)||typeof body.revision!=='number'||!Number.isSafeInteger(body.revision)||body.revision<1)reject(422,'invalid_request');if(action.endsWith('.publish')&&body.reviewed!==true)reject(422,'review_required');}
  const result=await testRPC(transport,'feture_test_admin',{p_command:body});res.statusCode=200;res.end(JSON.stringify({ok:true,...result}));
 }catch(e){const safe=e instanceof DomainError?e:new DomainError(503,'domain_unavailable');res.statusCode=safe.status;res.end(JSON.stringify({error:safe.code}));}return true;};
}
module.exports={createTestsAdmin};
