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
const coreJs=fs.readFileSync('src/app/00-core.js','utf8');
const dataSync=fs.readFileSync('src/app/10-data-sync.js','utf8');
const accountJs=fs.readFileSync('src/app/20-account.js','utf8');
const progressJs=fs.readFileSync('src/app/30-progress-media.js','utf8');
const programsAi=fs.readFileSync('src/app/40-programs-ai.js','utf8');
const workoutJs=fs.readFileSync('src/app/70-workout.js','utf8');
const trainerCatalog=fs.readFileSync('src/app/50-trainer-catalog.js','utf8');
const builderJs=fs.readFileSync('src/app/60-builder.js','utf8');
const actions=fs.readFileSync('src/app/05-actions.js','utf8');
const shell=fs.readFileSync('src/html/00-shell-home.html','utf8');
const programsHtml=fs.readFileSync('src/html/10-programs-builder.html','utf8');
const profilesHtml=fs.readFileSync('src/html/40-profiles.html','utf8');
const progressHtml=fs.readFileSync('src/html/50-profile-progress.html','utf8');
const workoutHtml=fs.readFileSync('src/html/20-workout-finish.html','utf8');
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

ok('settings/utility actions are declarative',
  profilesHtml.includes('data-act="setHandsFreeMode" data-hf="off"')
  && progressHtml.includes('id="btnHfApply" data-act="applyHandsFree"')
  && profilesHtml.includes('id="btnVoicePack" data-act="downloadVoicePack"')
  && profilesHtml.includes('id="btnVoiceTest" data-act="openVoiceTest"')
  && shell.includes('id="storeClear" data-act="clearStoreSearch"')
  && profilesHtml.includes('id="coachPhotoBtn" data-act="pickCoachPhoto"')
  && onboardingHtml.includes('id="legalHeadPrivacy" data-act="toggleLegalSection" data-legal="privacy"')
  && profilesHtml.includes('id="notifWorkouts" data-act="toggleNotificationPref" data-pref="workouts"')
  && profilesHtml.includes('id="emailOffers" data-act="toggleNotificationPref" data-pref="emailOffers"')
  && progressHtml.includes('id="lockGo" data-act="unlockApp"')
  && progressHtml.includes('id="lockMail" data-act="unlockByEmail"'));
ok('settings/utility actions have no direct onclick wiring',
  !events.includes("document.querySelectorAll('#hfSeg button').forEach(b =>")
  && !events.includes("$('btnResume').onclick")
  && !events.includes("$('weightModalDone').onclick")
  && !events.includes("$('btnHfApply').onclick")
  && !events.includes("$('btnVoicePack').onclick")
  && !events.includes("$('btnVoiceTest').onclick")
  && !events.includes("$('storeClear').onclick")
  && !events.includes("$('coachPhotoBtn').onclick")
  && !events.includes("legalHead' + k[0].toUpperCase() + k.slice(1)).onclick")
  && !events.includes("btn.onclick = ()=> { setNotificationPref")
  && !events.includes("$('lockGo').onclick")
  && !events.includes("$('lockMail').onclick"));

ok('trainer/client/weight/premium actions are declarative',
  profilesHtml.includes('id="tglTrainer" data-act="toggleTrainerMode"')
  && profilesHtml.includes('id="btnSaveCoach" data-act="saveCoachProfile"')
  && programsHtml.includes('id="startByChip" data-act="openWorkoutTrainer"')
  && progressHtml.includes('id="btnAddClient" data-act="addClient"')
  && progressHtml.includes('id="btnClSend" data-act="sendClientProgram"')
  && progressHtml.includes('id="btnDelClient" data-act="deleteClient"')
  && profilesHtml.includes('id="btnAddWeight" data-act="openWeightEntry"')
  && progressHtml.includes('id="btnSaveWeight" data-act="saveWeightEntry"')
  && progressHtml.includes('id="pmBuy" data-act="startPremiumPurchase"')
  && progressHtml.includes('id="pokBio" data-act="enableBiometryAfterPurchase"')
  && profilesHtml.includes('id="tglBio" data-act="toggleBiometry"')
  && profilesHtml.includes('id="tglRenew" data-act="toggleRenewal"'));
