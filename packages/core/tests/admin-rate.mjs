// Admin brute-force guard: a wrong ADMIN_KEY costs an attempt, a right one does not.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.ALLOW_MEMORY_STORE = '1';
process.env.ADMIN_KEY = 'rate-admin';
const require = createRequire(import.meta.url);
const adminHandler = require('../template/api/admin');

// Memory store multiplies limits by 50: 30 bad keys → 1500, 600 requests → 30000.
const BAD_KEY_LIMIT = 30 * 50;

async function call(key, ip){
  const res = {statusCode:0, headers:{}, body:'', setHeader(k, v){ this.headers[k] = v; }, end(b){ this.body = b || ''; }};
  const req = {method:'POST', headers:{'x-forwarded-for':ip, 'x-admin-key':encodeURIComponent(key)}, body:{action:'products_list'}};
  await adminHandler(req, res);
  return res.statusCode;
}

// Real admin work is not throttled by the guard (the old shared counter blocked it).
for(let i = 0; i < BAD_KEY_LIMIT + 50; i++) assert.equal(await call('rate-admin', '10.9.0.1'), 200, 'valid request ' + i);

for(let i = 0; i < BAD_KEY_LIMIT; i++) assert.equal(await call('wrong', '10.9.0.2'), 403, 'bad key ' + i);
assert.equal(await call('wrong', '10.9.0.2'), 429);
assert.equal(await call('rate-admin', '10.9.0.2'), 429, 'a blocked address stays blocked even with the right key');
assert.equal(await call('rate-admin', '10.9.0.3'), 200, 'other addresses are not affected');

console.log('Admin rate guard OK');
