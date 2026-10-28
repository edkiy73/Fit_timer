/** Prepares a clip on the device before it is sent (owner, 28.10.2026): only the chosen part, in the chosen frame,
 * downscaled and compressed. Loaded only when a clip is sent (kit Uploader → `import('./video-edit')`).
 *  1. WebCodecs (video-encode.ts, Mediabunny) in a worker — faster than real time, H.264 + AAC in MP4;
 *     on the page when a worker cannot start.
 *  2. Otherwise the recorder: the clip plays hidden, each frame is drawn cut and scaled on a canvas, the canvas and the
 *     clip's sound are recorded (MediaRecorder) — real time; MP4 where the browser records it, WebM otherwise.
 * `videoEditPath()` in media.ts says up front which one the device has (null: the clip goes as picked). */
import {baseMime,openVideo,recorderMime,videoEditPath} from './media';
import {LONG_SIDE,outSize,videoBitrate,type EditJob} from './video-size';

export type Made={file:File,path:'webcodecs'|'recorder'};
const abortErr=()=>new DOMException('cancelled','AbortError');
const named=(src:File,blob:Blob,mime:string)=>new File([blob],src.name.replace(/\.[^.]+$/,'')+(mime==='video/webm'?'.webm':'.mp4'),{type:mime});

/** WebCodecs in a worker. Resolves null when the device cannot do it this way (the recorder is tried next). */
function inWorker(job:EditJob,onProgress:(p:number)=>void,signal?:AbortSignal):Promise<{buf:ArrayBuffer,mime:string}|null|'no-worker'>{
 return new Promise((res,rej)=>{
  let w:Worker;
  try{w=new Worker(new URL('./video-worker.ts',import.meta.url),{type:'module'});}catch{res('no-worker');return;}
  let started=false;
  const end=()=>{signal?.removeEventListener('abort',stop);w.terminate();};
  const stop=()=>{end();rej(abortErr());};
  if(signal?.aborted){stop();return;}
  signal?.addEventListener('abort',stop);
  w.onerror=e=>{e.preventDefault();end();if(!started)res('no-worker');else rej(new Error('video'));};
  w.onmessage=(e:MessageEvent)=>{const m=e.data as {type:string,p?:number,buf?:ArrayBuffer,mime?:string,message?:string};
   if(m.type==='ready'){started=true;w.postMessage(job);return;}
   if(m.type==='progress'){onProgress(m.p??0);return;}
   end();
   if(m.type==='done')res({buf:m.buf!,mime:m.mime!});
   else if(m.type==='unsupported')res(null);
   else rej(new Error(m.message||'video'));};
 });
}
async function onPage(job:EditJob,onProgress:(p:number)=>void,signal?:AbortSignal){
 const {Unsupported,encodeVideo}=await import('./video-encode');
 if(signal?.aborted)throw abortErr();
 try{return await Promise.race([encodeVideo(job,onProgress),new Promise<never>((_,rej)=>signal?.addEventListener('abort',()=>rej(abortErr())))]);}
 catch(e){if(e instanceof Unsupported)return null;throw e;}
}

/** One sound graph per page, opened on the tap that sends (Safari lets sound start only from a tap). */
let audioCtx:AudioContext|null=null;
export function primeAudio(){
 try{const A=window.AudioContext??(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
  if(!A)return;audioCtx??=new A();void audioCtx.resume().catch(()=>{});}catch{/* no sound graph: the recorder records the picture only */}
}

async function record(job:EditJob,onProgress:(p:number)=>void,signal?:AbortSignal):Promise<{blob:Blob,mime:string}>{
 const mime=recorderMime();if(!mime)throw new Error('unsupported');
 const o=await openVideo(job.file);const v=o.v;
 const W=v.videoWidth,H=v.videoHeight;const r=job.crop??{sx:0,sy:0,sw:W,sh:H};
 const {w,h}=outSize(r.sw,r.sh,LONG_SIDE);
 const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');if(!g)throw new Error('canvas');
 const start=(job.trim?.startMs??0)/1000,end=job.trim?job.trim.endMs/1000:o.length;
 const stream=c.captureStream(30);
 // The clip's sound goes into the recording only (never to the speaker).
 if(!audioCtx)primeAudio();
 let node:MediaElementAudioSourceNode|null=null;
 try{if(audioCtx){node=audioCtx.createMediaElementSource(v);const dest=audioCtx.createMediaStreamDestination();node.connect(dest);
  dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));v.muted=false;}}catch{node=null;v.muted=true;}
 const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:videoBitrate(w,h),audioBitsPerSecond:128_000});
 const parts:Blob[]=[];rec.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
 const cleanup=()=>{try{node?.disconnect();}catch{/* gone */}stream.getTracks().forEach(t=>t.stop());v.pause();URL.revokeObjectURL(o.src);v.removeAttribute('src');v.load();};
 try{
  await new Promise<void>((res,rej)=>{const t=setTimeout(()=>rej(new Error('seek')),10000);v.onseeked=()=>{clearTimeout(t);v.onseeked=null;res();};v.currentTime=start;});
  return await new Promise((res,rej)=>{
   let done=false;
   const vfc=(v as HTMLVideoElement&{requestVideoFrameCallback?:(cb:()=>void)=>number}).requestVideoFrameCallback?.bind(v);
   const draw=()=>{if(done)return;g.drawImage(v,r.sx,r.sy,r.sw,r.sh,0,0,w,h);onProgress(Math.max(0,Math.min(1,(v.currentTime-start)/Math.max(.1,end-start))));
    if(v.currentTime>=end-.02||v.ended){finish();return;}if(vfc)vfc(draw);else requestAnimationFrame(draw);};
   const finish=()=>{if(done)return;done=true;v.pause();rec.onstop=()=>res({blob:new Blob(parts,{type:baseMime(mime)}),mime:baseMime(mime)});rec.stop();};
   const abort=()=>{if(done)return;done=true;rec.onstop=null;try{rec.stop();}catch{/* idle */}rej(abortErr());};
   if(signal?.aborted){abort();return;}
   signal?.addEventListener('abort',abort,{once:true});
   v.onended=finish;
   g.drawImage(v,r.sx,r.sy,r.sw,r.sh,0,0,w,h);
   rec.start(1000);
   v.play().then(()=>{if(vfc)vfc(draw);else requestAnimationFrame(draw);}).catch(async()=>{
    // Sound refused without a tap: record the picture only.
    v.muted=true;try{await v.play();if(vfc)vfc(draw);else requestAnimationFrame(draw);}catch{done=true;try{rec.stop();}catch{/* idle */}rej(new Error('play'));}});
  });
 }finally{cleanup();}
}

/** Makes the clip to send. Rejects with an AbortError on cancel, with Error('unsupported') when the device has no way
 * to make it, with another error when this clip could not be made. */
export async function makeVideo(job:EditJob,{onProgress,signal}:{onProgress:(p:number)=>void,signal?:AbortSignal}):Promise<Made>{
 // No H.264 encoder at all (videoEditPath): straight to the recorder, without loading the WebCodecs code.
 let got:{buf:ArrayBuffer,mime:string}|null=null;
 if(await videoEditPath()==='webcodecs'){const w=await inWorker(job,onProgress,signal);got=w==='no-worker'?await onPage(job,onProgress,signal):w;}
 if(got)return {file:named(job.file,new Blob([got.buf],{type:got.mime}),got.mime),path:'webcodecs'};
 onProgress(0);
 const r=await record(job,onProgress,signal);
 return {file:named(job.file,r.blob,r.mime),path:'recorder'};
}
