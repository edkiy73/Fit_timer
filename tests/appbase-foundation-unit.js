const fs = require('fs');
const vm = require('vm');
let bad = 0;
const ok = (name, cond, extra) => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' FAIL ') + ' ' + name + (extra != null ? ' → ' + extra : ''));
};

const product = JSON.parse(fs.readFileSync('config/product.json', 'utf8'));
const capacitor = JSON.parse(fs.readFileSync('capacitor.config.json', 'utf8'));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const tsconfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));

ok('product id matches Capacitor', product.id === capacitor.appId, capacitor.appId);
ok('product name matches Capacitor', product.name === capacitor.appName, capacitor.appName);
ok('brand background matches Capacitor', product.brand.background === capacitor.backgroundColor, capacitor.backgroundColor);
ok('notification accent matches Capacitor',
  product.brand.notificationAccent === capacitor.plugins.LocalNotifications.iconColor,
  capacitor.plugins.LocalNotifications.iconColor);

const context = {window:{}};
vm.runInNewContext(fs.readFileSync('app.config.js', 'utf8'), context);
const runtime = context.window.APP_CONFIG || {};
ok('generic runtime config carries app id', runtime.appId === product.id, runtime.appId);
ok('FitTimer runtime config alias points to generic config', context.window.FIT_TIMER_CONFIG === context.window.APP_CONFIG);
const configConsumerSources = [
  'src/app/40-programs-ai.js',
  'src/app/80-platform.js',
  'mobile.js'
].map(path => fs.readFileSync(path, 'utf8')).join('\n');
ok('runtime consumers use canonical APP_CONFIG',
  configConsumerSources.includes('window.APP_CONFIG')
  && !configConsumerSources.includes('window.FIT_TIMER_CONFIG'));
ok('runtime config carries feature flags',
  runtime.features && Object.keys(product.features).every(k => runtime.features[k] === product.features[k]));
ok('root runtime keeps API relative for local/web fallback', runtime.apiBase === '' && runtime.publicAppUrl === '');

const runtimeCompatSource = fs.readFileSync('src/app/05-runtime-compat.js', 'utf8');
const dataSyncSource = fs.readFileSync('src/app/10-data-sync.js', 'utf8');
const sourceBuild = fs.readFileSync('scripts/build-sources.mjs', 'utf8');
ok('legacy storage global is isolated to compatibility boundary',
  /window\.storage/.test(runtimeCompatSource) && !/window\.storage/.test(dataSyncSource));
ok('storage compatibility adapter validates the external KV contract',
  ['get','set','delete'].every(name => runtimeCompatSource.includes(`candidate.${name}`)));
ok('Capacitor platform global is isolated to compatibility boundary',
  runtimeCompatSource.includes('window.Capacitor')
  && !fs.readFileSync('src/app/10-data-sync.js','utf8').includes('window.Capacitor')
  && runtimeCompatSource.includes('candidate.getPlatform'));
const buildMetadataSources = [
  'src/app/10-data-sync.js',
  'src/app/20-account.js'
].map(path => fs.readFileSync(path, 'utf8')).join('\n');
ok('runtime build metadata stays out of window globals',
  !buildMetadataSources.includes('window.FIT_TIMER_BUILD')
  && runtimeCompatSource.includes('setBuild(value)')
  && runtimeCompatSource.includes('build()'));
ok('runtime compatibility adapter loads before product data sync',
  sourceBuild.indexOf("'src/app/05-runtime-compat.js'") >= 0
  && sourceBuild.indexOf("'src/app/05-runtime-compat.js'") < sourceBuild.indexOf("'src/app/10-data-sync.js'"));
