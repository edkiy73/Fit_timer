import {useCallback,useEffect,useRef,useState,type CSSProperties} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Search} from 'lucide-react';
import {Btn,Range,Sheet} from './index';
import {ASPECTS,NO_CROP,type Aspect,type Crop} from './media';

/** The crop sheet, fixed format: the photo under a fixed frame (4:5, 1:1, 16:9); drag moves it, two fingers / wheel / slider zoom
 * (1–3×). «Сбросить» centres it, «Применить» returns the placement — cropPhoto() cuts the same frame; for a clip the
 * picture is its frame at the trim start and the placement is stored with it (players apply it, kit/media.ts clipBox). */
type Props={src:string,initial?:Crop|undefined,onApply:(c:Crop)=>void,onClose:()=>void,
 /** The line under the title (a clip's frame says it is applied when it plays). */ hint?:string|undefined};
/** One crop sheet for every place that frames a photo (uploader: posts, profile, gallery, covers, chats; a clip's frame). */
export function CropSheet({aspect,...p}:Props&{aspect:Aspect}){return aspect==='orig'?<FreeCrop {...p}/>:<FixedCrop aspect={aspect} {...p}/>;}

function FixedCrop({src,aspect,initial=NO_CROP,onApply,onClose,hint}:Props&{aspect:Exclude<Aspect,'orig'>}){
 const {t}=useI18n();
 const [st,setSt]=useState<Crop>(initial);const [box,setBox]=useState({w:0,h:0});const [nat,setNat]=useState({w:0,h:0});
 // The sheet renders through a portal a frame later, so the frame is measured when it appears (callback ref).
 const boxRef=useRef<HTMLDivElement|null>(null);const ro=useRef<ResizeObserver|null>(null);
 const frame=useCallback((el:HTMLDivElement|null)=>{ro.current?.disconnect();boxRef.current=el;if(!el)return;
  ro.current=new ResizeObserver(()=>setBox({w:el.clientWidth,h:el.clientHeight}));ro.current.observe(el);},[]);
 // Keep the frame covered: the shift is limited by how much the scaled photo overhangs the frame.
 const fit=(c:Crop):Crop=>{
  if(!box.w||!nat.w)return c;const base=Math.max(box.w/nat.w,box.h/nat.h);const w=nat.w*base*c.z,h=nat.h*base*c.z;
  const mx=(w-box.w)/2/w,my=(h-box.h)/2/h;return {z:c.z,x:Math.max(-mx,Math.min(mx,c.x)),y:Math.max(-my,Math.min(my,c.y))};
 };
 const base=nat.w&&box.w?Math.max(box.w/nat.w,box.h/nat.h):0;const w=nat.w*base*st.z,h=nat.h*base*st.z;
 const pts=useRef(new Map<number,[number,number]>());const last=useRef<[number,number]|null>(null);const pinch=useRef<{d:number,z:number}|null>(null);
 const down=(e:React.PointerEvent)=>{e.currentTarget.setPointerCapture(e.pointerId);pts.current.set(e.pointerId,[e.clientX,e.clientY]);last.current=[e.clientX,e.clientY];
  if(pts.current.size===2){const [a,b]=[...pts.current.values()];pinch.current={d:Math.hypot(a![0]-b![0],a![1]-b![1]),z:st.z};}};
 const move=(e:React.PointerEvent)=>{if(!pts.current.has(e.pointerId)||!w)return;pts.current.set(e.pointerId,[e.clientX,e.clientY]);
  if(pts.current.size===2&&pinch.current){const [a,b]=[...pts.current.values()];const z=Math.max(1,Math.min(3,pinch.current.z*Math.hypot(a![0]-b![0],a![1]-b![1])/pinch.current.d));setSt(c=>fit({...c,z}));return;}
  const l=last.current;if(!l)return;const dx=(e.clientX-l[0])/w,dy=(e.clientY-l[1])/h;last.current=[e.clientX,e.clientY];setSt(c=>fit({...c,x:c.x+dx,y:c.y+dy}));};
 const up=(e:React.PointerEvent)=>{pts.current.delete(e.pointerId);if(pts.current.size<2)pinch.current=null;const r=[...pts.current.values()][0];if(r)last.current=r;};
 useEffect(()=>{const el=boxRef.current;if(!el)return;const wheel=(e:WheelEvent)=>{e.preventDefault();setSt(c=>fit({...c,z:Math.max(1,Math.min(3,c.z-e.deltaY*.002))}));};
  el.addEventListener('wheel',wheel,{passive:false});return ()=>el.removeEventListener('wheel',wheel);});
 const [aw,ah]=ASPECTS[aspect];
 const vars={'--k-ar':`${aw}/${ah}`,'--k-w':`${w}px`,'--k-h':`${h}px`,'--k-tx':`${(box.w-w)/2+st.x*w}px`,'--k-ty':`${(box.h-h)/2+st.y*h}px`} as CSSProperties;
 return <Sheet title={t('fe.kit.crop.title')} sub={hint??t('fe.kit.crop.hint')} full onClose={onClose}
  foot={<div className="row g8"><Btn kind="soft" fit onClick={()=>setSt(NO_CROP)}>{t('fe.kit.crop.reset')}</Btn><Btn onClick={()=>onApply(fit(st))}>{t('fe.kit.crop.apply')}</Btn></div>}>
  <div ref={frame} className="k-crop" style={vars} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
   <img ref={el=>{if(el?.complete&&el.naturalWidth&&!nat.w)setNat({w:el.naturalWidth,h:el.naturalHeight});}} src={src} alt="" draggable={false}
    onLoad={e=>setNat({w:e.currentTarget.naturalWidth,h:e.currentTarget.naturalHeight})}/>
   <CropFrame/>
  </div>
  <label className="k-crop-zoom"><Search/><Range label={t('fe.kit.crop.zoom')} min={1} max={3} step={.01} value={st.z} onChange={z=>setSt(c=>fit({...c,z}))}/></label>
 </Sheet>;
}

