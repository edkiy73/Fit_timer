// @ts-check
'use strict';
const { reject } = require('./errors');
/** The sign-in second step (optional factor) for the earlier domain API and the operator cabinet: a Core sign-in that
 * has not passed it is refused 403 `second_factor` (server/core-guard.mjs, server/signin.mjs); an outage is 503.
 * @param {import('./contracts').Request} req @param {import('./contracts').Actor} actor */
async function secondStepGuard(req, actor) {
  let refusal = null;
  try { await (await import('../../server/core-guard.mjs')).guardCoreRequest(/** @type {any} */ (req), actor); }
  catch (error) { refusal = /** @type {{status?: number}} */ (error)?.status === 403 ? 403 : 503; }
  if (refusal) reject(refusal, refusal === 403 ? 'second_factor' : 'domain_unavailable');
}
module.exports = { secondStepGuard };
