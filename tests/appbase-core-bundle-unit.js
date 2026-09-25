/* AppBase browser runtime bundle separation regression. */
const fs=require('fs');
let bad=0;
const ok=(name,cond)=>{
  if(!cond) bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name);
};

const build=fs.readFileSync('scripts/build-sources.mjs','utf8');
const web=fs.readFileSync('scripts/build-web.mjs','utf8');
const mobile=fs.readFileSync('scripts/check-mobile.mjs','utf8');
const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('app.js','utf8');

ok('legacy AppBase Core target is removed from source build',
  !build.includes("target: 'appbase-core.js'"));
ok('product app target no longer lists Core runtimes',
  !build.slice(build.indexOf("target: 'app.js'"),build.indexOf("target: 'style.css'")).includes('src/core/'));
ok('ESM entry owns temporary compatibility namespaces',
  ['AppBaseStorage','AppBaseIdentity','AppBaseSync','AppBaseObservability','AppBaseNotifications','AppBaseUI']
    .every(x=>fs.readFileSync('src/main.ts','utf8').includes(x)));
ok('product app no longer embeds reusable Core namespace declarations',
  !app.includes('var AppBaseStorage;')
  && !app.includes('var AppBaseIdentity;')
  && !app.includes('var AppBaseSync;')
  && !app.includes('var AppBaseObservability;')
  && !app.includes('var AppBaseNotifications;')
  && !app.includes('var AppBaseUI;'));
ok('HTML loads ESM entry instead of legacy Core and product scripts',
  html.includes('<script type="module" src="esm/main.js"></script>')
  && !html.includes('<script src="appbase-core.js"></script>')
  && !html.includes('<script src="app.js"></script>'));
ok('web build no longer ships legacy Core bundle',
  !web.includes("'appbase-core.js'"));
ok('mobile validation no longer requires legacy Core bundle',
  !mobile.includes("'dist/appbase-core.js'"));
ok('ESM entry exposes legacy Core names before loading product runtime',
  /exposeLegacyCoreGlobals/.test(fs.readFileSync('src/main.ts','utf8'))
  && /loadLegacyProductRuntime/.test(fs.readFileSync('src/main.ts','utf8')));

process.exit(bad?1:0);
