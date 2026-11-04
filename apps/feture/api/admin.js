require('../lib/product');
const { createAdminHandler } = require('../../../packages/core/server/admin-handler');
const { analyticsStats } = require('../lib/app-analytics');
const Supabase = require('../../../packages/core/server/supabase');
const {store}=require('../../../packages/core/server/store');
const {createPrivateMetrics}=require('../lib/feture/private-metrics');
const {createMetricsAdmin}=require('../lib/feture/private-metrics-admin');
const {createUpdateAdmin,sendPublicUpdate}=require('../lib/app-update');
const {createStaffFactorAdmin}=require('../lib/feture/staff-factor-admin');
const {cors,fail,rateOkScoped,readBody}=require('../../../packages/core/server/util');

const coreAdmin = createAdminHandler({analyticsStats,handlers:[createMetricsAdmin(createPrivateMetrics(store)),createUpdateAdmin(store),createStaffFactorAdmin()]});

module.exports=async(req,res)=>{
 // /api/config (vercel.json rewrite): the published Android update, read by the installed app. Public, no secrets.
 if(req.method==='GET'&&req.query&&req.query.public_config==='1'){if(cors(req,res))return;return sendPublicUpdate(store,res);}
 if(req.method==='OPTIONS')return coreAdmin(req,res);
 if(req.method!=='POST')return coreAdmin(req,res);
 // Parse once before dispatch; no staff route can fall through to Core by changing a field.
 let body;try{body=await readBody(req);}catch{return require('../../../packages/core/server/util').fail(res,413,'too_large');}
 req.body=body;req.rawBody=undefined;
 const action=body&&body.action;
 // O03.4: Core diagnostics and device analytics are global to AppBase's
 // shared store. They are not scoped to FetUre: exposing them here would
 // disclose other products' error text, device aggregates, or let this admin
 // delete their diagnostic groups. Use FetUre's bounded metrics view instead.
 if(action==='analytics_stats'||action==='client_errors'||action==='client_error_clear'){
  res.setHeader('Cache-Control','no-store');
  return fail(res,404,'unsupported_feture_observability');
 }
 return coreAdmin(req,res);
};
