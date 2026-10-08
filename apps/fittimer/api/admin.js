/* POST /api/admin — single authenticated Admin dispatcher.
   Reusable actions live in lib/admin/core/*.
   FitTimer domain actions live in lib/admin/fittimer/*.
   Keep one Vercel endpoint so auth/rate-limit behavior stays centralized. */
require('../lib/product');

const { store } = require('../../../packages/core/server/store');
const { fail, readBody, rateOkScoped, sameSecret, cors, ipHash } = require('../../../packages/core/server/util');
const { createAIHandler } = require('../../../packages/core/server/ai-endpoint');
const { registry: fitAIActions } = require('../lib/fit-ai-actions');
const handleAI = createAIHandler(fitAIActions);

const { createAdminObservability } = require('../../../packages/core/server/admin/observability');
const { analyticsStats } = require('../lib/analytics');
const handleAdminObservability = createAdminObservability({analyticsStats});
const { handleAdminAccounts } = require('../../../packages/core/server/admin/accounts');
const { handleAdminCampaigns } = require('../../../packages/core/server/admin/campaigns');
const { handleAdminAISettings } = require('../../../packages/core/server/admin/ai-settings');
const { handleAdminRelease } = require('../../../packages/core/server/admin/release');
const { handleAdminStorage } = require('../../../packages/core/server/admin/storage');

const { handleCatalogTextAI } = require('../lib/admin/fittimer/catalog-ai');
const { handleCatalogImageAI } = require('../lib/admin/fittimer/catalog-images');
const { handleCatalogAdmin } = require('../lib/admin/fittimer/catalog-admin');

const BAD_KEY_LIMIT = 30;
const REQUEST_LIMIT = 600;
const WINDOW_SEC = 3600;

function badKeyBucket(req){
  return `rl:admin-bad-key:${ipHash(req)}:${Math.floor(Date.now() / (WINDOW_SEC * 1000))}`;
}

async function badKeyBlocked(req){
  const limit = process.env.ALLOW_MEMORY_STORE === '1' ? BAD_KEY_LIMIT * 50 : BAD_KEY_LIMIT;
  try{ return (+(await store.get(badKeyBucket(req))) || 0) >= limit; }
  catch(_){ return true; }
}

async function chargeBadKey(req){
  try{ await store.incr(badKeyBucket(req), WINDOW_SEC + 5); }catch(_){}
}

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

  // Неверный ключ ограничиваем строго, но нормальная работа админки не должна
  // съедать тот же лимит: один экран делает несколько API-запросов подряд.
  if(await badKeyBlocked(req)) return fail(res, 429, 'rate_limited');
  if(!(await rateOkScoped(req, 'admin-request', REQUEST_LIMIT, '', WINDOW_SEC, true))){
    return fail(res, 429, 'rate_limited');
  }

  let given = String(req.headers['x-admin-key'] || '');
  try{ given = decodeURIComponent(given); }
  catch(_){ given = ''; }
  if(!sameSecret(given, admin)){
    await chargeBadKey(req);
    return fail(res, 403, 'bad_key');
  }

  let body;
  try{
    // Auth already passed above. Catalog editor can legitimately send a compressed
    // cover + exercise media; the generic public API limit remains unchanged.
    body = await readBody(req, 1024 * 1024);
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
  if(await handleAdminStorage(action,body,res)) return;

  if(await handleCatalogTextAI(action,body,res)) return;
  if(await handleCatalogImageAI(action,body,res)) return;
  if(await handleCatalogAdmin(action,body,res)) return;

  return fail(res,400,'unknown_action');
};
