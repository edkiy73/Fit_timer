/** Realtime «something new» signals (docs/server/S2-API.md §8): a tiny Phoenix-protocol client for Supabase Realtime
 * Broadcast, without supabase-js — or, on our own server (`transport: 'sse'`), Server-Sent Events from
 * `<url>/api/fe-events` (server/realtime-sse.mjs). The server names one public channel per profile with an opaque token only its
 * members get in `session.bootstrap`; a message carries only a kind (`{k}`), and screens then fetch with the normal
 * commands. Polling stays as the fallback, so a lost socket only makes updates slower, never wrong. */

export type RtKind='chat'|'notify'|'decide'|'feed'|'typing';
export const RT_KINDS:readonly RtKind[]=['chat','notify','decide','feed','typing'];
export type RtConfig={url:string,key:string,transport?:'sse'|undefined,channels:Record<string,string>};
/** `kind` is null after a reconnect: signals may have been missed, so everyone refreshes once. */
export type RtListener=(kind:RtKind|null,profileId:string|null,tag?:string)=>void;

const HEARTBEAT_MS=25_000;
const BACKOFF_MS=[1_000,2_000,5_000,10_000,30_000];
const HIDDEN_PAUSE_MS=5*60_000;

type Frame={topic:string,event:string,payload:any,ref:string|null,join_ref?:string|null};

export function socketUrl(cfg:Pick<RtConfig,'url'|'key'>){
 const u=new URL(cfg.url);
 u.protocol=u.protocol==='http:'?'ws:':'wss:';
 u.pathname='/realtime/v1/websocket';
 u.search=new URLSearchParams({apikey:cfg.key,vsn:'1.0.0'}).toString();
 return u.toString();
}

/** Opens the socket, joins every channel, keeps it alive and reconnects with backoff. Closes while the page has been
 * hidden for more than five minutes and comes back (with one refresh signal) when it is shown again. */
export function connectRealtime(cfg:RtConfig,listener:RtListener):{close:()=>void}{
 if(cfg.transport==='sse')return connectSse(cfg,listener);
 const byTopic=new Map(Object.entries(cfg.channels).map(([profile,topic])=>['realtime:'+topic,profile]));
 let ws:WebSocket|null=null;let ref=0;let attempt=0;let closed=false;let joinedOnce=false;
 let heartbeat:ReturnType<typeof setInterval>|undefined;let retry:ReturnType<typeof setTimeout>|undefined;
 let hiddenTimer:ReturnType<typeof setTimeout>|undefined;let paused=false;let pendingBeat:string|null=null;
 const send=(f:Frame)=>{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(f));};
 const stop=()=>{
  clearInterval(heartbeat);clearTimeout(retry);heartbeat=undefined;pendingBeat=null;
  if(ws){ws.onopen=ws.onmessage=ws.onclose=ws.onerror=null;try{ws.close();}catch{/* already closed */}ws=null;}
 };
 const schedule=()=>{
  if(closed||paused)return;
  const wait=BACKOFF_MS[Math.min(attempt,BACKOFF_MS.length-1)]!;attempt++;
  retry=setTimeout(open,wait*(0.75+Math.random()*0.5));
 };
 function open(){
  stop();if(closed||paused||typeof WebSocket==='undefined')return;
  try{ws=new WebSocket(socketUrl(cfg));}catch{schedule();return;}
  ws.onopen=()=>{
   for(const topic of byTopic.keys()){
    const r=String(++ref);
    send({topic,event:'phx_join',ref:r,join_ref:r,payload:{config:{broadcast:{self:false,ack:false},presence:{key:''},postgres_changes:[],private:false}}});
   }
   heartbeat=setInterval(()=>{
    if(pendingBeat){open();return;} // the last heartbeat got no reply: the connection is dead
    pendingBeat=String(++ref);send({topic:'phoenix',event:'heartbeat',payload:{},ref:pendingBeat});
   },HEARTBEAT_MS);
  };
  ws.onmessage=e=>{
   let f:Frame;try{f=JSON.parse(String(e.data));}catch{return;}
   if(f.topic==='phoenix'&&f.ref===pendingBeat){pendingBeat=null;return;}
   const profile=byTopic.get(f.topic);if(profile===undefined)return;
   if(f.event==='phx_reply'&&f.payload?.status==='ok'&&f.ref===f.join_ref){
    attempt=0;
    if(joinedOnce)listener(null,profile); // back after a drop: something may have been missed
    return;
   }
   if(f.event==='broadcast'&&f.payload?.event==='new'){
    const k=f.payload?.payload?.k;
    const tag=f.payload?.payload?.t;if(RT_KINDS.includes(k))listener(k,profile,typeof tag==='string'?tag:undefined);
   }
  };
  ws.onclose=()=>{joinedOnce=true;stop();schedule();};
  ws.onerror=()=>{/* onclose follows */};
 }
 const onVisibility=()=>{
  if(document.visibilityState==='hidden'){
   clearTimeout(hiddenTimer);
   hiddenTimer=setTimeout(()=>{paused=true;joinedOnce=true;stop();},HIDDEN_PAUSE_MS);
  }else{
   clearTimeout(hiddenTimer);
   if(paused){paused=false;attempt=0;open();}
  }
 };
 if(typeof document!=='undefined')document.addEventListener('visibilitychange',onVisibility);
 open();
 return {close(){
  closed=true;clearTimeout(hiddenTimer);stop();
  if(typeof document!=='undefined')document.removeEventListener('visibilitychange',onVisibility);
 }};
}

