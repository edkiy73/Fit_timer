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
ok('account/progress actions are declarative',
  shell.includes('id="btnPremium" data-act="openPremium"')
  && profilesHtml.includes('id="btnPlanCard" data-act="openPremium"')
  && progressHtml.includes('id="payGo" data-act="completePurchase"')
  && progressHtml.includes('id="loginGo" data-act="login"')
  && progressHtml.includes('id="loginHaveCode" data-act="loginUseCode"')
  && progressHtml.includes('id="loginCancel" data-act="loginCancel"')
  && profilesHtml.includes('id="btnLoginRow" data-act="openLogin"')
  && profilesHtml.includes('id="btnSignOut" data-act="signOut"')
  && progressHtml.includes('id="btnImportProgFile" data-act="pickProgramImportFile"')
  && profilesHtml.includes('id="btnExportAll" data-act="exportAllData"')
  && profilesHtml.includes('id="btnImportAll" data-act="pickAllDataImportFile"')
  && profilesHtml.includes('id="btnWipeAccount" data-act="wipeAccount"')
  && profilesHtml.includes('id="btnWeightHist" data-act="openWeightHistory"')
  && profilesHtml.includes('id="btnShareWeight" data-act="shareWeightChart"')
  && profilesHtml.includes('id="btnAddPhoto" data-act="pickProgressPhoto"')
  && profilesHtml.includes('id="btnCompare" data-act="openPhotoCompare"'));
ok('account/progress static buttons have no direct onclick wiring',
  !events.includes("$('btnPremium').onclick")
  && !events.includes("$('btnPlanCard').onclick")
  && !events.includes("$('payGo').onclick")
  && !events.includes("$('loginGo').onclick")
  && !events.includes("$('loginHaveCode').onclick")
  && !events.includes("$('loginCancel').onclick")
  && !events.includes("$('btnLoginRow').onclick")
  && !events.includes("$('btnSignOut').onclick")
  && !events.includes("$('btnImportProgFile').onclick")
  && !events.includes("$('btnExportAll').onclick")
  && !events.includes("$('btnImportAll').onclick")
  && !events.includes("$('btnWipeAccount').onclick")
  && !events.includes("$('btnWeightHist').onclick")
  && !events.includes("$('btnShareWeight').onclick")
  && !events.includes("$('btnAddPhoto').onclick")
  && !events.includes("$('btnCompare').onclick"));

ok('progress/onboarding/profile actions are declarative',
  profilesHtml.includes('id="btnAddWell" data-act="openWellAdd"')
  && progressHtml.includes('id="btnSaveWell" data-act="saveWell"')
  && profilesHtml.includes('id="btnWellHist" data-act="openWellHistory"')
  && profilesHtml.includes('id="btnShareWell" data-act="shareWellChart"')
  && progressHtml.includes('id="wellHistSave" data-act="saveWellHistory"')
  && profilesHtml.includes('id="btnDeleteAllPhotos" data-act="deleteAllPhotos"')
  && progressHtml.includes('id="cmpDelA" data-act="deleteCompareA"')
  && progressHtml.includes('id="cmpDelB" data-act="deleteCompareB"')
  && progressHtml.includes('id="btnShareCmp" data-act="shareCompare"')
  && progressHtml.includes('id="whSave" data-act="saveWeightHistory"')
  && profilesHtml.includes('id="calPrev" data-act="calendarPrev"')
  && profilesHtml.includes('id="calNext" data-act="calendarNext"')
  && onboardingHtml.includes('id="obLegal1" data-act="onboardingPrivacy"')
  && onboardingHtml.includes('id="obStart" data-act="onboardingStart"')
  && onboardingHtml.includes('id="obLogin" data-act="onboardingLogin"')
  && progressHtml.includes('id="whoSave" data-act="whoSave"')
  && progressHtml.includes('id="whoSkip" data-act="whoSkip"')
  && progressHtml.includes('id="ueBackTop" data-act="profileBack"')
  && profilesHtml.includes('id="btnAddUser" data-act="addUser"')
  && progressHtml.includes('id="btnSaveUser" data-act="saveUser"')
  && progressHtml.includes('id="btnDelUser" data-act="deleteUser"'));
ok('progress/onboarding/profile static buttons have no direct onclick wiring',
  !events.includes("$('btnAddWell').onclick")
  && !events.includes("$('btnSaveWell').onclick")
  && !events.includes("$('btnWellHist').onclick")
  && !events.includes("$('btnShareWell').onclick")
  && !events.includes("$('wellHistSave').onclick")
  && !events.includes("$('btnDeleteAllPhotos').onclick")
  && !events.includes("$('cmpDelA').onclick")
  && !events.includes("$('cmpDelB').onclick")
  && !events.includes("$('btnShareCmp').onclick")
  && !events.includes("$('whSave').onclick")
  && !events.includes("$('calPrev').onclick")
  && !events.includes("$('calNext').onclick")
  && !events.includes("$('obLegal1').onclick")
  && !events.includes("$('obStart').onclick")
  && !events.includes("$('obLogin').onclick")
  && !events.includes("$('whoSave').onclick")
  && !events.includes("$('whoSkip').onclick")
  && !events.includes("$('ueBackTop').onclick")
  && !events.includes("$('btnAddUser').onclick")
  && !events.includes("$('btnSaveUser').onclick")
  && !events.includes("$('btnDelUser').onclick"));

ok('navigation/profile selectors are declarative',
  profilesHtml.includes('data-act="switchStatsTab" data-tab="workouts"')
  && profilesHtml.includes('data-act="switchMoreTab" data-more="me"')
  && shell.includes('class="qs-btn" data-act="openStatsTab" data-tab="workouts"')
  && progressHtml.includes('class="dock-btn act" data-act="goRootTab" data-scr="scrMenu"')
  && progressHtml.includes('data-act="setProfileTheme" data-theme="system"')
  && progressHtml.includes('data-act="setProfileLocale" data-locale="system"')
  && progressHtml.includes('id="ueGenderF" data-act="setProfileGender" data-gender="f"')
  && progressHtml.includes('id="ueGenderM" data-act="setProfileGender" data-gender="m"')
  && progressHtml.includes('id="whoF" data-act="setWhoGender" data-gender="f"')
  && progressHtml.includes('id="whoM" data-act="setWhoGender" data-gender="m"'));
ok('navigation/profile selectors have no per-element onclick wiring',
  !events.includes("document.querySelectorAll('#statsTabs .tab').forEach(b => b.onclick")
  && !events.includes("document.querySelectorAll('#moreTabs .tab').forEach(b => b.onclick")
  && !events.includes("document.querySelectorAll('.qs-btn').forEach(b => b.onclick")
  && !events.includes("document.querySelectorAll('.dock-btn').forEach(b => b.onclick")
  && !events.includes("document.querySelectorAll('#ueThemeSeg button').forEach(b =>")
  && !events.includes("document.querySelectorAll('#ueLocaleSeg button').forEach(b =>")
  && !events.includes("$('ueGenderF').onclick")
  && !events.includes("$('ueGenderM').onclick")
  && !events.includes("$('whoF').onclick")
  && !events.includes("$('whoM').onclick"));


process.exit(bad?1:0);
