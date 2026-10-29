// @ts-check
'use strict';
const {createHash}=require('node:crypto');
const {authenticate}=require('./identity');
const {readBody}=require('./validation');
const {DomainError,reject}=require('./errors');
const {createQaAdultAdmin}=require('./qa-adult');
const {postReview}=require('./post-review');
const {commentReview}=require('./comment-review');
const {eventStaffQueue,eventStaffDecision,eventStaffPublish}=require('./events-staff');
const {timingSafeEqual}=require('node:crypto');
/** @param {string} a @param {string} b */
const sameSecret=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
/** Only this endpoint supplies the authenticated actor and bootstrap authority.
 * QA roles never enter Core admin handlers or read private map/tests/journal.
 * @param {{transport:import('./contracts').Transport,accounts:import('./contracts').AccountStore,cors:(req:import('./contracts').Request,res:import('./contracts').Response)=>boolean,quota:(req:import('./contracts').Request,owner:string)=>Promise<boolean>,guard?:(req:import('./contracts').Request,actor:import('./contracts').Actor)=>Promise<void>}} deps */
function createOperatorEndpoint({transport,accounts,cors,quota,guard}){
 /** @param {import('./contracts').Request} req @param {import('./contracts').Response} res */
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
  if(cors(req,res))return;
  try{
   if(req.method!=='POST')reject(405,'method_not_allowed');
   const actor=await authenticate(req,accounts);
   if(guard)await guard(req,actor); // the second step of the sign-in (server/core-guard.mjs)
   if(!actor.accountGeneration)reject(403,'forbidden');
   if(!await quota(req,actor.accountHash))reject(429,'rate_limited');
   const input=await readBody(req);
   if(!input||typeof input!=='object'||Array.isArray(input))reject(422,'invalid_request');
   const body=/** @type {Record<string,unknown>} */(input);
   const action=body.action;
   if(typeof action!=='string')reject(422,'invalid_request');
   // Check staff role BEFORE any email lookup: ordinary accounts must not
   // distinguish existing Core accounts by different lookup/grant errors.
   if(action.startsWith('feture.posts.')){const result=await postReview(transport,actor,body);res.statusCode=200;res.end(JSON.stringify(result));return;}
   if(action.startsWith('feture.events.')){const result=await (action==='feture.events.decide'?eventStaffDecision(transport,actor,body):action==='feture.events.publish'?eventStaffPublish(transport,actor,body):eventStaffQueue(transport,actor,body));res.statusCode=200;res.end(JSON.stringify(result));return;}
   if(action.startsWith('feture.comments.')){const result=await commentReview(transport,actor,body);res.statusCode=200;res.end(JSON.stringify(result));return;}
   if(action.startsWith('feture.qa.')||action==='feture.operators.set'){
    if(!transport.configured())reject(503,'operators_unavailable');
    const check=await transport.request('/rest/v1/rpc/feture_operator_bound_command',{
     method:'POST',headers:{'Content-Type':'application/json'},timeoutMs:8000,
     body:JSON.stringify({p_actor:actor.accountHash,p_generation:actor.accountGeneration,p_target_generation:null,p_bootstrap:false,p_command:{action:'status'}})});
    const permission=await check.json();
    if(!check.ok||!permission||permission.ok!==true)reject(503,'operators_unavailable');
    const allowed=action==='feture.operators.set'?['manager']:['feture.qa.grant','feture.qa.revoke'].includes(action)?['manager','qa_operator']:['manager','qa_operator','auditor'];
    if(!allowed.includes(permission.role))reject(403,'forbidden');
   }
   if(action.startsWith('feture.qa.')){
    if(!await createQaAdultAdmin(transport,accounts,actor)(action,body,res))reject(400,'unknown_action');
    return;
   }
   const names=action==='feture.operators.set'?(Object.hasOwn(body,'expectedAccountHash')?'action,email,expectedAccountHash,expectedRevision,role':'action,email,expectedRevision,role'):'action';
   if(Object.keys(body).sort().join(',')!==names||!['feture.operators.status','feture.operators.bootstrap','feture.operators.set'].includes(action))reject(422,'invalid_request');
   let bootstrap=false;
   if(action==='feture.operators.bootstrap'){
    let key='';try{key=decodeURIComponent(String(req.headers['x-admin-key']||''));}catch{}
    if(!process.env.ADMIN_KEY||!sameSecret(key,process.env.ADMIN_KEY))reject(403,'bad_key');
    bootstrap=true;
   }
   /** @type {Record<string,unknown>} */
   const cmd={action:action.split('.').pop()};
   let targetGeneration=null;
   if(action==='feture.operators.set'){
    if(typeof body.email!=='string'||body.email.length>120||!['manager','qa_operator','auditor',null].includes(/** @type {string|null} */(body.role))||typeof body.expectedRevision!=='number'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)reject(422,'invalid_request');
    const email=body.email.trim().toLowerCase();
    if(!/^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/.test(email))reject(422,'invalid_request');
    const hash=createHash('sha256').update(email).digest('hex').slice(0,32);
    if(Object.hasOwn(body,'expectedAccountHash')&&body.expectedAccountHash!==hash)reject(422,'invalid_request');
    let account;try{account=JSON.parse(await accounts.get('a:'+hash)||'null');}catch{reject(503,'identity_unavailable');}
    if(!account||account.email!==email)reject(404,'account_not_found');
    if(typeof account.since!=='string'||!Number.isFinite(Date.parse(account.since)))reject(403,'forbidden');
    targetGeneration=createHash('sha256').update(hash+':'+account.since).digest('hex');
    Object.assign(cmd,{accountHash:hash,role:body.role,expectedRevision:body.expectedRevision});
   }
   if(!transport.configured())reject(503,'operators_unavailable');
   const reply=await transport.request('/rest/v1/rpc/feture_operator_bound_command',{
    method:'POST',headers:{'Content-Type':'application/json'},timeoutMs:8000,
    body:JSON.stringify({p_actor:actor.accountHash,p_generation:actor.accountGeneration,p_target_generation:targetGeneration,p_bootstrap:bootstrap,p_command:cmd})});
   const result=await reply.json();
   if(!reply.ok||!result||typeof result!=='object'||Array.isArray(result))reject(503,'operators_unavailable');
   if(result.ok!==true){
    const code=result.error;
    if(['forbidden','already_initialized','last_manager'].includes(code))reject(403,code);
    if(code==='revision_conflict')reject(409,code);
    if(code==='invalid_request')reject(422,code);
    reject(503,'operators_unavailable');
   }
   // Closed SQL DTO: no arbitrary upstream payload reaches the client.
   if(!Array.isArray(result.items)||result.items.length>100||!result.items.every((/** @type {Record<string,unknown>} */ x)=>x&&/^[a-f0-9]{32}$/.test(String(x.accountHash))&&['manager','qa_operator','auditor',null].includes(/** @type {string|null} */(x.role))&&Number.isSafeInteger(x.revision)&&Number(x.revision)>0)||!['manager','qa_operator','auditor',null].includes(result.role)||typeof result.initialized!=='boolean')reject(503,'operators_unavailable');
   if(!Array.isArray(result.events)||result.events.length>25||!result.events.every((/** @type {Record<string,unknown>} */ x)=>x&&/^[a-f0-9]{32}$/.test(String(x.actor))&&/^[a-f0-9]{32}$/.test(String(x.accountHash))&&['bootstrap','role_set'].includes(String(x.action))&&['manager','qa_operator','auditor',null].includes(/** @type {string|null} */(x.role))&&Number.isSafeInteger(x.revision)&&Number(x.revision)>0&&typeof x.at==='string'&&Number.isFinite(Date.parse(x.at))))reject(503,'operators_unavailable');
   res.statusCode=200;res.end(JSON.stringify({ok:true,events:result.events.map((/** @type {Record<string,unknown>} */ x)=>({actor:x.actor,accountHash:x.accountHash,action:x.action,role:x.role,revision:x.revision,at:x.at})),role:result.role,initialized:result.initialized,items:result.items.map((/** @type {Record<string,unknown>} */ x)=>({accountHash:x.accountHash,role:x.role,revision:x.revision}))}));
  }catch(e){const safe=e instanceof DomainError?e:new DomainError(503,'operators_unavailable');res.statusCode=safe.status;res.end(JSON.stringify({error:safe.code}));}
 };
}
module.exports={createOperatorEndpoint};
