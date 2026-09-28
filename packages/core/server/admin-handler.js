'use strict';

const { store } = require('./store');
const { fail, readBody, rateOkScoped, sameSecret, cors } = require('./util');
const { createAdminObservability } = require('./admin/observability');
const { handleAdminAccounts } = require('./admin/accounts');
const { handleAdminCampaigns } = require('./admin/campaigns');
const { handleAdminAISettings } = require('./admin/ai-settings');
const { handleAdminStorage } = require('./admin/storage');
const { handleAdminBilling } = require('./billing');

function createAdminHandler({analyticsStats, handlers = []} = {}){
  const handleObservability = createAdminObservability({analyticsStats});
  const productHandlers = Array.isArray(handlers) ? handlers.filter(fn => typeof fn === 'function') : [];

  return async function adminHandler(req, res){
    if(cors(req, res)) return;
    if(req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
    if(!store.configured()) return fail(res, 503, 'no_store');

    const admin = process.env.ADMIN_KEY || '';
    if(!admin) return fail(res, 503, 'no_admin_key');

    if(!(await rateOkScoped(req, 'admin-auth', 30, '', 3600, true))){
      return fail(res, 429, 'rate_limited');
    }

    let given = String(req.headers['x-admin-key'] || '');
    try{ given = decodeURIComponent(given); }
    catch(_){ return fail(res, 403, 'bad_key'); }
    if(!sameSecret(given, admin)) return fail(res, 403, 'bad_key');

    let body;
    try{ body = await readBody(req); }
    catch(_){ return fail(res, 413, 'too_large'); }

    const action = (body && body.action) || '';

    if(await handleObservability(action, body, res)) return;
    if(await handleAdminAccounts(action, body, res)) return;
    if(await handleAdminCampaigns(action, body, res)) return;
    if(await handleAdminAISettings(action, body, res)) return;
    if(await handleAdminStorage(action, body, res)) return;
    if(await handleAdminBilling(action, body, res)) return;

    for(const handler of productHandlers){
      if(await handler(action, body, res)) return;
    }

    return fail(res, 400, 'unknown_action');
  };
}

module.exports = { createAdminHandler };
