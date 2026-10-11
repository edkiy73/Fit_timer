'use strict';
require('../lib/product');
const { store } = require('../../../packages/core/server/store');
const Supabase = require('../../../packages/core/server/supabase');
const { cors,rateOkScoped } = require('../../../packages/core/server/util');
const { reject } = require('../lib/feture/errors');
const { createHandler } = require('../lib/feture/handler');
const { createRepository } = require('../lib/feture/repository');
const { createDocumentsRepository } = require('../lib/feture/documents');
const {createProfileRepository}=require('../lib/feture/profile');
const {createAccessRepository}=require('../lib/feture/access');
const {createModerationRepository}=require('../lib/feture/moderation');
const {createTestsRepository}=require('../lib/feture/questionnaires');
const {createJournalRepository}=require('../lib/feture/journal');
const {createShareRepository}=require('../lib/feture/shares');
const documents=createDocumentsRepository(Supabase);
module.exports=createHandler({
  store,tests:createTestsRepository(Supabase,documents),journal:createJournalRepository(Supabase,documents),shares:createShareRepository(Supabase,documents),repository:createRepository(Supabase,documents),documents,profiles:createProfileRepository(Supabase,documents),access:createAccessRepository(Supabase,documents,store),moderation:createModerationRepository(Supabase,store),cors,
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
