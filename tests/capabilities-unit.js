/* AppBase capability switches (config/product.json → features).
 * Checks the generic server helper, the Core-owned server gates and the mobile composition gates.
 */
const fs = require('fs');
const path = require('path');

let bad = 0;
const ok = (name, cond, extra='') => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra ? ' → ' + extra : ''));
};

const capsModule = require('../lib/capabilities-core');
const { CAPABILITY_NAMES, createCapabilities, capabilities } = capsModule;
const product = JSON.parse(fs.readFileSync('config/product.json','utf8'));

ok('product config declares every known capability as boolean',
  CAPABILITY_NAMES.every(name => typeof product.features[name] === 'boolean'));
ok('client and server capability lists match',
  CAPABILITY_NAMES.every(name => fs.readFileSync('src/core/capabilities.ts','utf8').includes(`'${name}'`))
  && fs.readFileSync('src/types/core.ts','utf8').includes('voice: boolean'));
ok('FitTimer keeps every capability on',
  CAPABILITY_NAMES.every(name => capabilities().enabled(name)));

const partial = createCapabilities({ai:true, sharing:'yes', unknown:true});
ok('missing, non-boolean and unknown switches are off',
  partial.enabled('ai') && !partial.enabled('sharing') && !partial.enabled('notifications')
  && !('unknown' in partial.flags()));
ok('capability helper tolerates missing config',
  CAPABILITY_NAMES.every(name => !createCapabilities(undefined).enabled(name)));

const capSource = fs.readFileSync('lib/capabilities-core.js','utf8');
ok('server capability helper is product-neutral',
  !/workout|exercise|trainer|fittimer|program/i.test(capSource));

function fakeRes(){
  return {
    statusCode:0, headers:{}, body:'',
    setHeader(k,v){ this.headers[k]=v; },
    end(b){ this.body = b || ''; }
  };
}

async function withCapabilities(flags, fn){
  const original = capsModule.capabilities;
  capsModule.capabilities = () => createCapabilities(flags);
  const target = path.resolve('lib/ai-endpoint.js');
  delete require.cache[target];
  try{ return await fn(require(target)); }
  finally{
    capsModule.capabilities = original;
    delete require.cache[target];
  }
}

(async () => {
  const off = Object.fromEntries(CAPABILITY_NAMES.map(name => [name, name !== 'ai']));
  await withCapabilities(off, async ({createAIHandler}) => {
    const handleAI = createAIHandler(require('../lib/fit-ai-actions').registry);
    const res = fakeRes();
    await handleAI({method:'POST', headers:{}, body:{}}, res);
    ok('AI endpoint refuses requests when the ai capability is off',
      res.statusCode === 404 && JSON.parse(res.body).error === 'capability_disabled');
  });

  const authSource = fs.readFileSync('api/auth.js','utf8');
  ok('push device registration is gated by the notifications capability',
    /capabilities\(\)\.enabled\('notifications'\)/.test(authSource)
    && /body\.enabled === false/.test(authSource));

  const mobile = fs.readFileSync('mobile.js','utf8');
  ok('mobile composition wires native integrations through capabilities',
    /from ['"]\.\/esm\/core\/capabilities\.js['"]/.test(mobile)
    && /when\('voice', plugins\.FitAudio/.test(mobile)
    && /when\('biometrics', plugins\.FitBiometric/.test(mobile)
    && /when\('notifications', plugins\.PushNotifications/.test(mobile)
    && /when\('notifications', plugins\.LocalNotifications/.test(mobile)
    && /when\('sharing', plugins\.Share/.test(mobile)
    && !/[^.]plugins\.LocalNotifications\b(?![^\n]*when\()/.test(mobile.replace(/when\('notifications', plugins\.LocalNotifications[^\n]*/g, '')));

  console.log(bad ? `\nCapability failures: ${bad}` : '\nCapability checks passed');
  process.exit(bad ? 1 : 0);
})();
