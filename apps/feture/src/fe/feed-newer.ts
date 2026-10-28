import {useCallback,useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import {useFe,useRealtime} from './session';

/** «Новые публикации ↑» (owner, 29.10.2026). When the feed is opened again (another tab of the app, another feed
 * tab, the app back from the background) or a realtime «feed» signal comes, the first page is read past the cache and
 * compared with what is shown: a post newer than the newest one on screen lights the pill. The list itself is never
 * changed under the reader — only the pill's tap (or a pull) reloads it. */
const head=z.object({ok:z.literal(true),items:z.array(z.unknown())});
const item=z.object({id:z.string(),kind:z.string().optional(),publishedAt:z.string().nullable().optional()});
const GAP=15000;
type Shown={id:string,publishedAt:string|null}[];

export function useNewerPosts(input:Record<string,unknown>,shown:Shown|null,on:boolean):[boolean,()=>void]{
 const {call,peek}=useFe();
 const key=JSON.stringify(input);
 const [newer,setNewer]=useState(false);
 const latest=useRef({input,shown,on,key});latest.current={input,shown,on,key};
 const last=useRef(new Map<string,number>());
 // Was this list read before (a revisit)? Decided before its first answer comes here.
 const had=useRef(new Map<string,boolean>());
 if(!had.current.has(key))had.current.set(key,peek('feed.list',input,head)!==null);
 const check=useCallback(()=>{
  const {input,shown,on,key}=latest.current;
  if(!on||!shown||document.visibilityState==='hidden')return;
  const now=Date.now();if(now-(last.current.get(key)??0)<GAP)return;last.current.set(key,now);
  const ids=new Set(shown.map(p=>p.id));
  const top=shown.reduce((m,p)=>p.publishedAt&&p.publishedAt>m?p.publishedAt:m,'');
  call('feed.list',input,head,{fresh:true}).then(r=>{
   if(latest.current.key!==key)return;
   const found=r.items.some(x=>{const p=item.safeParse(x);return p.success&&p.data.kind!=='activity'&&!ids.has(p.data.id)&&!!p.data.publishedAt&&p.data.publishedAt>top;});
   if(found)setNewer(true);
  }).catch(()=>{});
 },[call]);
 // Another list: its own pill.
 useEffect(()=>{setNewer(false);},[key]);
 const loaded=shown!==null;
 // Shown here before: the next time this list loads is a revisit too.
 useEffect(()=>{if(!loaded)return;if(had.current.get(key))check();had.current.set(key,true);},[key,loaded,check]);
 useEffect(()=>{
  const vis=()=>{if(document.visibilityState==='visible')check();};
  document.addEventListener('visibilitychange',vis);return ()=>document.removeEventListener('visibilitychange',vis);
 },[check]);
 useRealtime('feed',()=>{last.current.delete(latest.current.key);check();});
 return [newer,useCallback(()=>setNewer(false),[])];
}
