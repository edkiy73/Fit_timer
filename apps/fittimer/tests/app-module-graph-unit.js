/* Phase 13 guard: the product runtime is a graph of ES modules (src/app/NN-*.js) that
   import each other cyclically. That is safe only while:
   1. a part's top level only declares things — startup wiring lives in its exported
      init function, which src/app/index.js calls once, in part order;
   2. no top-level initializer reads another part's binding at load time (in a cycle
      it may not be initialised yet); shared constants live in leaf modules (options.js);
   3. every name another module exports is imported where it is used. A forgotten
      import is not a build error: it silently falls back to a global and fails only
      at run time.
   Cross-module writes need no guard: esbuild rejects assignments to imports. */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const APP = 'src/app';
const parts = fs.readdirSync(APP).filter(n => /^\d\d-[\w-]+\.js$/.test(n) && n !== '00-dependencies.js').sort();
const leaves = ['00-dependencies.js', 'options.js'].map(n => path.join(APP, n)).concat('src/i18n/index.js');
const files = parts.map(n => path.join(APP, n)).concat(leaves, path.join(APP, 'index.js')).map(f => path.resolve(f));
const program = ts.createProgram(files, {allowJs:true, checkJs:false, noLib:true, noEmit:true,
  module:ts.ModuleKind.ESNext, moduleResolution:ts.ModuleResolutionKind.Bundler});
const checker = program.getTypeChecker();
const sfOf = f => program.getSourceFile(path.resolve(f));
const hasExport = n => (ts.getCombinedModifierFlags(n) & ts.ModifierFlags.Export) !== 0;

const problems = [];
const exportedBy = new Map();
for(const f of parts.map(n => path.join(APP, n)).concat(leaves)){
  for(const st of sfOf(f).statements){
    if((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name && hasExport(st)) exportedBy.set(st.name.text, f);
    if(ts.isVariableStatement(st) && hasExport(st)) for(const d of st.declarationList.declarations) if(ts.isIdentifier(d.name)) exportedBy.set(d.name.text, f);
  }
}

for(const name of parts){
  const f = path.join(APP, name);
  const sf = sfOf(f);
  const localFns = new Map();
  for(const st of sf.statements){
    if(ts.isFunctionDeclaration(st) && st.name) localFns.set(st.name.text, st);
  }
  // 1. top level only declares
  for(const st of sf.statements){
    if(ts.isImportDeclaration(st) || ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isVariableStatement(st)) continue;
    const line = sf.getLineAndCharacterOfPosition(st.getStart()).line + 1;
    problems.push(`${f}:${line} runs code at module load; move it into the part's init function`);
  }
  // 2. load-time reads of other parts' bindings (following this part's own functions)
  const importedFromPart = id => {
    const sym = checker.getSymbolAtLocation(id);
    if(!sym || !(sym.flags & ts.SymbolFlags.Alias)) return null;
    const decl = sym.declarations && sym.declarations[0];
    const imp = decl && ts.findAncestor(decl, ts.isImportDeclaration);
    const spec = imp && imp.moduleSpecifier.text;
    return spec && /^\.\/\d\d-[\w-]+\.js$/.test(spec) && spec !== './00-dependencies.js' ? spec : null;
  };
  for(const st of sf.statements){
    if(!ts.isVariableStatement(st)) continue;
    for(const d of st.declarationList.declarations){
      if(!d.initializer) continue;
      const seen = new Set();
      const scan = (node, deep) => {
        if(!deep && ts.isFunctionLike(node)) return;
        if(ts.isIdentifier(node)){
          const from = importedFromPart(node);
          if(from){
            const target = checker.getAliasedSymbol(checker.getSymbolAtLocation(node));
            const isFn = target && target.declarations && target.declarations.some(ts.isFunctionDeclaration);
            if(!isFn) problems.push(`${f}: top-level ${d.name.getText()} reads ${node.text} from ${from} at load time`);
          }
          if(localFns.has(node.text) && !seen.has(node.text) && !ts.isFunctionDeclaration(node.parent)){
            seen.add(node.text); scan(localFns.get(node.text).body || localFns.get(node.text), true);
          }
        }
        ts.forEachChild(node, n => scan(n, deep));
      };
      if(ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) continue;
      scan(d.initializer, false);
    }
  }
}

// 3. missing imports
const NOT_REFERENCE = id => {
  const p = id.parent;
  return (ts.isPropertyAccessExpression(p) && p.name === id)
    || ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p)
      || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p)) && p.name === id)
    || (ts.isBindingElement(p) && p.propertyName === id)
    || ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p)
    || ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p) || ts.isQualifiedName(p);
};
for(const f of parts.map(n => path.join(APP, n)).concat(leaves, path.join(APP, 'index.js'))){
  const sf = sfOf(f);
  const missing = new Set();
  (function visit(node){
    if(ts.isIdentifier(node) && !NOT_REFERENCE(node) && exportedBy.has(node.text)){
      const sym = ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node
        ? checker.getShorthandAssignmentValueSymbol(node.parent)
        : checker.getSymbolAtLocation(node);
      if(!sym) missing.add(node.text);
    }
    ts.forEachChild(node, visit);
  })(sf);
  for(const name of missing) problems.push(`${f} uses ${name} without importing it from ${exportedBy.get(name)}`);
}


