'use strict';

const { send, fail, clampLine } = require('../../util');
const { clientErrorStats, clearClientError } = require('../../diagnostics');

const ACTIONS = new Set(['analytics_stats','client_errors','client_error_clear']);

/* The product composes analytics (engine + its event taxonomy) and passes the stats reader in. */
function createAdminObservability({analyticsStats}){
  if(typeof analyticsStats !== 'function') throw new Error('analytics_stats_required');
  return async function handleAdminObservability(action, body, res){
    if(!ACTIONS.has(action)) return false;

    if(action === 'analytics_stats'){
      send(res,200,{ok:true,stats:await analyticsStats(body&&body.days)});
      return true;
    }

    if(action === 'client_errors'){
      send(res,200,{ok:true,stats:await clientErrorStats()});
      return true;
    }

    const sig=clampLine(body&&body.sig,40).toLowerCase();
    if(!/^[a-f0-9]{20}$/.test(sig)){
      fail(res,400,'bad_signature');
      return true;
    }
    const cleared=await clearClientError(sig);
    send(res,200,{ok:true,cleared});
    return true;
  };
}

module.exports={createAdminObservability,ACTIONS};
