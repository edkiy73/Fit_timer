require('../lib/product');
const { createAdminHandler } = require('../../../packages/core/server/admin-handler');
const { createAIHandler } = require('../../../packages/core/server/ai-endpoint');
const { analyticsStats } = require('../lib/app-analytics');
const { createContentAdminHandler } = require('../lib/content-admin');
const { registry: unmuteAIActions } = require('../lib/unmute-ai-actions');
const { authorizeUnMuteAI } = require('../lib/unmute-ai-trial');

const { handleAdminRelease } = require('../../../packages/core/server/admin/release');

// The latest APK built by .github/workflows/unmute-android-release.yml (GitHub releases).
const ANDROID_RELEASE={
  repo:'edkiy73/Fit_timer',
  tag:'unmute-latest',
  archiveTag:'unmute-apk-archive',
  metaName:'UnMute-release.json',
  latestAsset:'UnMute-latest.apk',
  archivePrefix:'UnMute',
  userAgent:'UnMute-admin'
};
const handleRelease=(action,body,res)=>handleAdminRelease(action,res,ANDROID_RELEASE);

const handleAdmin=createAdminHandler({analyticsStats,handlers:[createContentAdminHandler(),handleRelease]});
const handleAI=createAIHandler(unmuteAIActions,{authorize:authorizeUnMuteAI});

module.exports=async(req,res)=>{
  if(req.query&&(req.query.ai_endpoint==='1'||req.query.public_config==='1')){
    return handleAI(req,res);
  }
  return handleAdmin(req,res);
};
