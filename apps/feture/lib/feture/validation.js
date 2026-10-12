// @ts-check
'use strict';
const { reject } = require('./errors');
const { interestState,INTEREST_ID,UUID } = require('./interest-model');
const {profileCommand}=require('./profile');
const {accessCommand}=require('./access');
const {moderationCommand}=require('./moderation');
const {testsCommand}=require('./questionnaires');
const {journalCommand}=require('./journal');
const {shareCommand}=require('./shares');
const {postCommand}=require('./posts');
const {photoCommand}=require('./post-photos');
const MAX_BODY=16384,MAX_PHOTO_BODY=1400000;
/** @param {import('./contracts').Request} req @returns {Promise<unknown>} */
async function readBody(req) {
  if(req.rawBody==null && req.body && typeof req.body==='object'&&!Buffer.isBuffer(req.body)) {
    let raw;try {raw=JSON.stringify(req.body);} catch {reject(422,'invalid_request');}
    if(!raw||Buffer.byteLength(raw)>MAX_PHOTO_BODY)reject(413,'request_too_large');
    if(Buffer.byteLength(raw)>MAX_BODY&&/** @type {{action?:unknown}} */(req.body).action!=='photo.put')reject(413,'request_too_large');
    return req.body;
  }
  const supplied=req.rawBody??req.body;
  let raw='';
  if(Buffer.isBuffer(supplied)) {if(supplied.length>MAX_PHOTO_BODY)reject(413,'request_too_large');raw=supplied.toString('utf8');}
  else if(typeof supplied==='string')raw=supplied;
  else {
    const chunks=[];let bytes=0;
    for await(const chunk of req) {const buffer=Buffer.from(chunk);bytes+=buffer.length;if(bytes>MAX_PHOTO_BODY)reject(413,'request_too_large');chunks.push(buffer);}
    raw=Buffer.concat(chunks).toString('utf8');
  }
  if(Buffer.byteLength(raw)>MAX_PHOTO_BODY)reject(413,'request_too_large');
  try {const input=JSON.parse(raw);if(Buffer.byteLength(raw)>MAX_BODY&&input?.action!=='photo.put')reject(413,'request_too_large');return input;} catch(e) {if(e instanceof require('./errors').DomainError)throw e;return reject(422,'invalid_request');}
}
/** @param {unknown} input @returns {import('./contracts').Command} */
function command(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.getPrototypeOf(input)!==Object.prototype)reject(422,'invalid_request');
  const value=/** @type {Record<string,unknown>} */(input);
  const action=value.action;
  if(typeof action==='string'&&action.startsWith('photo.'))return photoCommand(value);
  if(typeof action==='string'&&action.startsWith('posts.'))return postCommand(value);
  if(typeof action==='string'&&action.startsWith('comments.'))return postCommand(value);
  if(typeof action==='string'&&action.startsWith('authors.'))return postCommand(value);
  if(typeof action==='string'&&action.startsWith('relationships.'))return postCommand(value);
  if(typeof action==='string'&&action.startsWith('share.'))return shareCommand(value);
  if(typeof action==='string'&&action.startsWith('tests.'))return testsCommand(value);
  if(typeof action==='string'&&(action.startsWith('journal.')||action.startsWith('history.')))return journalCommand(value);
  if(typeof action==='string'&&action.startsWith('moderation.'))return moderationCommand(value);
  if(typeof action==='string'&&action.startsWith('access.'))return accessCommand(value);
  if(action==='profile.read'||action==='profile.save')return profileCommand(value);
  if(action==='documents.status'||action==='documents.accept'){
    const keys=action==='documents.status'?['action','locale']:['action','locale','documentIds'];
    if(Object.keys(value).some(k=>!keys.includes(k))||value.locale!=='ru'&&value.locale!=='en')reject(422,'invalid_request');
    const locale=/** @type {'ru'|'en'} */(value.locale);
    if(action==='documents.status')return {action,locale};
    if(!Array.isArray(value.documentIds)||value.documentIds.length<1||value.documentIds.length>9||new Set(value.documentIds).size!==value.documentIds.length||!value.documentIds.every(v=>typeof v==='string'&&UUID.test(v)))reject(422,'invalid_request');
    return {action,locale,documentIds:/** @type {string[]} */(value.documentIds)};
  }
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
