import {createContext,useContext,useEffect,useMemo,useRef,useState,type CSSProperties,type ReactNode,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ArrowDown,ArrowUp} from 'lucide-react';

/** Pull-to-refresh (owner, 29.10.2026). Touch only: at the very top of a screen's scroller a pull down brings a small
 * round mark from under the header, with resistance; let go past THRESHOLD and the screen's reads are asked again
 * while the mark blinks (never spins). The content itself never moves, so nothing jumps; fresh answers replace what is
 * shown in place. Desktop (mouse) gets nothing. */
const THRESHOLD=70;
const REST=56;
const MAX=124;
/** Finger distance → mark distance: follows at first, then holds back more and more. */
const resist=(dy:number)=>dy<=0?0:MAX*(1-Math.exp(-dy/(MAX*1.4)));
const MIN_BUSY=500;
const MAX_BUSY=15000;

type Run=(work:()=>unknown)=>Promise<unknown>;
/** How a refresh runs its loaders. The app's session passes one that skips the read cache for every read the loaders
 * start (`refreshReads`); outside it (Storybook) the loaders simply run. */
const RunCtx=createContext<Run>(async work=>{await work();});
export const PullRefreshRunner=RunCtx.Provider;
type Reg={add:(fn:()=>unknown)=>()=>void};
const RegCtx=createContext<Reg|null>(null);

/** A block inside a pull-to-refresh screen (its own list, its own read) asks to be read again on a pull. Outside one it
 * does nothing. */
export function useRefreshable(fn:()=>unknown){
 const reg=useContext(RegCtx);const latest=useRef(fn);latest.current=fn;
 useEffect(()=>reg?.add(()=>latest.current()),[reg]);
}

/** Inside a touch that started here, something else owns the gesture: a field, a nested scroller not at its top. */
function blocked(from:EventTarget|null,root:HTMLElement){
 let n=from instanceof Element?from:null;
 if(n?.closest('input,textarea,select,[contenteditable="true"],[data-nopull]'))return true;
 for(;n&&n!==root;n=n.parentElement)if(n.scrollTop>0&&n.scrollHeight>n.clientHeight)return true;
 return false;
}

/** Wires pull-to-refresh to `target` (the screen's `.view`); the mark is drawn in the scroller's parent (`.main`),
 * under the header. `onRefresh` and every `useRefreshable` inside run on release. Use through `View refresh`. */
export function PullRefresh({target,onRefresh,children}:{target:RefObject<HTMLElement|null>,onRefresh?:(()=>unknown)|undefined,children:ReactNode}){
 const {t}=useI18n();const run=useContext(RunCtx);
 const loaders=useRef(new Set<()=>unknown>());
 const reg=useMemo<Reg>(()=>({add:fn=>{loaders.current.add(fn);return ()=>{loaders.current.delete(fn);};}}),[]);
 const cb=useRef(onRefresh);cb.current=onRefresh;
 const [d,setD]=useState(0);const [drag,setDrag]=useState(false);const [busy,setBusy]=useState(false);
 const [host,setHost]=useState<{el:HTMLElement,top:number}|null>(null);
 const busyRef=useRef(false);
 useEffect(()=>{
  const el=target.current;if(!el)return;
  let on=false,pulling=false,sy=0,sx=0,cur=0;
  const place=()=>{const main=el.parentElement;if(!main)return;const bar=main.querySelector<HTMLElement>(':scope>.bar');
   setHost({el:main,top:bar?bar.offsetTop+bar.offsetHeight:el.offsetTop});};
  const start=(e:TouchEvent)=>{
   on=false;const p=e.touches[0];
   if(busyRef.current||(!cb.current&&!loaders.current.size)||e.touches.length!==1||!p||el.scrollTop>0||blocked(e.target,el))return;
   on=true;pulling=false;sy=p.clientY;sx=p.clientX;
  };
  const move=(e:TouchEvent)=>{
   if(!on)return;const p=e.touches[0];if(!p)return;
   if(!pulling){
    const dy=p.clientY-sy,dx=p.clientX-sx;
    if(Math.abs(dy)<8&&Math.abs(dx)<8)return;
    // Up, sideways, or the list already moved: an ordinary scroll or a swipe, not a pull.
    if(dy<=0||Math.abs(dx)>dy||el.scrollTop>0){on=false;return;}
    pulling=true;sy=p.clientY;place();setDrag(true);
   }
   if(e.cancelable)e.preventDefault();
   cur=resist(p.clientY-sy);setD(cur);
  };
  const end=()=>{
   if(!on)return;on=false;if(!pulling)return;pulling=false;setDrag(false);
   if(cur<THRESHOLD){setD(0);cur=0;return;}
   cur=0;busyRef.current=true;setBusy(true);setD(REST);
   const started=Date.now();
   const work=()=>Promise.all([cb.current?.(),...[...loaders.current].map(f=>f())]);
   const limit=new Promise(r=>setTimeout(r,MAX_BUSY));
   void Promise.race([run(work).catch(()=>{}),limit])
    .then(()=>new Promise(r=>setTimeout(r,Math.max(0,MIN_BUSY-(Date.now()-started)))))
    .then(()=>{busyRef.current=false;setBusy(false);setD(0);});
  };
  el.addEventListener('touchstart',start,{passive:true});
  el.addEventListener('touchmove',move,{passive:false});
  el.addEventListener('touchend',end);
  el.addEventListener('touchcancel',end);
  return ()=>{el.removeEventListener('touchstart',start);el.removeEventListener('touchmove',move);el.removeEventListener('touchend',end);el.removeEventListener('touchcancel',end);};
 },[target,run]);
 const p=Math.min(1,d/THRESHOLD);
 const mark=host&&(d>0||busy)?createPortal(
  <div className={'k-pull'+(drag?' drag':'')+(busy?' busy':'')+(p>=1?' ready':'')} role="status" aria-busy={busy||undefined}
   aria-label={busy?t('fe.kit.pull.busy'):p>=1?t('fe.kit.pull.release'):t('fe.kit.pull.pull')}
   style={{'--pr-d':d+'px','--pr-p':p,'--pr-top':host.top+'px'} as CSSProperties}>
   <svg className="k-pull-ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" pathLength={1}/></svg>
   {busy?<i className="k-pull-dot" aria-hidden="true"/>:<ArrowDown aria-hidden="true"/>}
  </div>,host.el):null;
 return <RegCtx.Provider value={reg}>{children}{mark}</RegCtx.Provider>;
}

/** «Новые публикации ↑»: a small floating pill at the top of a list that has newer items the reader has not been shown.
 * Put it in the list's flow before the items (it takes no room and sticks under the header); `onClick` scrolls up and
 * shows them — new items are never put above the reader without this tap. */
export function NewPill({label,onClick}:{label:string,onClick:()=>void}){
 const ref=useRef<HTMLDivElement>(null);
 const go=()=>{const still=matchMedia('(prefers-reduced-motion: reduce)').matches;
  ref.current?.closest('.view')?.scrollTo({top:0,behavior:still?'auto':'smooth'});onClick();};
 return <div ref={ref} className="k-newpill"><button type="button" onClick={go}><ArrowUp aria-hidden="true"/>{label}</button></div>;
}
