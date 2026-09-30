'use strict';

const { store } = require('../../../packages/core/server/store');
const { NO_ACCOUNT_EXTENSION } = require('../../../packages/core/server/auth-core');
const { trialKey } = require('./unmute-ai-trial');

// Server records UnMute keeps per account besides Core documents: the free AI trial and the
// retained "already learned" ledger (unmute:learned:v1:<account>:<set>, see api/content.js).
// Account deletion must remove them too, not wait for their TTL.
const learnedPattern = accountHash => `unmute:learned:v1:${accountHash}:*`;

const unmuteAccountExtension = Object.freeze({
  ...NO_ACCOUNT_EXTENSION,
  async purgeAccountData(accountHash){
    if(!accountHash)return;
    await store.del(trialKey(accountHash));
    for(const key of await store.scan(learnedPattern(accountHash),200)) await store.del(key);
  }
});

module.exports = { unmuteAccountExtension, learnedPattern };