ok('trainer/client/weight/premium actions have no direct onclick wiring',
  !events.includes("$('tglTrainer').onclick")
  && !events.includes("$('btnSaveCoach').onclick")
  && !events.includes("$('startByChip').onclick")
  && !events.includes("$('btnAddClient').onclick")
  && !events.includes("$('btnClSend').onclick")
  && !events.includes("$('btnDelClient').onclick")
  && !events.includes("$('btnAddWeight').onclick")
  && !events.includes("$('btnSaveWeight').onclick")
  && !events.includes("$('pmBuy').onclick")
  && !events.includes("$('pokBio').onclick")
  && !events.includes("$('tglBio').onclick")
  && !events.includes("$('tglRenew').onclick"));

ok('workout start/exit actions are declarative',
  programsHtml.includes('id="startMore" data-act="toggleStartMenu"')
  && programsHtml.includes('id="progDescMore" data-act="toggleProgramDescription"')
  && programsHtml.includes('id="btnStart" data-act="openWorkoutStart"')
  && programsHtml.includes('id="startResume" data-act="resumeSavedWorkout"')
  && programsHtml.includes('id="startFresh" data-act="startFreshWorkout"')
  && programsHtml.includes('id="startPick" data-act="pickWorkoutStartStep"')
  && programsHtml.includes('id="startBackTop" data-act="backFromWorkoutStart"')
  && programsHtml.includes('id="exitSave" data-act="saveAndExitWorkout"')
  && programsHtml.includes('id="exitFinishToday" data-act="finishWorkoutToday"')
  && programsHtml.includes('id="exitDrop" data-act="discardWorkout"'));
ok('workout start/exit actions have no direct onclick wiring',
  !events.includes("$('startMore').onclick")
  && !events.includes("$('progDescMore').onclick")
  && !events.includes("$('btnStart').onclick")
  && !events.includes("$('startResume').onclick")
  && !events.includes("$('startFresh').onclick")
  && !events.includes("$('startPick').onclick")
  && !events.includes("$('startBackTop').onclick")
  && !events.includes("$('exitSave').onclick")
  && !events.includes("$('exitFinishToday').onclick")
  && !events.includes("$('exitDrop').onclick"));

ok('core workout controls are declarative',
  workoutHtml.includes('id="btnPrev" data-act="previousWorkoutStep"')
  && workoutHtml.includes('id="btnSkip" data-act="skipWorkoutStep"')
  && workoutHtml.includes('id="btnDone" data-act="completeWorkoutStep"'));
ok('core workout controls have no direct onclick wiring',
  !events.includes("$('btnPrev').onclick")
  && !events.includes("$('btnSkip').onclick")
  && !events.includes("$('btnDone').onclick"));

ok('workout dynamic controls and modal backdrops use action registry',
  programsHtml.includes('id="startModal" data-act="closeModalBackdrop"')
  && programsHtml.includes('id="pickStepModal" data-act="closeModalBackdrop"')
  && programsHtml.includes('id="exitModal" data-act="closeModalBackdrop"')
  && progressHtml.includes('id="hfModal" data-act="closeModalBackdrop"')
  && progressHtml.includes('id="soundModal" data-act="closeModalBackdrop"')
  && progressHtml.includes('id="voiceTestModal" data-act="closeModalBackdrop"')
  && progressHtml.includes('id="createModal" data-act="closeModalBackdrop"')
  && progressHtml.includes('id="importModal" data-act="closeModalBackdrop"')
  && progressHtml.includes('id="waModal" data-act="closeModalBackdrop"')
  && progressHtml.includes('id="premiumModal" data-act="closeModalBackdrop"')
  && progressHtml.includes('id="payModal" data-act="closeModalBackdrop"')
  && progressHtml.includes('id="premiumOkModal" data-act="closeModalBackdrop"')
  && progressHtml.includes('id="wellModal" data-act="closeModalBackdrop"')
  && progressHtml.includes('id="cmpModal" data-act="closeModalBackdrop"')
  && progressHtml.includes('id="whModal" data-act="closeModalBackdrop"')
  && events.includes("b.dataset.act = 'chooseWorkoutStartStep'")
  && events.includes("btn.dataset.act = 'stageHandsFreeMode'")
  && events.includes("$('btnHfVoiceTest').dataset.act = 'openHandsFreeVoiceTest'"));
