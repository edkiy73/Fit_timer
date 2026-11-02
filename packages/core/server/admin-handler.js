'use strict';

const { store } = require('./store');
const { fail, readBody, rateOkScoped, sameSecret, cors, ipHash } = require('./util');
const { createAdminObservability } = require('./admin/observability');
const { handleAdminAccounts } = require('./admin/accounts');
const { handleAdminCampaigns } = require('./admin/campaigns');
const { handleAdminAISettings } = require('./admin/ai-settings');
const { handleAdminStorage } = require('./admin/storage');
const { handleAdminBilling } = require('./billing');

// Brute-force guard: only a wrong key costs an attempt. Charging every request made the
// guard throttle real admin work (one content screen issues several requests at once).
const BAD_KEY_LIMIT = 30;
const REQUEST_LIMIT = 600;
const WINDOW_SEC = 3600;

// Optional second key for test sign-in: TEST_LOGIN_KEY (>= 24 chars) together with TEST_LOGIN_DOMAIN (e.g. feture.test).
// It opens exactly two actions, `user_create` and `user_test_code`, and only for addresses at that domain, so an agent
// (or a tester) can sign in to the test accounts without holding ADMIN_KEY. Off unless BOTH variables are set.
const TEST_LOGIN_ACTIONS = new Set(['user_create', 'user_test_code']);

function testLoginDomain(given){
  const key = process.env.TEST_LOGIN_KEY || '';
  const domain = String(process.env.TEST_LOGIN_DOMAIN || '').trim().toLowerCase().replace(/^@/, '');
  if(key.length < 24 || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) || !sameSecret(given, key)) return '';
  return domain;
}

function testLoginAllowed(domain, action, body){
  if(!TEST_LOGIN_ACTIONS.has(action)) return false;
  const email = String((body && body.email) || '').trim().toLowerCase();
  const parts = email.split('@');
  return email.length <= 120 && parts.length === 2 && !!parts[0] && parts[1] === domain;
}

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

function createAdminHandler({analyticsStats, handlers = []} = {}){
  const handleObservability = createAdminObservability({analyticsStats});
  const productHandlers = Array.isArray(handlers) ? handlers.filter(fn => typeof fn === 'function') : [];

  return async function adminHandler(req, res){
    if(cors(req, res)) return;
    if(req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
    if(!store.configured()) return fail(res, 503, 'no_store');

    const admin = process.env.ADMIN_KEY || '';
    if(!admin) return fail(res, 503, 'no_admin_key');

    if(await badKeyBlocked(req)) return fail(res, 429, 'rate_limited');
    if(!(await rateOkScoped(req, 'admin-request', REQUEST_LIMIT, '', WINDOW_SEC, true))){
      return fail(res, 429, 'rate_limited');
    }

    let given = String(req.headers['x-admin-key'] || '');
    try{ given = decodeURIComponent(given); }
    catch(_){ given = ''; }
    let testDomain = '';
    if(!sameSecret(given, admin)){
      testDomain = testLoginDomain(given);
      if(!testDomain){
        await chargeBadKey(req);
        return fail(res, 403, 'bad_key');
      }
    }

    let body;
    try{ body = await readBody(req); }
    catch(_){ return fail(res, 413, 'too_large'); }

    const action = (body && body.action) || '';
    if(testDomain && !testLoginAllowed(testDomain, action, body)) return fail(res, 403, 'scope_denied');

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
