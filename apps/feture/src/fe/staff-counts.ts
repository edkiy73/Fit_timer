import {useEffect,useState} from 'react';
import {z} from 'zod';
import {useFe,useRealtime} from './session';

/** How much waits for the signed-in staff member (server/commands/staff-counts.mjs): per queue, in support, and in all.
 * Shared by the badge in the profile, the dock and the staff screen: one call serves them all (not again within 10 s),
 * refreshed by the notification signal, a slow poll while the page is open, and after every decision. */
const countsRes=z.object({ok:z.literal(true),queues:z.record(z.string(),z.number()),support:z.number(),total:z.number()});
export type StaffCounts=z.infer<typeof countsRes>;
type Call=ReturnType<typeof useFe>['call'];

let last:StaffCounts|null=null,lastAt=0,inflight:Promise<void>|null=null;
const subs=new Set<(c:StaffCounts|null)=>void>();

/** Asks the server unless it was asked a moment ago (`force`: after a decision). */
export function pullStaffCounts(call:Call,force=false):Promise<void>{
 if(inflight)return inflight;
 if(!force&&Date.now()-lastAt<10000)return Promise.resolve();
 inflight=call('staff.counts',{},countsRes,{asAccount:true,fresh:true})
  .then(r=>{last=r;lastAt=Date.now();subs.forEach(f=>f(r));}).catch(()=>{}).finally(()=>{inflight=null;});
 return inflight;
}

/** `enabled`: the person has a staff role (everyone else asks nothing). */
export function useStaffCounts(enabled:boolean):StaffCounts|null{
 const {call}=useFe();const [c,setC]=useState<StaffCounts|null>(enabled?last:null);
 useEffect(()=>{
  if(!enabled){setC(null);return;}
  subs.add(setC);if(last)setC(last);void pullStaffCounts(call);
  const id=setInterval(()=>{if(!document.hidden)void pullStaffCounts(call);},60000);
  return ()=>{subs.delete(setC);clearInterval(id);};
 },[call,enabled]);
 useRealtime(['notify'],()=>{if(enabled)void pullStaffCounts(call,true);});
 return enabled?c:null;
}