ok('workout dynamic controls and modal backdrops have no direct onclick wiring',
  !events.includes("$('startModal').onclick")
  && !events.includes("$('pickStepModal').onclick")
  && !events.includes("$('exitModal').onclick")
  && !events.includes("$('hfModal').onclick")
  && !events.includes("$('soundModal').onclick")
  && !events.includes("$('voiceTestModal').onclick")
  && !events.includes("$('createModal').onclick")
  && !events.includes("$('importModal').onclick")
  && !events.includes("$('waModal').onclick")
  && !events.includes("$('premiumModal').onclick")
  && !events.includes("$('payModal').onclick")
  && !events.includes("$('premiumOkModal').onclick")
  && !events.includes("$('wellModal').onclick")
  && !events.includes("$('cmpModal').onclick")
  && !events.includes("$('whModal').onclick")
  && !events.includes("$('btnHfVoicePack').onclick")
  && !events.includes("$('btnHfVoiceTest').onclick")
  && !events.includes("document.querySelectorAll('#hfModalSeg [data-hf]').forEach(c =>"));

ok('finish/profile dynamic actions are declarative',
  workoutHtml.includes('id="btnShareResult" data-act="shareWorkoutResult"')
  && workoutHtml.includes('id="finNoteToggle" data-act="openFinishNote"')
  && workoutHtml.includes('id="finProgCheckYes" data-act="applyFinishProgression"')
  && workoutHtml.includes('id="finProgCheckList"')
  && !workoutHtml.includes('id="finProgCheckToggle"')
  && workoutHtml.includes('id="btnAgain" data-act="finishResultDone"')
  && workoutHtml.includes('id="btnDiscardResult" data-act="discardWorkoutResult"')
  && progressHtml.includes('id="uePhotoBtn" data-act="openProfilePhotoMenu"')
  && progressHtml.includes('id="whoModal" data-act="skipWhoBackdrop"')
  && progressHtml.includes('id="loginModal" data-act="dropLoginBackdrop"')
  && events.includes("b.dataset.act = 'sendChosenProgramToClient'")
  && events.includes("replace.dataset.act = 'replaceProfilePhoto'")
  && events.includes("remove.dataset.act = 'deleteProfilePhoto'"));
ok('finish/profile dynamic actions have no direct onclick wiring',
  !events.includes("$('btnShareResult').onclick")
  && !events.includes("$('finNoteToggle').onclick")
  && !events.includes("$('finProgCheckYes').onclick")
  && !events.includes("$('finProgCheckToggle').onclick")
  && !events.includes("registerAction('toggleFinishProgressionList'")
  && !events.includes("$('btnAgain').onclick")
  && !events.includes("$('btnDiscardResult').onclick")
  && !events.includes("$('uePhotoBtn').onclick")
  && !events.includes("$('whoModal').onclick")
  && !events.includes("$('loginModal').onclick"));

