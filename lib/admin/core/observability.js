'use strict';

const { send, fail, clampLine } = require('../../util');
const { analyticsStats } = require('../../analytics');
const { clientErrorStats, clearClientError } = require('../../diagnostics');

const ACTIONS = new Set(['analytics_stats','client_errors','client_error_clear']);

async function handleAdminObservability(action, body, res){
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
}

module.exports={handleAdminObservability,ACTIONS};
