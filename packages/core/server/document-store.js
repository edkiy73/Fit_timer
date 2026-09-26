'use strict';

function createDocumentStore(adapter){
  if(!adapter || typeof adapter !== 'object') throw new Error('document_store_adapter_required');
  for(const method of ['upsert','listAccount','purgeProfile','purgeAccount']){
    if(typeof adapter[method] !== 'function') throw new Error('document_store_missing_'+method);
  }
  return Object.freeze({
    upsert: doc => adapter.upsert(doc),
    listAccount: accountHash => adapter.listAccount(accountHash),
    purgeProfile: (accountHash, profileId) => adapter.purgeProfile(accountHash, profileId),
    purgeAccount: accountHash => adapter.purgeAccount(accountHash)
  });
}

module.exports={createDocumentStore};
