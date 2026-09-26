/* FitTimer adoption of AppBase UI Core. */
const fs=require('fs');
let bad=0;
const ok=(name,cond)=>{
  if(!cond)bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name);
};

const core=fs.readFileSync('src/app/00-core.js','utf8');
const platform=fs.readFileSync('src/app/80-platform.js','utf8');
const esmEntry=fs.readFileSync('src/main.ts','utf8');

const productDeps = require('fs').readFileSync('src/app/00-dependencies.js','utf8');
ok('product runtime imports UI Core',
  /from ['"]@appbase\/core\/ui\.js['"]/.test(productDeps));
ok('ESM startup loads the native bridge before the product runtime',
  esmEntry.indexOf('await loadMobileRuntime()') < esmEntry.indexOf('await loadProductRuntime()'));
ok('FitTimer setShown delegates to appUi',
  core.includes('appUi.setShown(node, !!on)'));
ok('named action delegation uses appUi',
  platform.includes('appUi.bindActions(document, ACTIONS)'));
ok('closeModal uses generic modal helpers',
  platform.includes('appUi.closestModal(btn)')&&platform.includes('appUi.closeModal(m)'));
ok('old manual data-act click dispatcher is gone',
  !platform.includes("e.target.closest('[data-act]')"));

process.exit(bad?1:0);
