// @ts-check
'use strict';
const {requireAdult}=require('./permissions');
const {reject}=require('./errors');
/** @param {import('./documents').DocumentsRepository|null} documents */
function createAccessGuard(documents){
 /** @param {import('./contracts').Actor} actor */
 return async actor=>{requireAdult(actor);if(!documents)reject(503,'documents_unavailable');await documents.requireCurrent(actor);};
}
module.exports={createAccessGuard};
