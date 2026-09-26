/* POST /api/admin — single authenticated Admin dispatcher (+ /api/ai and /api/config rewrites). */
require('../lib/product');
const { store } = require('../../server/store');
const { fail, readBody, rateOkScoped, sameSecret, cors } = require('../../server/util');
const { createAIHandler } = require('../../server/ai-endpoint');
const { registry: aiActions } = require('../lib/app-ai-actions');
const { analyticsStats } = require('../lib/app-analytics');
const { createAdminObservability } = require('../../server/admin/observability');
const { handleAdminAccounts } = require('../../server/admin/accounts');
const { handleAdminCampaigns } = require('../../server/admin/campaigns');
const { handleAdminAISettings } = require('../../server/admin/ai-settings');

const handleAI = createAIHandler(aiActions);
const handleAdminObservability = createAdminObservability({analyticsStats});

module.exports = async (req, res) => {
  if(req.query && (req.query.ai_endpoint === '1' || req.query.public_config === '1')) return handleAI(req, res);
  if(cors(req, res)) return;
  if(req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  if(!store.configured()) return fail(res, 503, 'no_store');
  const admin = process.env.ADMIN_KEY || '';
  if(!admin) return fail(res, 503, 'no_admin_key');
  if(!(await rateOkScoped(req, 'admin-auth', 30, '', 3600, true))) return fail(res, 429, 'rate_limited');
  let given = String(req.headers['x-admin-key'] || '');
  try{ given = decodeURIComponent(given); }catch(_){ return fail(res, 403, 'bad_key'); }
  if(!sameSecret(given, admin)) return fail(res, 403, 'bad_key');
  let body;
  try{ body = await readBody(req); }catch(_){ return fail(res, 413, 'too_large'); }
  const action = (body && body.action) || '';
  if(await handleAdminObservability(action, body, res)) return;
  if(await handleAdminAccounts(action, body, res)) return;
  if(await handleAdminCampaigns(action, body, res)) return;
  if(await handleAdminAISettings(action, body, res)) return;
  return fail(res, 400, 'unknown_action');
};
