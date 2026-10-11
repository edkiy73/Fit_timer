// O03.4: shared AppBase observability must not be served by FetUre Admin.
// Other applications own some of these diagnostic messages/device records.
'use strict';
process.env.ALLOW_MEMORY_STORE='1';
process.env.APPBASE_STORE='redis';
process.env.ADMIN_KEY='feture-privacy-admin-key';
for(const k of ['KV_REST_API_URL','KV_REST_API_TOKEN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','REDIS_REST_URL','REDIS_REST_TOKEN','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'])delete process.env[k];
require('../lib/product');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {recordClientError,clientErrorStats,clearClientError}=require('../../../packages/core/server/diagnostics');
const handler=require('../api/admin');
function response(){return {statusCode:0,headers:{},body:null,setHeader(k,v){this.headers[k]=v;},end(body){this.body=JSON.parse(body);}};}
async function invoke(body){
 const r=response();
 await handler({method:'POST',headers:{'x-admin-key':process.env.ADMIN_KEY},body},r);
 return r;
}
test('FetUre admin denies cross-product Core device reports and diagnostics, including destructive clear',async()=>{
 const sentinel='OTHER_PRODUCT_PRIVATE_DIAGNOSTIC_NEVER_IN_FETURE';
 const saved=await recordClientError({kind:'error',name:'TypeError',message:sentinel,stack:'',platform:'android'});
 try{
  for(const action of ['analytics_stats','client_errors','client_error_clear']){
   const result=await invoke({action,days:30,sig:saved.sig});
   assert.equal(result.statusCode,404,action);
   assert.equal(result.body.error,'unsupported_feture_observability');
   assert.equal(result.headers['Cache-Control'],'no-store');
   assert.ok(!JSON.stringify(result.body).includes(sentinel));
  }
  const stored=(await clientErrorStats()).items.find(item=>item.sig===saved.sig);
  assert.equal(stored?.message,sentinel,'FetUre may not erase another product diagnostic');
  const own=await invoke({action:'feture.metrics.summary',days:7});
  assert.equal(own.statusCode,200,'FetUre private aggregates still work');
  assert.equal(own.body.ok,true);
  assert.ok(!JSON.stringify(own.body).includes(sentinel));
 }finally{await clearClientError(saved.sig);}
});
