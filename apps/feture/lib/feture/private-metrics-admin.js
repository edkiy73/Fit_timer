// @ts-check
'use strict';
const {DomainError,reject}=require('./errors');
/** Read-only O03.1 view behind existing Core-admin secret. No export of
 * device/account identifiers, request content, query strings or daily rows.
 * @param {ReturnType<import('./private-metrics').createPrivateMetrics>} metrics */
function createMetricsAdmin(metrics){
 /** @param {string} action @param {Record<string,unknown>} body @param {import('./contracts').Response} res */
 return async(action,body,res)=>{
  if(action!=='feture.metrics.summary')return false;
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  try{
   if(Object.keys(body).sort().join(',')!=='action,days'||body.days!==7&&body.days!==30)reject(422,'invalid_request');
   const data=await metrics.summary(/** @type {7|30} */(body.days));
   res.statusCode=200;res.end(JSON.stringify({ok:true,...data}));
  }catch(e){const safe=e instanceof DomainError?e:new DomainError(503,'metrics_unavailable');res.statusCode=safe.status;res.end(JSON.stringify({error:safe.code}));}
  return true;
 };
}
module.exports={createMetricsAdmin};
