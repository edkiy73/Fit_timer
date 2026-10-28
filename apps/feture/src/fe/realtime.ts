/** Realtime «something new» signals (docs/server/S2-API.md §8): a tiny Phoenix-protocol client for Supabase Realtime
 * Broadcast, without supabase-js. The server names one public channel per profile with an opaque token only its
 * members get in `session.bootstrap`; a message carries only a kind (`{k}`), and screens then fetch with the normal
 * commands. Polling stays as the fallback, so a lost socket only makes updates slower, never wrong. */

export type RtKind='chat'|'notify'|'decide'|'feed'|'typing';
export const RT_KINDS:readonly RtKind[]=['chat','notify','decide','feed','typing'];
export type RtConfig={url:string,key:string,channels:Record<string,string>};
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
