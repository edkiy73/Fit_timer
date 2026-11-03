// Fixed test sign-in code (TEST_LOGIN_STATIC_CODE + TEST_LOGIN_DOMAIN): test accounts only, off by default.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
process.env.ALLOW_MEMORY_STORE = '1';
const auth = require('../template/api/auth');
let n = 0;
async function call(body){
  const res = {statusCode:0, setHeader(){}, end(raw){ this.body = JSON.parse(raw); }};
  await auth({method:'POST', headers:{'x-forwarded-for':'10.30.0.' + (++n % 250 + 1)}, query:{}, body}, res);
  return res;
}
const verify = (email, code, deviceId = 'dev-1') => call({action:'verify', email, code, deviceId});

// Off by default: no code, no sign-in.
delete process.env.TEST_LOGIN_STATIC_CODE; delete process.env.TEST_LOGIN_DOMAIN;
assert.notEqual((await verify('world-mira@feture.test', '424242')).statusCode, 200, 'off by default');
process.env.TEST_LOGIN_STATIC_CODE = '424242';
assert.notEqual((await verify('world-mira@feture.test', '424242')).statusCode, 200, 'code without a domain');
delete process.env.TEST_LOGIN_STATIC_CODE; process.env.TEST_LOGIN_DOMAIN = 'feture.test';
assert.notEqual((await verify('world-mira@feture.test', '424242')).statusCode, 200, 'domain without a code');

process.env.TEST_LOGIN_STATIC_CODE = '424242';
let r = await verify('world-mira@feture.test', '424242');
assert.equal(r.statusCode, 200, 'static code signs in a test account');
assert.ok(r.body.syncToken, 'a session is issued');
r = await verify('world-mira@feture.test', '424242', 'dev-2');
assert.equal(r.statusCode, 200, 'the fixed code is reusable (other device too)');
assert.equal((await verify('world-mira@feture.test', '111111')).statusCode, 410, 'a wrong code does not sign in');
assert.equal((await verify('WORLD-LEV@Feture.Test', '42-42-42')).statusCode, 200, 'case and separators are normalised');

// Never outside the test domain, and never the staff test accounts.
for(const email of ['real@example.com', 'a@feture.test.evil.com', 'a@evilfeture.test', 'qa-staff@feture.test', 'qa-staff2@feture.test'])
  assert.notEqual((await verify(email, '424242')).statusCode, 200, 'blocked: ' + email);

// A malformed fixed code is ignored (it must be exactly six digits).
process.env.TEST_LOGIN_STATIC_CODE = '4242';
assert.notEqual((await verify('world-kira@feture.test', '4242')).statusCode, 200, 'short fixed code is ignored');
process.env.TEST_LOGIN_STATIC_CODE = '424242';

// The normal one-time email code still works for test addresses and for everyone else.
const sent = await call({action:'send', email:'world-timur@feture.test'});
assert.equal(sent.statusCode, 200);
assert.equal((await verify('world-timur@feture.test', sent.body.devCode)).statusCode, 200, 'normal code still works');
const sent2 = await call({action:'send', email:'person@example.com'});
assert.equal((await verify('person@example.com', sent2.body.devCode)).statusCode, 200, 'normal code for a real address');

console.log('Fixed test code OK');
