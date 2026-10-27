import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {CircleAlert,CircleCheck,Info,TriangleAlert,type LucideIcon} from 'lucide-react';

/** V21 `toast()` with the prototype's markup: `div.toasts[aria-live=polite] > div.toast.<type>(svg, span.tx, button.tb)`.
 * One toast at a time (a new one replaces the old), an optional action («Вернуть»), auto-hide after ~5 s with an
 * action (shorter without), paused while the pointer or focus is on it. While a sheet or dialog is open it shows at
 * the top (`.over-modal`), never over the sheet's buttons. */
export type ToastType='ok'|'err'|'warn'|'info';
export type ToastOptions={type?:ToastType,action?:{label:string,fn:()=>void}|null,ms?:number};
type Item={id:number,msg:string,type:ToastType|'',action:ToastOptions['action'],ms:number,overModal:boolean,out:boolean};
type ToastFn=(msg:string,o?:ToastOptions)=>void;

const ICONS:Record<ToastType,LucideIcon>={ok:CircleCheck,err:CircleAlert,warn:TriangleAlert,info:Info};
const Ctx=createContext<ToastFn|null>(null);
const noop:ToastFn=()=>{};

/** `toast(msg, {type, action, ms})`; a no-op outside the provider (screens shown before the shell). */
export function useToast():ToastFn{return useContext(Ctx)??noop;}

export function ToastProvider({children,nodock=false}:{children:ReactNode,nodock?:boolean}){
 const [item,setItem]=useState<Item|null>(null);const seq=useRef(0);
 const toast=useCallback<ToastFn>((msg,o={})=>{
  const type=o.type??'';
  const ms=o.ms??(type==='err'?5200:o.action?5000:3000);
  const overModal=!!document.querySelector('.v21 .sheet.on, .v21 .dialog.on');
  setItem({id:++seq.current,msg,type,action:o.action??null,ms,overModal,out:false});
 },[]);
 const dismiss=useCallback((id:number)=>{
  setItem(cur=>cur&&cur.id===id?{...cur,out:true}:cur);
  window.setTimeout(()=>setItem(cur=>cur&&cur.id===id?null:cur),260);
 },[]);
 return <Ctx.Provider value={toast}>
  {children}
  <div className={'toasts'+(nodock?' nodock':'')+(item?.overModal?' over-modal':'')} id="toasts" aria-live="polite">
   {item&&<Toast key={item.id} item={item} onDismiss={dismiss}/>}
  </div>
 </Ctx.Provider>;
}

function Toast({item,onDismiss}:{item:Item,onDismiss:(id:number)=>void}){
 const [paused,setPaused]=useState(false);
 const left=useRef(item.ms);const started=useRef(0);const hover=useRef(false);const focus=useRef(false);
 useEffect(()=>{
  if(paused||item.out)return;
  started.current=Date.now();
  const timer=window.setTimeout(()=>onDismiss(item.id),left.current);
  return ()=>{window.clearTimeout(timer);left.current=Math.max(800,left.current-(Date.now()-started.current));};
 },[paused,item.out,item.id,onDismiss]);
 const sync=()=>setPaused(hover.current||focus.current);
 const Icon=item.type?ICONS[item.type]:null;
 return <div className={'toast '+item.type+(item.out?' out':'')} role={item.type==='err'?'alert':'status'}
  onMouseEnter={()=>{hover.current=true;sync();}} onMouseLeave={()=>{hover.current=false;sync();}}
  onFocus={()=>{focus.current=true;sync();}} onBlur={()=>{focus.current=false;sync();}}>
  {Icon&&<Icon aria-hidden="true"/>}<span className="tx">{item.msg}</span>
  {item.action&&<button type="button" className="tb" onClick={()=>{const a=item.action;onDismiss(item.id);a?.fn();}}>{item.action.label}</button>}
 </div>;
}

/** Puts removed items back where they were: keeps the old order for everything still listed or restored, then
 * anything that arrived since (a next page). */
export function restoreInto<T extends {id:string}>(before:T[],now:T[]|null,removed:Set<string>):T[]{
 const cur=new Set((now??[]).map(x=>x.id));
 const kept=before.filter(x=>cur.has(x.id)||removed.has(x.id));
 const known=new Set(kept.map(x=>x.id));
 return [...kept,...(now??[]).filter(x=>!known.has(x.id))];
}
