/* Behavioral regression for the real compiled ESM Core. */
let bad = 0;
const ok = (name, cond) => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name);
};

const {createAccount, createProfileDraft} = await import('../dist/core/identity.js');
const {createRegistry} = await import('../dist/core/sync.js');
const {createClient} = await import('../dist/core/observability.js');
const {createPreferenceStore, limitCandidates} = await import('../dist/core/notifications.js');
const {createSpeech} = await import('../dist/core/speech.js');
const {createCapabilities, CAPABILITY_NAMES} = await import('../dist/core/capabilities.js');
const {themeCssVars} = await import('../dist/core/ui.js');
const {createAuthClient, normalizeEmail, validEmail} = await import('../dist/core/auth.js');
const {createAdminClient} = await import('../dist/core/admin.js');
const {createSyncClient} = await import('../dist/core/sync-client.js');

const accountDraft = createAccount(new Date('2026-01-02T03:04:05.000Z'));
const profileDraft = createProfileDraft('Demo');
ok('ESM identity account defaults are domain-free',
  accountDraft.email === '' && accountDraft.handle === '' && accountDraft.deletedProfiles.length === 0);
ok('ESM identity profile defaults are domain-free',
  profileDraft.name === 'Demo' && profileDraft.theme === 'system' && profileDraft.locale === 'system'
  && !('gender' in profileDraft) && !('age' in profileDraft));

const demoRegistry = createRegistry([
  {scope:'profile', prefix:'note:', allowDeleted:true},
  {scope:'account', key:'prefs', free:true}
]);
ok('ESM sync registry accepts a non-fitness document type',
  demoRegistry.accepts('profile', 'note:123')
  && demoRegistry.allowsDeleted('profile', 'note:123'));
ok('ESM sync registry handles account/free policy generically',
  demoRegistry.accepts('account', 'prefs')
  && demoRegistry.isFree('account', 'prefs')
  && !demoRegistry.accepts('profile', 'prefs'));

const obs = createClient({
  post: async () => true,
  deviceId: async () => 'device-demo',
  context: () => ({platform:'web', locale:'en', build:'demo', premium:false})
});
ok('ESM observability exposes generic track/capture',
  typeof obs.track === 'function' && typeof obs.capture === 'function');
const diagPayload = obs.diagnosticPayload('error', new Error('boom'), 'fallback');
ok('ESM diagnostic payload contains no FitTimer semantics',
  diagPayload.action === 'client_error'
  && diagPayload.platform === 'web'
  && diagPayload.locale === 'en');

const memory = new Map();
const prefStore = createPreferenceStore({
  key:'prefs',
  defaults:{alerts:true,offers:false},
  storage:{
    getItem:key => memory.has(key) ? memory.get(key) : null,
    setItem:(key,value) => memory.set(key,value)
  }
});
ok('ESM notification preferences preserve defaults',
  prefStore.get().alerts === true && prefStore.get().offers === false);
prefStore.set({alerts:false});
ok('ESM notification preferences merge persisted values',
  prefStore.get().alerts === false && prefStore.get().offers === false);
const demoNotifications = limitCandidates([
  {at:'2026-01-05T09:00:00',priority:1},
  {at:'2026-01-05T10:00:00',priority:2},
  {at:'2026-01-05T11:00:00',priority:3}
],{
  maxTotal:10,
  passiveDailyLimit:2,
  engagementWeeklyLimit:3,
  dayKey:d => d.toISOString().slice(0,10)
});
ok('ESM notification budget limits passive daily delivery',
  demoNotifications.length === 2);

const audioCalls = [];
const audioListeners = new Map();
let removedListeners = 0;
const fakeAudio = {
  requestMicrophone: async () => ({granted:true}),
  speak: async input => { audioCalls.push(['speak', input]); return {spoken:true}; },
  addListener: async (name, fn) => {
    audioListeners.set(name, fn);
    return {remove: async () => { removedListeners++; audioListeners.delete(name); }};
  },
  startRecognition: async input => { audioCalls.push(['start', input]); return {started:true}; },
  stopRecognition: async () => { audioCalls.push(['stop']); },
  prepareRecognitionModel: async input => { audioCalls.push(['prepare', input]); return {installed:false, sizeMb:40}; }
};
let beforeDownload = 0;
const speech = createSpeech({
  native:true,
  audio:fakeAudio,
  defaultLanguage:'en',
  defaultLocale:'en-US',
  beforeModelDownload: async () => { beforeDownload++; }
});
ok('ESM speech uses product-supplied default locale',
  await speech.speak('hello')
  && audioCalls[0][1].locale === 'en-US' && audioCalls[0][1].text === 'hello');
