/* FitTimer adoption of AppBase UI Core. */
const fs=require('fs');
let bad=0;
const ok=(name,cond)=>{
  if(!cond)bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name);
};

const core=fs.readFileSync('src/app/00-core.js','utf8');
const platform=fs.readFileSync('src/app/80-platform.js','utf8');
const build=fs.readFileSync('scripts/build-sources.mjs','utf8');

ok('frontend bundle loads UI runtime',
  build.includes("'src/core/ui.runtime.js'"));
ok('UI runtime loads before application core',
  build.indexOf("'src/core/ui.runtime.js'") < build.indexOf("'src/app/00-core.js'"));
ok('FitTimer setShown delegates to AppBaseUI',
  core.includes('AppBaseUI.setShown(node, !!on)'));
ok('named action delegation uses AppBaseUI',
  platform.includes('AppBaseUI.bindActions(document, ACTIONS)'));
ok('closeModal uses generic modal helpers',
  platform.includes('AppBaseUI.closestModal(btn)')&&platform.includes('AppBaseUI.closeModal(m)'));
ok('old manual data-act click dispatcher is gone',
  !platform.includes("e.target.closest('[data-act]')"));

process.exit(bad?1:0);
