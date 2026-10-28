import {useCallback,useEffect,useRef,useState,type CSSProperties,type PointerEvent as RPointerEvent} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ChevronLeft,Lock,Mic,Pause,Play,SendHorizontal,Square,Trash2} from 'lucide-react';
import {IconBtn} from './index';
import {VOICE_MAX_MS,baseMime,fmtDur,voiceMime} from './media';

/** Video and voice (owner, 28.10.2026). Clips and voice notes come as short signed links (mediaDto `src.file`); the
 * players never offer a download, picture-in-picture or remote playback — no more than photos can be saved. */

const noMenu=(e:{preventDefault:()=>void})=>e.preventDefault();

/** Play mark with the clip length, over a poster in grids, cells and tiles. */
export function VideoBadge({durationMs}:{durationMs?:number|null|undefined}){
 return <span className="k-vbadge" aria-hidden="true"><Play/>{durationMs?fmtDur(durationMs):null}</span>;
}

/** A clip: its poster with a round play button and the length; a tap plays it in place with the system controls
 * (no download). `autoPlay` starts at once (the full-screen viewer). Without `src` (still checked, covered) only the
 * poster shows. `onExpired`: the signed link ran out — the screen asks for fresh links. */
export function VideoPlayer({src,poster,w,h,durationMs,autoPlay,fill,onExpired,label}:{src?:string|null|undefined,poster?:string|null|undefined,
 w?:number|null|undefined,h?:number|null|undefined,durationMs?:number|null|undefined,autoPlay?:boolean|undefined,
 /** Fill the parent (viewer slide) instead of keeping the clip's own shape. */ fill?:boolean|undefined,onExpired?:(()=>void)|undefined,label?:string|undefined}){
 const {t}=useI18n();const [on,setOn]=useState(!!autoPlay&&!!src);const failed=useRef(false);
 const style=!fill&&w&&h?{'--ar':`${w}/${h}`} as CSSProperties:undefined;
 return <div className={'k-video'+(fill?' fill':'')} style={style} onContextMenu={noMenu}>
  {on&&src?<video src={src} poster={poster??undefined} controls autoPlay playsInline controlsList="nodownload noremoteplayback noplaybackrate" disablePictureInPicture
   aria-label={label??t('fe.kit.av.video')} onError={()=>{if(failed.current)return;failed.current=true;setOn(false);onExpired?.();}}/>
   :<>{poster?<img src={poster} alt="" draggable={false}/>:<span className="k-vnone"/>}
    {src?<button type="button" className="k-vplay" aria-label={t('fe.kit.av.play')+(durationMs?' · '+fmtDur(durationMs):'')} onClick={e=>{e.stopPropagation();failed.current=false;setOn(true);}}><Play/></button>
     :<VideoBadge durationMs={durationMs}/>}
    {src&&durationMs?<span className="k-vdur">{fmtDur(durationMs)}</span>:null}</>}
 </div>;
}

/* ---------------- voice ---------------- */
/** 48 bars, levels 0…31 (what the server stores). */
const BARS=48;
function squeeze(levels:number[],n=BARS):number[]{
 if(!levels.length)return [];
 const out:number[]=[];for(let i=0;i<n;i++){const a=Math.floor(i*levels.length/n),b=Math.max(a+1,Math.floor((i+1)*levels.length/n));
  let m=0;for(let k=a;k<b&&k<levels.length;k++)m=Math.max(m,levels[k]!);out.push(m);}
 const top=Math.max(1,...out);return out.map(v=>Math.round(v/top*31));
}
function Wave({peaks,frac,onSeek}:{peaks:number[],frac:number,onSeek?:((f:number)=>void)|undefined}){
 const bars=peaks.length?peaks:Array.from({length:BARS},()=>6);
 return <span className={'k-wave'+(onSeek?' seek':'')} aria-hidden="true"
  onClick={onSeek?e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();onSeek(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)));}:undefined}>
  {bars.map((p,i)=><i key={i} className={i/bars.length<frac?'on':undefined} style={{'--h':String(Math.max(2,p)/31)} as CSSProperties}/>)}
 </span>;
}

/** A voice message in a bubble: play / pause, the waveform filling as it plays (a tap on it seeks), the time. The
 * recipient sees a dot until they played it (`listened`); the sender sees «прослушано». `onPlayed` fires once when a
 * recipient has heard most of it. Without `src` (still on its way) it shows the length only. */