const heard = [];
const results = [];
ok('ESM speech starts recognition in product-supplied language',
  await speech.startRecognition({
    onResult: text => results.push(text),
    onHeard: event => heard.push(event)
  })
  && audioCalls.some(call => call[0] === 'start' && call[1].language === 'en'));
audioListeners.get('speechResult')({text:'next'});
audioListeners.get('speechHeard')({text:'mumble'});
ok('ESM speech routes results and raw heard events to handlers',
  results[0] === 'next' && heard[0].text === 'mumble');
await speech.stopRecognition();
ok('ESM speech removes recognition listeners on stop',
  removedListeners === 4 && audioListeners.size === 0);
const downloadStatuses = [];
ok('ESM speech queues model download after product hook',
  await speech.downloadModel('de', status => downloadStatuses.push(status))
  && beforeDownload === 1
  && downloadStatuses[0].status === 'queued' && downloadStatuses[0].language === 'de');
const webSpeech = createSpeech({native:false, audio:fakeAudio, defaultLanguage:'en', defaultLocale:'en-US'});
ok('ESM speech is unavailable outside native shell',
  !webSpeech.available() && !(await webSpeech.speak('x'))
  && (await webSpeech.modelStatus()).unavailable === true);

const caps = createCapabilities({voice:true, sharing:'yes'});
ok('ESM capabilities default missing/non-boolean switches to off',
  caps.enabled('voice') && !caps.enabled('sharing') && !caps.enabled('ai')
  && caps.when('voice', 'x') === 'x' && caps.when('ai', 'x') === null
  && CAPABILITY_NAMES.length === Object.keys(caps.flags()).length);

const themeVars = themeCssVars({background:'#000001', card:'#000002', surface:'#000003', accent:'#000004', accentInk:'#000005'});
ok('ESM UI maps product theme tokens to the shared CSS variable names',
  JSON.stringify(themeVars) === JSON.stringify({bg:'#000001', card:'#000002', surface:'#000003', accent:'#000004', 'accent-ink':'#000005'}));


const authMemory = new Map();
const authStorage = {
  getItem: async key => authMemory.has(key) ? authMemory.get(key) : null,
  setItem: async (key, value) => { authMemory.set(key, value); },
  removeItem: async key => { authMemory.delete(key); }
};
const authCalls = [];
const authFetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  authCalls.push(body);
  if(body.action === 'send') return {ok:true,status:200,json:async()=>({ok:true,sent:true})};
  if(body.action === 'verify') return {ok:true,status:200,json:async()=>({
    ok:true,email:body.email,syncToken:'sync-demo',handle:'@demo',locale:'en',
    fresh:true,sub:{until:'2099-01-01T00:00:00.000Z'}
  })};
  if(body.action === 'status') return {ok:true,status:200,json:async()=>({
    ok:true,premium:true,sub:{until:'2099-01-01T00:00:00.000Z'}
  })};
  if(body.action === 'set_locale') return {ok:true,status:200,json:async()=>({ok:true,locale:body.locale})};
  if(body.action === 'set_handle') return {ok:true,status:200,json:async()=>({ok:true,handle:body.handle})};
  if(body.action === 'forget') return {ok:true,status:200,json:async()=>({ok:true,account:true})};
  return {ok:false,status:400,json:async()=>({error:'unknown_action'})};
};
const auth = createAuthClient({
  endpoint:'/api/auth',
  storage:authStorage,
  fetch:authFetch,
  createDeviceId:()=>'device-demo'
});
ok('ESM auth normalizes and validates email without product assumptions',
  normalizeEmail('  Demo@Example.COM ') === 'demo@example.com'
  && validEmail('demo@example.com') && !validEmail('broken@'));
