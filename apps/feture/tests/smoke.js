process.env.ALLOW_MEMORY_STORE = '1';
process.env.ADMIN_KEY = 'starter-admin-key';
const fs = require('fs');
let bad = 0;
const ok = (name, value) => { if(!value) bad++; console.log((value ? '  ok  ' : ' FAIL ') + name); };

function fakeRes(){
  return {statusCode:0,headers:{},body:'',setHeader(k,v){this.headers[k]=v;},end(v){this.body=v||'';}};
}

(async () => {
  require('../lib/product');
  const { productIdentity } = require('../../../packages/core/server/product-core');
  const { registry } = require('../lib/app-sync-schema');
  ok('product identity is registered', productIdentity().name === 'FetUre');
  ok('starter owns only neutral account sync doc', registry.accepts('account','settings') && !registry.accepts('profile','task:1') && !registry.accepts('account','interest-map'));

  const app = fs.readFileSync(require('path').join(__dirname,'../src/app.tsx'),'utf8');
  ok('shared auth UI is wired (optional sign-in)', app.includes('@appbase/ui-react/auth.js') && app.includes('AuthProvider'));
  ok('interface language is wired', app.includes('@appbase/ui-react/i18n.js'));

  const auth = require('../api/auth');
  const res = fakeRes();
  await auth({method:'POST',headers:{},body:{action:'unknown'}},res);
  ok('generic auth endpoint is mounted', res.statusCode >= 400);

  const admin = require('../api/admin');
  const adminRes = fakeRes();
  await admin({method:'POST',headers:{'x-admin-key':'wrong'},body:{action:'users_list'}},adminRes);
  ok('generic admin endpoint is mounted and protected', adminRes.statusCode === 403);

  const billing = require('../api/billing');
  const billingRes = fakeRes();
  await billing({method:'POST',headers:{},body:{action:'providers'}},billingRes);
  ok('billing endpoint is mounted (test provider only on the memory store)',
    JSON.parse(billingRes.body || '{}').providers.join() === 'test');
  ok('synced settings are a free account document', registry.isFree('account','settings'));

  const health = require('../api/health');
  const healthRes = fakeRes();
  await health({method:'GET',headers:{},query:{}},healthRes);
  const report = JSON.parse(healthRes.body || '{}');
  ok('generic health endpoint is mounted', Array.isArray(report.probes));

  // Public taxonomy projection: no network and no private database rows.
  const oldFetch=global.fetch;
  const oldUrl=process.env.SUPABASE_URL, oldKey=process.env.SUPABASE_PUBLISHABLE_KEY;
  try {
    process.env.SUPABASE_URL='https://catalog-check.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_catalog_check';
    const paths=[];
    global.fetch=async url=>{
      const table=new URL(url).pathname.split('/').at(-1);paths.push(table);
      const rows=table==='feture_categories'?[{id:'category-1',title:'Роли',short_title:'Роли',icon:'layers',accent_color:'#7156cb',position:1}]
        :table==='feture_interests'?[{id:'interest-1-3',category_id:'category-1',title:'Свитч',position:1},{id:'unpublished',category_id:'category-1',title:'Hidden',position:2}]
        :table==='feture_catalog_publications'?[{version:2,entries:{'interest-1-3':{definition:'Свитч — выбранная и опубликованная новая редакция.',synonyms:['switch','переключение роли'],relatedIds:[]}}}]:[];
      const bytes=new TextEncoder().encode(JSON.stringify(rows));
      return {ok:true,headers:new Headers({'content-length':String(bytes.length)}),
        body:new ReadableStream({start(stream){stream.enqueue(bytes);stream.close();}})};
    };
    const catalog=require('../api/catalog');
    const result=fakeRes();await catalog({method:'GET',headers:{}},result);
    const payload=JSON.parse(result.body);
    const topics=payload.categories[0].interests;
    ok('public catalog exposes published revisions from three public-only sources; no drafts or questionnaires', result.statusCode===200 && topics.length===1 && topics[0].definition.includes('новая редакция') && topics[0].synonyms.includes('switch') && payload.editorialVersion===2 && payload.tests.length===0 && paths.sort().join() === 'feture_catalog_publications,feture_categories,feture_interests');

    // An unavailable public taxonomy source must never expose internal request
    // details, credentials, SQL diagnostics or provider payloads to clients/logs.
    const secretMarker='PRIVATE_CATALOG_TOKEN_NEVER_EXPOSE';
    const previousWarn=console.warn, warnings=[];
    let unavailable;
    try {
      console.warn=(...parts)=>warnings.push(parts.join(' '));
      global.fetch=async()=>{throw new Error(secretMarker);};
      unavailable=fakeRes();
      await catalog({method:'GET',headers:{},url:'/api/catalog'},unavailable);
    } finally { console.warn=previousWarn; }
    ok('public catalog upstream failure returns a bounded, sanitized 503',
      unavailable.statusCode===503 &&
      unavailable.headers['Cache-Control']==='no-store' &&
      unavailable.headers['X-Content-Type-Options']==='nosniff' &&
      unavailable.body===JSON.stringify({error:'catalog_unavailable'}) &&
      !JSON.stringify(warnings).includes(secretMarker));

    // A lying/missing Content-Length must not allow an oversized JSONB release
    // to be buffered or parsed. Both paths still return the same safe error.
    const tooLarge=(headers,chunk)=>({ok:true,headers:new Headers(headers),
      body:new ReadableStream({start(stream){stream.enqueue(chunk);stream.close();}})});
    const previousWarning=console.warn;
    try {
      console.warn=()=>{};
      global.fetch=async()=>tooLarge({'content-length':String(1024*1024+1)},new Uint8Array([91,93]));
      const claimed=fakeRes();
      await catalog({method:'GET',headers:{},url:'/api/catalog'},claimed);
      ok('public catalog rejects excessive declared upstream size',
        claimed.statusCode===503 && claimed.body===JSON.stringify({error:'catalog_unavailable'}) &&
        claimed.headers['Cache-Control']==='no-store');
      global.fetch=async()=>tooLarge({},new Uint8Array(1024*1024+1));
      const streamed=fakeRes();
      await catalog({method:'GET',headers:{},url:'/api/catalog'},streamed);
      ok('public catalog rejects excessive streamed upstream size without Content-Length',
        streamed.statusCode===503 && streamed.body===JSON.stringify({error:'catalog_unavailable'}) &&
        streamed.headers['Cache-Control']==='no-store');
    } finally { console.warn=previousWarning; }
  } finally {
    global.fetch=oldFetch;
    if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined)delete process.env.SUPABASE_PUBLISHABLE_KEY;else process.env.SUPABASE_PUBLISHABLE_KEY=oldKey;
  }

  console.log(bad ? '\nStarter smoke failures: ' + bad : '\nStarter smoke passed');
  process.exit(bad ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
