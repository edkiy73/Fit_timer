// Service keys pasted in the admin: write-only, env wins, only known names.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.ALLOW_MEMORY_STORE = '1';
delete process.env.GEMINI_API_KEY;
delete process.env.YOOKASSA_SHOP_ID;
const require = createRequire(import.meta.url);
const { handleAdminAISettings } = require('../server/admin/ai-settings');
const { providerStatus, getSettings } = require('../server/ai');
const { secret } = require('../server/secrets');

const call = async (action, body = {}) => {
  const res = {statusCode:0, body:'', setHeader(){}, end(value){ this.body = String(value || ''); }};
  assert.equal(await handleAdminAISettings(action, body, res), true);
  return {status:res.statusCode, raw:res.body, json:JSON.parse(res.body)};
};

let status = await call('secrets_status');
assert.equal(status.json.secrets.GEMINI_API_KEY.set, false);

const value = 'AIzaSy-secret-value-9876';
const saved = await call('secret_set', {name:'GEMINI_API_KEY', value});
assert.equal(saved.status, 200);
assert.ok(!saved.raw.includes(value), 'the key never comes back');
assert.deepEqual(saved.json.secrets.GEMINI_API_KEY, {set:true, source:'admin', last4:'9876'});

await getSettings();
assert.equal(providerStatus().gemini, true, 'AI sees the admin key');
assert.equal(secret('GEMINI_API_KEY'), value);

process.env.GEMINI_API_KEY = 'env-key-000011112222';
status = await call('secrets_status');
assert.equal(status.json.secrets.GEMINI_API_KEY.source, 'env', 'hosting env wins');
assert.equal(secret('GEMINI_API_KEY'), 'env-key-000011112222');
delete process.env.GEMINI_API_KEY;

const unknown = await call('secret_set', {name:'HOME', value:'x'});
assert.equal(unknown.status, 400);
assert.equal(unknown.json.error, 'unknown_secret');

await call('secret_set', {name:'GEMINI_API_KEY', value:''});
status = await call('secrets_status');
assert.equal(status.json.secrets.GEMINI_API_KEY.set, false, 'an empty value removes the key');
console.log('secrets ok');
