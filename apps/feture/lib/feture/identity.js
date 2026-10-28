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
 * @param {(accountHash:string)=>Promise<string|null>} [qaResolver]
 * @returns {Promise<import('./contracts').Actor>}
 */
async function authenticate(req,store,qaResolver) {
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
  // After an email change Core keeps the account's first hash (keyHash): FetUre data stays linked to the same person.
  const keyHash=typeof account.keyHash==='string'&&/^[0-9a-f]{32}$/.test(account.keyHash)?account.keyHash:accountHash;
  // QA access is a server-only, live prelaunch entitlement, NOT proof of identity or age.
  // No client flag or self-declared DOB can ever grant it.
  const qaUntil=qaResolver?await qaResolver(keyHash):null;
  // e2e persona logins (qa-…@feture.test, signed in only with the admin test code): their FetUre account is marked qa.
  const actor=Object.freeze({qa:/^qa-[a-z0-9-]+@feture\.test$/.test(email),accountHash:keyHash,verifiedAdult:!!qaUntil,qaUntil,accountGeneration:typeof account.since==='string'&&Number.isFinite(Date.parse(account.since))?sha(keyHash+':'+account.since):undefined});
  authenticatedActors.add(actor);
  return actor;
}
/** @param {unknown} actor @returns {actor is import('./contracts').Actor} */
function isAuthenticatedActor(actor) {return typeof actor==='object'&&actor!==null&&authenticatedActors.has(actor);}
module.exports={authenticate,isAuthenticatedActor};
