'use strict';
// Deleting an account removes UnMute's own server records too (AI trial, learned ledger).
process.env.ALLOW_MEMORY_STORE = '1';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const auth = require('../api/auth');
const { store } = require('../../../packages/core/server/store');
const { trialKey } = require('../lib/unmute-ai-trial');

async function call(body){
  const res = {statusCode:0, headers:{}, body:'', setHeader(k,v){ this.headers[k]=v; }, end(b){ this.body=b||''; }};
  await auth({method:'POST', headers:{'x-forwarded-for':'10.7.0.1'}, body}, res);
  return {status:res.statusCode, body:res.body ? JSON.parse(res.body) : {}};
}

(async () => {
  const email = 'family@example.com';
  const mh = crypto.createHash('sha256').update(email).digest('hex').slice(0,32);
  const sent = await call({action:'send', email});
  assert.equal(sent.status, 200);
  const verified = await call({action:'verify', email, code:sent.body.devCode, deviceId:'device-delete'});
  assert.equal(verified.status, 200);

  await store.set(trialKey(mh), JSON.stringify({activityId:'ai.ai1'}));
  await store.set(`unmute:learned:v1:${mh}:general-foundation`, JSON.stringify(['card.one']));
  const other = 'unmute:learned:v1:someoneelse0000000000000000000000:general-foundation';
  await store.set(other, JSON.stringify(['card.two']));

  const gone = await call({action:'forget', scope:'all', email, deviceId:'device-delete', syncToken:verified.body.syncToken, handle:''});
  assert.equal(gone.status, 200);
  assert.equal(await store.get(`a:${mh}`), null);
  assert.equal(await store.get(trialKey(mh)), null);
  assert.equal(await store.get(`unmute:learned:v1:${mh}:general-foundation`), null);
  assert.ok(await store.get(other), 'other accounts are untouched');
  console.log('UnMute account deletion purge OK');
})().catch(error => { console.error(error); process.exit(1); });
