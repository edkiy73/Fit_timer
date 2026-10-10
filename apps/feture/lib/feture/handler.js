// @ts-check
'use strict';
const { randomUUID } = require('node:crypto');
const { authenticate } = require('./identity');
const { requireAdult } = require('./permissions');
const { DomainError } = require('./errors');
const { readBody,command } = require('./validation');
/** @typedef {import('./contracts').Request} Request */
/** @typedef {import('./contracts').Response} Response */
/** @param {{store:import('./contracts').AccountStore;repository:import('./contracts').Repository;cors:(req:Request,res:Response)=>boolean;quota:(req:Request,scope:string)=>Promise<boolean>;audit:(event:import('./contracts').AuditEvent)=>void}} deps */
function createHandler({store,repository,cors,quota,audit}) {
  /** @param {Request} req @param {Response} res */
  return async function handler(req,res) {
    const requestId=randomUUID();
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Request-ID',requestId);
    if(cors(req,res))return;
    /** @type {import('./contracts').AuditEvent['action']} */
    let action='unknown';
    /** Audit allowlist contains no actor/email/URL/body/answers/token/DB errors. */
    const record=/** @param {string} outcome */(outcome)=>{try {audit(Object.freeze({requestId,action,outcome}));} catch { /* Logging failure never exposes the request. */ }};
    /** @param {number} status @param {object} value */
    const send=(status,value)=>{res.statusCode=status;res.end(JSON.stringify(value));};
    try {
      if(req.method!=='POST'){res.setHeader('Allow','POST, OPTIONS');record('method_not_allowed');return send(405,{error:'method_not_allowed',requestId});}
      const actor=await authenticate(req,store);
      if(!(await quota(req,actor.accountHash))){res.setHeader('Retry-After','60');record('rate_limited');return send(429,{error:'rate_limited',requestId});}
      const input=command(await readBody(req));action=input.action;
      if(input.action==='profile.get') {
        const profile=await repository.getProfile(actor);record('ok');return send(200,{ok:true,profile,requestId});
      }
      requireAdult(actor); // Also enforced by repository: alternate callers cannot bypass.
      if(input.action==='interests.set'||input.action==='interests.delete') {
        const result=await repository.mutateInterest(actor,input);record(result.ok?'ok':result.error);
        return send(result.ok?200:409,{...result,requestId});
      }
      const page=await repository.listInterests(actor,input);record('ok');return send(200,{ok:true,...page,requestId});
    } catch(error) {
      const safe=error instanceof DomainError?error:new DomainError(503,'domain_unavailable');record(safe.code);return send(safe.status,{error:safe.code,requestId});
    }
  };
}
module.exports={createHandler};
