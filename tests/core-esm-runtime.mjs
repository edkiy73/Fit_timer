/* Behavioral regression for the real compiled ESM Core. */
let bad = 0;
const ok = (name, cond) => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name);
};

const {createAccount, createProfileDraft} = await import('../dist/esm/core/identity.js');
const {createRegistry} = await import('../dist/esm/core/sync.js');
const {createClient} = await import('../dist/esm/core/observability.js');
const {createPreferenceStore, limitCandidates} = await import('../dist/esm/core/notifications.js');

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

console.log(bad ? `\nESM Core failures: ${bad}` : '\nESM Core behavior is clean');
process.exit(bad ? 1 : 0);