const genericNativeProductSources = [
  'src/app/00-core.js',
  'src/app/20-account.js',
  'src/app/30-progress-media.js',
  'src/app/40-programs-ai.js',
  'src/app/80-platform.js'
].map(path => fs.readFileSync(path, 'utf8')).join('\n');
const genericLegacyNativeCalls = [
  'window.FitNative.haptic',
  'window.FitNative.shareFile',
  'window.FitNative.setSystemTheme',
  'window.FitNative.openExternal',
  'window.FitNative.getAppInfo',
  'window.FitNative.biometricStatus',
  'window.FitNative.authenticateBiometric'
];
ok('generic legacy native calls are isolated to compatibility boundary',
  genericLegacyNativeCalls.every(token => !genericNativeProductSources.includes(token))
  && genericLegacyNativeCalls.every(token => runtimeCompatSource.includes(token.replace('window.FitNative.', 'candidate.'))));
const updaterNativeSource = fs.readFileSync('src/app/20-account.js','utf8');
const legacyUpdaterCalls = [
  'window.FitNative.installUpdate',
  'window.FitNative.cancelUpdate',
  'window.FitNative.getUpdateState',
  'window.FitNative.resumeUpdateInstall'
];
ok('legacy Android updater calls are isolated to compatibility boundary',
  legacyUpdaterCalls.every(token => !updaterNativeSource.includes(token))
  && ['candidate.installUpdate','candidate.cancelUpdate','candidate.getUpdateState','candidate.resumeUpdateInstall']
    .every(token => runtimeCompatSource.includes(token)));
const notificationProductSources = [
  'src/app/60-builder.js',
  'src/app/70-workout.js',
  'src/app/80-platform.js',
  'src/app/90-events.js'
].map(path => fs.readFileSync(path, 'utf8')).join('\n');
const legacyNotificationCalls = [
  'window.FitNative.requestNotifications',
  'window.FitNative.registerRemotePush',
  'window.FitNative.syncWorkoutNotifications'
];
ok('legacy native notification calls are isolated to compatibility boundary',
  legacyNotificationCalls.every(token => !notificationProductSources.includes(token))
  && ['candidate.requestNotifications','candidate.registerRemotePush','candidate.syncWorkoutNotifications']
    .every(token => runtimeCompatSource.includes(token)));
const workoutNativeSources = [
  'src/app/70-workout.js',
  'src/app/90-events.js'
].map(path => fs.readFileSync(path, 'utf8')).join('\n');
const legacyWorkoutCalls = [
  'window.FitNative.cancelRest',
  'window.FitNative.updateWorkoutState',
  'window.FitNative.clearWorkoutState',
  'window.FitNative.requestReview'
];
ok('legacy workout native calls are isolated to compatibility boundary',
  legacyWorkoutCalls.every(token => !workoutNativeSources.includes(token))
  && ['candidate.cancelRest','candidate.updateWorkoutState','candidate.clearWorkoutState','candidate.requestReview']
    .every(token => runtimeCompatSource.includes(token)));
const voiceNativeSources = [
  'src/app/70-workout.js',
  'src/app/80-platform.js',
  'src/app/90-events.js'
].map(path => fs.readFileSync(path, 'utf8')).join('\n');
const legacyVoiceCalls = [
  'window.FitNative.offlineVoice',
  'window.FitNative.getVoiceModelStatus',
  'window.FitNative.listTtsVoices',
  'window.FitNative.downloadVoiceModel',
  'window.FitNative.startVoiceRecognition',
  'window.FitNative.stopVoiceRecognition',
  'window.FitNative.stopSpeaking'
];
ok('legacy voice native calls are isolated to compatibility boundary',
  legacyVoiceCalls.every(token => !voiceNativeSources.includes(token))
  && ['candidate.offlineVoice','candidate.getVoiceModelStatus','candidate.listTtsVoices',
      'candidate.downloadVoiceModel','candidate.startVoiceRecognition',
      'candidate.stopVoiceRecognition','candidate.stopSpeaking']
    .every(token => runtimeCompatSource.includes(token)));
