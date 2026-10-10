'use strict';
require('../lib/product');
const { store } = require('../../../packages/core/server/store');
const Supabase = require('../../../packages/core/server/supabase');
const { cors,rateOkScoped } = require('../../../packages/core/server/util');
const { reject } = require('../lib/feture/errors');
const { createHandler } = require('../lib/feture/handler');
const { createRepository } = require('../lib/feture/repository');
module.exports=createHandler({
  store,repository:createRepository(Supabase),cors,
  quota:async(req,accountHash)=>{
    // Global account quota: changing devices/IP does not reset it. Core stores ephemeral rl:* keys.
    const window=Math.floor(Date.now()/60000);
    let count;
    try {count=await store.incr(`rl:feture-domain-account:${accountHash}:${window}`,65);}
    catch {reject(503,'quota_unavailable');}
    return count<=120 && await rateOkScoped(req,'feture-domain-ip',240,'',60,true);
  },
  audit:event=>console.info('feture_domain_access',JSON.stringify(event))
});