export function VoiceBubble({src,durationMs,peaks,mine,listened,onPlayed,onExpired}:{src?:string|null|undefined,durationMs?:number|null|undefined,
 peaks?:number[]|null|undefined,mine?:boolean|undefined,listened?:boolean|undefined,onPlayed?:(()=>void)|undefined,onExpired?:(()=>void)|undefined}){
 const {t}=useI18n();const a=useRef<HTMLAudioElement>(null);const [playing,setPlaying]=useState(false);const [pos,setPos]=useState(0);
 const told=useRef(false);const failed=useRef(false);
 const total=Math.max(1,durationMs??0)/1000;
 const toggle=()=>{const el=a.current;if(!el||!src)return;if(el.paused){void el.play().catch(()=>setPlaying(false));}else el.pause();};
 const seek=(f:number)=>{const el=a.current;if(!el||!src)return;el.currentTime=f*total;setPos(el.currentTime);};
 const tick=()=>{const el=a.current;if(!el)return;setPos(el.currentTime);
  if(!told.current&&!mine&&el.currentTime>=Math.min(total*.8,total-.5)){told.current=true;onPlayed?.();}};
 useEffect(()=>()=>a.current?.pause(),[]);
 const frac=Math.min(1,pos/total);
 return <div className={'k-voice'+(mine?' mine':'')+(src?'':' wait')} onContextMenu={noMenu}>
  <IconBtn icon={playing?Pause:Play} kind="send" size="sm" label={playing?t('fe.kit.av.pause'):t('fe.kit.av.listen')} disabled={!src} onClick={e=>{e.stopPropagation();toggle();}}/>
  <span className="k-vbody">
   <Wave peaks={peaks??[]} frac={frac} onSeek={src?seek:undefined}/>
   <span className="k-vmeta"><span>{playing||pos>0?fmtDur(pos*1000):fmtDur(durationMs)}</span>
    {mine?(listened?<span className="k-vheard">{t('fe.kit.av.listened')}</span>:null):(!listened&&<i className="k-vdot" aria-label={t('fe.kit.av.new')}/>)}</span>
  </span>
  {src&&<audio ref={a} src={src} preload="metadata" controlsList="nodownload"
   onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>{setPlaying(false);setPos(0);if(!told.current&&!mine){told.current=true;onPlayed?.();}}}
   onTimeUpdate={tick} onError={()=>{if(failed.current)return;failed.current=true;setPlaying(false);onExpired?.();}}/>}
 </div>;
}

export type Voice={blob:Blob,mime:string,durationMs:number,peaks:number[]};
type RecState='idle'|'asking'|'hold'|'locked'|'review';

/** The microphone button of a chat's message bar. Hold to record; slide left to cancel, slide up (or tap the lock) to
 * keep recording hands-free; release to send. A short tap also starts a hands-free recording. Hands-free shows ✕, a
 * stop button and then the recording to listen to before «Отправить». The microphone is asked for only on the first
 * press; `onError('denied' | 'unsupported' | 'short')` lets the screen explain. Up to five minutes. */
