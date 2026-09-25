/* AppBase readiness audit: executable Phase 16 checklist. */
const fs = require('fs');
const path = require('path');

let bad = 0;
const ok = (name, cond, extra='') => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra ? ' → ' + extra : ''));
};

const read = p => fs.readFileSync(p, 'utf8');
const exists = p => fs.existsSync(p);
const walk = dir => {
  if(!exists(dir)) return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(ent => {
    const full = path.join(dir, ent.name);
    return ent.isDirectory() ? walk(full) : [full];
  });
};

const pkg = JSON.parse(read('package.json'));
const workflow = read('.github/workflows/source-consistency.yml');
const browserRunner = read('scripts/run-browser-tests.mjs');

ok('typed Core contracts and typecheck exist',
  exists('src/types/core.ts')
  && typeof pkg.scripts.typecheck === 'string'
  && typeof pkg.scripts['build:esm'] === 'string');

const capabilityCore = read('src/core/capabilities.ts');
ok('generic capability registry exists',
  /createCapabilities/.test(capabilityCore)
  && !/fitness|workout|exercise|trainer|catalog/i.test(capabilityCore));

const identityCore = read('src/core/identity.ts');
const productIdentity = read('src/app/identity.ts');
ok('Account/Profile Core is separated from FitTimer profile extension',
  /createAccount/.test(identityCore)
  && /createProfileDraft/.test(identityCore)
  && !/gender|age|workout|exercise|trainer|catalog/i.test(identityCore)
  && /gender/.test(productIdentity)
  && /age/.test(productIdentity));

const storageCore = read('src/core/storage.ts');
ok('generic Storage API exists',
  /export function createStorage/.test(storageCore)
  && /ExternalStorage/.test(storageCore)
  && !/workout|exercise|trainer|catalog|program:/i.test(storageCore));

const syncCore = read('src/core/sync.ts');
const productSync = read('src/app/sync-schema.ts');
ok('generic document sync registry exists',
  /export function createRegistry/.test(syncCore)
  && !/program:|trainer|notificationPrefs/.test(syncCore)
  && /program:/.test(productSync)
  && /notificationPrefs/.test(productSync));

const observabilityCore = read('src/core/observability.ts');
const analyticsCore = read('lib/analytics-core.js');
const fitAnalytics = read('lib/fit-analytics-schema.js');
ok('Analytics/Diagnostics remain generic',
  !/workout_|program_added|trainer|catalog/i.test(observabilityCore)
  && !/workout_|program_added|trainer|catalog/i.test(analyticsCore)
  && /workout_completed/.test(fitAnalytics));

const aiRegistry = read('lib/ai-action-registry.js');
const fitAiActions = read('lib/fit-ai-actions.js');
ok('AI Runtime/action registry does not own fitness semantics',
  !/program\.create|video\.parse|image\.exercise|workout|trainer|catalog/i.test(aiRegistry)
  && /program\.create/.test(fitAiActions)
  && /image\.exercise/.test(fitAiActions));

const notificationsCore = read('src/core/notifications.ts');
ok('notification Core owns no workout semantics',
  !/workout|exercise|trainer|catalog|program:/i.test(notificationsCore));

const mobileCore = read('src/core/mobile.ts');
ok('mobile Core owns no FitTimer links or workout semantics',
  !/workout|program:|trainer|catalog|fittimer/i.test(mobileCore));

const adminCoreFiles = walk('lib/admin/core').filter(f => f.endsWith('.js'));
const adminLeaks = [];
for(const file of adminCoreFiles){
  const source = read(file);
  if(/admin\/fittimer|fit[-_](?:catalog|trainer|program)|workout|exercise/i.test(source)){
    adminLeaks.push(file);
  }
}
ok('Core Admin is separated from FitTimer Admin',
  adminCoreFiles.length > 0 && adminLeaks.length === 0,
  adminLeaks.join(', '));

ok('Core → product dependency guard is enforced in CI',
  typeof pkg.scripts['test:boundaries'] === 'string'
  && workflow.includes('npm run test:boundaries')
  && exists('tests/dependency-boundaries-unit.js'));

const bootstrap = read('src/app/bootstrap.ts');
ok('product bootstrap composes capabilities + infrastructure + identity + sync',
  /capabilities/.test(bootstrap)
  && /infrastructure/.test(bootstrap)
  && /identity:/.test(bootstrap)
  && /sync:/.test(bootstrap));

ok('critical profile/auth/sync/backup browser regressions are part of CI',
  ['profile-switch','account-flow','sync-flow','backup-flow']
    .every(name => browserRunner.includes("'" + name + "'")));

ok('legacy browser Core runtime artifacts are retired',
  !exists('appbase-core.js')
  && !exists('scripts/build-core.mjs')
  && !walk('src/core').some(f => f.endsWith('.runtime.js')));

ok('production startup uses ESM entry',
  read('index.html').includes('<script type="module" src="esm/main.js"></script>')
  && !read('index.html').includes('<script src="appbase-core.js"></script>'));

console.log(bad ? `\nAppBase readiness failures: ${bad}` : '\nAppBase readiness audit passed');
process.exit(bad ? 1 : 0);
