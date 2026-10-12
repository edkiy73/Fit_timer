require('../lib/product');
const { createAdminHandler } = require('../../../packages/core/server/admin-handler');
const { analyticsStats } = require('../lib/app-analytics');
const Supabase = require('../../../packages/core/server/supabase');
const {createDocumentsAdmin}=require('../lib/feture/documents-admin');
const {createModerationAdmin}=require('../lib/feture/moderation-admin');
const {createTestsAdmin}=require('../lib/feture/questionnaires-admin');
const {createCatalogAdmin}=require('../lib/feture/catalog-admin');
const {store}=require('../../../packages/core/server/store');
const {createPrivateMetrics}=require('../lib/feture/private-metrics');
const {createMetricsAdmin}=require('../lib/feture/private-metrics-admin');
const {createOperatorEndpoint}=require('../lib/feture/operators');
const {cors,fail,rateOkScoped,readBody}=require('../../../packages/core/server/util');

const coreAdmin = createAdminHandler({analyticsStats,handlers:[createCatalogAdmin(Supabase),createTestsAdmin(Supabase),createDocumentsAdmin(Supabase),createModerationAdmin(Supabase,store),createMetricsAdmin(createPrivateMetrics(store))]});

const operators=createOperatorEndpoint({transport:Supabase,accounts:store,cors,quota:(req,owner)=>rateOkScoped(req,'feture-operators',120,owner,60,true)});
module.exports=async(req,res)=>{
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
 if(typeof action==='string'&&(action.startsWith('feture.qa.')||action.startsWith('feture.operators.')||action.startsWith('feture.posts.')||action.startsWith('feture.events.')))return operators(req,res);
 return coreAdmin(req,res);
};
