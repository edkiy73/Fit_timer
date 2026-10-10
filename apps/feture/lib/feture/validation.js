// @ts-check
'use strict';
const { reject } = require('./errors');
const { interestState,INTEREST_ID,UUID } = require('./interest-model');
const MAX_BODY=4096;
/** @param {import('./contracts').Request} req @returns {Promise<unknown>} */
async function readBody(req) {
  if(req.rawBody==null && req.body && typeof req.body==='object'&&!Buffer.isBuffer(req.body)) {
    let raw;try {raw=JSON.stringify(req.body);} catch {reject(422,'invalid_request');}
    if(!raw||Buffer.byteLength(raw)>MAX_BODY)reject(413,'request_too_large');
    return req.body;
  }
  const supplied=req.rawBody??req.body;
  let raw='';
  if(Buffer.isBuffer(supplied)) {if(supplied.length>MAX_BODY)reject(413,'request_too_large');raw=supplied.toString('utf8');}
  else if(typeof supplied==='string')raw=supplied;
  else {
    const chunks=[];let bytes=0;
    for await(const chunk of req) {const buffer=Buffer.from(chunk);bytes+=buffer.length;if(bytes>MAX_BODY)reject(413,'request_too_large');chunks.push(buffer);}
    raw=Buffer.concat(chunks).toString('utf8');
  }
  if(Buffer.byteLength(raw)>MAX_BODY)reject(413,'request_too_large');
  try {return JSON.parse(raw);} catch {return reject(422,'invalid_request');}
}
/** @param {unknown} input @returns {import('./contracts').Command} */
function command(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.getPrototypeOf(input)!==Object.prototype)reject(422,'invalid_request');
  const value=/** @type {Record<string,unknown>} */(input);
  const action=value.action;
  const mutation=action==='interests.set'||action==='interests.delete';
  const allowed=(action==='profile.get'||action==='verification.status')?['action']:action==='interests.list'?['action','limit','cursor']:mutation?['action','interestId','operationId','expectedRevision',...(action==='interests.set'?['state']:[])]:[];
  if(!allowed.length||Object.keys(value).some(key=>!allowed.includes(key)))reject(422,'invalid_request');
  if(action==='profile.get'||action==='verification.status')return {action};
  if(mutation) {
    const {interestId,operationId,expectedRevision}=value;
    if(typeof interestId!=='string'||!INTEREST_ID.test(interestId)||typeof operationId!=='string'||!UUID.test(operationId)||typeof expectedRevision!=='number'||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||expectedRevision>=Number.MAX_SAFE_INTEGER)reject(422,'invalid_request');
    const base={interestId:/** @type {string} */(interestId),operationId:/** @type {string} */(operationId),expectedRevision:/** @type {number} */(expectedRevision)};
    return action==='interests.set'?{action,...base,state:interestState(value.state)}:{action:'interests.delete',...base};
  }
  const limit=value.limit===undefined?30:value.limit;
  if(typeof limit!=='number'||!Number.isInteger(limit)||limit<1||limit>50)reject(422,'invalid_request');
  let after=null;
  if(value.cursor!==undefined&&value.cursor!==null) {
    if(typeof value.cursor!=='string'||value.cursor.length>160||!/^v1\.[A-Za-z0-9_-]+$/.test(value.cursor))reject(422,'invalid_cursor');
    const encoded=value.cursor.slice(3);
    after=Buffer.from(encoded,'base64url').toString('utf8');
    if(!/^interest-[1-9]\d{0,2}-[1-9]\d{0,2}$/.test(after)||Buffer.from(after).toString('base64url')!==encoded)reject(422,'invalid_cursor');
  }
  return {action:'interests.list',limit:/** @type {number} */(limit),after};
}
/** @param {string} id */
const cursorFor=id=>'v1.'+Buffer.from(id).toString('base64url');
module.exports={readBody,command,cursorFor,MAX_BODY};