export function VoiceRecorder({onSend,onError,disabled,maxMs=VOICE_MAX_MS}:{onSend:(v:Voice)=>void,onError:(why:'denied'|'unsupported'|'short'|'failed')=>void,
 disabled?:boolean|undefined,maxMs?:number|undefined}){
 const {t}=useI18n();
 const [st,setSt]=useState<RecState>('idle');const stRef=useRef<RecState>('idle');const set=(s:RecState)=>{stRef.current=s;setSt(s);};
 const [ms,setMs]=useState(0);const [drag,setDrag]=useState({x:0,y:0});const [level,setLevel]=useState(0);
 const rec=useRef<{mr:MediaRecorder,stream:MediaStream,ctx:AudioContext|null,chunks:Blob[],levels:number[],t0:number,timer:ReturnType<typeof setInterval>,mime:string,send:boolean,cancel:boolean}|null>(null);
 const start=useRef<{x:number,y:number,at:number}|null>(null);
 const [review,setReview]=useState<(Voice&{url:string})|null>(null);
 const cleanup=useCallback(()=>{const r=rec.current;if(!r)return;clearInterval(r.timer);r.stream.getTracks().forEach(x=>x.stop());void r.ctx?.close().catch(()=>{});rec.current=null;},[]);
 useEffect(()=>()=>{const r=rec.current;if(r){r.cancel=true;try{r.mr.stop();}catch{/* already stopped */}}cleanup();},[cleanup]);
 useEffect(()=>()=>{if(review)URL.revokeObjectURL(review.url);},[review]);
 const finish=(send:boolean)=>{const r=rec.current;if(!r)return;r.send=send;r.cancel=!send&&stRef.current!=='locked';
  if(r.mr.state!=='inactive')r.mr.stop();};
 const cancel=()=>{const r=rec.current;if(r){r.cancel=true;r.send=false;if(r.mr.state!=='inactive')r.mr.stop();}else{set('idle');}setReview(null);};
 const begin=async(locked:boolean)=>{
  const mime=voiceMime();
  if(mime===null||!navigator.mediaDevices?.getUserMedia){onError('unsupported');return;}
  set('asking');
  let stream:MediaStream;
  try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});}
  catch(e){set('idle');onError(e instanceof DOMException&&(e.name==='NotAllowedError'||e.name==='SecurityError')?'denied':'failed');return;}
  let mr:MediaRecorder;
  try{mr=mime?new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:32000}):new MediaRecorder(stream);}
  catch{stream.getTracks().forEach(x=>x.stop());set('idle');onError('unsupported');return;}
  // Live level for the meter and the stored waveform (sampled ten times a second).
  let ctx:AudioContext|null=null;let an:AnalyserNode|null=null;
  try{ctx=new AudioContext();an=ctx.createAnalyser();an.fftSize=512;ctx.createMediaStreamSource(stream).connect(an);}catch{ctx=null;an=null;}
  const buf=new Uint8Array(512);const levels:number[]=[];const t0=Date.now();
  const timer=setInterval(()=>{
   const el=Date.now()-t0;setMs(el);
   if(an){an.getByteTimeDomainData(buf);let m=0;for(const v of buf)m=Math.max(m,Math.abs(v-128));levels.push(m);setLevel(m/128);}
   if(el>=maxMs)finish(stRef.current==='hold');
  },100);
  const r={mr,stream,ctx,chunks:[] as Blob[],levels,t0,timer,mime:baseMime(mr.mimeType||mime||'audio/webm'),send:false,cancel:false};rec.current=r;
  mr.ondataavailable=e=>{if(e.data.size)r.chunks.push(e.data);};
  mr.onstop=()=>{
   const durationMs=Date.now()-r.t0;const blob=new Blob(r.chunks,{type:r.mime});const peaks=squeeze(r.levels);const wasLocked=stRef.current==='locked';
   cleanup();setMs(0);setDrag({x:0,y:0});
   if(r.cancel){set('idle');return;}
   if(durationMs<700||!blob.size){set('idle');onError('short');return;}
   const v={blob,mime:r.mime,durationMs:Math.min(durationMs,maxMs),peaks};
   if(r.send){set('idle');onSend(v);return;}
   if(wasLocked){setReview({...v,url:URL.createObjectURL(blob)});set('review');return;}
   set('idle');
  };
  mr.start(250);
  // Released while the browser was asking for the microphone: keep recording hands-free.
  set(locked||!start.current?'locked':'hold');
 };
 const down=(e:RPointerEvent<HTMLButtonElement>)=>{
  if(disabled||stRef.current!=='idle'||e.button!==0)return;
  e.currentTarget.setPointerCapture?.(e.pointerId);start.current={x:e.clientX,y:e.clientY,at:Date.now()};void begin(false);
 };
 const move=(e:RPointerEvent<HTMLButtonElement>)=>{
  const s=start.current;if(!s||stRef.current!=='hold')return;
  const x=Math.min(0,e.clientX-s.x),y=Math.min(0,e.clientY-s.y);setDrag({x,y});
  if(x<-90){start.current=null;cancel();}
  else if(y<-70){start.current=null;set('locked');setDrag({x:0,y:0});}
 };
 const up=()=>{
  const s=start.current;start.current=null;
  if(stRef.current==='hold'){
   // A short tap: hands-free instead of a too-short message.
   if(s&&Date.now()-s.at<350){set('locked');setDrag({x:0,y:0});return;}
   finish(true);
  }
 };
 const active=st==='hold'||st==='locked'||st==='asking';
 return <span className="k-recw">
  <IconBtn icon={Mic} kind="send" label={t('fe.kit.av.record')} disabled={disabled} aria-pressed={active}
   className={st==='hold'?'k-recon':undefined} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{start.current=null;if(stRef.current==='hold')cancel();}}
   onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&stRef.current==='idle'){e.preventDefault();start.current=null;void begin(true);}}}
   onClick={e=>e.preventDefault()}/>
  {(active||st==='review')&&<div className={'k-rec '+st} role="group" aria-label={t('fe.kit.av.recording')}>
   {st==='review'&&review?<>
    <IconBtn icon={Trash2} kind="ghost" label={t('fe.kit.av.discard')} onClick={()=>{setReview(null);set('idle');}}/>
    <VoiceBubble src={review.url} durationMs={review.durationMs} peaks={review.peaks} mine/>
    <IconBtn icon={SendHorizontal} kind="send" label={t('fe.kit.av.send')} onClick={()=>{const v=review;setReview(null);set('idle');onSend({blob:v.blob,mime:v.mime,durationMs:v.durationMs,peaks:v.peaks});}}/>
   </>:<>
    {st==='locked'&&<IconBtn icon={Trash2} kind="ghost" label={t('fe.kit.av.discard')} onClick={cancel}/>}
    <span className="k-rdot" style={{'--lv':level.toFixed(2)} as CSSProperties} aria-hidden="true"/>
    <span className="k-rtime" aria-live="off">{fmtDur(ms)}</span>
    {st==='hold'?<span className="k-rhint" style={{'--dx':drag.x+'px'} as CSSProperties}><ChevronLeft/>{t('fe.kit.av.slideCancel')}</span>
     :st==='asking'?<span className="k-rhint">{t('fe.kit.av.asking')}</span>
     :<span className="k-rhint">{t('fe.kit.av.locked')}</span>}
    {st==='hold'&&<span className="k-rlock" style={{'--dy':drag.y+'px'} as CSSProperties} aria-hidden="true"><Lock/></span>}
    {st==='locked'&&<IconBtn icon={Square} kind="ghost" label={t('fe.kit.av.stop')} onClick={()=>finish(false)}/>}
    {st==='locked'&&<IconBtn icon={SendHorizontal} kind="send" label={t('fe.kit.av.send')} onClick={()=>finish(true)}/>}
   </>}
  </div>}
 </span>;
}
