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
const deps=fs.readFileSync('src/app/00-dependencies.js','utf8');

ok('legacy AppBase Core target is removed from source build',
  !build.includes("target: 'appbase-core.js'"));
ok('product app target no longer lists Core runtimes',
  !build.slice(build.indexOf("target: 'app.js'"),build.indexOf("target: 'style.css'")).includes('../../packages/core/src/core/'));
const mainSource=fs.readFileSync('src/main.ts','utf8');
ok('no global product-module bridge remains',
  !/FitTimerModules/.test(mainSource) && !/FitTimerModules/.test(app)
  && !fs.readdirSync('src/app').some(name => /FitTimerModules/.test(fs.readFileSync('src/app/' + name,'utf8'))));
ok('product runtime imports its dependencies as ES modules',
  /import \* as appbaseNotifications from '@appbase\/core\/notifications\.js'/.test(deps)
  && /import \* as appbaseUi from '@appbase\/core\/ui\.js'/.test(deps)
  && /import \* as fitInfrastructure from '\.\/src\/app\/infrastructure\.js'/.test(deps)
  && /import FitAIProtocol from '\.\/lib\/ai-protocol\.js'/.test(deps)
  && /const appInfrastructure = /.test(deps) && /const appUi = /.test(deps));
ok('product runtime contains no AppBase Core references',
  !/AppBase(?:Storage|Identity|Sync|Observability|Notifications|UI)/.test(app)
  && !/AppBase(?:Storage|Identity|Sync|Observability|Notifications|UI)/.test(fs.readFileSync('src/main.ts','utf8')));
ok('shared AI protocol is imported, not concatenated into the product runtime',
  !build.includes("'lib/ai-protocol.js'") && !/Shared Fit Timer AI protocol contract/.test(app));
ok('test-only binding bridge is generated, gated and never enabled by production config',
  /__FIT_TEST_MODE__ === true/.test(app)
  && /testBridge/.test(build)
  && !/__FIT_TEST_MODE__/.test(fs.readFileSync('app.config.js','utf8'))
  && /__FIT_TEST_MODE__ = true/.test(fs.readFileSync('../../.github/workflows/browser-tests.yml','utf8')));

ok('HTML loads only the ESM startup entry for Core/product runtimes',
  html.includes('<script type="module" src="esm/main.js"></script>')
  && !html.includes('<script src="appbase-core.js"></script>')
  && !html.includes('<script src="native-notifications.js"></script>')
  && !html.includes('<script src="mobile-core.js"></script>')
  && !html.includes('<script src="mobile.js"></script>')
  && !html.includes('<script src="app.js"></script>'));
ok('web build no longer ships legacy Core bundle',
  !web.includes("'appbase-core.js'"));
ok('mobile validation no longer requires legacy Core bundle',
  !mobile.includes("'dist/appbase-core.js'"));
ok('ESM entry starts the native bridge before the product runtime chunk',
  /loadMobileRuntime/.test(mainSource)
  && /await import\('\.\.\/app\.js'\)/.test(mainSource)
  && mainSource.indexOf('await loadMobileRuntime()') < mainSource.indexOf('await loadProductRuntime()'));
ok('web and mobile builds no longer ship app.js as a classic script',
  !/'app\.js'/.test(web) && !mobile.includes("'dist/app.js'"));

process.exit(bad?1:0);