export function eventsUrl(cfg:Pick<RtConfig,'url'|'channels'>){
 const u=new URL(cfg.url);
 u.pathname=u.pathname.replace(/\/$/,'')+'/api/fe-events';
 u.search=new URLSearchParams({c:Object.values(cfg.channels).join(',')}).toString();
 return u.toString();
}

/** The same contract over SSE: the browser's EventSource reconnects by itself (the server sends `retry`), every
 * (re)open after the first gives one refresh signal per profile, and the stream closes while the page has been hidden
 * for more than five minutes. Without EventSource nothing happens: polling covers it. */
function connectSse(cfg:RtConfig,listener:RtListener):{close:()=>void}{
 const byTopic=new Map(Object.entries(cfg.channels).map(([profile,topic])=>[topic,profile]));
 let es:EventSource|null=null;let closed=false;let paused=false;let openedOnce=false;
 let hiddenTimer:ReturnType<typeof setTimeout>|undefined;
 const stop=()=>{if(es){es.onopen=es.onmessage=es.onerror=null;es.close();es=null;}};
 function open(){
  stop();if(closed||paused||typeof EventSource==='undefined'||!byTopic.size)return;
  es=new EventSource(eventsUrl(cfg));
  es.onopen=()=>{
   if(openedOnce)for(const profile of byTopic.values())listener(null,profile); // back after a drop: something may have been missed
   openedOnce=true;
  };
  es.onmessage=e=>{
   let m:{c?:unknown,k?:unknown,t?:unknown};try{m=JSON.parse(String(e.data));}catch{return;}
   const profile=typeof m.c==='string'?byTopic.get(m.c):undefined;if(profile===undefined)return;
   if(RT_KINDS.includes(m.k as RtKind))listener(m.k as RtKind,profile,typeof m.t==='string'?m.t:undefined);
  };
  es.onerror=()=>{/* EventSource retries by itself; a closed one (HTTP error) is reopened after the server's retry */
   if(es&&es.readyState===2){stop();setTimeout(()=>{if(!closed&&!paused&&!es)open();},5_000);}
  };
 }
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
  closed=true;clearTimeout(hiddenTimer);stop();
  if(typeof document!=='undefined')document.removeEventListener('visibilitychange',onVisibility);
 }};
}
