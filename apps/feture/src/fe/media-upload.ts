import {useCallback} from 'react';
import {z} from 'zod';
import {newOpId} from '../feture/fe-api';
import {useFe} from './session';
import type {SendPhoto} from './kit/Uploader';

/** The one way a screen uploads a photo: upload intent → PUT straight to storage (with progress) → commit.
 * Pass it to the kit Uploader as `send`. `extra` carries purpose-specific intent fields (explicit, viewRule…). */
const intentRes=z.object({ok:z.literal(true),assetId:z.uuid(),upload:z.object({url:z.string(),method:z.string(),headers:z.record(z.string(),z.string())})});
const okRes=z.object({ok:z.literal(true)}).passthrough();
export type Purpose='post'|'avatar'|'private'|'chat'|'gallery'|'community'|'event'|'verification';

function put(url:string,method:string,headers:Record<string,string>,body:Blob,onProgress:(p:number)=>void){
 return new Promise<void>((res,rej)=>{
  const x=new XMLHttpRequest();x.open(method,url);for(const [k,v] of Object.entries(headers))x.setRequestHeader(k,v);
  x.upload.onprogress=e=>{if(e.lengthComputable)onProgress(e.loaded/e.total);};
  x.onload=()=>x.status>=200&&x.status<300?res():rej(new Error('upload'));x.onerror=()=>rej(new Error('upload'));x.ontimeout=()=>rej(new Error('upload'));
  x.timeout=120000;x.send(body);
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
