// AI endpoint accepts the React auth client's field name (`syncToken`) as well as `token`.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

process.env.ALLOW_MEMORY_STORE = '1';
const require = createRequire(import.meta.url);
require('../template/lib/product');
const { store } = require('../server/store');
const { createAIHandler } = require('../server/ai-endpoint');

const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const email = 'ai-auth@example.com';
const hash = sha(email).slice(0, 32);
await store.set('a:' + hash, JSON.stringify({syncDevices:{dev1:{h:sha('secret-token')}}}));

const handler = createAIHandler({get:() => null});
async function call(body){
  const res = {statusCode:0, headers:{}, body:'', setHeader(k, v){ this.headers[k] = v; }, end(b){ this.body = b || ''; }};
  await handler({method:'POST', headers:{'x-forwarded-for':'10.7.0.1'}, query:{}, body}, res);
  return res;
}

const base = {email, deviceId:'dev1', kind:'test', prompt:'x'};
const viaSyncToken = await call({...base, syncToken:'secret-token'});
const viaToken = await call({...base, token:'secret-token'});
const wrong = await call({...base, syncToken:'nope'});
const missing = await call(base);
// Past authentication a non-premium account without a product policy is asked for Premium.
if(viaSyncToken.statusCode !== 404){ // 404 = AI capability off in this environment; nothing to assert then
  assert.equal(viaSyncToken.statusCode, 402, viaSyncToken.body);
  assert.equal(viaToken.statusCode, 402, viaToken.body);
  assert.equal(wrong.statusCode, 403, wrong.body);
  assert.equal(missing.statusCode, 401, missing.body);
}
console.log('AI endpoint auth OK' + (viaSyncToken.statusCode === 404 ? ' (AI capability off, skipped)' : ''));
