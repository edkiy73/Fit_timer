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
const runtime = context.window.FIT_TIMER_CONFIG || {};
ok('runtime config carries app id', runtime.appId === product.id, runtime.appId);
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

const documentsContext = {AppBaseDocuments: undefined};
vm.createContext(documentsContext);
vm.runInContext(fs.readFileSync('src/core/documents.runtime.js', 'utf8'), documentsContext);
const registry = documentsContext.AppBaseDocuments.createRegistry([
  {id:'demo.note', scope:'profile', exact:'note'},
  {id:'demo.item', scope:'profile', prefix:'item:'},
  {id:'account.prefs', scope:'account', exact:'prefs'}
]);
ok('generic document registry supports non-fitness profile docs',
  registry.accepts('profile', 'note') && registry.accepts('profile', 'item:123'));
ok('document registry keeps scopes separate',
  !registry.accepts('account', 'note') && registry.accepts('account', 'prefs'));
ok('document registry can enumerate exact keys',
  registry.exactKeys('profile').join(',') === 'note');

console.log(bad ? `\nFailed: ${bad}` : '\nAppBase foundation checks passed');
process.exit(bad ? 1 : 0);
