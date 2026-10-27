import {z} from 'zod';
import {newOpId} from '../feture/fe-api';

/** V21 N02 web push in the browser: our service worker (`/fe-sw.js`, no fetch handler, no cache), a subscription with
 * the server's public VAPID key, and the device row on the server (`push.register` / `push.unregister`, platform
 * `web`, token = the subscription JSON). Native apps (Capacitor) get their own sender later, never this one.
 * Permission is asked only from a tap (`enableWebPush` must be the first thing a click handler calls). */

type Call=<T>(action:string,input:Record<string,unknown>,schema:z.ZodType<T>,opts?:{asAccount?:boolean})=>Promise<T>;
export type WebPushState='unsupported'|'denied'|'off'|'on';

const SW='/fe-sw.js';
const ok=z.object({ok:z.literal(true)}).passthrough();
const FRESH_KEY='feture.fe.push.seen';

function native(){return !!(globalThis as unknown as {Capacitor?:{isNativePlatform?():boolean}}).Capacitor?.isNativePlatform?.();}

export function webPushSupported(){
 return typeof window!=='undefined'&&!native()&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
}
/** iPhone / iPad Safari: web push only after «На экран „Домой“». */
export function needsHomeScreen(){
 if(typeof navigator==='undefined'||native())return false;
 const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 return ios&&!('PushManager' in window);
}

function keyBytes(b64:string){
 const s=atob(b64.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(b64.length/4)*4,'='));
 const out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;
}
function sameKey(sub:PushSubscription,key:Uint8Array){
 const k=sub.options?.applicationServerKey;if(!k)return true; // the browser does not say: keep it
 const a=new Uint8Array(k);return a.length===key.length&&a.every((v,i)=>v===key[i]);
}
async function currentSubscription(){
 if(!webPushSupported())return null;
 const reg=await navigator.serviceWorker.getRegistration('/');
 return reg?(await reg.pushManager.getSubscription()):null;
}
const tz=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||undefined;}catch{return undefined;}};
async function register(call:Call,sub:PushSubscription){
 const zone=tz();
 await call('push.register',{opId:newOpId(),platform:'web',token:JSON.stringify(sub.toJSON()),...(zone?{tz:zone}:{})},ok,{asAccount:true});
 try{localStorage.setItem(FRESH_KEY,String(Date.now()));}catch{/* no storage */}
}

/** What this browser is doing now: no push here, blocked by the browser, off, or subscribed. */
export async function webPushState():Promise<WebPushState>{
 if(!webPushSupported())return 'unsupported';
 if(Notification.permission==='denied')return 'denied';
 if(Notification.permission!=='granted')return 'off';
 try{return (await currentSubscription())?'on':'off';}catch{return 'off';}
}

/** Asks the browser (call it straight from a tap), subscribes with the server's key and registers this browser. */
export async function enableWebPush(call:Call,webKey:string):Promise<'on'|'denied'|'dismissed'|'error'>{
 if(!webPushSupported())return 'error';
 const permission=await Notification.requestPermission();
 if(permission==='denied')return 'denied';
 if(permission!=='granted')return 'dismissed';
 try{
  await navigator.serviceWorker.register(SW,{scope:'/'});
  const reg=await navigator.serviceWorker.ready;
  const key=keyBytes(webKey);
  let sub=await reg.pushManager.getSubscription();
  if(sub&&!sameKey(sub,key)){await sub.unsubscribe();sub=null;} // the server's key changed: subscribe again
  sub??=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  await register(call,sub);
  return 'on';
 }catch{return 'error';}
}

/** Off for this browser: the server forgets it first, then the browser drops the subscription. */
export async function disableWebPush(call:Call){
 const sub=await currentSubscription().catch(()=>null);
 if(!sub)return;
 await call('push.unregister',{opId:newOpId(),token:JSON.stringify(sub.toJSON())},ok,{asAccount:true}).catch(()=>{});
 await sub.unsubscribe().catch(()=>false);
}

/** On sign-out the browser stops receiving this account's pushes even if the server could not be told (its next
 * send then gets «gone» and the row is removed). */
export async function forgetWebPush(){
 try{const sub=await currentSubscription();if(sub)await sub.unsubscribe();}catch{/* nothing to drop */}
 try{localStorage.removeItem(FRESH_KEY);}catch{/* no storage */}
}

/** A subscribed browser re-registers about once a day: the server skips devices unseen for 60 days, and a changed
 * server key means a new subscription. Never asks for permission. */
export async function refreshWebPush(call:Call,webKey:string){
 if(!webPushSupported()||Notification.permission!=='granted')return;
 try{
  const sub=await currentSubscription();if(!sub)return;
  const key=keyBytes(webKey);
  if(!sameKey(sub,key)){await sub.unsubscribe();const reg=await navigator.serviceWorker.ready;await register(call,await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key}));return;}
  let seen=0;try{seen=Number(localStorage.getItem(FRESH_KEY)||0);}catch{/* no storage */}
  if(Date.now()-seen>20*3600*1000)await register(call,sub);
 }catch{/* next time */}
}

/** «The first useful action» (V21 maybePush): a message sent, a like, a follow, joining a community or an event. */
const USEFUL=new Set(['chat.send','chat.sendMedia','like.send','follow.set','community.join','event.apply']);
const bus=new EventTarget();
export function noteAction(action:string){if(USEFUL.has(action))bus.dispatchEvent(new Event('useful'));}
export function onUseful(fn:()=>void){bus.addEventListener('useful',fn);return ()=>bus.removeEventListener('useful',fn);}
