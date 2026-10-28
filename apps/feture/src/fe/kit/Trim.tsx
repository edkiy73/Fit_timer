import {useEffect,useRef,useState,type CSSProperties,type KeyboardEvent as RKeyboardEvent,type PointerEvent as RPointerEvent} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Pause,Play} from 'lucide-react';
import {Btn,Note,Sheet} from './index';
import {ASPECTS,TRIM_MIN_MS,VIDEO_MAX_MS,clipBox,filmstrip,fmtDurFine,type ClipCrop} from './media';

const FRAMES=8;
/** The trim sheet (owner, 28.10.2026): the clip on top (in its crop when there is one) playing the chosen part in a
 * loop, a filmstrip under it with two handles — drag an edge, or the window between them to move it; arrows move a
 * focused handle by 0.1 s (with Shift by 1 s). The part is 1 s … 1 min, so a longer clip (up to 10 min) always keeps
 * at most a minute. «Всё видео» («Первая минута» for a longer clip) resets, «Применить» returns it (null = the whole
 * clip). Only this part is sent: the uploader cuts and compresses it on the device (kit/video-edit.ts). */
export function TrimSheet({file,durationMs,initial,crop,onApply,onClose}:{file:File,durationMs:number,initial?:{startMs:number,endMs:number}|undefined,
 crop?:ClipCrop|undefined,onApply:(t:{startMs:number,endMs:number}|null)=>void,onClose:()=>void}){
 const {t}=useI18n();const D=Math.max(TRIM_MIN_MS,durationMs);const MAX=Math.min(D,VIDEO_MAX_MS);
 const [a,setA]=useState(initial?.startMs??0);const [b,setB]=useState(Math.min(initial?.endMs??MAX,D));
 const [frames,setFrames]=useState<string[]>([]);const [src,setSrc]=useState('');const [nat,setNat]=useState<number|null>(null);
 const [playing,setPlaying]=useState(false);const [at,setAt]=useState(a);
 const v=useRef<HTMLVideoElement>(null);const strip=useRef<HTMLDivElement>(null);const span=useRef<[number,number]>([a,b]);span.current=[a,b];
 useEffect(()=>{const u=URL.createObjectURL(file);setSrc(u);let live=true;let got:string[]=[];
  filmstrip(file,FRAMES).then(f=>{got=f;if(live)setFrames(f);else f.forEach(x=>URL.revokeObjectURL(x));}).catch(()=>{});
  return ()=>{live=false;URL.revokeObjectURL(u);got.forEach(x=>URL.revokeObjectURL(x));};},[file]);
 // Plays the chosen part in a loop.
 useEffect(()=>{let r=0;const step=()=>{const el=v.current;if(el){const [s,e]=span.current;
   if(el.currentTime*1000>=e-30||el.currentTime*1000<s-200)el.currentTime=s/1000;setAt(el.currentTime*1000);}
  r=requestAnimationFrame(step);};
  if(playing)r=requestAnimationFrame(step);return ()=>cancelAnimationFrame(r);},[playing]);
 const show=(ms:number)=>{const el=v.current;if(el){el.currentTime=ms/1000;setAt(ms);}};
 const clamp=(na:number,nb:number,moved:'a'|'b'|'both')=>{
  if(moved==='both'){const len=nb-na;na=Math.max(0,Math.min(D-len,na));return [na,na+len] as const;}
  na=Math.max(0,Math.min(na,D));nb=Math.max(0,Math.min(nb,D));
  if(moved==='a'){na=Math.min(na,nb-TRIM_MIN_MS);na=Math.max(na,nb-MAX,0);}
  else{nb=Math.max(nb,na+TRIM_MIN_MS);nb=Math.min(nb,na+MAX,D);}
  return [na,nb] as const;
 };
 const set=(na:number,nb:number,moved:'a'|'b'|'both')=>{const [x,y]=clamp(Math.round(na),Math.round(nb),moved);setA(x);setB(y);show(moved==='b'?y:x);};
 const drag=useRef<{what:'a'|'b'|'both',x:number,a:number,b:number}|null>(null);
 const msPerPx=()=>D/Math.max(1,strip.current?.clientWidth??1);
 const down=(what:'a'|'b'|'both')=>(e:RPointerEvent<HTMLElement>)=>{e.stopPropagation();e.currentTarget.setPointerCapture?.(e.pointerId);
  v.current?.pause();drag.current={what,x:e.clientX,a,b};};
 const move=(e:RPointerEvent<HTMLElement>)=>{const d=drag.current;if(!d)return;const dm=(e.clientX-d.x)*msPerPx();
  if(d.what==='a')set(d.a+dm,d.b,'a');else if(d.what==='b')set(d.a,d.b+dm,'b');else set(d.a+dm,d.b+dm,'both');};
 const up=()=>{drag.current=null;};
 const key=(what:'a'|'b')=>(e:RKeyboardEvent<HTMLElement>)=>{
  const k=e.shiftKey?1000:100;const d=e.key==='ArrowLeft'||e.key==='ArrowDown'?-k:e.key==='ArrowRight'||e.key==='ArrowUp'?k:0;
  if(e.key==='Home'||e.key==='End'){e.preventDefault();if(what==='a')set(e.key==='Home'?0:b-TRIM_MIN_MS,b,'a');else set(a,e.key==='End'?D:a+TRIM_MIN_MS,'b');return;}
  if(!d)return;e.preventDefault();if(what==='a')set(a+d,b,'a');else set(a,b+d,'b');
 };
 const toggle=()=>{const el=v.current;if(!el)return;if(el.paused){if(el.currentTime*1000<a||el.currentTime*1000>=b-30)el.currentTime=a/1000;void el.play().catch(()=>{});}else el.pause();};
 const pc=(ms:number)=>`${(ms/D*100).toFixed(3)}%`;
 const box=crop&&nat?clipBox(nat,crop):null;const [aw,ah]=crop?ASPECTS[crop.aspect]:[0,0];
 const prev={...(crop?{'--ar':`${aw}/${ah}`}:nat?{'--ar':nat.toFixed(4)}:{}),...(box?{'--vw':box.w+'%','--vh':box.h+'%','--vx':box.x+'%','--vy':box.y+'%'}:{})} as CSSProperties;
 const long=D>MAX;const whole=a===0&&b>=Math.min(D,MAX);
 return <Sheet title={t('fe.kit.trim.title')} sub={t('fe.kit.trim.hint')} full onClose={onClose}
  foot={<div className="row g8"><Btn kind="soft" fit disabled={whole} onClick={()=>{setA(0);setB(Math.min(D,MAX));show(0);}}>{t(long?'fe.kit.trim.resetLong':'fe.kit.trim.reset')}</Btn>
   <Btn onClick={()=>onApply(a<=0&&b>=D?null:{startMs:a,endMs:b})}>{t('fe.kit.trim.apply')}</Btn></div>}>
  <div className="k-trim">
   <div className={'k-video k-trim-prev'+(crop?' crop':'')+(playing?' playing on':' on')} style={prev} onClick={toggle}>
    {src&&<video ref={v} src={src} muted playsInline preload="auto" disablePictureInPicture
     onLoadedMetadata={e=>{const el=e.currentTarget;if(el.videoWidth)setNat(el.videoWidth/el.videoHeight);el.currentTime=a/1000;}}
     onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)}/>}
    <button type="button" className="k-vplay" aria-label={playing?t('fe.kit.av.pause'):t('fe.kit.av.play')} onClick={e=>{e.stopPropagation();toggle();}}>{playing?<Pause/>:<Play/>}</button>
   </div>
   <div ref={strip} className="k-trim-strip" style={{'--a':pc(a),'--b':pc(b),'--at':pc(at)} as CSSProperties} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
    <div className="k-trim-frames" aria-hidden="true">{(frames.length?frames:Array.from({length:FRAMES},()=>'')).map((f,i)=>f?<img key={i} src={f} alt="" draggable={false}/>:<i key={i} className="sk"/>)}</div>
    <i className="k-trim-dim l" aria-hidden="true"/><i className="k-trim-dim r" aria-hidden="true"/>
    <div className="k-trim-win" onPointerDown={down('both')}>
     <span className="k-trim-h l" role="slider" tabIndex={0} aria-label={t('fe.kit.trim.start')} aria-valuemin={0} aria-valuemax={Math.round(D/1000)} aria-valuenow={Math.round(a/1000)}
      aria-valuetext={fmtDurFine(a)} onPointerDown={down('a')} onKeyDown={key('a')}/>
     <span className="k-trim-h r" role="slider" tabIndex={0} aria-label={t('fe.kit.trim.end')} aria-valuemin={0} aria-valuemax={Math.round(D/1000)} aria-valuenow={Math.round(b/1000)}
      aria-valuetext={fmtDurFine(b)} onPointerDown={down('b')} onKeyDown={key('b')}/>
    </div>
    {playing&&<i className="k-trim-at" aria-hidden="true"/>}
   </div>
   <div className="k-trim-meta"><span>{fmtDurFine(a)}</span><b aria-live="polite">{t('fe.kit.trim.length').replace('{dur}',fmtDurFine(b-a))}</b><span>{fmtDurFine(b)}</span></div>
   <Note>{t('fe.kit.trim.note')}</Note>
  </div>
 </Sheet>;
}
