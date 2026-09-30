/* FitTimer adoption of AppBase UI Core. */
const fs=require('fs');
let bad=0;
const ok=(name,cond)=>{
  if(!cond)bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name);
};

const core=fs.readFileSync('src/app/00-core.js','utf8');
const platform=fs.readFileSync('src/app/80-platform.js','utf8');
const events=fs.readFileSync('src/app/90-events.js','utf8');
const actions=fs.readFileSync('src/app/05-actions.js','utf8');
const shell=fs.readFileSync('src/html/00-shell-home.html','utf8');
const programsHtml=fs.readFileSync('src/html/10-programs-builder.html','utf8');
const profilesHtml=fs.readFileSync('src/html/40-profiles.html','utf8');
const progressHtml=fs.readFileSync('src/html/50-profile-progress.html','utf8');
const onboardingHtml=fs.readFileSync('src/html/30-onboarding-account.html','utf8');
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
ok('shared action registry is used by platform and events',
  platform.includes("from './05-actions.js'")&&events.includes("from './05-actions.js'")&&actions.includes('export function registerAction'));
ok('workout toolbar actions are declarative',
  shell.includes('data-act="openWorkoutSound"')&&shell.includes('data-act="openHandsFree"'));
ok('workout toolbar has no brittle direct onclick wiring',
  !events.includes("$('btnSoundW').onclick")&&!events.includes("$('btnMicW').onclick"));
ok('program/catalog actions are declarative',
  programsHtml.includes('id="btnAddProgram" data-act="openCreateProgram"')
  && programsHtml.includes('id="btnToStore" data-act="openStoreFromPrograms"')
  && shell.includes('id="greetAva" data-act="editCurrentProfile"')
  && shell.includes('id="btnStoreMenu" data-act="openStoreFromMenu"')
  && shell.includes('id="storeBackTop" data-act="backFromStore"')
  && progressHtml.includes('id="chManual" data-act="createProgramManual"')
  && progressHtml.includes('id="chAI" data-act="createProgramAI"')
  && progressHtml.includes('id="chImport" data-act="openProgramImport"')
  && progressHtml.includes('id="btnDoImport" data-act="importProgramCode"')
  && profilesHtml.includes('id="btnMyCatalog" data-act="openMyCatalog"'));
ok('program/catalog static buttons have no direct onclick wiring',
  !events.includes("$('btnAddProgram').onclick")
  && !events.includes("$('greetAva').onclick")
  && !events.includes("$('btnStoreMenu').onclick")
  && !events.includes("$('storeBackTop').onclick")
  && !events.includes("$('chManual').onclick")
  && !events.includes("$('chAI').onclick")
  && !events.includes("$('chImport').onclick")
  && !events.includes("$('btnDoImport').onclick")
  && !events.includes("$('btnToStore').onclick")
  && !events.includes("$('btnMyCatalog').onclick"));
ok('trainer/legal actions are declarative',
  progressHtml.includes('id="tpBackTop" data-act="backTrainerProfile"')
  && progressHtml.includes('id="pubBackTop" data-act="backPublish"')
  && progressHtml.includes('id="mcBackTop" data-act="backMyCatalog"')
  && profilesHtml.includes('id="coachNoAcc" data-act="openCoachAccount"')
  && profilesHtml.includes('id="btnCoachWipe" data-act="wipeCoach"')
  && profilesHtml.includes('id="btnMyPage" data-act="openMyTrainerPage"')
  && progressHtml.includes('id="btnPublish" data-act="publishProgram"')
  && progressHtml.includes('id="clBackTop" data-act="backClient"')
  && onboardingHtml.includes('id="legalBackTop" data-act="legalBack"')
  && onboardingHtml.includes('id="btnLegalDone" data-act="legalBack"')
  && profilesHtml.includes('id="btnLegalPrivacy" data-act="openLegalPrivacy"')
  && profilesHtml.includes('id="btnLegalTerms" data-act="openLegalTerms"')
  && profilesHtml.includes('id="btnLegalHealth" data-act="openLegalHealth"'));
ok('trainer/legal static buttons have no direct onclick wiring',
  !events.includes("$('tpBackTop').onclick")
  && !events.includes("$('pubBackTop').onclick")
  && !events.includes("$('mcBackTop').onclick")
  && !events.includes("$('coachNoAcc').onclick")
  && !events.includes("$('btnCoachWipe').onclick")
  && !events.includes("$('btnMyPage').onclick")
  && !events.includes("$('btnPublish').onclick")
  && !events.includes("$('clBackTop').onclick")
  && !events.includes("$('legalBackTop').onclick")
  && !events.includes("$('btnLegalDone').onclick")
  && !events.includes("$('btnLegalPrivacy').onclick")
  && !events.includes("$('btnLegalTerms').onclick")
  && !events.includes("$('btnLegalHealth').onclick"));

process.exit(bad?1:0);