/** The frame drawn over the photo: a border on all four sides and the thirds guides — always inside its box, so it shows
 * whatever the pan, zoom or photo size is. `free` adds the drag handles (borders and corners). */
function CropFrame({free,style}:{free?:boolean,style?:CSSProperties|undefined}){
 return <div className={'k-crop-frame'+(free?' free':'')} style={style} aria-hidden="true" data-crop-frame="">
  <div className="k-crop-grid"><i/><i/><i/><i/></div>
  {free&&HANDLES.map(h=><b key={h} className={'k-crop-h '+h} data-h={h}/>)}
 </div>;
}
const HANDLES=['nw','n','ne','e','se','s','sw','w'] as const;
type Fr={l:number,t:number,r:number,b:number};
const MIN=44;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));

/** Free format («Свой»): any proportions. The frame is dragged by its borders and corners; the photo moves under it
 * with a finger, zoom (1–3×) with the slider, two fingers or the wheel. The frame stays inside the photo and the sheet.
 * Returns the frame as a share of the photo (`rect`). */
function FreeCrop({src,initial,onApply,onClose,hint}:Props){
 const {t}=useI18n();
 const [box,setBox]=useState({w:0,h:0});const [nat,setNat]=useState({w:0,h:0});
 const [v,setV]=useState({z:1,ox:0,oy:0});const [fr,setFr]=useState<Fr|null>(null);
 const boxRef=useRef<HTMLDivElement|null>(null);const ro=useRef<ResizeObserver|null>(null);
 const frame=useCallback((el:HTMLDivElement|null)=>{ro.current?.disconnect();boxRef.current=el;if(!el)return;
  ro.current=new ResizeObserver(()=>setBox({w:el.clientWidth,h:el.clientHeight}));ro.current.observe(el);},[]);
 const ready=!!(box.w&&nat.w);
 // The photo's rectangle in the box for a view.
 const imgOf=(z:number,ox:number,oy:number)=>{const s=Math.min(box.w/nat.w,box.h/nat.h)*z;const iw=nat.w*s,ih=nat.h*s;
  return {L:box.w/2+ox-iw/2,T:box.h/2+oy-ih/2,iw,ih};};
 const img=ready?imgOf(v.z,v.ox,v.oy):null;
 // Where the frame may be: on the photo and inside the box.
 const bounds=(i:NonNullable<typeof img>):Fr=>({l:Math.max(0,i.L),t:Math.max(0,i.T),r:Math.min(box.w,i.L+i.iw),b:Math.min(box.h,i.T+i.ih)});
 const fitFr=(f:Fr,i:NonNullable<typeof img>):Fr=>{const b=bounds(i);
  const l=clamp(f.l,b.l,Math.max(b.l,b.r-MIN)),t=clamp(f.t,b.t,Math.max(b.t,b.b-MIN));
  return {l,t,r:clamp(f.r,Math.min(b.r,l+MIN),b.r),b:clamp(f.b,Math.min(b.b,t+MIN),b.b)};};
 // The photo must keep covering the frame: limit the shift.
 const fitView=(z:number,ox:number,oy:number,f:Fr)=>{const i=imgOf(z,ox,oy);
  const dx=Math.min(0,f.l-i.L)+Math.max(0,f.r-(i.L+i.iw)),dy=Math.min(0,f.t-i.T)+Math.max(0,f.b-(i.T+i.ih));
  return {z,ox:ox+dx,oy:oy+dy};};
 // First measure: the whole photo at zoom 1, or the frame saved earlier.
 useEffect(()=>{if(!ready||fr)return;const i=imgOf(1,0,0);const r=initial?.rect;
  setFr(r?{l:i.L+r[0]*i.iw,t:i.T+r[1]*i.ih,r:i.L+(r[0]+r[2])*i.iw,b:i.T+(r[1]+r[3])*i.ih}:{l:i.L,t:i.T,r:i.L+i.iw,b:i.T+i.ih});});// eslint-disable-line react-hooks/exhaustive-deps
 const zoom=(z:number)=>{if(!ready||!fr)return;const nz=clamp(z,1,3);const k=nz/v.z;const i=imgOf(nz,v.ox*k,v.oy*k);
  const f=fitFr(fr,i);const nv=fitView(nz,v.ox*k,v.oy*k,f);setFr(f);setV(nv);};
 const pts=useRef(new Map<number,[number,number]>());const last=useRef<[number,number]|null>(null);const pinch=useRef<{d:number,z:number}|null>(null);
 const drag=useRef<{h:string,x:number,y:number,f:Fr}|null>(null);
 const down=(e:React.PointerEvent)=>{if(!fr)return;e.currentTarget.setPointerCapture(e.pointerId);pts.current.set(e.pointerId,[e.clientX,e.clientY]);last.current=[e.clientX,e.clientY];
  const h=(e.target as HTMLElement).dataset.h;
  if(h&&pts.current.size===1){drag.current={h,x:e.clientX,y:e.clientY,f:fr};return;}
  drag.current=null;
  if(pts.current.size===2){const [a,b]=[...pts.current.values()];pinch.current={d:Math.hypot(a![0]-b![0],a![1]-b![1]),z:v.z};}};
 const move=(e:React.PointerEvent)=>{if(!pts.current.has(e.pointerId)||!img||!fr)return;pts.current.set(e.pointerId,[e.clientX,e.clientY]);
  const d=drag.current;
  if(d){const dx=e.clientX-d.x,dy=e.clientY-d.y;const b=bounds(img);const f={...d.f};
   if(d.h.includes('w'))f.l=clamp(d.f.l+dx,b.l,d.f.r-MIN);if(d.h.includes('e'))f.r=clamp(d.f.r+dx,d.f.l+MIN,b.r);
   if(d.h.includes('n'))f.t=clamp(d.f.t+dy,b.t,d.f.b-MIN);if(d.h.includes('s'))f.b=clamp(d.f.b+dy,d.f.t+MIN,b.b);
   setFr(f);return;}
  if(pts.current.size===2&&pinch.current){const [a,b]=[...pts.current.values()];zoom(pinch.current.z*Math.hypot(a![0]-b![0],a![1]-b![1])/pinch.current.d);return;}
  const l=last.current;if(!l)return;const dx=e.clientX-l[0],dy=e.clientY-l[1];last.current=[e.clientX,e.clientY];
  setV(c=>fitView(c.z,c.ox+dx,c.oy+dy,fr));};
 const up=(e:React.PointerEvent)=>{pts.current.delete(e.pointerId);if(pts.current.size<2)pinch.current=null;drag.current=null;const r=[...pts.current.values()][0];if(r)last.current=r;};
 useEffect(()=>{const el=boxRef.current;if(!el)return;const wheel=(e:WheelEvent)=>{e.preventDefault();zoom(v.z-e.deltaY*.002);};
  el.addEventListener('wheel',wheel,{passive:false});return ()=>el.removeEventListener('wheel',wheel);});
 const reset=()=>{if(!ready)return;const i=imgOf(1,0,0);setV({z:1,ox:0,oy:0});setFr({l:i.L,t:i.T,r:i.L+i.iw,b:i.T+i.ih});};
 const apply=()=>{if(!img||!fr){onApply(NO_CROP);return;}
  const x=clamp((fr.l-img.L)/img.iw,0,1),y=clamp((fr.t-img.T)/img.ih,0,1);
  const w=clamp((fr.r-fr.l)/img.iw,0,1-x),h=clamp((fr.b-fr.t)/img.ih,0,1-y);
  // The whole photo is no edit.
  onApply(w>.995&&h>.995?NO_CROP:{x:0,y:0,z:1,rect:[x,y,w,h]});};
 const vars={'--k-ar':'4/5'} as CSSProperties;
 const fs=fr?{left:fr.l+'px',top:fr.t+'px',width:(fr.r-fr.l)+'px',height:(fr.b-fr.t)+'px'} as CSSProperties:{display:'none'} as CSSProperties;
 const is=img?{width:img.iw+'px',height:img.ih+'px',transform:`translate(${img.L}px,${img.T}px)`} as CSSProperties:undefined;
 return <Sheet title={t('fe.kit.crop.title')} sub={hint??t('fe.kit.crop.hintFree')} full onClose={onClose}
  foot={<div className="row g8"><Btn kind="soft" fit onClick={reset}>{t('fe.kit.crop.reset')}</Btn><Btn onClick={apply}>{t('fe.kit.crop.apply')}</Btn></div>}>
  <div ref={frame} className="k-crop free" style={vars} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
   <img ref={el=>{if(el?.complete&&el.naturalWidth&&!nat.w)setNat({w:el.naturalWidth,h:el.naturalHeight});}} src={src} alt="" draggable={false} style={is}
    onLoad={e=>setNat({w:e.currentTarget.naturalWidth,h:e.currentTarget.naturalHeight})}/>
   <CropFrame free style={fs}/>
  </div>
  <label className="k-crop-zoom"><Search/><Range label={t('fe.kit.crop.zoom')} min={1} max={3} step={.01} value={v.z} onChange={zoom}/></label>
 </Sheet>;
}
