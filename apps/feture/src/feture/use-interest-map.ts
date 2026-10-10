import { useEffect, useSyncExternalStore } from 'react';
import { useOptionalAuth } from '@appbase/ui-react/auth.js';
import { authClient } from '../auth';
import { apiUrl } from '../api-url';
import { createInterestAPI } from './interest-api';
import { createInterestStore } from './interest-store';
import { createInterestQueue } from './interest-queue';

let channel:BroadcastChannel|undefined;
export const interestQueue=createInterestQueue({
 store:createInterestStore(),api:createInterestAPI(apiUrl('/api/domain'),()=>authClient.getSession()),
 getSession:()=>authClient.getSession(),changed:()=>channel?.postMessage('changed')
});
export function InterestLifecycle(){
 const auth=useOptionalAuth();
 useEffect(()=>{
  const wake=()=>{void interestQueue.select().then(()=>interestQueue.sync());};
  const storage=(event:StorageEvent)=>{if(event.key==='feture.auth.session'||event.key===null)wake();};
  const visible=()=>{if(document.visibilityState==='visible')wake();};
  try{channel=new BroadcastChannel('feture/interests');channel.onmessage=()=>{void interestQueue.reload();};}catch{}
  window.addEventListener('storage',storage);window.addEventListener('online',wake);window.addEventListener('focus',wake);
  document.addEventListener('visibilitychange',visible);
  const clock=setInterval(()=>{void interestQueue.select();},10000);
  wake();
  return ()=>{clearInterval(clock);channel?.close();channel=undefined;window.removeEventListener('storage',storage);window.removeEventListener('online',wake);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',visible);};
 },[]);
 useEffect(()=>{void interestQueue.select().then(()=>interestQueue.sync());},[auth.loading,auth.session?.email,auth.session?.deviceId,auth.session?.syncToken]);
 return null;
}
export function useInterestMap(){
 const snapshot=useSyncExternalStore(interestQueue.subscribe,interestQueue.getSnapshot);
 return {...snapshot,loading:snapshot.phase==='loading',saving:snapshot.phase==='syncing',
  save:(id:string,state:Parameters<typeof interestQueue.save>[1])=>interestQueue.save(id,state,snapshot.scope),
  remove:(id:string)=>interestQueue.remove(id,snapshot.scope),
  resolve:(id:string,keepLocal:boolean)=>interestQueue.resolve(id,keepLocal,snapshot.scope),
  importGuest:()=>interestQueue.importGuest(snapshot.scope),retry:()=>interestQueue.sync()
 };
}
