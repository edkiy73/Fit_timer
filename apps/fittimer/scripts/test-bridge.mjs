/* Test-only binding bridge for the product runtime modules (src/app/NN-*.js,
   src/app/00-dependencies.js, src/i18n/index.js).

   Browser tests inspect and stub a measured subset of product internals by name on
   globalThis. scripts/build-esm.mjs appends this bridge to each product module, but only
   bindings in TEST_BRIDGE_ALLOWLIST are re-exposed on
   globalThis only when the harness sets globalThis.__FIT_TEST_MODE__ (never in
   production). Only names in TEST_BRIDGE_WRITABLE receive setters, so ordinary
   compatibility reads cannot mutate module state by accident. */
import ts from 'typescript';

/* Explicit compatibility surface for browser tests. The audit script measures real
   page-context usage; anything else stays module-private even in test builds. */
export const TEST_BRIDGE_ALLOWLIST = new Set([
  "$",
  "account",
  "accountSyncAdapter",
  "activateClientAt",
  "addStoreItem",
  "addClient",
  "addExManual",
  "apiFetch",
  "apiPost",
  "appLocale",
  "applyAndroidUpdateConfig",
  "applyMedia",
  "applyThemeFor",
  "autoReport",
  "backupGlobalKeys",
  "backupProfileKeys",
  "buildReport",
  "buildStartMenu",
  "buildSteps",
  "buildWorkoutNotificationCandidates",
  "calcStreakInfo",
  "carryLinkedProgramState",
  "clampLine",
  "clampText",
  "cleanLink",
  "cleanPic",
  "clearSession",
  "clients",
  "closeImages",
  "completeStep",
  "configureWorkoutTiming",
  "connectAccountSync",
  "createEditedProgram",
  "curPlan",
  "curUser",
  "customPrograms",
  "DAYS",
  "deleteCustomProgram",
  "draft",
  "doPublish",
  "duplicateProgram",
  "enableTrainerMode",
  "esc",
  "exitWorkout",
  "exportProgram",
  "fillTrainerPage",
  "finishWorkout",
  "fitStorage",
  "fitImageToSlot",
  "forgetMe",
  "fullAIPrompt",
  "generateOneImageViaAI",
  "getExProgValue",
  "getExWeight",
  "GLOBAL_KEYS",
  "goTab",
  "identity",
  "imagesPromptText",
  "importAllData",
  "importFromText",
  "importProgramFile",
  "initAIForm",
  "isPremium",
  "kvGet",
  "kvSet",
  "limitNotificationCandidates",
  "liveExercise",
  "loadAccount",
  "loadBuilderDraft",
  "loadData",
  "loadDelta",
  "loadIdentity",
  "loadPhotos",
  "loadSession",
  "loadSessions",
  "loadStoreServer",
  "localISO",
  "navDepth",
  "navStack",
  "nextStep",
  "NO_BACKUP",
  "normalizeWorkoutOutcomes",
  "normHandle",
  "normPlans",
  "notifyAt",
  "notifyDayKey",
  "openAI",
  "openBuilder",
  "openClient",
  "openClients",
  "openEditAI",
  "openExAI",
  "openExEdAI",
  "openExercise",
  "openImages",
  "openLegal",
  "openMyCatalog",
  "openPublish",
  "openSlotPicker",
  "openStart",
  "openStore",
  "openStoreItem",
  "openTrainer",
  "openUserEdit",
  "openVoiceTest",
  "outbox",
  "pk",
  "pr",
  "previousWorkoutLoad",
  "PROFILE_KEYS",
  "programMedia",
  "programPayload",
  "programTemplateCopy",
  "progressedRepsRange",
  "pubDraft",
  "pushProfile",
  "refreshPubStatus",
  "refreshVoicePackUI",
  "renderClients",
  "renderMine",
  "renderToday",
  "renderTrainerCard",
  "restoreProfiles",
  "restoreTrainerClientState",
  "resumeWorkoutFromNativeNotification",
  "sanitizeProgram",
  "saveClients",
  "saveProgram",
  "savePrograms",
  "saveSession",
  "saveStats",
  "saveTrainer",
  "saveUsers",
  "sendProgramToClient",
  "sessionForProgram",
  "setDataSyncPlatformHooks",
  "shareProgramWithChoice",
  "show",
  "snapshotEx",
  "startWorkout",
  "state",
  "stats",
  "storeAll",
  "switchMoreTab",
  "switchUser",
  "syncDockTabs",
  "t",
  "tearDownWorkout",
  "trainer",
  "trainerProfile",
  "updateTrainerProfile",
  "userForAI",
  "users",
  "weekPlanInfo",
  "workoutLoadSnapshot",
  "workoutSessionSignature",
  "workoutStepKey",
  "workStepChoices",
]);

/* Only bindings that browser tests deliberately overwrite get setters. Everything
   else in the test compatibility surface is getter-only even when its declaration is mutable. */
export const TEST_BRIDGE_WRITABLE = new Set([]);

export function testBridge(source, fileName = 'module.js'){
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, false, ts.ScriptKind.JS);
  const names = new Map();
  const add = (name, mutable) => { if(name && !names.has(name)) names.set(name, mutable); };
  const bindingNames = node => {
    if(ts.isIdentifier(node)) return [node.text];
    return node.elements.flatMap(el => ts.isOmittedExpression(el) ? [] : bindingNames(el.name));
  };
  for(const stmt of file.statements){
    if(ts.isFunctionDeclaration(stmt) && stmt.name) add(stmt.name.text, true);
    else if(ts.isClassDeclaration(stmt) && stmt.name) add(stmt.name.text, false);
    else if(ts.isVariableStatement(stmt)){
      const mutable = !(stmt.declarationList.flags & ts.NodeFlags.Const);
      for(const decl of stmt.declarationList.declarations) for(const name of bindingNames(decl.name)) add(name, mutable);
    }
  }
  const exposed = [...names].filter(([name]) => TEST_BRIDGE_ALLOWLIST.has(name));
  if(!exposed.length) return '';
  const lines = exposed.map(([name, mutable]) => mutable && TEST_BRIDGE_WRITABLE.has(name)
    ? `  __fitExpose(${JSON.stringify(name)}, () => ${name}, value => { ${name} = value; });`
    : `  __fitExpose(${JSON.stringify(name)}, () => ${name});`);
  return `
/* Generated by scripts/test-bridge.mjs — test-only binding bridge, inert in production. */
if(globalThis.__FIT_TEST_MODE__ === true){
  const __fitExpose = (name, get, set) => {
    const current = Object.getOwnPropertyDescriptor(globalThis, name);
    if(current && !current.configurable) return;
    Object.defineProperty(globalThis, name, set ? {configurable:true, get, set} : {configurable:true, get});
  };
${lines.join('\n')}
}
`;
}

/* Modules that receive the bridge. */
export const TEST_BRIDGE_FILTER = /[\\/]src[\\/](app[\\/](\d\d-[\w-]+|options)|i18n[\\/]index)\.js$/;