const lifecycleNativeSources = [
  'src/app/70-workout.js',
  'src/app/80-platform.js',
  'src/app/90-events.js'
].map(path => fs.readFileSync(path, 'utf8')).join('\n');
const legacyLifecycleCalls = [
  'window.FitNative.isNative',
  'window.FitNative.consumeProgramLink',
  'window.FitNative.consumeWorkoutResume'
];
ok('legacy native lifecycle calls are isolated to compatibility boundary',
  legacyLifecycleCalls.every(token => !lifecycleNativeSources.includes(token))
  && ['candidate.isNative','candidate.consumeProgramLink','candidate.consumeWorkoutResume']
    .every(token => runtimeCompatSource.includes(token)));
ok('pending workout session stays module-local',
  !fs.readFileSync('src/app/90-events.js','utf8').includes('window.__pendingSession')
  && !fs.readFileSync('tests/workout-resume.js','utf8').includes('window.__pendingSession'));
ok('native notification sync is not exposed as a product window callback',
  !fs.readFileSync('src/app/80-platform.js','utf8').includes('window.syncNativeNotifications')
  && !fs.readFileSync('mobile.js','utf8').includes('window.syncNativeNotifications')
  && fs.readFileSync('src/app/80-platform.js','utf8').includes("window.addEventListener('fitAppForeground'"));






ok('TypeScript typecheck script exists', typeof pkg.scripts.typecheck === 'string' && /tsc/.test(pkg.scripts.typecheck));
ok('TypeScript strict mode enabled', tsconfig.compilerOptions.strict === true);
ok('TypeScript is noEmit during foundation', tsconfig.compilerOptions.noEmit === true);

const identityModuleSource = fs.readFileSync('src/core/identity.ts', 'utf8');
const esmEntrySource = fs.readFileSync('src/main.ts', 'utf8');
ok('Identity Core uses ESM exports instead of a namespace global',
  /export function createAccount/.test(identityModuleSource)
  && /export function createProfileDraft/.test(identityModuleSource)
  && !/namespace AppBaseIdentity/.test(identityModuleSource));
