// The scoped test sign-in key (TEST_LOGIN_KEY + TEST_LOGIN_DOMAIN): two actions, one domain, nothing else.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.ALLOW_MEMORY_STORE = '1';
process.env.ADMIN_KEY = 'admin-key-for-test-login';
const require = createRequire(import.meta.url);
const adminHandler = require('../template/api/admin');

const SCOPED = 'scoped-test-login-key-0123456789';
let n = 0;
async function call(key, body){
  const res = {statusCode:0, headers:{}, body:'', setHeader(k, v){ this.headers[k] = v; }, end(b){ this.body = b || ''; }};
  const req = {method:'POST', headers:{'x-forwarded-for':'10.20.0.' + (++n % 250 + 1), 'x-admin-key':encodeURIComponent(key)}, body};
  await adminHandler(req, res);
  let json = {}; try{ json = JSON.parse(res.body || '{}'); }catch(_){}
  return {status:res.statusCode, json};
}
const world = {action:'user_test_code', email:'world-mira@feture.test'};

// Off by default: the key alone (or the domain alone) opens nothing.
process.env.TEST_LOGIN_KEY = SCOPED;
assert.equal((await call(SCOPED, world)).status, 403, 'key without a domain');
delete process.env.TEST_LOGIN_KEY;
process.env.TEST_LOGIN_DOMAIN = 'feture.test';
assert.equal((await call(SCOPED, world)).status, 403, 'domain without a key');

process.env.TEST_LOGIN_KEY = SCOPED;
let r = await call(SCOPED, {action:'user_create', email:'world-mira@feture.test'});
assert.equal(r.status, 200, 'user_create for the test domain');
r = await call(SCOPED, world);
assert.equal(r.status, 200, 'user_test_code for the test domain');
assert.match(String(r.json.code), /^\d{6}$/);

// Only the test domain, exactly.
for(const email of ['someone@example.com', 'a@feture.test.evil.com', 'a@evilfeture.test', 'a@b@feture.test', '@feture.test', ''])
  assert.equal((await call(SCOPED, {action:'user_test_code', email})).status, 403, 'email ' + email);
// Only the two actions.
for(const action of ['users_list', 'products_list', 'user_premium', 'user_owned', 'user_ai_reset', 'analytics_stats', 'feture.documents.list'])
  assert.equal((await call(SCOPED, {action, email:'world-mira@feture.test'})).status, 403, 'action ' + action);

// A short key is never accepted, even when set.
process.env.TEST_LOGIN_KEY = 'short-key';
assert.equal((await call('short-key', world)).status, 403, 'short key');
process.env.TEST_LOGIN_KEY = SCOPED;
assert.equal((await call('wrong-key-wrong-key-wrong-key', world)).status, 403, 'wrong key');

// The real admin key is unchanged: any action, any address.
assert.equal((await call(process.env.ADMIN_KEY, {action:'products_list'})).status, 200);
assert.equal((await call(process.env.ADMIN_KEY, {action:'user_create', email:'real@example.com'})).status, 200);
assert.equal((await call(process.env.ADMIN_KEY, {action:'user_test_code', email:'real@example.com'})).status, 200);

console.log('Admin test sign-in scope OK');
