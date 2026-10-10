require('../lib/product');
const { createSyncHandler } = require('../../../packages/core/server/sync-core');
const { ACCOUNT_PROFILE, registry } = require('../lib/app-sync-schema');
const sync = createSyncHandler({registry, accountProfile:ACCOUNT_PROFILE});

// FetUre uses Core sync only for settings. Core premium pulls may still contain
// older, unregistered documents: whitelist the response before any bytes leave.
module.exports = (req,res) => sync(req,new Proxy(res,{
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
