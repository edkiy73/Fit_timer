/** Realtime «something new» signals (docs/server/S2-API.md §8): Server-Sent Events from `<url>/api/fe-events` on our
 * own server (server/realtime-sse.mjs). The server names one channel per profile with an opaque token only its members
 * get in `session.bootstrap`; a message carries only a kind (`{k}`), and screens then fetch with the normal commands.
 * Polling stays as the fallback, so a lost stream only makes updates slower, never wrong.
 * `changed` (server/live.mjs) carries the entity that changed in the tag (`t`), as `typing` carries its chat tag.
 * After the phone slept a dead stream still looks open: its heartbeat is watched and it reopens, and `wake()`
 * (a return to the app, the network back) reopens a stale connection — every reopen gives one refresh signal. */
import {App} from '@capacitor/app';
import {Capacitor} from '@capacitor/core';

export type RtKind='chat'|'notify'|'decide'|'typing'|'changed';
export const RT_KINDS:readonly RtKind[]=['chat','notify','decide','typing','changed'];
/** `close` ends it; `wake` (the app came back): reopens a connection that went quiet and answers true when that reopen
 * will give the refresh signal itself, false when the connection is fine (the caller refreshes). */
export type RtConnection={close:()=>void,wake:()=>boolean};
export type RtConfig={url:string,channels:Record<string,string>};
/** `kind` is null after a reconnect: signals may have been missed, so everyone refreshes once. */
export type RtListener=(kind:RtKind|null,profileId:string|null,tag?:string)=>void;

const HIDDEN_PAUSE_MS=5*60_000;
/** The server's SSE heartbeat comes every 25 s (server/realtime-sse.mjs): nothing for this long means a dead stream. */
export const SSE_SILENCE_MS=60_000;
const SSE_CHECK_MS=15_000;
/** On a return to the app a connection quiet for this long is reopened rather than trusted. */
const WAKE_STALE_MS=30_000;

export function eventsUrl(cfg:Pick<RtConfig,'url'|'channels'>){
 const u=new URL(cfg.url);
 u.pathname=u.pathname.replace(/\/$/,'')+'/api/fe-events';
 u.search=new URLSearchParams({c:Object.values(cfg.channels).join(',')}).toString();
 return u.toString();
}

/** Opens the stream for every channel. The browser's EventSource reconnects by itself (the server sends `retry`), every
 * (re)open after the first gives one refresh signal per profile, and the stream closes while the page has been hidden
 * for more than five minutes. A watchdog reopens a stream that heard neither data nor the server's `hb` heartbeat for
 * SSE_SILENCE_MS (after a sleep the socket is dead but EventSource still says «open»). Without EventSource nothing
 * happens: polling covers it. */
export function connectRealtime(cfg:RtConfig,listener:RtListener):RtConnection{
 const byTopic=new Map(Object.entries(cfg.channels).map(([profile,topic])=>[topic,profile]));
 let es:EventSource|null=null;let closed=false;let paused=false;let openedOnce=false;let lastSeen=Date.now();
 let hiddenTimer:ReturnType<typeof setTimeout>|undefined;let retry:ReturnType<typeof setTimeout>|undefined;
 const beat=()=>{lastSeen=Date.now();};
 const stop=()=>{clearTimeout(retry);if(es){es.onopen=es.onmessage=es.onerror=null;es.removeEventListener?.('hb',beat);es.close();es=null;}};
 function open(){
  stop();if(closed||paused||typeof EventSource==='undefined'||!byTopic.size)return;
  lastSeen=Date.now();
  es=new EventSource(eventsUrl(cfg));
  es.addEventListener?.('hb',beat);
  es.onopen=()=>{
   beat();
   if(openedOnce)for(const profile of byTopic.values())listener(null,profile); // back after a drop: something may have been missed
   openedOnce=true;
  };
  es.onmessage=e=>{
   beat();
   let m:{c?:unknown,k?:unknown,t?:unknown};try{m=JSON.parse(String(e.data));}catch{return;}
   const profile=typeof m.c==='string'?byTopic.get(m.c):undefined;if(profile===undefined)return;
   if(RT_KINDS.includes(m.k as RtKind))listener(m.k as RtKind,profile,typeof m.t==='string'?m.t:undefined);
  };
  es.onerror=()=>{/* EventSource retries by itself; a closed one (HTTP error) is reopened after the server's retry */
   if(es&&es.readyState===2){stop();openedOnce=true;retry=setTimeout(()=>{if(!closed&&!paused&&!es)open();},5_000);}
  };
 }
 const watchdog=setInterval(()=>{
  if(closed||paused||!es)return;
  if(Date.now()-lastSeen>SSE_SILENCE_MS){openedOnce=true;open();}
 },SSE_CHECK_MS);
 const onVisibility=()=>{
  if(document.visibilityState==='hidden'){
   clearTimeout(hiddenTimer);
   hiddenTimer=setTimeout(()=>{paused=true;stop();},HIDDEN_PAUSE_MS);
  }else{
   clearTimeout(hiddenTimer);
   if(paused){paused=false;open();}
  }
 };
 if(typeof document!=='undefined')document.addEventListener('visibilitychange',onVisibility);
 open();
 return {close(){
  closed=true;clearTimeout(hiddenTimer);clearInterval(watchdog);stop();
  if(typeof document!=='undefined')document.removeEventListener('visibilitychange',onVisibility);
 },wake(){
  if(closed||typeof EventSource==='undefined'||!byTopic.size)return false;
  if(paused){paused=false;open();return true;}
  if(!es)return true; // a reopen is already waiting; it gives the refresh
  if(es.readyState===0)return true;
  if(es.readyState===1&&Date.now()-lastSeen<WAKE_STALE_MS)return false;
  openedOnce=true;open();return true;
 }};
}

/** Calls `onWake` when the app comes back after being away at least `minAwayMs` (the page shown again, the window
 * focused, the Android/iOS app resumed) and whenever the network comes back. One return fires once, however many of
 * those events it raises. */
export function watchWake(onWake:(why:'back'|'online')=>void,{minAwayMs=5_000}:{minAwayMs?:number}={}):()=>void{
 if(typeof window==='undefined')return ()=>{};
 let awayAt:number|null=typeof document!=='undefined'&&document.visibilityState==='hidden'?Date.now():null;
 const away=()=>{awayAt??=Date.now();};
 const back=()=>{if(awayAt===null)return;const was=Date.now()-awayAt;awayAt=null;if(was>=minAwayMs)onWake('back');};
 const vis=()=>{if(document.visibilityState==='hidden')away();else back();};
 const online=()=>{awayAt=null;onWake('online');};
 document.addEventListener('visibilitychange',vis);
 window.addEventListener('blur',away);window.addEventListener('focus',back);window.addEventListener('online',online);
 const handles:Array<{remove:()=>Promise<void>}>=[];let gone=false;
 if(Capacitor.isNativePlatform()){
  const keep=(p:Promise<{remove:()=>Promise<void>}>)=>void p.then(h=>{if(gone)void h.remove();else handles.push(h);}).catch(()=>{});
  keep(App.addListener('appStateChange',s=>{if(s.isActive)back();else away();}));
  keep(App.addListener('pause',away));
  keep(App.addListener('resume',back));
 }
 return ()=>{
  gone=true;
  document.removeEventListener('visibilitychange',vis);
  window.removeEventListener('blur',away);window.removeEventListener('focus',back);window.removeEventListener('online',online);
  for(const h of handles)void h.remove();
 };
}
