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
ok('runtime config carries feature flags',
  runtime.features && Object.keys(product.features).every(k => runtime.features[k] === product.features[k]));
ok('root runtime keeps API relative for local/web fallback', runtime.apiBase === '' && runtime.publicAppUrl === '');

ok('TypeScript typecheck script exists', typeof pkg.scripts.typecheck === 'string' && /tsc/.test(pkg.scripts.typecheck));
ok('TypeScript strict mode enabled', tsconfig.compilerOptions.strict === true);
ok('TypeScript is noEmit during foundation', tsconfig.compilerOptions.noEmit === true);

const coreSources = [
  fs.readFileSync('src/types/core.ts', 'utf8'),
  ...fs.readdirSync('src/core').filter(name => name.endsWith('.ts'))
    .map(name => fs.readFileSync('src/core/' + name, 'utf8'))
].join('\n');
const forbidden = ['Workout', 'Exercise', 'Trainer', 'Muscle', 'Warmup', 'Gender', 'Age', 'PrepSec'];
ok('Core sources contain no fitness entities', !forbidden.some(word => coreSources.includes(word)),
  forbidden.filter(word => coreSources.includes(word)).join(', ') || 'clean');
ok('typed Core build/check scripts exist',
  typeof pkg.scripts['build:core'] === 'string' && typeof pkg.scripts['check:core'] === 'string');

const fitnessTypes = fs.readFileSync('src/types/fitness.ts', 'utf8');
ok('FitTimer profile extension is outside Core contracts',
  /FitTimerProfileExtension/.test(fitnessTypes) && /gender/.test(fitnessTypes) && /age/.test(fitnessTypes));

const syncContext = {AppBaseSync: undefined};
vm.createContext(syncContext);
vm.runInContext(fs.readFileSync('src/core/sync.runtime.js', 'utf8'), syncContext);
const demoRegistry = syncContext.AppBaseSync.createRegistry([
  {scope:'profile', prefix:'note:', allowDeleted:true},
  {scope:'account', key:'prefs', free:true}
]);
ok('generic sync registry accepts a non-fitness document type',
  demoRegistry.accepts('profile', 'note:123') && demoRegistry.allowsDeleted('profile', 'note:123'));
ok('generic sync registry handles account/free policy without product names',
  demoRegistry.accepts('account', 'prefs') && demoRegistry.isFree('account', 'prefs')
  && !demoRegistry.accepts('profile', 'prefs'));

const { createSyncRegistry } = require('./../lib/sync-registry');
const serverDemoRegistry = createSyncRegistry([{scope:'profile', prefix:'note:'}]);
ok('server sync registry is product-neutral',
  serverDemoRegistry.accepts('profile', 'note:abc') && !serverDemoRegistry.accepts('profile', 'program:abc'));

const obsContext = {AppBaseObservability: undefined};
vm.createContext(obsContext);
vm.runInContext(fs.readFileSync('src/core/observability.runtime.js', 'utf8'), obsContext);
let sent = [];
const obs = obsContext.AppBaseObservability.createClient({
  post: async body => { sent.push(body); return true; },
  deviceId: async () => 'device-demo',
  context: () => ({platform:'web', locale:'en', build:'demo', premium:false})
});
ok('generic observability tracks arbitrary non-fitness event',
  typeof obs.track === 'function' && typeof obs.capture === 'function');
const diagPayload = obs.diagnosticPayload('error', new Error('boom'), 'fallback');
ok('generic diagnostic payload contains no FitTimer semantics',
  diagPayload.action === 'client_error' && diagPayload.platform === 'web' && diagPayload.locale === 'en');

const {createAnalyticsEngine} = require('../lib/analytics-core');
const analyticsCoreSource = fs.readFileSync('lib/analytics-core.js','utf8');
ok('server analytics engine contains no workout taxonomy',
  !/workout_|program_added|ai_used/.test(analyticsCoreSource));
ok('FitTimer analytics taxonomy lives outside generic engine',
  /workout_completed/.test(fs.readFileSync('lib/fit-analytics-schema.js','utf8')));

const notifContext = {AppBaseNotifications: undefined, Date, Set, Map, JSON};
vm.createContext(notifContext);
vm.runInContext(fs.readFileSync('src/core/notifications.runtime.js','utf8'), notifContext);
const memory = new Map();
const prefStore = notifContext.AppBaseNotifications.createPreferenceStore({
  key:'prefs',
  defaults:{alerts:true,offers:false},
  storage:{
    getItem:key=>memory.has(key)?memory.get(key):null,
    setItem:(key,value)=>memory.set(key,value)
  }
});
ok('generic notification preferences preserve defaults',
  prefStore.get().alerts === true && prefStore.get().offers === false);
prefStore.set({alerts:false});
ok('generic notification preferences merge persisted values with defaults',
  prefStore.get().alerts === false && prefStore.get().offers === false);
const demoNotifications = notifContext.AppBaseNotifications.limitCandidates([
  {at:'2026-01-05T09:00:00',priority:1},
  {at:'2026-01-05T10:00:00',priority:2},
  {at:'2026-01-05T11:00:00',priority:3}
],{
  maxTotal:10,passiveDailyLimit:2,engagementWeeklyLimit:3,
  dayKey:d=>d.toISOString().slice(0,10)
});
ok('generic notification budget limits passive daily delivery', demoNotifications.length === 2);

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
