// @ts-check
'use strict';
const { isAuthenticatedActor } = require('./identity');
const { reject } = require('./errors');
/** Restrictive F04 policy: no cross-owner access, even with public visibility, grant or admin key.
 * P01/A04 must add verified attestations, blocks and scoped grants before expanding this policy.
 * @param {import('./contracts').Actor} actor @param {string} ownerHash
 */
function requireOwner(actor,ownerHash) {
  if(!isAuthenticatedActor(actor))reject(401,'auth_required');
  if(actor.accountHash!==ownerHash)reject(404,'resource_not_found');
}
/** @param {import('./contracts').Actor} actor */
function requireAdult(actor) {
  requireOwner(actor,actor.accountHash);
  if(!actor.verifiedAdult)reject(403,'verification_required');
}
module.exports={requireOwner,requireAdult};
