// @ts-check
'use strict';
const sharp=require('sharp');
const {createHash}=require('node:crypto');
const {reject,DomainError}=require('./errors');
const {uuid}=require('./documents');
const {requireOwner}=require('./permissions');
const {createAccessGuard}=require('./access-guard');
const BUCKET='feture-post-photos',MAX_SOURCE=1048576,MAX_JPEG=524288;
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** @param {Record<string,unknown>} v @param {string[]} keys */
const shape=(v,keys)=>Object.keys(v).sort().join(',')===keys.sort().join(',');
/** @param {unknown} v */
const revision=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=999999999999999;
/** @param {unknown} input @returns {import('./post-photos').PhotoCommand} */
function photoCommand(input){if(!object(input)||!uuid(input.id))reject(422,'invalid_request');const c=/** @type {Record<string,unknown>} */(input);
 if(typeof c.action==='string'&&c.action.startsWith('photo.review'))return require('./post-photo-consent').reviewCommand(input);
 if(c.action==='photo.read'&&shape(c,['action','id','revision'])&&revision(c.revision))return /** @type {import('./post-photos').PhotoCommand} */(c);
 if(!uuid(c.operationId)||!revision(c.expectedRevision))reject(422,'invalid_request');
 if(c.action==='photo.remove'&&shape(c,['action','id','operationId','expectedRevision']))return /** @type {import('./post-photos').PhotoCommand} */(c);
 if(c.action==='photo.put'&&shape(c,['action','id','operationId','expectedRevision','image','consent'])&&c.consent===true&&typeof c.image==='string'&&c.image.length<=Math.ceil(MAX_SOURCE/3)*4&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(c.image)&&c.image.length>0)return /** @type {import('./post-photos').PhotoCommand} */(c);
 return reject(422,'invalid_request');}
/** Decode/re-encode raster pixels only: no original EXIF, GPS, names, URLs or animations. @param {string} image */
async function normalizePhoto(image){try{const source=Buffer.from(image,'base64');if(source.length>MAX_SOURCE||source.toString('base64')!==image)reject(422,'invalid_image');
 const decoder=sharp(source,{limitInputPixels:16000000,failOn:'warning'});const meta=await decoder.metadata();if(!['jpeg','png','webp'].includes(meta.format||'')||(meta.pages||1)!==1)reject(422,'invalid_image');
 const out=await decoder.rotate().resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).jpeg({quality:78}).toBuffer({resolveWithObject:true});if(out.data.length>MAX_JPEG)reject(422,'invalid_image');
 return {data:out.data,width:out.info.width,height:out.info.height};
 }catch(e){if(e instanceof DomainError)throw e;return reject(422,'invalid_image');}}
/** @param {Uint8Array} data */
const hash=data=>createHash('sha256').update(data).digest('hex');
/** Bounded best-effort erasure; failed work stays in a private durable outbox. @param {import('./contracts').Transport} transport */
async function cleanupPhotoObjects(transport){try{
 await transport.request('/rest/v1/rpc/feture_photo_sweep',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',timeoutMs:1000});
 const response=await transport.request('/rest/v1/feture_photo_gc?select=object_path&order=created_at.asc&limit=2',{timeoutMs:1000});const rows=await response.json();
 if(!response.ok||!Array.isArray(rows)||rows.length>2)return;
 for(const row of rows){if(!object(row)||!shape(row,['object_path'])||typeof row.object_path!=='string'||!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/.test(row.object_path))continue;
  const deleted=await transport.request('/storage/v1/object/'+BUCKET,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[row.object_path]}),timeoutMs:1000});if(!deleted.ok)continue;
  await transport.request('/rest/v1/feture_photo_gc?object_path=eq.'+encodeURIComponent(row.object_path),{method:'DELETE',timeoutMs:1000});
 }
 }catch{/* Keep erasure work for the next sweep; never log private paths. */}}
