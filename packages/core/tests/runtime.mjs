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

console.log(bad ? `\nESM Core failures: ${bad}` : '\nESM Core behavior is clean');
process.exit(bad ? 1 : 0);