ok('ESM entry owns an explicit Identity Core dependency',
  /from ['"]\.\/core\/identity\.js['"]/.test(esmEntrySource)
  && /createAccount/.test(esmEntrySource)
  && /createProfileDraft/.test(esmEntrySource));

const syncModuleSource = fs.readFileSync('src/core/sync.ts', 'utf8');
ok('Sync Core uses ESM exports instead of a namespace global',
  /export function createRegistry/.test(syncModuleSource)
  && !/namespace AppBaseSync/.test(syncModuleSource));
ok('ESM entry owns an explicit Sync Core dependency',
  /from ['"]\.\/core\/sync\.js['"]/.test(esmEntrySource)
  && /createRegistry/.test(esmEntrySource));

const storageModuleSource = fs.readFileSync('src/core/storage.ts', 'utf8');
ok('Storage Core uses ESM exports instead of a namespace global',
  /export function createStorage/.test(storageModuleSource)
  && /export function namespacedKey/.test(storageModuleSource)
  && !/namespace AppBaseStorage/.test(storageModuleSource));
ok('Storage Core keeps external and IndexedDB contracts intact',
  /externalStorage\?:/.test(storageModuleSource)
  && /indexedDB\.open/.test(storageModuleSource)
  && /localStorage\.getItem/.test(storageModuleSource)
  && /localStorage\.setItem/.test(storageModuleSource));
ok('ESM entry owns an explicit Storage Core dependency',
  /from ['"]\.\/core\/storage\.js['"]/.test(esmEntrySource)
  && /createStorage/.test(esmEntrySource)
  && /namespacedKey/.test(esmEntrySource));

const observabilityModuleSource = fs.readFileSync('src/core/observability.ts', 'utf8');
ok('Observability Core uses ESM exports instead of a namespace global',
  /export function createClient/.test(observabilityModuleSource)
  && !/namespace AppBaseObservability/.test(observabilityModuleSource));
ok('Observability Core keeps analytics and diagnostic contracts intact',
  /action: 'analytics'/.test(observabilityModuleSource)
  && /action: 'client_error'/.test(observabilityModuleSource)
  && /diagnosticPayload/.test(observabilityModuleSource));
ok('ESM entry owns an explicit Observability Core dependency',
  /from ['"]\.\/core\/observability\.js['"]/.test(esmEntrySource)
  && /createClient/.test(esmEntrySource));

const notificationsModuleSource = fs.readFileSync('src/core/notifications.ts', 'utf8');
ok('Notifications Core uses ESM exports instead of a namespace global',
  /export function createPreferenceStore/.test(notificationsModuleSource)
  && /export function limitCandidates/.test(notificationsModuleSource)
  && !/namespace AppBaseNotifications/.test(notificationsModuleSource));
ok('Notifications Core keeps preference and delivery-budget contracts intact',
  /PreferenceStoreOptions/.test(notificationsModuleSource)
  && /DeliveryBudgetOptions/.test(notificationsModuleSource)
  && /engagementWeeklyLimit/.test(notificationsModuleSource)
  && /passiveDailyLimit/.test(notificationsModuleSource));
ok('ESM entry owns an explicit Notifications Core dependency',
  /from ['"]\.\/core\/notifications\.js['"]/.test(esmEntrySource)
  && /createPreferenceStore/.test(esmEntrySource)
  && /limitCandidates/.test(esmEntrySource));

const uiModuleSource = fs.readFileSync('src/core/ui.ts', 'utf8');
ok('UI Core uses ESM exports instead of a namespace global',
  /export function setShown/.test(uiModuleSource)
  && /export function bindActions/.test(uiModuleSource)
  && !/namespace AppBaseUI/.test(uiModuleSource));
ok('UI Core keeps generic modal, busy-state and action contracts intact',
  /export function openModal/.test(uiModuleSource)
  && /export function closeModal/.test(uiModuleSource)
  && /export function setBusy/.test(uiModuleSource)
  && /data-act/.test(fs.readFileSync('src/app/80-platform.js','utf8')));
ok('ESM entry owns an explicit UI Core dependency',
  /from ['"]\.\/core\/ui\.js['"]/.test(esmEntrySource)
  && /setShown/.test(esmEntrySource)
  && /bindActions/.test(esmEntrySource));

const coreSources = [
  fs.readFileSync('src/types/core.ts', 'utf8'),
  ...fs.readdirSync('src/core').filter(name => name.endsWith('.ts'))
    .map(name => fs.readFileSync('src/core/' + name, 'utf8'))
].join('\n');
const forbidden = ['Workout', 'Exercise', 'Trainer', 'Muscle', 'Warmup', 'Gender', 'Age', 'PrepSec'];
ok('Core sources contain no fitness entities', !forbidden.some(word => coreSources.includes(word)),
  forbidden.filter(word => coreSources.includes(word)).join(', ') || 'clean');
ok('ESM Core build script exists',
  typeof pkg.scripts['build:esm'] === 'string' && /tsc/.test(pkg.scripts['build:esm']));

const fitnessTypes = fs.readFileSync('src/types/fitness.ts', 'utf8');
ok('FitTimer profile extension is outside Core contracts',
  /FitTimerProfileExtension/.test(fitnessTypes) && /gender/.test(fitnessTypes) && /age/.test(fitnessTypes));

const { createSyncRegistry } = require('./../lib/sync-registry');
const serverDemoRegistry = createSyncRegistry([{scope:'profile', prefix:'note:'}]);
ok('server sync registry is product-neutral',
  serverDemoRegistry.accepts('profile', 'note:abc') && !serverDemoRegistry.accepts('profile', 'program:abc'));

const {createAnalyticsEngine} = require('../lib/analytics-core');
const analyticsCoreSource = fs.readFileSync('lib/analytics-core.js','utf8');
ok('server analytics engine contains no workout taxonomy',
  !/workout_|program_added|ai_used/.test(analyticsCoreSource));
ok('FitTimer analytics taxonomy lives outside generic engine',
  /workout_completed/.test(fs.readFileSync('lib/fit-analytics-schema.js','utf8')));

const nativeNotificationSource = fs.readFileSync('src/core/native-notifications.ts','utf8');
ok('native notification Core is product-neutral',
  !/workout|exercise|trainer|fittimer|premium/i.test(nativeNotificationSource));
ok('native notification transport exposes generic local and push primitives',
  /localPermission/.test(nativeNotificationSource)
  && /replaceRange/.test(nativeNotificationSource)
  && /registerPush/.test(nativeNotificationSource));

const mobileCoreSource = fs.readFileSync('src/core/mobile.ts','utf8');
ok('mobile Core is product-neutral',
  !/workout|exercise|trainer|fittimer|program/i.test(mobileCoreSource));
ok('mobile Core exposes reusable lifecycle/url/share/theme/biometry primitives',
  /onLifecycle/.test(mobileCoreSource)
  && /onUrl/.test(mobileCoreSource)
  && /shareBlob/.test(mobileCoreSource)
  && /setTheme/.test(mobileCoreSource)
  && /biometricStatus/.test(mobileCoreSource));

ok('native notification Core uses ESM exports instead of a namespace global',
  /export function createTransport/.test(nativeNotificationSource)
  && !/namespace AppBaseNativeNotifications/.test(nativeNotificationSource));
ok('mobile Core uses ESM exports instead of a namespace global',
  /export function createBridge/.test(mobileCoreSource)
  && !/namespace AppBaseMobile/.test(mobileCoreSource));
ok('ESM entry owns explicit native/mobile Core dependencies',
  /from ['"]\.\/core\/native-notifications\.js['"]/.test(esmEntrySource)
  && /from ['"]\.\/core\/mobile\.js['"]/.test(esmEntrySource)
  && /createTransport/.test(esmEntrySource)
  && /createBridge/.test(esmEntrySource));

const productSyncModuleSource = fs.readFileSync('src/app/sync-schema.ts', 'utf8');
ok('product sync schema is a real ESM module',
  /from ['"]\.\.\/core\/sync\.js['"]/.test(productSyncModuleSource)
  && /export const FIT_SYNC_REGISTRY/.test(productSyncModuleSource));
ok('product sync schema keeps FitTimer policy outside Core',
  /program:/.test(productSyncModuleSource)
  && /notificationPrefs/.test(productSyncModuleSource));
ok('ESM entry composes product sync schema explicitly',
  /from ['"]\.\/app\/sync-schema\.js['"]/.test(esmEntrySource)
  && /productSyncSchema/.test(esmEntrySource));

const syncCompatSource = fs.readFileSync('src/app/11-sync-schema.js', 'utf8');
ok('legacy sync schema is generated from the canonical ESM module',
  /Generated from src\/app\/sync-schema\.ts/.test(syncCompatSource)
  && /__fitSyncSchemaCompat/.test(syncCompatSource));
ok('product compatibility build owns the legacy sync schema output',
  /src\/app\/sync-schema\.ts/.test(fs.readFileSync('scripts/build-product-compat.mjs','utf8'))
  && /src\/app\/11-sync-schema\.js/.test(fs.readFileSync('scripts/build-product-compat.mjs','utf8')));

const productInfrastructureSource = fs.readFileSync('src/app/infrastructure.ts', 'utf8');
ok('product infrastructure composes Core through explicit imports',
  /from ['"]\.\.\/core\/storage\.js['"]/.test(productInfrastructureSource)
  && /from ['"]\.\.\/core\/observability\.js['"]/.test(productInfrastructureSource)
  && /createProductInfrastructure/.test(productInfrastructureSource));
ok('product infrastructure owns FitTimer storage configuration outside Core',
  /dbName: 'fittimer'/.test(productInfrastructureSource)
  && /mirrorKeys: \['account'\]/.test(productInfrastructureSource));
ok('product infrastructure has no direct legacy Core globals',
  !/AppBaseStorage|AppBaseObservability/.test(productInfrastructureSource));
ok('ESM entry composes product infrastructure explicitly',
  /from ['"]\.\/app\/infrastructure\.js['"]/.test(esmEntrySource)
  && /productInfrastructure/.test(esmEntrySource));

const productIdentitySource = fs.readFileSync('src/app/identity.ts', 'utf8');
ok('product identity composes generic Identity Core through imports',
  /from ['"]\.\.\/core\/identity\.js['"]/.test(productIdentitySource)
  && /createFitTimerAccount/.test(productIdentitySource)
  && /createFitTimerProfile/.test(productIdentitySource));
ok('FitTimer profile extension stays in product layer',
  /gender/.test(productIdentitySource)
  && /age/.test(productIdentitySource)
  && !/gender|age/.test(fs.readFileSync('src/core/identity.ts','utf8')));
ok('product identity has no legacy AppBaseIdentity global',
  !/AppBaseIdentity/.test(productIdentitySource));
ok('ESM entry composes product identity explicitly',
  /from ['"]\.\/app\/identity\.js['"]/.test(esmEntrySource)
  && /productIdentity/.test(esmEntrySource));

const runtimeEnvironmentSource = fs.readFileSync('src/app/runtime-environment.ts', 'utf8');
ok('runtime environment isolates legacy window dependencies',
  /interface LegacyRuntimeWindow/.test(runtimeEnvironmentSource)
  && /externalStorage/.test(runtimeEnvironmentSource)
  && /runtimePlatform/.test(runtimeEnvironmentSource));
ok('runtime environment keeps legacy globals behind one product boundary',
  /window as LegacyRuntimeWindow/.test(runtimeEnvironmentSource)
  && !/window\.storage|window\.Capacitor/.test(productInfrastructureSource)
  && !/window\.storage|window\.Capacitor/.test(productIdentitySource));
ok('ESM entry composes runtime environment explicitly',
  /from ['"]\.\/app\/runtime-environment\.js['"]/.test(esmEntrySource)
  && /runtimeEnvironment/.test(esmEntrySource));

const productBootstrapSource = fs.readFileSync('src/app/bootstrap.ts', 'utf8');
ok('product bootstrap is the ESM composition root',
  /from ['"]\.\/infrastructure\.js['"]/.test(productBootstrapSource)
  && /from ['"]\.\/identity\.js['"]/.test(productBootstrapSource)
  && /from ['"]\.\/sync-schema\.js['"]/.test(productBootstrapSource)
  && /from ['"]\.\/runtime-environment\.js['"]/.test(productBootstrapSource));
ok('product bootstrap assembles infrastructure, identity and sync',
  /infrastructure/.test(productBootstrapSource)
  && /identity:/.test(productBootstrapSource)
  && /sync:/.test(productBootstrapSource));
ok('ESM entry exposes the product bootstrap explicitly',
  /from ['"]\.\/app\/bootstrap\.js['"]/.test(esmEntrySource)
  && /productBootstrap/.test(esmEntrySource));

const identityContext = {AppBaseIdentity: undefined, Date};
vm.createContext(identityContext);
vm.runInContext(fs.readFileSync('src/core/identity.runtime.js', 'utf8'), identityContext);
const accountDraft = identityContext.AppBaseIdentity.createAccount(new Date('2026-01-02T03:04:05.000Z'));
const profileDraft = identityContext.AppBaseIdentity.createProfileDraft('Demo');
ok('generic account defaults are domain-free',
  accountDraft.email === '' && accountDraft.handle === '' && accountDraft.deletedProfiles.length === 0);
ok('generic profile defaults are domain-free',
  profileDraft.name === 'Demo' && profileDraft.theme === 'system' && profileDraft.locale === 'system'
  && !('gender' in profileDraft) && !('age' in profileDraft));

console.log(bad ? `\nFailed: ${bad}` : '\nAppBase foundation checks passed');
process.exit(bad ? 1 : 0);
