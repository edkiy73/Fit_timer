import {useCallback,useEffect,useSyncExternalStore} from 'react';
import {z} from 'zod';
import {useFe} from './session';
import type {CityApi,Place} from './kit/Place';

/** The city catalog lives on the server (GeoNames, 30 000+ cities): it is searched there, never loaded whole (owner
 * 06.11.2026). Three reads: `place.search` (the picker), `place.get` (names of cities a screen already shows) and
 * `place.nearest` (the aim button). */
const row=z.object({id:z.string(),code:z.string().nullable().optional(),country:z.string().nullable().optional(),ru:z.string().nullable(),en:z.string().nullable(),
 lat:z.number().nullable().optional(),lon:z.number().nullable().optional(),pop:z.number().nullable().optional(),tz:z.string().nullable().optional()}).passthrough();
const listRes=z.object({ok:z.literal(true),items:z.array(row)}).passthrough();
const nearestRes=z.object({ok:z.literal(true),place:row.nullable()}).passthrough();

/** The picker's search: the typed words (empty — the popular cities), narrowed to a country when one is chosen. */
export function usePlaceSearch(){
 const {call}=useFe();
 return useCallback((q:string,country:string,signal?:AbortSignal):Promise<Place[]>=>
  call('place.search',{q,...(country?{country}:{})},listRes,{asAccount:true,...(signal?{signal}:{})}).then(r=>r.items),[call]);
}

/** The catalog city nearest to a point (within 150 km), or null. */
export function usePlaceNearest(){
 const {call}=useFe();
 return useCallback((lat:number,lon:number):Promise<Place|null>=>call('place.nearest',{lat,lon},nearestRes,{asAccount:true}).then(r=>r.place),[call]);
}

// --- names by id: one cache for the whole app, asked in batches ---------------------------------------------------------
const cache=new Map<string,Place>();
const asked=new Set<string>();
let queue:string[]=[],timer:number|undefined,version=0,callRef:ReturnType<typeof useFe>['call']|null=null;
const listeners=new Set<()=>void>();
const bump=()=>{version++;listeners.forEach(l=>l());};

function flush(){
 timer=undefined;
 const call=callRef;if(!call||!queue.length)return;
 const ids=queue.splice(0,100);
 if(queue.length)timer=window.setTimeout(flush,0);
 call('place.get',{ids},listRes,{asAccount:true}).then(r=>{for(const p of r.items)cache.set(p.id,p);bump();})
  .catch(()=>{for(const id of ids)asked.delete(id);}); // asked again the next time a screen shows it
}

/** Cities by id (`place.get`), for the places a screen shows — a profile's city, an event's, a community's. Ids of one
 * render are asked together; what is known stays for the session. A city that is not known yet is simply absent. */
export function usePlaces(ids:readonly (string|null|undefined)[]):Map<string,Place>{
 const {call}=useFe();
 useSyncExternalStore(l=>{listeners.add(l);return ()=>{listeners.delete(l);};},()=>version);
 const key=ids.filter(Boolean).join(',');
 useEffect(()=>{
  callRef=call;
  let any=false;
  for(const id of key?key.split(','):[])if(!cache.has(id)&&!asked.has(id)){asked.add(id);queue.push(id);any=true;}
  if(any&&timer===undefined)timer=window.setTimeout(flush,20);
 },[key,call]);
 const out=new Map<string,Place>();
 for(const id of ids)if(id){const p=cache.get(id);if(p)out.set(id,p);}
 return out;
}

/** Puts a city the person has just picked into the cache, so its name shows at once. */
export function rememberPlace(p:Place){cache.set(p.id,p);bump();}

/** What the kit's `CityField` needs (`CityApi`): the server search, the nearest city and the name of the chosen one. */
export function useCityApi(value:string|null|undefined):CityApi{
 const search=usePlaceSearch();const nearest=usePlaceNearest();
 const current=usePlaces([value]).get(value??'');
 return {search,nearest,current,remember:rememberPlace};
}