ok('AI/image actions are declarative',
  programsHtml.includes('id="aiCopyFull" data-act="copyEditedProgram"')
  && workoutHtml.includes('id="swapBadge" data-act="openSwapHint"')
  && progressHtml.includes('id="swapModal" data-act="closeSwapBackdrop"')
  && programsHtml.includes('id="btnAddEx" data-act="openAddExerciseModal"')
  && progressHtml.includes('id="addExModal" data-act="closeModalBackdrop"')
  && programsHtml.includes('id="aiRunCancel" data-act="cancelAiRun"')
  && programsHtml.includes('id="aiSelf" data-act="runAiSelf"')
  && programsHtml.includes('id="aiCopy" data-act="copyAiRequest"')
  && programsHtml.includes('id="aiApply" data-act="applyAiResult"')
  && programsHtml.includes('id="aiMore" data-act="toggleAiMenu"')
  && programsHtml.includes('id="aiBackTop" data-act="backFromAi"')
  && programsHtml.includes('id="imgBackTop" data-act="closeImages"')
  && programsHtml.includes('id="imgGenScopeModal" data-act="closeModalBackdrop"')
  && programsHtml.includes('id="imgGenAll" data-act="generateAllImages"')
  && programsHtml.includes('id="imgGenMissing" data-act="generateMissingImages"')
  && programsHtml.includes('id="imgPromptCopy" data-act="copyImagesPrompt"')
  && programsHtml.includes('id="imgDone" data-act="closeImages"')
  && programsHtml.includes('id="imgPick" data-act="pickImageFiles"')
  && programsHtml.includes('id="trayAuto" data-act="autoAssignImageTray"')
  && programsHtml.includes('id="trayClear" data-act="clearImageTray"')
  && programsHtml.includes('id="slotModal" data-act="closeModalBackdrop"')
  && programsHtml.includes('id="slotRemove" data-act="removeImageSlot"')
  && programsHtml.includes('id="slotFromPhone" data-act="pickSlotImage"')
  && programsHtml.includes('id="slotGenerateAI" data-act="generateSlotImage"')
  && progressHtml.includes('id="chYT" data-act="openYouTubeCreate"'));
ok('AI/image actions have no direct onclick wiring',
  !events.includes("$('chYT').onclick")
  && !events.includes("$('aiCopyFull').onclick")
  && !events.includes("$('swapBadge').onclick")
  && !events.includes("$('swapOk').onclick")
  && !events.includes("$('swapAI').onclick")
  && !events.includes("$('swapModal').onclick")
  && !events.includes("$('swapCopy').onclick")
  && !events.includes("$('btnAddEx').onclick")
  && !events.includes("$('addExModal').onclick")
  && !events.includes("$('aemManual').onclick")
  && !events.includes("$('aemAI').onclick")
  && !events.includes("$('aiRunCancel').onclick")
  && !events.includes("$('aiSelf').onclick")
  && !events.includes("$('aiCopy').onclick")
  && !events.includes("$('aiApply').onclick")
  && !events.includes("$('aiMore').onclick")
  && !events.includes("$('aiBackTop').onclick")
  && !events.includes("$('imgBackTop').onclick")
  && !events.includes("$('imgSelfGen').onclick")
  && !events.includes("$('imgGenScopeModal').onclick")
  && !events.includes("$('imgGenAll').onclick")
  && !events.includes("$('imgGenMissing').onclick")
  && !events.includes("$('imgPromptCopy').onclick")
  && !events.includes("$('imgDone').onclick")
  && !events.includes("$('imgPick').onclick")
  && !events.includes("$('trayAuto').onclick")
  && !events.includes("$('trayClear').onclick")
  && !events.includes("$('slotModal').onclick")
  && !events.includes("$('slotRemove').onclick")
  && !events.includes("$('slotFromPhone').onclick")
  && !events.includes("$('slotGenerateAI').onclick"));

