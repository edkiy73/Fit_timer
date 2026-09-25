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
  !build.slice(build.indexOf("target: 'app.js'"),build.indexOf("target: 'style.css'")).includes('src/core/'));
ok('ESM entry exposes only a temporary product-module bridge',
  /FitTimerModules/.test(fs.readFileSync('src/main.ts','utf8'))
  && /clearLegacyProductModules/.test(fs.readFileSync('src/main.ts','utf8'))
  && !/AppBase(?:Storage|Identity|Sync|Observability|Notifications|UI)/.test(fs.readFileSync('src/main.ts','utf8')));
ok('legacy product captures startup dependencies once',
  /globalThis\.FitTimerModules/.test(deps)
  && /const appInfrastructure = fitLegacyModules\.infrastructure/.test(deps)
  && /const appIdentity = fitLegacyModules\.identity/.test(deps)
  && /const appSync = fitLegacyModules\.sync/.test(deps)
  && /const appNotifications = fitLegacyModules\.notifications/.test(deps)
  && /const appUi = fitLegacyModules\.ui/.test(deps));
ok('product runtime contains no AppBase Core references',
  !/AppBase(?:Storage|Identity|Sync|Observability|Notifications|UI)/.test(app)
  && !/AppBase(?:Storage|Identity|Sync|Observability|Notifications|UI)/.test(fs.readFileSync('src/main.ts','utf8')));
ok('FitTimerModules is isolated to the dependency prelude inside app.js',
  (app.match(/FitTimerModules/g) || []).length === 2
  && !fs.readdirSync('src/app').filter(name => name.endsWith('.js') && name !== '00-dependencies.js')
    .some(name => /FitTimerModules/.test(fs.readFileSync('src/app/' + name,'utf8'))));

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
ok('ESM entry exposes product modules before loading mobile and product runtimes',
  /exposeLegacyProductModules/.test(fs.readFileSync('src/main.ts','utf8'))
  && /loadLegacyMobileRuntime/.test(fs.readFileSync('src/main.ts','utf8'))
  && /loadLegacyProductRuntime/.test(fs.readFileSync('src/main.ts','utf8'))
  && fs.readFileSync('src/main.ts','utf8').indexOf('await loadLegacyMobileRuntime()')
     < fs.readFileSync('src/main.ts','utf8').indexOf('await loadLegacyProductRuntime()'));

process.exit(bad?1:0);

ok('legacy product bundle executes in ES module scope',
  /loadLegacyScript\([\s\S]*'app\.js'[\s\S]*true[\s\S]*\)/.test(fs.readFileSync('src/main.ts','utf8')));
ok('test-only binding bridge is gated and production config does not enable it',
  /__FIT_TEST_MODE__ === true/.test(fs.readFileSync('scripts/build-sources.mjs','utf8'))
  && /__FIT_TEST_MODE__ = true/.test(fs.readFileSync('.github/workflows/browser-tests.yml','utf8'))
  && !/__FIT_TEST_MODE__/.test(fs.readFileSync('app.config.js','utf8')));