/** @param {import('./contracts').Transport} transport @param {import('./documents').DocumentsRepository} documents */
function createPhotoRepository(transport,documents){const guard=createAccessGuard(documents);
 /** @param {string} actor @param {Record<string,unknown>} command */
 const rpc=async(actor,command)=>{const response=await transport.request('/rest/v1/rpc/feture_post_photo_command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_actor:actor,p_command:command}),timeoutMs:8000});const r=await response.json();if(!response.ok||!object(r))reject(503,'domain_unavailable');if(r.ok!==true){const code=String(r.error);if(code==='resource_not_found')reject(404,code);if(['revision_conflict','operation_conflict'].includes(code))reject(409,code);if(code==='invalid_request')reject(422,code);if(code==='rate_limited')reject(429,code);reject(503,'domain_unavailable');}return r;};
 /** Private paths are never returned by execute. @param {unknown} path @param {string} id */
 const pathFor=(path,id)=>{if(typeof path!=='string'||!new RegExp('^'+id+'/[a-f0-9-]{36}\\.jpg$').test(path))reject(503,'domain_unavailable');return /** @type {string} */(path);};
 /** @param {unknown} entry @param {string} id */
 const entryFor=(entry,id)=>{const p=require('./posts').postDto(entry);if(p.id!==id||!p.mine)reject(503,'domain_unavailable');return p;};
 return {/** @param {import('./contracts').Actor} actor @param {import('./post-photos').PhotoCommand} input */
 async execute(actor,input){requireOwner(actor,actor.accountHash);const c=photoCommand(input);if(c.action==='photo.reviewStatus'||c.action==='photo.reviewConsent'||c.action==='photo.reviewRevoke')return require('./post-photo-consent').executeReviewConsent(transport,documents,actor,c);if(c.action!=='photo.remove')await guard(actor);if(!transport.configured())reject(503,'domain_unavailable');
 try{
 if(c.action==='photo.read'){
  const cmd={action:'read',id:c.id,revision:c.revision};const r=await rpc(actor.accountHash,cmd);if(!shape(r,['ok','photo']))reject(503,'domain_unavailable');if(r.photo===null)return {photo:null};
  const p=r.photo;if(!object(p)||!shape(p,['path','hash','bytes','width','height'])||typeof p.hash!=='string'||!/^[a-f0-9]{64}$/.test(p.hash)||typeof p.bytes!=='number'||p.bytes<1||p.bytes>MAX_JPEG||typeof p.width!=='number'||typeof p.height!=='number'||!Number.isInteger(p.width)||!Number.isInteger(p.height)||p.width<1||p.height<1||p.width>1024||p.height>1024)reject(503,'domain_unavailable');
  const safe=/** @type {{path:string;hash:string;bytes:number;width:number;height:number}} */(p);const path=pathFor(safe.path,c.id);
  const response=await transport.request('/storage/v1/object/authenticated/'+BUCKET+'/'+path,{timeoutMs:8000});if(!response.ok||Number(response.headers.get('content-length'))>MAX_JPEG)reject(503,'domain_unavailable');
  const data=Buffer.from(await response.arrayBuffer());if(data.length!==safe.bytes||hash(data)!==safe.hash)reject(503,'domain_unavailable');
  // Recheck current grants/revision after object I/O; no bearer URLs survive a later revoke.
  const fresh=await rpc(actor.accountHash,cmd);if(JSON.stringify(fresh.photo)!==JSON.stringify(p))reject(404,'resource_not_found');
  return {photo:{mime:'image/jpeg',image:data.toString('base64'),width:safe.width,height:safe.height}};
 }
 if(c.action==='photo.remove'){const r=await rpc(actor.accountHash,{action:'remove',id:c.id,operationId:c.operationId,expectedRevision:c.expectedRevision});if(!shape(r,['ok','entry','replayed'])||typeof r.replayed!=='boolean')reject(503,'domain_unavailable');await cleanupPhotoObjects(transport);return {entry:entryFor(r.entry,c.id),replayed:r.replayed};}
 const image=await normalizePhoto(c.image),digest=hash(image.data);
 const prepared=await rpc(actor.accountHash,{action:'prepare',id:c.id,operationId:c.operationId,expectedRevision:c.expectedRevision,contentHash:digest,bytes:image.data.length,width:image.width,height:image.height,consent:true});
 if(prepared.upload===false){if(!shape(prepared,['ok','upload','entry']))reject(503,'domain_unavailable');await cleanupPhotoObjects(transport);return {entry:entryFor(prepared.entry,c.id),replayed:true};}
 if(prepared.upload!==true||!shape(prepared,['ok','upload','path']))reject(503,'domain_unavailable');const path=pathFor(prepared.path,c.id);
 try{const upload=await transport.request('/storage/v1/object/'+BUCKET+'/'+path,{method:'POST',headers:{'Content-Type':'image/jpeg','x-upsert':'false','cache-control':'no-store'},body:image.data,timeoutMs:8000});if(!upload.ok)reject(503,'domain_unavailable');}
 catch(e){if(![400,409].includes(Number(/** @type {{status?:number}} */(e).status)))throw e;
  // A retry may find the immutable object already uploaded. Verify bytes, never overwrite.
  const prior=await transport.request('/storage/v1/object/authenticated/'+BUCKET+'/'+path,{timeoutMs:8000});const bytes=Buffer.from(await prior.arrayBuffer());if(!prior.ok||bytes.length!==image.data.length||hash(bytes)!==digest)reject(409,'operation_conflict');}
 const attached=await rpc(actor.accountHash,{action:'attach',id:c.id,operationId:c.operationId,expectedRevision:c.expectedRevision});if(!shape(attached,['ok','entry','replayed'])||typeof attached.replayed!=='boolean')reject(503,'domain_unavailable');await cleanupPhotoObjects(transport);return {entry:entryFor(attached.entry,c.id),replayed:attached.replayed};
 }catch(e){if(e instanceof DomainError)throw e;return reject(503,'domain_unavailable');}
 }};
}
module.exports={cleanupPhotoObjects,photoCommand,normalizePhoto,createPhotoRepository};