ok('exercise editor and builder actions are declarative',
  programsHtml.includes('id="exMore" data-act="toggleExerciseMenu"')
  && programsHtml.includes('id="exBackTop" data-act="backFromExercise"')
  && programsHtml.includes('id="btnSaveEx" data-act="saveExercise"')
  && programsHtml.includes('id="exTypeReps" data-act="setExerciseType" data-ex-type="reps"')
  && programsHtml.includes('id="exTypeTime" data-act="setExerciseType" data-ex-type="time"')
  && programsHtml.includes('id="exLoadNone" data-act="setExerciseLoadType" data-load-type="none"')
  && programsHtml.includes('id="exLoadWeight" data-act="setExerciseLoadType" data-load-type="weight"')
  && programsHtml.includes('id="exLoadLevelType" data-act="setExerciseLoadType" data-load-type="level"')
  && programsHtml.includes('id="exLoadLevel"')
  && programsHtml.includes('id="exLoadLevels"')
  && programsHtml.includes('data-act="toggleExerciseLevelScale"')
  && programsHtml.includes('id="exProgMode"')
  && programsHtml.includes('id="exProgToggle" data-act="toggleExerciseProgressionBox"')
  && programsHtml.includes('id="exProgOn" data-act="toggleExerciseProgression"')
  && !programsHtml.includes('id="exDual"')
  && !events.includes("registerAction('toggleExerciseDualProgression'")
  && programsHtml.includes('id="exSwapOn" data-act="toggleExerciseSwap"')
  && programsHtml.includes('id="exWarm" data-act="toggleExerciseWarmup"')
  && programsHtml.includes('id="exSide" data-act="toggleExercisePerSide"')
  && programsHtml.includes('id="exDetailsToggle" data-act="toggleExerciseDetails"')
  && programsHtml.includes('id="exMediaBtn" data-act="pickExerciseMedia"')
  && programsHtml.includes('id="exMediaNone" data-act="removeExerciseMedia"')
  && programsHtml.includes('id="exMediaAI" data-act="generateExerciseMedia"')
  && programsHtml.includes('id="bImagesRow" data-act="openProgramImages"')
  && programsHtml.includes('id="bSettingsToggle" data-act="openProgramSettings"')
  && programsHtml.includes('id="psBackTop" data-act="backFromProgramSettings"')
  && programsHtml.includes('id="btnPsDone" data-act="saveProgramSettings"')
  && programsHtml.includes('id="btnSaveProgram" data-act="saveProgram"')
  && programsHtml.includes('id="builderBackTop" data-act="backFromBuilder"')
  && programsHtml.includes('id="bCoverBtn" data-act="pickProgramCover"')
  && programsHtml.includes('id="bCoverNone" data-act="removeProgramCover"')
  && programsHtml.includes('id="bCoverAI" data-act="generateProgramCover"')
  && profilesHtml.includes('id="btnResetTotal" data-act="resetWorkoutStats"'));
ok('exercise editor and builder actions have no direct onclick wiring',
  !events.includes("$('exMore').onclick")
  && !events.includes("$('exBackTop').onclick")
  && !events.includes("$('btnSaveEx').onclick")
  && !events.includes("$('exTypeReps').onclick")
  && !events.includes("$('exTypeTime').onclick")
  && !events.includes("$('exLoadNone').onclick")
  && !events.includes("$('exLoadWeight').onclick")
  && !events.includes("$('exProgToggle').onclick")
  && !events.includes("$('exProgOn').onclick")
  && !events.includes("$('exDual').onclick")
  && !events.includes("$('exSwapOn').onclick")
  && !events.includes("$('exWarm').onclick")
  && !events.includes("$('exSide').onclick")
  && !events.includes("$('exDetailsToggle').onclick")
  && !events.includes("$('exMediaBtn').onclick")
  && !events.includes("$('exMediaNone').onclick")
  && !events.includes("$('exMediaAI').onclick")
  && !events.includes("$('bImagesRow').onclick")
  && !events.includes("$('bSettingsToggle').onclick")
  && !events.includes("$('psBackTop').onclick")
  && !events.includes("$('btnPsDone').onclick")
  && !events.includes("$('btnSaveProgram').onclick")
  && !events.includes("$('builderBackTop').onclick")
  && !events.includes("$('bCoverBtn').onclick")
  && !events.includes("$('bCoverNone').onclick")
  && !events.includes("$('bCoverAI').onclick")
  && !events.includes("$('btnResetTotal').onclick"));

ok('final onclick migration uses declarative actions',
  programsHtml.includes('id="bModeTabs"')
  && programsHtml.includes('data-act="switchBuilderMode" data-m="manual"')
  && programsHtml.includes('data-act="switchBuilderMode" data-m="text"')
  && programsHtml.includes('data-act="switchBuilderMode" data-m="video"')
  && programsHtml.includes('id="exModeTabs"')
  && programsHtml.includes('data-act="switchExerciseMode" data-m="manual"')
  && programsHtml.includes('data-act="switchExerciseMode" data-m="ai"')
  && events.includes("$(p + 'SoundOn').dataset.act = 'toggleLiveSoundMaster'")
  && events.includes("$(p + 'VoiceOn').dataset.act = 'toggleLiveSoundVoice'")
  && events.includes("$(p + 'FxOn').dataset.act = 'toggleLiveSoundFx'")
  && events.includes("$(p + 'Music').dataset.act = 'toggleLiveSoundMusic'")
  && events.includes("b.dataset.act = action")
  && events.includes("'duplicateAiExercise'")
  && events.includes("'deleteAiExercise'")
  && events.includes("'duplicateExercise'")
  && events.includes("'deleteExercise'"));
