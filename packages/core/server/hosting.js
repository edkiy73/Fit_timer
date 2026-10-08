'use strict';

function cleanAdapter(value){
  const text = String(value || '').trim().toLowerCase();
  return /^[a-z][a-z0-9_-]{0,39}$/.test(text) ? text : '';
}

/** Provider-neutral host identity for health/Admin.
 * Deployment config may set APPBASE_HOST_ADAPTER explicitly. Otherwise Core only
 * recognizes the currently supported default environments and falls back to Node.
 * No product code should branch on this value. */
function hostingInfo(){
  const configured = cleanAdapter(process.env.APPBASE_HOST_ADAPTER);
  if(configured){
    return {adapter:configured, source:'configured', runtime:'node'};
  }
  if(process.env.VERCEL){
    return {adapter:'vercel', source:'detected', runtime:'node'};
  }
  return {adapter:'node', source:'default', runtime:'node'};
}

module.exports = { cleanAdapter, hostingInfo };
