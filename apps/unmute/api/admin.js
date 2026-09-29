require('../lib/product');
const { createAdminHandler } = require('../../../packages/core/server/admin-handler');
const { createAIHandler } = require('../../../packages/core/server/ai-endpoint');
const { analyticsStats } = require('../lib/app-analytics');
const { createContentAdminHandler } = require('../lib/content-admin');
const { registry: unmuteAIActions } = require('../lib/unmute-ai-actions');

const handleAdmin=createAdminHandler({analyticsStats,handlers:[createContentAdminHandler()]});
const handleAI=createAIHandler(unmuteAIActions);

module.exports=async(req,res)=>{
  if(req.query&&(req.query.ai_endpoint==='1'||req.query.public_config==='1')){
    return handleAI(req,res);
  }
  return handleAdmin(req,res);
};