ok('90-events has no direct onclick wiring left',
  !events.includes('.onclick'));

ok('account/progress/data-sync click actions use registry',
  accountJs.includes("registerAction('openAndroidUpdate'")
  && accountJs.includes("b.dataset.act = 'selectPremiumPlan'")
  && progressJs.includes("b.dataset.act = 'openPhotoCompareAt'")
  && progressJs.includes("del.dataset.act = 'toggleWeightHistoryDelete'")
  && dataSync.includes("edit.dataset.act = 'editProfileFromList'")
  && dataSync.includes("row.dataset.act = 'openOrSwitchProfile'")
  && dataSync.includes("del.dataset.act = 'toggleWellHistoryDelete'")
  && dataSync.includes("el.dataset.act = 'showBadgeInfo'")
  && dataSync.includes("row.dataset.act = 'openSessionProgram'"));
ok('account/progress/data-sync migrated handlers have no direct onclick wiring',
  !accountJs.includes("$('appUpdateNow').onclick")
  && !accountJs.includes("banner.onclick")
  && !accountJs.includes("b.onclick = ()=>{ pmPlan")
  && !progressJs.includes("b.onclick = ()=> openCompare")
  && !progressJs.includes("row.querySelector('.wh-del').onclick")
  && !progressJs.includes("$('cmpImgA').onclick")
  && !progressJs.includes("$('cmpImgB').onclick")
  && !progressJs.includes("$('photoFullModal').onclick")
  && !dataSync.includes("row.querySelector('.ue').onclick")
  && !dataSync.includes("row.onclick = ()=> act")
  && !dataSync.includes("row.querySelector('.wh-del').onclick")
  && !dataSync.includes("el.onclick = ()=> appAlert")
  && !dataSync.includes("row.onclick = () => openDayProgram")
  && !dataSync.includes("$('sessModal').onclick"));
ok('account/progress static markup uses data-act',
  shell.includes('id="appUpdateBanner" data-act="openAndroidUpdate"')
  && shell.includes('id="appUpdateNow" data-act="openAndroidUpdate"')
  && progressHtml.includes('id="cmpImgA" data-act="openComparePhotoFull" data-compare-side="A"')
  && progressHtml.includes('id="cmpImgB" data-act="openComparePhotoFull" data-compare-side="B"')
  && progressHtml.includes('id="photoFullModal" data-act="closePhotoFullBackdrop"')
  && progressHtml.includes('id="sessModal" data-act="closeModalBackdrop"'));

ok('programs AI dynamic clicks use action registry',
  programsAi.includes("registerAction('showDynamicInfo'")
  && programsAi.includes("registerAction('openBodyStats'")
  && programsAi.includes("registerAction('openTodayProgram'")
  && programsAi.includes("registerAction('openWeekDay'")
  && programsAi.includes("registerAction('openDayProgram'")
  && programsAi.includes("registerAction('removeTrayImage'")
  && programsAi.includes("registerAction('openImageSlot'")
  && programsAi.includes("registerAction('assignTrayImageToSlot'")
  && programsAi.includes("el.dataset.act = 'showDynamicInfo'")
  && programsAi.includes("b.dataset.act = 'openBodyStats'")
  && programsAi.includes("cell.dataset.act = 'openWeekDay'")
  && programsAi.includes("row.dataset.act = 'openDayProgram'"));
ok('workout dynamic clicks use action registry',
  workoutJs.includes("registerAction('toggleProgressionHard'")
  && workoutJs.includes("registerAction('toggleWorkoutMenu'")
  && workoutJs.includes("registerAction('editWorkoutExercise'")
  && workoutJs.includes("registerAction('toggleWorkoutPause'")
  && workoutJs.includes("registerAction('openWorkoutExit'")
  && workoutJs.includes("card.dataset.act = 'toggleProgressionHard'")
  && workoutJs.includes("$('workMore').dataset.act = 'toggleWorkoutMenu'"));
