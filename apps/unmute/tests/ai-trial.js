'use strict';

process.env.ALLOW_MEMORY_STORE='1';
const assert=require('assert');
const {store}=require('../../../packages/core/server/store');
const {
  authorizeUnMuteAI,
  TRIAL_MAX_CALLS,
  TRIAL_WINDOW_MS,
  FREE_EXPLAIN_CALLS,
  trialKey
}=require('../lib/unmute-ai-trial');

(async()=>{
  const accountHash='trial-test-'+Date.now();
  const base={
    accountHash,
    store,
    now:Date.parse('2026-09-29T00:00:00Z')
  };
  const trial={id:'trial_abcdefghijklmnop',scope:'talk.clinic'};

  // «Почему?»: three free explanations per account in total, then Plus only.
  let result;
  for(let i=1;i<=FREE_EXPLAIN_CALLS;i++){
    result=await authorizeUnMuteAI({...base,body:{kind:'answer.explain'}});
    assert.equal(result.allowed,true);
    assert.equal(result.meta.mode,'free');
    assert.equal(result.meta.remaining,FREE_EXPLAIN_CALLS-i);
  }
  result=await authorizeUnMuteAI({...base,now:base.now+30*86400000,body:{kind:'answer.explain'}});
  assert.deepEqual(result,{allowed:false,code:'free_explain_used',status:402});
  // The explanation allowance does not touch the AI talk trial.
  assert.equal(await store.get(trialKey(accountHash)),null);

  result=await authorizeUnMuteAI({
    ...base,
    body:{kind:'talk.reply',trial,start:true}
  });
  assert.equal(result.allowed,true);
  assert.equal(result.meta.mode,'trial');
  assert.equal(result.meta.remaining,TRIAL_MAX_CALLS-1);

  result=await authorizeUnMuteAI({
    ...base,
    body:{kind:'talk.reply',trial,start:false}
  });
  assert.equal(result.allowed,true);
  assert.equal(result.meta.remaining,TRIAL_MAX_CALLS-2);

  result=await authorizeUnMuteAI({
    ...base,
    body:{kind:'talk.review',trial}
  });
  assert.equal(result.allowed,true);

  result=await authorizeUnMuteAI({
    ...base,
    body:{
      kind:'talk.reply',
      start:true,
      trial:{id:'trial_otherabcdefghijkl',scope:'talk.clinic'}
    }
  });
  assert.deepEqual(result,{allowed:false,code:'trial_used',status:402});

  result=await authorizeUnMuteAI({
    ...base,
    body:{
      kind:'talk.reply',
      start:true,
      trial:{id:'trial_abcdefghijklmnop',scope:'talk.bank'}
    }
  });
  assert.deepEqual(result,{allowed:false,code:'trial_used',status:402});

  const expiredHash=accountHash+'-expired';
  await store.set(trialKey(expiredHash),JSON.stringify({
    id:trial.id,
    scope:trial.scope,
    startedAt:base.now-TRIAL_WINDOW_MS-1,
    calls:1
  }),3600);
  result=await authorizeUnMuteAI({
    ...base,
    accountHash:expiredHash,
    body:{kind:'talk.reply',trial,start:false}
  });
  assert.deepEqual(result,{allowed:false,code:'trial_used',status:402});

  const cappedHash=accountHash+'-capped';
  await store.set(trialKey(cappedHash),JSON.stringify({
    id:trial.id,
    scope:trial.scope,
    startedAt:base.now,
    calls:TRIAL_MAX_CALLS
  }),3600);
  result=await authorizeUnMuteAI({
    ...base,
    accountHash:cappedHash,
    body:{kind:'talk.reply',trial,start:false}
  });
  assert.deepEqual(result,{allowed:false,code:'trial_limit',status:429});

  await Promise.all([
    store.del(trialKey(accountHash)),
    store.del(trialKey(expiredHash)),
    store.del(trialKey(cappedHash))
  ]);
  console.log('UnMute AI trial checks passed');
})().catch(error=>{
  console.error(error);
  process.exit(1);
});
