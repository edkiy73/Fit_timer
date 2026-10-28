/// <reference lib="webworker" />
/** Makes a clip off the page (video-encode.ts) so the sheet keeps responding. In: an EditJob. Out: progress messages,
 * then the MP4 (transferred) — or `unsupported` (the page tries the recorder) / `error`. Cancel = terminate. */
import {Unsupported,encodeVideo} from './video-encode';
import type {EditJob} from './video-size';

const post=(m:unknown,t?:Transferable[])=>(self as unknown as DedicatedWorkerGlobalScope).postMessage(m,t??[]);
self.onmessage=async(e:MessageEvent<EditJob>)=>{
 try{
  const r=await encodeVideo(e.data,p=>post({type:'progress',p}));
  post({type:'done',buf:r.buf,mime:r.mime},[r.buf]);
 }catch(err){
  post(err instanceof Unsupported?{type:'unsupported',why:err.message}:{type:'error',message:err instanceof Error?err.message:String(err)});
 }
};
post({type:'ready'});
