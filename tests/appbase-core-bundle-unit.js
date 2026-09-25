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
const core=fs.readFileSync('appbase-core.js','utf8');
const app=fs.readFileSync('app.js','utf8');

ok('build has a dedicated AppBase Core target',
  build.includes("target: 'appbase-core.js'"));
ok('product app target no longer lists Core runtimes',
  !build.slice(build.indexOf("target: 'app.js'"),build.indexOf("target: 'style.css'")).includes('src/core/'));
ok('Core bundle contains reusable browser namespaces',
  ['AppBaseStorage','AppBaseIdentity','AppBaseSync','AppBaseObservability','AppBaseNotifications','AppBaseUI'].every(x=>core.includes(x)));
ok('product app no longer embeds reusable Core namespace declarations',
  !app.includes('var AppBaseStorage;')
  && !app.includes('var AppBaseIdentity;')
  && !app.includes('var AppBaseSync;')
  && !app.includes('var AppBaseObservability;')
  && !app.includes('var AppBaseNotifications;')
  && !app.includes('var AppBaseUI;'));
const coreScript='<script src="appbase-core.js"></script>';
const appScript='<script src="app.js"></script>';
ok('HTML loads Core before product app',
  html.includes(coreScript)
  && html.includes(appScript)
  && html.indexOf(coreScript) < html.indexOf(appScript));
ok('mobile build copies Core bundle',web.includes("'appbase-core.js'"));
ok('mobile validation requires Core bundle',mobile.includes("'dist/appbase-core.js'"));

process.exit(bad?1:0);
