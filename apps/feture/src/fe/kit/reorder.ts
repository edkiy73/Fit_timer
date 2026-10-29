import {useEffect,useRef,useState,type PointerEvent as RPointerEvent} from 'react';

/** V21 drag to reorder for a grid of `.mi[data-id]` cells (profile photos): with a mouse the drag starts after a few
 * pixels, with a finger after a short press-and-hold, so scrolling keeps working. While dragging, a fixed copy of the
 * cell follows the pointer and the grid is drawn in the preview order (React state — the DOM is never moved by hand);
 * on release `onDrop(k, ids)` gets the new order if it changed. The click that ends a drag is swallowed, so the cell's
 * tap action (its sheet) does not open. */
export type DragPreview<K extends string>={k:K,ids:string[],drag:string};
export function useDragOrder<K extends string>(onDrop:(k:K,ids:string[])=>void,cellSel='.mi[data-id]'){
 const [preview,setPreview]=useState<DragPreview<K>|null>(null);
 const swallow=useRef(false);const drop=useRef(onDrop);drop.current=onDrop;const stopRef=useRef<(()=>void)|null>(null);
 useEffect(()=>{
  const click=(e:MouseEvent)=>{if(swallow.current){e.stopPropagation();e.preventDefault();swallow.current=false;}};
  document.addEventListener('click',click,true);
  return ()=>{document.removeEventListener('click',click,true);stopRef.current?.();};
 },[]);
 const down=(e:RPointerEvent<HTMLElement>,k:K,ids:string[],id:string)=>{
  if(e.button>0||ids.length<2)return;
  stopRef.current?.();
  const cell=e.currentTarget,grid=cell.parentElement;if(!grid)return;
  const touch=e.pointerType!=='mouse',x0=e.clientX,y0=e.clientY,pid=e.pointerId;
  let on=false,ghost:HTMLElement|null=null,dx=0,dy=0,order=ids,lock=0;
  const begin=()=>{
   if(on)return;on=true;const r=cell.getBoundingClientRect();dx=x0-r.left;dy=y0-r.top;
   ghost=cell.cloneNode(true) as HTMLElement;ghost.classList.add('mi-ghost');ghost.removeAttribute('data-id');
   ghost.style.cssText=`position:fixed;left:0;top:0;width:${r.width}px;height:${r.height}px;transform:translate(${r.left}px,${r.top}px);z-index:60;pointer-events:none`;
   (cell.closest('.v21')??document.body).append(ghost);
   grid.classList.add('reordering');document.body.classList.add('no-sel');navigator.vibrate?.(8);
   setPreview({k,ids:order,drag:id});
  };
  const move=(ev:PointerEvent)=>{
   if(ev.pointerId!==pid)return;
   if(!on){const m=Math.hypot(ev.clientX-x0,ev.clientY-y0);if(touch){if(m>8)stop();}else if(m>5)begin();return;}
   if(ghost)ghost.style.transform=`translate(${ev.clientX-dx}px,${ev.clientY-dy}px)`;
   const over=(document.elementFromPoint(ev.clientX,ev.clientY) as HTMLElement|null)?.closest<HTMLElement>(cellSel);
   const oid=over?.dataset.id;if(!over||!oid||over.parentElement!==grid||oid===id||Date.now()<lock)return;
   const next=order.filter(x=>x!==id);next.splice(order.indexOf(oid),0,id);
   order=next;lock=Date.now()+170;setPreview({k,ids:order,drag:id});
  };
  const up=(ev:PointerEvent)=>{
   if(ev.pointerId!==pid)return;const was=on;stop();
   if(!was)return;
   swallow.current=true;window.setTimeout(()=>{swallow.current=false;},60);
   if(ev.type==='pointerup'&&order.join()!==ids.join())drop.current(k,order);
  };
  const touchmove=(ev:TouchEvent)=>{if(on)ev.preventDefault();};
  const menu=(ev:Event)=>ev.preventDefault();
  const timer=touch?window.setTimeout(begin,330):0;
  const stop=()=>{
   window.clearTimeout(timer);ghost?.remove();grid.classList.remove('reordering');document.body.classList.remove('no-sel');
   removeEventListener('pointermove',move);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);
   removeEventListener('touchmove',touchmove);removeEventListener('contextmenu',menu);
   stopRef.current=null;setPreview(null);
  };
  addEventListener('pointermove',move);addEventListener('pointerup',up);addEventListener('pointercancel',up);
  addEventListener('touchmove',touchmove,{passive:false});addEventListener('contextmenu',menu);
  stopRef.current=stop;
 };
 /** The list as it should be drawn now: the preview order while this grid is being dragged. */
 const arrange=<T extends {id:string}>(k:K,list:T[]):T[]=>{
  if(!preview||preview.k!==k)return list;
  const by=new Map(list.map(x=>[x.id,x]));const out=preview.ids.map(i=>by.get(i)).filter((x):x is T=>!!x);
  return out.length===list.length?out:list;
 };
 return {preview,down,arrange};
}
