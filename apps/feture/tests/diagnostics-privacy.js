// FetUre privacy regression: direct forged auth requests and browser payload
// must never write sexuality/interest content, email, secret or URL to Core diag.
'use strict';
process.env.ALLOW_MEMORY_STORE='1';
process.env.APPBASE_STORE='redis';
for(const key of ['KV_REST_API_URL','KV_REST_API_TOKEN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','REDIS_REST_URL','REDIS_REST_TOKEN','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'])delete process.env[key];
require('../lib/product');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {safeFetureDiagnostic}=require('../lib/feture/diagnostic-policy');
const {clientErrorStats,clearClientError}=require('../../../packages/core/server/diagnostics');
const appHandler=require('../api/auth');
const {createAuthHandler}=require('../../../packages/core/server/auth-core');
const analytics=require('../lib/app-analytics');
function res(){return {statusCode:0,headers:{},body:null,setHeader(k,v){this.headers[k]=v;},end(b){this.body=JSON.parse(b);}};}
async function invoke(handler,body){const r=res();await handler({method:'POST',headers:{},body},r);return r;}
const leaked=['topic-private-nonconsensual','private-answer-7942','user-private@example.com','long-private-device-token','https://private.example/share/secret?k=123','/hidden/user/post/3737','user-provided-quote'];
test('FetUre diagnostic shape carries only fixed enum/family and bounded build',()=>{
 const v=safeFetureDiagnostic({action:'client_error',kind:'rejection',name:'TypeError',message:leaked[0],stack:leaked.join('\n'),build:'https://example.com/?token=secret',platform:'ios',locale:'en',email:leaked[2]});
 assert.deepEqual(v,{action:'client_error',kind:'rejection',name:'TypeError',message:'feture_client_error',stack:'',build:'',platform:'ios',locale:'en'});
 const invalid=safeFetureDiagnostic({name:'Custom-'+leaked[0],kind:'supercritical',platform:'myphone',locale:leaked[1],build:'a'.repeat(200)});
 assert.equal(invalid.name,'Error');assert.equal(invalid.kind,'error');assert.equal(invalid.platform,'web');assert.equal(invalid.locale,'ru');assert.equal(invalid.build,'');
 assert.equal(safeFetureDiagnostic({name:'ReferenceError',build:'main.abc-123_456'}).build,'main.abc-123_456');
});
test('FetUre Core auth forces sanitization even when bypassing browser and sending raw data',async()=>{
 const payload={action:'client_error',kind:'rejection',name:'CustomName-'+leaked[0],message:leaked.join(' '),stack:'Error: '+leaked.join('\\n'),build:leaked[4],platform:'ios',locale:'en',extra:{private:leaked[1]}};
 const out=await invoke(appHandler,payload);
 assert.equal(out.statusCode,200);assert.equal(out.body.ok,true);
 const result=await clientErrorStats();assert.equal(result.items.length,1);
 const first=result.items[0];assert.equal(first.name,'Error');assert.equal(first.message,'feture_client_error');assert.equal(first.stack,'');assert.equal(first.build,'');
 assert.equal(first.kind,'rejection');assert.equal(first.platform.ios,1);assert.equal(first.locale.en,1);
 const stored=JSON.stringify(result);
 for(const str of leaked)assert.equal(stored.includes(str),false,'No sensitive text in diagnostics: '+str.slice(0,16));
 assert.equal(await clearClientError(first.sig),true);
});
test('Shared Core diagnostics still works for other products without FetUre policy',async()=>{
 const nonFeture=createAuthHandler({analytics});
 const result=await invoke(nonFeture,{action:'client_error',kind:'error',name:'RangeError',message:'generic-other-product-only',stack:'',build:'build-4',platform:'web',locale:'ru'});
 assert.equal(result.statusCode,200);
 const stats=await clientErrorStats();assert.equal(stats.items.length,1);assert.equal(stats.items[0].message,'generic-other-product-only');
 await clearClientError(stats.items[0].sig);
});
test('Legacy anonymous FetUre device analytics no longer accepts install submissions',async()=>{
 assert.deepEqual([...analytics.EVENTS],[]);
 const denied=await invoke(appHandler,{action:'analytics',event:'install',deviceId:'long-private-device-token',platform:'web',locale:'ru',premium:false});
 assert.equal(denied.statusCode,400);assert.equal(denied.body.error,'bad_event');
});