ok('programs AI and workout have no direct onclick wiring',
  !programsAi.includes('.onclick')
  && !workoutJs.includes('.onclick'));

ok('trainer catalog and builder actions use registry',
  trainerCatalog.includes("registerAction('openClientFromList'")
  && trainerCatalog.includes("registerAction('pickCatalogOption'")
  && trainerCatalog.includes("registerAction('toggleMineProgramMenu'")
  && trainerCatalog.includes("registerAction('openStorePremium'")
  && builderJs.includes("registerAction('selectPlanTab'")
  && builderJs.includes("registerAction('toggleExerciseMuscle'")
  && builderJs.includes("registerAction('toggleAiChip'")
  && builderJs.includes("registerAction('toggleAiCard'")
  && builderJs.includes("registerAction('setScheduleMode'")
  && !builderJs.includes("registerAction('toggleBuilderProgression'"));
ok('trainer catalog and builder have no direct onclick wiring',
  !trainerCatalog.includes('.onclick')
  && !builderJs.includes('.onclick'));
ok('trainer catalog and builder static markup uses data-act',
  shell.includes('id="siBackTop" data-act="backFromStoreItem"')
  && shell.includes('id="siBy" data-act="openStoreTrainer"')
  && shell.includes('id="siLock" data-act="openStorePremium"')
  && shell.includes('id="siBuy" data-act="buyStoreItem"')
  && programsHtml.includes('data-act="setScheduleMode" data-mode="days"')
  && programsHtml.includes('data-act="setScheduleMode" data-mode="rot"')
  && programsHtml.includes('id="bProgEvery"')
  && !programsHtml.includes('id="bProgOn"')
  && programsHtml.includes('id="qSplit" data-act="toggleAiSplit"')
  && programsHtml.includes('id="qRotate" data-act="toggleAiRotate"')
  && progressHtml.includes('id="restModalDone" data-act="applyCustomRest"'));

ok('core dialog actions are declarative',
  core.includes("registerAction('confirmDialog'")
  && core.includes("registerAction('cancelDialog'")
  && core.includes("registerAction('dialogBackdrop'")
  && progressHtml.includes('id="dlg" data-act="dialogBackdrop"')
  && progressHtml.includes('id="dlgOk" data-act="confirmDialog"')
  && progressHtml.includes('id="dlgCancel" data-act="cancelDialog"'));
ok('core start-screen dynamic actions use registry',
  core.includes("b.dataset.act = 'selectStartPlan'")
  && core.includes("row.dataset.act = 'openStartWeight'")
  && core.includes("'editStartProgram'")
  && core.includes("'toggleStartProgramActive'")
  && core.includes("'duplicateStartProgram'")
  && core.includes("'deleteStartProgram'"));
ok('FitTimer app modules have no direct onclick wiring',
  [core,actions,dataSync,accountJs,progressJs,programsAi,trainerCatalog,builderJs,workoutJs,platform,events]
    .every(src => !src.includes('.onclick')));

ok('core dynamic actions use action registry',
  coreJs.includes("registerAction('selectStartPlan'")
  && coreJs.includes("registerAction('openStartWeight'")
  && coreJs.includes("registerAction('editStartProgram'")
  && coreJs.includes("registerAction('toggleStartProgramActive'")
  && coreJs.includes("registerAction('duplicateStartProgram'")
  && coreJs.includes("registerAction('deleteStartProgram'")
  && coreJs.includes("b.dataset.act = 'selectStartPlan'")
  && coreJs.includes("row.dataset.act = 'openStartWeight'")
  && coreJs.includes("b.dataset.act = action"));
const appJsFiles=fs.readdirSync('src/app').filter(name => name.endsWith('.js'));
const directOnclickFiles=appJsFiles.filter(name => fs.readFileSync('src/app/' + name,'utf8').includes('.onclick'));
ok('FitTimer product app has no direct .onclick handlers', directOnclickFiles.length === 0);


process.exit(bad?1:0);
