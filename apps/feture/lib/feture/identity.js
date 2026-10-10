// @ts-check
'use strict';
const { createHash } = require('node:crypto');
const { reject } = require('./errors');
const { validSession } = require('../../../../packages/core/server/util');
const authenticatedActors = new WeakSet();
const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
/** @param {string} value */
const sha = value => createHash('sha256').update(value).digest('hex');
/** @param {import('./contracts').Request} req @param {string} name @param {number} max */
function header(req,name,max) {
  const value=req.headers[name];
  return typeof value==='string' && value.length>0 && value.length<=max && !/[\x00-\x1f\x7f]/.test(value) ? value : '';
}
/** Core's account/device-token contract. Client identity is only a lookup, never proof.
 * Re-read the server account on every request: removed/rotated device tokens stop working.
 * @param {import('./contracts').Request} req @param {import('./contracts').AccountStore} store
 * @returns {Promise<import('./contracts').Actor>}
 */
async function authenticate(req,store) {
  const email=header(req,'x-fit-email',120).trim().toLowerCase();
  const deviceId=header(req,'x-fit-device',80).trim();
  const token=header(req,'x-fit-token',256);
  if(!EMAIL.test(email)||!deviceId||!token)reject(401,'auth_required');
  if(!store.configured())reject(503,'identity_unavailable');
  const accountHash=sha(email).slice(0,32);
  let raw;
  try {raw=await store.get('a:'+accountHash);} catch {reject(503,'identity_unavailable');}
  let account;
  try {account=JSON.parse(raw||'null');} catch {reject(503,'identity_unavailable');}
  const devices=account && account.syncDevices;
  const device=devices && Object.hasOwn(devices,deviceId) ? devices[deviceId] : null;
  let valid=false;
  try {valid=await validSession(device,token,store);} catch {reject(503,'identity_unavailable');}
  if(!valid||typeof account.email!=='string'||account.email.trim().toLowerCase()!==email)reject(401,'auth_required');
  // No trusted FetUre attestation exists yet. Core account metadata/client flags are NOT age proof.
  const actor=Object.freeze({accountHash,verifiedAdult:false});
  authenticatedActors.add(actor);
  return actor;
}
/** @param {unknown} actor @returns {actor is import('./contracts').Actor} */
function isAuthenticatedActor(actor) {return typeof actor==='object'&&actor!==null&&authenticatedActors.has(actor);}
module.exports={authenticate,isAuthenticatedActor};