const coreSource = fs.readFileSync(path.join(APP, '00-core.js'), 'utf8');
const dataSyncSource = fs.readFileSync(path.join(APP, '10-data-sync.js'), 'utf8');
const accountSource = fs.readFileSync(path.join(APP, '20-account.js'), 'utf8');
const progressSource = fs.readFileSync(path.join(APP, '30-progress-media.js'), 'utf8');
const programsAiSource = fs.readFileSync(path.join(APP, '40-programs-ai.js'), 'utf8');
const trainerCatalogSource = fs.readFileSync(path.join(APP, '50-trainer-catalog.js'), 'utf8');
const platformDataSyncSource = fs.readFileSync(path.join(APP, '80-platform.js'), 'utf8');
const builderSource = fs.readFileSync(path.join(APP, '60-builder.js'), 'utf8');
const workoutSource = fs.readFileSync(path.join(APP, '70-workout.js'), 'utf8');
const platformCoreSource = fs.readFileSync(path.join(APP, '80-platform.js'), 'utf8');
const eventsCoreSource = fs.readFileSync(path.join(APP, '90-events.js'), 'utf8');
if(/from ['"]\.\/00-core\.js['"]/.test(dataSyncSource)){
  problems.push('src/app/10-data-sync.js must not import 00-core.js; inject core helpers instead');
}
if(!/setDataSyncCoreHooks/.test(dataSyncSource) || !/setDataSyncCoreHooks\(\{[\s\S]*appAlert[\s\S]*icon[\s\S]*plural[\s\S]*setShown[\s\S]*getSideSec[\s\S]*getState[\s\S]*syncDockTabs/.test(coreSource)){
  problems.push('data-sync/core hook boundary is missing or incomplete');
}

if(/from ['"]\.\/50-trainer-catalog\.js['"]/.test(dataSyncSource)){
  problems.push('src/app/10-data-sync.js must not import 50-trainer-catalog.js; inject trainer-catalog-facing hooks instead');
}
if(!/setDataSyncTrainerCatalogHooks/.test(dataSyncSource) || !/setDataSyncTrainerCatalogHooks\(\{[\s\S]*renderMine/.test(trainerCatalogSource)){
  problems.push('data-sync/trainer-catalog hook boundary is missing or incomplete');
}

if(/from ['"]\.\/80-platform\.js['"]/.test(dataSyncSource)){
  problems.push('src/app/10-data-sync.js must not import 80-platform.js; inject platform-facing hooks instead');
}
if(!/setDataSyncPlatformHooks/.test(dataSyncSource) || !/setDataSyncPlatformHooks\(\{[\s\S]*applyThemeFor[\s\S]*syncNativeNotifications/.test(platformDataSyncSource)){
  problems.push('data-sync/platform hook boundary is missing or incomplete');
}


if(/from ['"]\.\/30-progress-media\.js['"]/.test(dataSyncSource)){
  problems.push('src/app/10-data-sync.js must not import 30-progress-media.js; inject progress-media-facing hooks instead');
}
if(!/setDataSyncProgressMediaHooks/.test(dataSyncSource) || !/setDataSyncProgressMediaHooks\(\{[\s\S]*ensureWarmup[\s\S]*loadPhotos[\s\S]*renderPhotos[\s\S]*shortD[\s\S]*uniqueExerciseIds/.test(progressSource)){
  problems.push('data-sync/progress-media hook boundary is missing or incomplete');
}

if(/from ['"]\.\/60-builder\.js['"]/.test(dataSyncSource)){
  problems.push('src/app/10-data-sync.js must not import 60-builder.js; inject builder-facing hooks instead');
}
if(!/setDataSyncBuilderHooks/.test(dataSyncSource) || !/setDataSyncBuilderHooks\(\{[\s\S]*exRestAfter[\s\S]*getExProgValue[\s\S]*hasWeight[\s\S]*normValue[\s\S]*parseValue[\s\S]*progAtCeiling[\s\S]*progAxis[\s\S]*progBaseValue[\s\S]*progStepSize[\s\S]*progressedRepsRange/.test(builderSource)){
  problems.push('data-sync/builder hook boundary is missing or incomplete');
}

if(/from ['"]\.\/70-workout\.js['"]/.test(dataSyncSource)){
  problems.push('src/app/10-data-sync.js must not import 70-workout.js; inject workout-facing hooks instead');
}
if(!/setDataSyncWorkoutHooks/.test(dataSyncSource) || !/setDataSyncWorkoutHooks\(\{[\s\S]*getBadges[\s\S]*badgeDesc[\s\S]*badgeName[\s\S]*earnBadges[\s\S]*esc[\s\S]*hasBadge/.test(workoutSource)){
  problems.push('data-sync/workout hook boundary is missing or incomplete');
}

if(/from ['"]\.\/90-events\.js['"]/.test(dataSyncSource)){
  problems.push('src/app/10-data-sync.js must not import 90-events.js; inject event-facing hooks instead');
}
if(!/setDataSyncEventHooks/.test(dataSyncSource) || !/setDataSyncEventHooks\(\{[\s\S]*getNotificationPrefsKey[\s\S]*getNotificationPrefDefaults[\s\S]*applyAudioFromUser[\s\S]*getNotificationPrefs[\s\S]*syncNotificationSettings[\s\S]*syncSettingsForm/.test(eventsCoreSource)){
  problems.push('data-sync/events hook boundary is missing or incomplete');
}


if(/from ['"]\.\/20-account\.js['"]/.test(dataSyncSource)){
  problems.push('src/app/10-data-sync.js must not import 20-account.js; inject account-facing hooks instead');
}
if(!/setDataSyncAccountHooks/.test(dataSyncSource) || !/setDataSyncAccountHooks\(\{[\s\S]*getProfileKeys[\s\S]*getAccount[\s\S]*bumpAccountMeta[\s\S]*isPremium[\s\S]*openUserEdit[\s\S]*readAccountBucket[\s\S]*renderPlan[\s\S]*saveAccount[\s\S]*writeAccountBucket/.test(accountSource)){
  problems.push('data-sync/account hook boundary is missing or incomplete');
}

if(/from ['"]\.\/40-programs-ai\.js['"]/.test(dataSyncSource)){
  problems.push('src/app/10-data-sync.js must not import 40-programs-ai.js; inject programs-ai-facing hooks instead');
}
if(!/setDataSyncProgramsAiHooks/.test(dataSyncSource) || !/setDataSyncProgramsAiHooks\(\{[\s\S]*apiFetch[\s\S]*applyProgressionAll[\s\S]*getClients[\s\S]*loadTrainer[\s\S]*openDayProgram[\s\S]*renderGreeting[\s\S]*setClientsShared[\s\S]*setTrainerShared[\s\S]*getTrainer[\s\S]*weekPlanInfo/.test(programsAiSource)){
  problems.push('data-sync/programs-ai hook boundary is missing or incomplete');
}

if(/from ['"]\.\/20-account\.js['"]/.test(coreSource)){
  problems.push('src/app/00-core.js must not import 20-account.js; inject account-facing hooks instead');
}
if(!/setCoreAccountHooks/.test(coreSource) || !/setCoreAccountHooks\(\{[\s\S]*userDirty[\s\S]*maybeRunDeferredBiometricLock/.test(accountSource)){
  problems.push('core/account hook boundary is missing or incomplete');
}

if(/from ['"]\.\/30-progress-media\.js['"]/.test(coreSource)){
  problems.push('src/app/00-core.js must not import 30-progress-media.js; inject progress-facing hooks instead');
}
if(!/setCoreProgressHooks/.test(coreSource) || !/setCoreProgressHooks\(\{[\s\S]*renderPhotos/.test(progressSource)){
  problems.push('core/progress hook boundary is missing or incomplete');
}

if(/from ['"]\.\/40-programs-ai\.js['"]/.test(coreSource)){
  problems.push('src/app/00-core.js must not import 40-programs-ai.js; inject programs-ai-facing hooks instead');
}
if(!/setCoreProgramsAiHooks/.test(coreSource) || !/setCoreProgramsAiHooks\(\{[\s\S]*getActiveAiDirty[\s\S]*applyProgressionAll[\s\S]*duplicateProgram[\s\S]*exportProgram[\s\S]*exportProgramFile[\s\S]*renderGreeting[\s\S]*renderToday[\s\S]*trainerOn/.test(programsAiSource)){
  problems.push('core/programs-ai hook boundary is missing or incomplete');
}


if(/from ['"]\.\/50-trainer-catalog\.js['"]/.test(coreSource)){
  problems.push('src/app/00-core.js must not import 50-trainer-catalog.js; inject trainer-catalog-facing hooks instead');
}
if(!/setCoreTrainerCatalogHooks/.test(coreSource) || !/setCoreTrainerCatalogHooks\(\{[\s\S]*openPublish[\s\S]*pickClientFor[\s\S]*refreshClientsScreen[\s\S]*renderMine[\s\S]*renderTrainerCard[\s\S]*storeCountText/.test(trainerCatalogSource)){
  problems.push('core/trainer-catalog hook boundary is missing or incomplete');
}

if(/from ['"]\.\/60-builder\.js['"]/.test(coreSource)){
  problems.push('src/app/00-core.js must not import 60-builder.js; inject builder-facing hooks instead');
}
if(!/setCoreBuilderHooks/.test(coreSource) || !/setCoreBuilderHooks\(\{[\s\S]*dropFreshEx[\s\S]*exDirty[\s\S]*exRestAfter[\s\S]*fmtKg[\s\S]*getExProgValue[\s\S]*getExWeight[\s\S]*hasWeight[\s\S]*normValue[\s\S]*openBuilder[\s\S]*parseKg[\s\S]*parseValue[\s\S]*progAtCeiling[\s\S]*progAxis[\s\S]*progBaseValue[\s\S]*progStepSize[\s\S]*programDirty[\s\S]*progressedRepsRange[\s\S]*setExDraftShared[\s\S]*setExIdxShared[\s\S]*setExOrigShared[\s\S]*setExWeight[\s\S]*weightPending/.test(builderSource)){
  problems.push('core/builder hook boundary is missing or incomplete');
}

if(/from ['"]\.\/70-workout\.js['"]/.test(coreSource)){
  problems.push('src/app/00-core.js must not import 70-workout.js; inject workout-facing hooks instead');
}
if(!/setCoreWorkoutHooks/.test(coreSource) || !/setCoreWorkoutHooks\(\{[\s\S]*esc[\s\S]*exitWorkout[\s\S]*setExFromWorkShared[\s\S]*settleQuickFinish[\s\S]*stopFinishFx[\s\S]*tnum/.test(workoutSource)){
  problems.push('core/workout hook boundary is missing or incomplete');
}

if(/from ['"]\.\/80-platform\.js['"]/.test(coreSource)){
  problems.push('src/app/00-core.js must not import 80-platform.js; inject platform-facing hooks instead');
}
if(!/setCorePlatformHooks/.test(coreSource) || !/setCorePlatformHooks\(\{[\s\S]*hasSpeechRecognition[\s\S]*getHfMode[\s\S]*hfHintText[\s\S]*syncPrefs/.test(platformCoreSource)){
  problems.push('core/platform hook boundary is missing or incomplete');
}

if(/from ['"]\.\/90-events\.js['"]/.test(coreSource)){
  problems.push('src/app/00-core.js must not import 90-events.js; inject event-facing hooks instead');
}
if(!/setCoreEventHooks/.test(coreSource) || !/setCoreEventHooks\(\{[\s\S]*applyAudioFromUser[\s\S]*fillLiveSoundCascade[\s\S]*getMoreTab[\s\S]*switchMoreTab[\s\S]*syncSettingsForm/.test(eventsCoreSource)){
  problems.push('core/events hook boundary is missing or incomplete');
}

const platformSource = fs.readFileSync(path.join(APP, '80-platform.js'), 'utf8');
const eventsSource = fs.readFileSync(path.join(APP, '90-events.js'), 'utf8');
if(/from ['"]\.\/90-events\.js['"]/.test(platformSource)){
  problems.push('src/app/80-platform.js must not import 90-events.js; inject event-facing hooks instead');
}
if(!/setPlatformEventHooks/.test(platformSource) || !/setPlatformEventHooks\(\{[\s\S]*getNotificationPrefs[\s\S]*refreshVoicePackUI/.test(eventsSource)){
  problems.push('platform/event hook boundary is missing or incomplete');
}

// 4. the entry imports one init per part and runs them once, in part order
const entry = fs.readFileSync(path.join(APP, 'index.js'), 'utf8');
const inits = [...entry.matchAll(/^import \{ (init[A-Z]\w*) \} from '\.\/([\w-]+\.js)';$/gm)].map(m => [m[2], m[1]]);
const calls = [...entry.matchAll(/^(init[A-Z]\w*)\(\);$/gm)].map(m => m[1]);
if(JSON.stringify(inits.map(i => i[0])) !== JSON.stringify(parts)) problems.push(`src/app/index.js must import the init function of every part in part order (found ${inits.map(i => i[0]).join(', ')})`);
if(JSON.stringify(calls) !== JSON.stringify(inits.map(i => i[1]))) problems.push(`src/app/index.js must call ${inits.map(i => i[1]).join(', ')} once, in that order`);

console.log((problems.length ? ' ПЛОХО' : '  ok  ') + '  product runtime modules: declaration-only top level, no load-time cycles, no missing imports'
  + (problems.length ? '\n    ' + problems.join('\n    ') : ` (${parts.length} parts, ${exportedBy.size} exports, ${inits.length} init functions)`));
process.exit(problems.length ? 1 : 0);
