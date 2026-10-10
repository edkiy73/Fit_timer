// @ts-check
'use strict';
const { reject } = require('./errors');
const INTEREST_ID=/^interest-[1-9]\d{0,2}-[1-9]\d{0,2}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
/** Full atomic state, not a patch: omitted visibility/discovery always default private/off.
 * Source/revision/time/owner are server fields and cannot be supplied here.
 * @param {unknown} input @returns {import('./contracts').InterestState}
 */
function interestState(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.getPrototypeOf(input)!==Object.prototype)reject(422,'invalid_request');
  const value=/** @type {Record<string,unknown>} */(input);
  if(Object.keys(value).some(k=>!['stance','experience','boundary','boundaryNote','intensity','visibility','useForDiscovery'].includes(k)))reject(422,'invalid_request');
  const {stance,experience,boundary,intensity}=value;
  const note=value.boundaryNote===undefined?null:value.boundaryNote;
  const visibility=value.visibility===undefined?'private':value.visibility;
  const discovery=value.useForDiscovery===undefined?false:value.useForDiscovery;
  if(typeof stance!=='string'||!['unknown','curious','fantasy','want_to_try','not_interested'].includes(stance)
    ||typeof experience!=='string'||!['unspecified','none','tried','ongoing'].includes(experience)
    ||typeof boundary!=='string'||!['none','conditional','hard'].includes(boundary)
    ||typeof visibility!=='string'||!['private','public','granted'].includes(visibility)||typeof discovery!=='boolean'
    ||note!==null&&(typeof note!=='string'||note.length>1000||boundary!=='conditional')
    ||intensity!==null&&(typeof intensity!=='number'||!Number.isInteger(intensity)||intensity<1||intensity>5||!['curious','fantasy','want_to_try'].includes(stance)||boundary==='hard'))reject(422,'invalid_request');
  return /** @type {import('./contracts').InterestState} */({stance,experience,boundary,boundaryNote:note,intensity,visibility,useForDiscovery:discovery});
}
module.exports={interestState,INTEREST_ID,UUID};
