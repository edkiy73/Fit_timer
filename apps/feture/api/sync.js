require('../lib/product');
const { createSyncHandler } = require('../../../packages/core/server/sync-core');
const { ACCOUNT_PROFILE, registry } = require('../lib/app-sync-schema');
const sync = createSyncHandler({registry, accountProfile:ACCOUNT_PROFILE});

// FetUre uses Core sync only for settings. Core premium pulls may still contain
// older, unregistered documents: whitelist the response before any bytes leave.
const { cors, fail, readBody } = require('../../../packages/core/server/util');

// The sign-in second step (optional factor, server/core-guard.mjs) guards settings sync like every other endpoint.
module.exports = async (req,res) => {
  if(req.method==='POST'){
    let body;
    try{ body = await readBody(req, 4 * 1024 * 1024); }catch{ cors(req,res); return fail(res,413,'too_large'); }
    req.body = body; req.rawBody = undefined;
    const { guardCoreBody } = await import('../server/core-guard.mjs');
    const refusal = await guardCoreBody(req, body);
    if(refusal){ if(cors(req,res)) return; return fail(res, refusal.status, refusal.error, refusal.rule ? {rule:refusal.rule} : {}); }
  }
  return filtered(req,res);
};
const filtered = (req,res) => sync(req,new Proxy(res,{
  get(target,key){
    if(key==='end')return value=>{
      if(target.statusCode===200){
        try{
          const data=JSON.parse(value);
          if(Array.isArray(data.accountDocs)){
            data.accountDocs=data.accountDocs.filter(doc=>doc&&doc.key==='settings');
            data.profiles=[];
          }
          return target.end(JSON.stringify(data));
        }catch{
          target.statusCode=503;return target.end(JSON.stringify({error:'sync_unavailable'}));
        }
      }
      return target.end(value);
    };
    const value=Reflect.get(target,key,target);
    return typeof value==='function'?value.bind(target):value;
  },
  set(target,key,value){return Reflect.set(target,key,value,target);}
}));
