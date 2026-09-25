/* POST /api/admin — single authenticated Admin dispatcher.
   Reusable actions live in lib/admin/core/*.
   FitTimer domain actions live in lib/admin/fittimer/*.
   Keep one Vercel endpoint so auth/rate-limit behavior stays centralized. */

const { store } = require('../lib/store');
const { fail, readBody, rateOkScoped, sameSecret, cors } = require('../lib/util');
const { createAIHandler } = require('../lib/ai-endpoint');
const { registry: fitAIActions } = require('../lib/fit-ai-actions');
const handleAI = createAIHandler(fitAIActions);

const { handleAdminObservability } = require('../lib/admin/core/observability');
const { handleAdminAccounts } = require('../lib/admin/core/accounts');
const { handleAdminCampaigns } = require('../lib/admin/core/campaigns');
const { handleAdminAISettings } = require('../lib/admin/core/ai-settings');
const { handleAdminRelease } = require('../lib/admin/core/release');

const { handleCatalogTextAI } = require('../lib/admin/fittimer/catalog-ai');
const { handleCatalogImageAI } = require('../lib/admin/fittimer/catalog-images');
const { handleCatalogAdmin } = require('../lib/admin/fittimer/catalog-admin');

const ANDROID_RELEASE_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(process.env.ANDROID_RELEASE_REPO || '')
  ? process.env.ANDROID_RELEASE_REPO : 'edkiy73/Fit_timer';

module.exports = async (req, res) => {
  if(req.query && (req.query.ai_endpoint === '1' || req.query.public_config === '1')){
    return handleAI(req, res);
  }
  if(cors(req, res)) return;
  if(req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  if(!store.configured()) return fail(res, 503, 'no_store');

  const admin = process.env.ADMIN_KEY || '';
  if(!admin) return fail(res, 503, 'no_admin_key');

  if(!(await rateOkScoped(req, 'admin-auth', 30, '', 3600, true))){
    return fail(res, 429, 'rate_limited');
  }

  let given = String(req.headers['x-admin-key'] || '');
  try{
    given = decodeURIComponent(given);
  }catch(_){
    return fail(res, 403, 'bad_key');
  }
  if(!sameSecret(given, admin)) return fail(res, 403, 'bad_key');

  let body;
  try{
    body = await readBody(req);
  }catch(_){
    return fail(res, 413, 'too_large');
  }
  const action = (body && body.action) || '';

  if(await handleAdminRelease(action,res,{
    repo:ANDROID_RELEASE_REPO,
    tag:'latest-apk',
    archiveTag:'apk-archive',
    metaName:'FitTimer-release.json',
    latestAsset:'FitTimer-latest.apk',
    archivePrefix:'FitTimer',
    userAgent:'FitTimer-admin'
  })) return;

  if(await handleAdminObservability(action,body,res)) return;
  if(await handleAdminAccounts(action,body,res)) return;
  if(await handleAdminCampaigns(action,body,res)) return;
  if(await handleAdminAISettings(action,body,res)) return;

  if(await handleCatalogTextAI(action,body,res)) return;
  if(await handleCatalogImageAI(action,body,res)) return;
  if(await handleCatalogAdmin(action,body,res)) return;

  return fail(res,400,'unknown_action');
};
