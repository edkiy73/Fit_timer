// @ts-check
'use strict';
const { requireOwner } = require('./permissions');
/** Read-only status. Only a future trusted server attestation may grant access.
 * @param {import('./contracts').Actor} actor
 * @returns {import('./contracts').VerificationStatusDTO} */
function verificationStatus(actor) {
  requireOwner(actor,actor.accountHash);
  return {state:'unavailable',verifiedAdult:false,validUntil:null,reason:'provider_not_configured'};
}
module.exports={verificationStatus};
