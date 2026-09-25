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

ok('ESM entry imports UI Core',
  /from ['"]\.\/core\/ui\.js['"]/.test(esmEntry));
ok('ESM startup exposes UI Core before loading legacy product runtime',
  esmEntry.indexOf('exposeLegacyCoreGlobals()') < esmEntry.indexOf('loadLegacyProductRuntime()'));
ok('FitTimer setShown delegates to AppBaseUI',
  core.includes('AppBaseUI.setShown(node, !!on)'));
ok('named action delegation uses AppBaseUI',
  platform.includes('AppBaseUI.bindActions(document, ACTIONS)'));
ok('closeModal uses generic modal helpers',
  platform.includes('AppBaseUI.closestModal(btn)')&&platform.includes('AppBaseUI.closeModal(m)'));
ok('old manual data-act click dispatcher is gone',
  !platform.includes("e.target.closest('[data-act]')"));

process.exit(bad?1:0);
