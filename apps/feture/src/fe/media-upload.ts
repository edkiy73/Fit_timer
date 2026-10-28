import {useCallback} from 'react';
import {z} from 'zod';
import {newOpId} from '../feture/fe-api';
import {useFe} from './session';
import type {SendPhoto,SendVideo} from './kit/Uploader';
import type {Voice} from './kit/av';

/** The one way a screen uploads media: upload intent → PUT straight to storage (with progress) → commit.
 * Photos: `useSendPhoto` (pass it to the kit Uploader as `send`). Clips: `useSendVideo` (the Uploader's `sendVideo`):
 * the poster frame cut on the device goes to its own upload URL next to the clip. Voice messages: `useSendVoice`.
 * `extra` carries purpose-specific intent fields (explicit, viewRule…). */
const target=z.object({url:z.string(),method:z.string(),headers:z.record(z.string(),z.string())});
const intentRes=z.object({ok:z.literal(true),assetId:z.uuid(),upload:target,posterUpload:target.optional()});
const okRes=z.object({ok:z.literal(true)}).passthrough();
export type Purpose='post'|'avatar'|'private'|'chat'|'gallery'|'community'|'event'|'verification'|'voice';

function put(url:string,method:string,headers:Record<string,string>,body:Blob,onProgress:(p:number)=>void,timeout=120000){
 return new Promise<void>((res,rej)=>{
  const x=new XMLHttpRequest();x.open(method,url);for(const [k,v] of Object.entries(headers))x.setRequestHeader(k,v);
  x.upload.onprogress=e=>{if(e.lengthComputable)onProgress(e.loaded/e.total);};
  x.onload=()=>x.status>=200&&x.status<300?res():rej(new Error('upload'));x.onerror=()=>rej(new Error('upload'));x.ontimeout=()=>rej(new Error('upload'));
  x.timeout=timeout;x.send(body);
 });
}
/** `profileId`: upload as this profile instead of the acting one (verification shots always belong to the person). */
export function useSendPhoto(purpose:Purpose,extra:Record<string,unknown>={},profileId?:string):SendPhoto{
 const {call}=useFe();const key=JSON.stringify(extra);
 return useCallback(async(blob,onProgress)=>{
  const as=profileId?{profileId}:{};
  const i=await call('media.uploadIntent',{opId:newOpId(),purpose,kind:'image',mime:blob.type||'image/jpeg',bytes:blob.size,...JSON.parse(key)},intentRes,as);
  await put(i.upload.url,i.upload.method,i.upload.headers,blob,onProgress);
  await call('media.commit',{assetId:i.assetId},okRes,as);
  return i.assetId;
 },[call,purpose,key,profileId]);
}

/** A clip with its poster (and its trim / crop, `edit`): the poster first (small), then the clip with progress; ten
 * minutes for a slow connection. */
export function useSendVideo(purpose:Purpose,extra:Record<string,unknown>={},profileId?:string):SendVideo{
 const {call}=useFe();const key=JSON.stringify(extra);
 return useCallback(async(v,onProgress,more={})=>{
  const as=profileId?{profileId}:{};
  const i=await call('media.uploadIntent',{opId:newOpId(),purpose,kind:'video',mime:v.mime,bytes:v.size,durationMs:Math.max(1,v.durationMs),
   poster:{mime:'image/jpeg',bytes:v.poster.size},...(v.edit?{edit:v.edit}:{}),...JSON.parse(key),...more},intentRes,as);
  if(!i.posterUpload)throw new Error('upload');
  await put(i.posterUpload.url,i.posterUpload.method,i.posterUpload.headers,v.poster,()=>{});
  await put(i.upload.url,i.upload.method,i.upload.headers,v.file,onProgress,600000);
  await call('media.commit',{assetId:i.assetId},okRes,as);
  return i.assetId;
 },[call,purpose,key,profileId]);
}

/** A recorded voice message (purpose `voice`, chats only). */
export function useSendVoice(profileId?:string){
 const {call}=useFe();
 return useCallback(async(v:Voice)=>{
  const as=profileId?{profileId}:{};
  const i=await call('media.uploadIntent',{opId:newOpId(),purpose:'voice',kind:'audio',mime:v.mime,bytes:v.blob.size,durationMs:Math.max(1,v.durationMs),
   ...(v.peaks.length?{peaks:v.peaks}:{})},intentRes,as);
  await put(i.upload.url,i.upload.method,i.upload.headers,v.blob,()=>{});
  await call('media.commit',{assetId:i.assetId},okRes,as);
  return i.assetId;
 },[call,profileId]);
}
