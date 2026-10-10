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
        :table==='feture_interests'?[{id:'interest-1-3',category_id:'category-1',title:'Свитч',position:1},{id:'unpublished',category_id:'category-1',title:'Hidden',position:2}]:[];
      return {ok:true,json:async()=>rows};
    };
    const catalog=require('../api/catalog');
    const result=fakeRes();await catalog({method:'GET',headers:{}},result);
    const payload=JSON.parse(result.body);
    const topics=payload.categories[0].interests;
    ok('public catalog exposes only released definitions and three taxonomy tables', result.statusCode===200 && topics.length===1 && topics[0].definition && topics[0].synonyms.includes('switch') && payload.editorialVersion===1 && paths.sort().join() === 'feture_categories,feture_interests,feture_tests');
  } finally {
    global.fetch=oldFetch;
    if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined)delete process.env.SUPABASE_PUBLISHABLE_KEY;else process.env.SUPABASE_PUBLISHABLE_KEY=oldKey;
  }

  console.log(bad ? '\nStarter smoke failures: ' + bad : '\nStarter smoke passed');
  process.exit(bad ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
