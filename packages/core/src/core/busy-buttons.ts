/**
 * Busy buttons: the button a person just pressed shows a spinner while the requests it
 * started are still running, so a slow network never looks like a frozen app.
 *
 * It works for every button without per-screen code: a click arms the pressed button,
 * and every fetch started within a short window after the click (or while that button is
 * already waiting) is tied to it. A quick answer (under SHOW_AFTER_MS) shows no spinner.
 * A button opts out with data-busy="off"; background requests (analytics, error reports)
 * use untrackedFetch so they never spin the button that happened to be pressed.
 */

export const BUSY_ATTRIBUTE = 'aria-busy';

const ARM_MS = 1000;
const FOLLOW_UP_MS = 400;
const SHOW_AFTER_MS = 150;
const STYLE_ID = 'appbase-busy-buttons';

const CSS = `
button[aria-busy="true"]{cursor:progress;pointer-events:none}
button[aria-busy="true"]::before{content:"";display:inline-block;flex:none;box-sizing:border-box;width:1em;height:1em;margin-inline-end:.5em;vertical-align:-.15em;border:2px solid currentColor;border-inline-end-color:transparent;border-radius:50%;animation:appbase-busy-spin .7s linear infinite}
@keyframes appbase-busy-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){button[aria-busy="true"]::before{animation-duration:1.6s}}
`;

interface ButtonLike {
  isConnected:boolean;
  setAttribute(name:string,value:string):void;
  removeAttribute(name:string):void;
  getAttribute(name:string):string|null;
}

interface BusyHost {
  document:{
    addEventListener(type:'click',listener:(event:{target:unknown})=>void,capture:boolean):void;
    removeEventListener(type:'click',listener:(event:{target:unknown})=>void,capture:boolean):void;
    getElementById(id:string):unknown;
    createElement(tag:'style'):{id:string;textContent:string|null};
    head:{appendChild(node:unknown):unknown}|null;
  };
  fetch:(...args:never[])=>Promise<unknown>;
  setTimeout(callback:()=>void,ms:number):unknown;
}

let unwrappedFetch:((...args:never[])=>Promise<unknown>)|null=null;

/** fetch that never marks a button busy: for fire-and-forget background requests. */
export function untrackedFetch(input:RequestInfo|URL,init?:RequestInit):Promise<Response>{
  const target=(unwrappedFetch||globalThis.fetch) as unknown as typeof fetch;
  return target.call(globalThis,input,init);
}

function pressedButton(target:unknown):ButtonLike|null{
  const node=target as {closest?:(selector:string)=>ButtonLike|null}|null;
  const button=node&&typeof node.closest==='function' ? node.closest('button') : null;
  if(!button||button.getAttribute('data-busy')==='off')return null;
  return button;
}

/** Installs once per page; returns a function that removes it (tests, hot reload). */
export function installBusyButtons(host:BusyHost=globalThis as unknown as BusyHost,now:()=>number=()=>Date.now()):()=>void{
  const doc=host.document;
  if(!doc||typeof host.fetch!=='function'||unwrappedFetch)return ()=>{};

  if(!doc.getElementById(STYLE_ID)&&doc.head){
    const style=doc.createElement('style');
    style.id=STYLE_ID;
    style.textContent=CSS;
    doc.head.appendChild(style);
  }

  const pending=new WeakMap<ButtonLike,number>();
  let armed:{button:ButtonLike;until:number}|null=null;

  const onClick=(event:{target:unknown})=>{
    const button=pressedButton(event.target);
    armed=button?{button,until:now()+ARM_MS}:null;
  };

  const activeButton=():ButtonLike|null=>{
    if(!armed||!armed.button.isConnected)return null;
    if(now()<=armed.until||(pending.get(armed.button)||0)>0)return armed.button;
    return null;
  };

  const track=(button:ButtonLike,request:Promise<unknown>)=>{
    pending.set(button,(pending.get(button)||0)+1);
    let settled=false;
    host.setTimeout(()=>{
      if(!settled&&(pending.get(button)||0)>0&&button.isConnected)button.setAttribute(BUSY_ATTRIBUTE,'true');
    },SHOW_AFTER_MS);
    const done=()=>{
      settled=true;
      const left=Math.max(0,(pending.get(button)||0)-1);
      pending.set(button,left);
      if(left>0)return;
      button.removeAttribute(BUSY_ATTRIBUTE);
      // A follow-up request (reload after save) still belongs to this press.
      if(armed&&armed.button===button)armed.until=Math.max(armed.until,now()+FOLLOW_UP_MS);
    };
    request.then(done,done);
  };

  const original=host.fetch;
  unwrappedFetch=original;
  const wrapped=(...args:never[])=>{
    const request=original.apply(host,args);
    const button=activeButton();
    if(button)track(button,request);
    return request;
  };
  host.fetch=wrapped;
  doc.addEventListener('click',onClick,true);

  return ()=>{
    doc.removeEventListener('click',onClick,true);
    if(host.fetch===wrapped)host.fetch=original;
    if(unwrappedFetch===original)unwrappedFetch=null;
  };
}
