'use strict';

const { send, fail } = require('../util');
const { copyBatch, verifyBatch, migrationStatus, resetMirrorFailures } = require('../store-migration');

const ACTIONS = new Set(['storage_status','storage_copy','storage_verify','storage_reset_failures']);

/* Admin «Хранилище»: состояние движков и перенос данных между ними.
   Секреты и значения ключей наружу не отдаются — только счётчики и имена ключей
   в примерах расхождений. */
async function handleAdminStorage(action, body, res){
  if(!ACTIONS.has(action)) return false;
  body = body || {};
  try{
    if(action === 'storage_status'){
      send(res,200,{ok:true,status:await migrationStatus()});
    }else if(action === 'storage_copy'){
      send(res,200,{ok:true,step:await copyBatch({cursor:body.cursor,count:body.count})});
    }else if(action === 'storage_verify'){
      send(res,200,{ok:true,step:await verifyBatch({
        cursor:body.cursor,count:body.count,repair:body.repair === true,reverse:body.reverse === true
      })});
    }else{
      await resetMirrorFailures();
      send(res,200,{ok:true});
    }
  }catch(e){
    const code = String((e && e.message) || 'storage_failed').slice(0,80);
    fail(res, e && e.status === 409 ? 409 : 502, code);
  }
  return true;
}

module.exports={handleAdminStorage,ACTIONS};
