// @ts-check
'use strict';
const {createHash}=require('node:crypto');
const {reject,DomainError}=require('./errors');
const {requireOwner}=require('./permissions');
const {uuid}=require('./documents');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** @param {Record<string,unknown>} v @param {string[]} keys */
const shape=(v,keys)=>Object.keys(v).sort().join(',')===keys.sort().join(',');
/** Bound both memory and body consumption; transport timeout only covers response headers.
 * @param {Response} response @param {number} maxBytes @param {number} [timeoutMs] */
async function readBoundedBody(response,maxBytes,timeoutMs=8000){
 if(!response.body)reject(503,'operators_unavailable');
 const reader=response.body.getReader(),buffer=Buffer.alloc(maxBytes);let offset=0;
 /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;
 /** @type {Promise<never>} */ const deadline=new Promise((_,fail)=>{timer=setTimeout(()=>{fail(new Error('body_deadline'));void reader.cancel().catch(()=>{});},timeoutMs);});
 try{
  for(;;){const part=await Promise.race([reader.read(),deadline]);if(part.done)break;
   if(part.value.byteLength>maxBytes-offset)reject(503,'operators_unavailable');
   buffer.set(part.value,offset);offset+=part.value.byteLength;
  }
  return buffer.subarray(0,offset);
 }finally{clearTimeout(timer);void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{/* Pending cancellation releases the reader. */}}
}
/** @param {import('./contracts').Transport} transport @param {import('./contracts').Actor} actor @param {Record<string,unknown>} body */
async function staffPhotoRead(transport,actor,body){requireOwner(actor,actor.accountHash);
 if(!actor.accountGeneration)reject(403,'forbidden');
 if(!shape(body,['action','id','revision'])||body.action!=='feture.posts.photo'||!uuid(body.id)||typeof body.revision!=='number'||!Number.isSafeInteger(body.revision)||body.revision<1||body.revision>999999999999999)reject(422,'invalid_request');
 if(!transport.configured())reject(503,'operators_unavailable');
 const command=JSON.stringify({p_actor:actor.accountHash,p_generation:actor.accountGeneration,p_id:body.id,p_revision:body.revision});
 const authorize=async()=>{
  const response=await transport.request('/rest/v1/rpc/feture_staff_photo_read',{method:'POST',headers:{'Content-Type':'application/json'},body:command,timeoutMs:8000});const r=JSON.parse((await readBoundedBody(response,4096)).toString('utf8'));
  if(!response.ok||!object(r))reject(503,'operators_unavailable');
  if(r.ok!==true){if(r.error==='forbidden')reject(403,'forbidden');if(r.error==='resource_not_found')reject(404,'resource_not_found');if(r.error==='review_required')reject(409,'review_required');reject(503,'operators_unavailable');}
  const p=r.photo;
  if(!shape(r,['ok','photo'])||!object(p)||!shape(p,['path','hash','bytes','width','height','consentRevision'])||typeof p.path!=='string'||!new RegExp('^'+body.id+'/[a-f0-9-]{36}\\.jpg$').test(p.path)||typeof p.hash!=='string'||!/^[a-f0-9]{64}$/.test(p.hash)||typeof p.bytes!=='number'||!Number.isInteger(p.bytes)||p.bytes<1||p.bytes>524288||typeof p.width!=='number'||!Number.isInteger(p.width)||p.width<1||p.width>1024||typeof p.height!=='number'||!Number.isInteger(p.height)||p.height<1||p.height>1024||typeof p.consentRevision!=='number'||!Number.isSafeInteger(p.consentRevision)||p.consentRevision<1)reject(503,'operators_unavailable');
  return /** @type {{path:string;hash:string;bytes:number;width:number;height:number;consentRevision:number}} */(p);
 };
 try{
  const descriptor=await authorize();
  const response=await transport.request('/storage/v1/object/authenticated/feture-post-photos/'+descriptor.path,{timeoutMs:8000});
  if(!response.ok||response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()!=='image/jpeg'||!response.body||Number(response.headers.get('content-length'))>descriptor.bytes){void response.body?.cancel().catch(()=>{});reject(503,'operators_unavailable');}
  const image=await readBoundedBody(response,descriptor.bytes);
  if(image.length!==descriptor.bytes||createHash('sha256').update(image).digest('hex')!==descriptor.hash)reject(503,'operators_unavailable');
  // The DB transaction ends before I/O. Revalidate roles, eligibility, blocks and exact consent.
  const fresh=await authorize();
  if(['path','hash','bytes','width','height','consentRevision'].some(key=>fresh[/** @type {keyof typeof fresh} */(key)]!==descriptor[/** @type {keyof typeof descriptor} */(key)]))reject(404,'resource_not_found');
  return {ok:true,photo:{mime:'image/jpeg',image:image.toString('base64'),width:descriptor.width,height:descriptor.height}};
 }catch(e){if(e instanceof DomainError)throw e;return reject(503,'operators_unavailable');}
}
module.exports={staffPhotoRead,readBoundedBody};
