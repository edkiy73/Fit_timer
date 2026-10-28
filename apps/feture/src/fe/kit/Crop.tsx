import {useCallback,useEffect,useRef,useState,type CSSProperties} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Search} from 'lucide-react';
import {Btn,Range,Sheet} from './index';
import {ASPECTS,NO_CROP,type Aspect,type Crop} from './media';

/** The crop sheet: the photo under a fixed frame (4:5, 1:1, 16:9); drag moves it, two fingers / wheel / slider zoom
 * (1–3×). «Сбросить» centres it, «Применить» returns the placement — cropPhoto() cuts the same frame; for a clip the
 * picture is its frame at the trim start and the placement is stored with it (players apply it, kit/media.ts clipBox). */
export function CropSheet({src,aspect,initial=NO_CROP,onApply,onClose,hint}:{src:string,aspect:Exclude<Aspect,'orig'>,initial?:Crop,onApply:(c:Crop)=>void,onClose:()=>void,
 /** The line under the title (a clip's frame says it is applied when it plays). */ hint?:string|undefined}){
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
   <div className="k-crop-grid" aria-hidden="true"><i/><i/><i/><i/></div>
  </div>
  <label className="k-crop-zoom"><Search/><Range label={t('fe.kit.crop.zoom')} min={1} max={3} step={.01} value={st.z} onChange={z=>setSt(c=>fit({...c,z}))}/></label>
 </Sheet>;
}