await auth.sendCode(' Demo@Example.COM ', 'en');
ok('ESM auth sendCode uses normalized address and locale',
  authCalls[0].action === 'send' && authCalls[0].email === 'demo@example.com' && authCalls[0].locale === 'en');
const verified = await auth.verifyCode({
  email:'Demo@Example.COM',
  code:'12 34 56',
  locale:'en',
  platform:'web',
  extra:{campaign:'demo'}
});
ok('ESM auth verify creates device once and persists generic session',
  verified.email === 'demo@example.com' && verified.deviceId === 'device-demo'
  && verified.syncToken === 'sync-demo' && verified.handle === '@demo' && verified.premium === true
  && authCalls[1].code === '123456' && authCalls[1].campaign === 'demo');
const restored = await auth.restoreSession();
ok('ESM auth restores persisted session',
  restored && restored.email === 'demo@example.com' && restored.deviceId === 'device-demo');
const detachedRestore = auth.restoreSession;
const validated = await detachedRestore(true);
ok('ESM auth validates restored session without method binding',
  validated && validated.premium === true && authCalls.some(call => call.action === 'status'));
await auth.setLocale('ru');
await auth.claimHandle({handle:'@next', extra:{source:'demo'}});
const changed = await auth.getSession();
ok('ESM auth updates locale and handle in persisted session',
  changed && changed.locale === 'ru' && changed.handle === '@next'
  && authCalls.some(call => call.action === 'set_handle' && call.source === 'demo'));
const fields = await auth.authFields();
ok('ESM auth exposes sync credentials without product fields',
  fields && fields.email === 'demo@example.com' && fields.deviceId === 'device-demo' && fields.syncToken === 'sync-demo');
await auth.logout();
ok('ESM auth logout clears session but preserves stable device identity',
  (await auth.getSession()) === null && (await auth.getOrCreateDeviceId()) === 'device-demo');
await auth.verifyCode({email:'demo@example.com', code:'123456'});
await auth.forget('all');
ok('ESM auth full forget removes local session after server success',
  (await auth.getSession()) === null && authCalls.some(call => call.action === 'forget' && call.scope === 'all'));


const adminCalls = [];
const admin = createAdminClient({
  endpoint:'/api/admin',
  healthEndpoint:'/api/health',
  fetch:async (url, init={}) => {
    adminCalls.push({url, init});
    if(url === '/api/health'){
      return {ok:false,status:503,json:async()=>({ok:false,status:'error',warnings:['storage']})};
    }
    return {ok:true,status:200,json:async()=>({ok:true,users:[]})};
  }
});
const degradedHealth = await admin.health();
ok('ESM admin client preserves degraded Health payloads returned with 503',
  degradedHealth.status === 'error' && degradedHealth.warnings[0] === 'storage');
const adminUsers = await admin.action('a key/with spaces', 'users_list');
ok('ESM admin client sends protected actions with encoded key',
  Array.isArray(adminUsers.users)
  && adminCalls[1].init.headers['X-Admin-Key'] === encodeURIComponent('a key/with spaces')
  && JSON.parse(adminCalls[1].init.body).action === 'users_list');


const syncCalls = [];
const syncClient = createSyncClient({
  auth:{authFields:async()=>({email:'demo@example.com',deviceId:'device-demo',syncToken:'sync-demo'})},
  fetch:async (_url, init) => {
    const body = JSON.parse(init.body);
    syncCalls.push(body);
    if(body.action === 'pull') return {ok:true,status:200,json:async()=>({ok:true,profiles:[],accountDocs:[{key:'settings',value:'{}'}]})};
    return {ok:true,status:200,json:async()=>({ok:true})};
  }
});
const pulled = await syncClient.pull();
await syncClient.push({docs:[{profileId:'__account__',key:'settings',value:'{}',rev:1}]});
ok('ESM sync client maps auth session to server wire fields and normalizes pull',
  pulled.profiles.length === 0 && pulled.accountDocs[0].key === 'settings'
  && syncCalls[0].email === 'demo@example.com' && syncCalls[0].deviceId === 'device-demo'
  && syncCalls[0].token === 'sync-demo' && syncCalls[1].action === 'push');

console.log(bad ? `\nESM Core failures: ${bad}` : '\nESM Core behavior is clean');
process.exit(bad ? 1 : 0);
