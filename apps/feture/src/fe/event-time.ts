import {useEffect,useState} from 'react';
import {z} from 'zod';
import {useFe} from './session';

/** The one place that says WHEN and WHERE an event is. An event's time is always shown in the event's own time zone
 * (the zone of its city, stored as `tz` on the event), with the zone named next to the time, so the card, the list,
 * the search and the page never disagree. Callers never format an event date themselves. */

const loc=(locale:string)=>locale==='en'?'en-GB':'ru-RU';
const known=(tz:string)=>{try{new Intl.DateTimeFormat('en',{timeZone:tz});return true;}catch{return false;}};

export const USER_TZ=(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}catch{return 'UTC';}})();
/** The zone an event is shown in: its own. Only an old row without one falls back to the viewer's zone. */
export const evTz=(e:{tz?:string|null|undefined})=>e.tz&&known(e.tz)?e.tz:USER_TZ;

export const inTz=(iso:string,tz:string,locale:string,o:Intl.DateTimeFormatOptions)=>{
 try{return new Date(iso).toLocaleString(loc(locale),{...o,timeZone:tz});}catch{return new Date(iso).toLocaleString(loc(locale),o);}};
export const timeOf=(iso:string,tz:string,locale:string)=>inTz(iso,tz,locale,{hour:'2-digit',minute:'2-digit'});

/** Zone → how people call it. Other zones show the last part of their name. */
const ZONE_NAME:Record<string,[string,string]>={
 'Europe/Berlin':['Берлин','Berlin'],'Europe/Moscow':['Москва','Moscow'],'Europe/London':['Лондон','London'],'Europe/Vienna':['Вена','Vienna'],
 'Europe/Zurich':['Цюрих','Zurich'],'Europe/Amsterdam':['Амстердам','Amsterdam'],'Europe/Paris':['Париж','Paris'],'Europe/Madrid':['Мадрид','Madrid'],
 'Europe/Rome':['Рим','Rome'],'Europe/Warsaw':['Варшава','Warsaw'],'Europe/Prague':['Прага','Prague'],'Europe/Kyiv':['Киев','Kyiv'],
 'Europe/Istanbul':['Стамбул','Istanbul'],'Asia/Tbilisi':['Тбилиси','Tbilisi'],'Asia/Almaty':['Алма-Ата','Almaty'],'Asia/Krasnoyarsk':['Красноярск','Krasnoyarsk'],
 'Asia/Novosibirsk':['Новосибирск','Novosibirsk'],'Asia/Yekaterinburg':['Екатеринбург','Yekaterinburg'],'UTC':['UTC','UTC'],
 'Asia/Dubai':['Дубай','Dubai'],'Asia/Tashkent':['Ташкент','Tashkent'],'Asia/Irkutsk':['Иркутск','Irkutsk'],'Asia/Vladivostok':['Владивосток','Vladivostok'],'Asia/Bangkok':['Бангкок','Bangkok'],
 'Asia/Singapore':['Сингапур','Singapore'],'Asia/Tokyo':['Токио','Tokyo'],'Australia/Sydney':['Сидней','Sydney'],'Pacific/Auckland':['Окленд','Auckland'],'America/Sao_Paulo':['Сан-Паулу','São Paulo'],
 'America/New_York':['Нью-Йорк','New York'],'America/Chicago':['Чикаго','Chicago'],'America/Denver':['Денвер','Denver'],'America/Los_Angeles':['Лос-Анджелес','Los Angeles']};
const zoneName=(tz:string,locale:string)=>{const n=ZONE_NAME[tz];return n?n[locale==='en'?1:0]:(tz.split('/').pop()??tz).replace(/_/g,' ');};
/** «UTC+1», «UTC+5:30», «UTC». */
const offsetOf=(iso:string,tz:string,locale:string)=>{
 try{const p=new Intl.DateTimeFormat(loc(locale),{timeZone:tz,timeZoneName:'shortOffset'}).formatToParts(new Date(iso)).find(x=>x.type==='timeZoneName')?.value??'';
  return p.replace(/^GMT|^UTC/,'UTC').replace('−','-');}catch{return 'UTC';}};
/** «Берлин (UTC+1)». */
export const zoneLabel=(tz:string,iso:string,locale:string)=>`${zoneName(tz,locale)} (${offsetOf(iso,tz,locale)})`;

type Timed={starts_at?:string|undefined,startsAt?:string|undefined,ends_at?:string|undefined,endsAt?:string|undefined,tz?:string|null|undefined};
const startOf=(e:Timed)=>(e.starts_at??e.startsAt)!;
const endOf=(e:Timed)=>e.ends_at??e.endsAt;
/** Pieces of an event's date in its own zone, for cards: day number, short month, clock time. */
export function evParts(e:Timed,locale:string){
 const tz=evTz(e),iso=startOf(e);
 return {day:inTz(iso,tz,locale,{day:'numeric'}),month:inTz(iso,tz,locale,{month:'short'}).replace('.',''),time:timeOf(iso,tz,locale),zone:zoneLabel(tz,iso,locale)};
}
/** «30 окт., 19:00 · Берлин (UTC+1)» — one line for lists. */
export function evWhen(e:Timed,locale:string,withDate=true){
 const tz=evTz(e),iso=startOf(e);const p=evParts(e,locale);
 return (withDate?inTz(iso,tz,locale,{day:'numeric',month:'short'}).replace('.','')+', ':'')+p.time+' · '+p.zone;
}
/** «19:00–21:00 · Берлин (UTC+1)» for the event page. */
export function evRange(e:Timed,locale:string){
 const tz=evTz(e),iso=startOf(e),end=endOf(e);
 return timeOf(iso,tz,locale)+(end?'–'+timeOf(end,tz,locale):'')+' · '+zoneLabel(tz,iso,locale);
}

/** The zone of a catalog city: by its code, then by its country. A city the table does not know gives null (the form
 * then asks the organiser's own zone — and never a free picker). */
const CODE_TZ:Record<string,string>={abakan:'Asia/Krasnoyarsk',krasnoyarsk:'Asia/Krasnoyarsk',novosibirsk:'Asia/Novosibirsk',yekaterinburg:'Asia/Yekaterinburg'};
const COUNTRY_TZ:Record<string,string>={DE:'Europe/Berlin',RU:'Europe/Moscow',GB:'Europe/London',AT:'Europe/Vienna',CH:'Europe/Zurich',NL:'Europe/Amsterdam',
 FR:'Europe/Paris',ES:'Europe/Madrid',IT:'Europe/Rome',PL:'Europe/Warsaw',CZ:'Europe/Prague',UA:'Europe/Kyiv',TR:'Europe/Istanbul',GE:'Asia/Tbilisi',KZ:'Asia/Almaty'};
export const placeZone=(p:{code?:string|null|undefined,country?:string|null|undefined}|null|undefined)=>
 p?(p.code&&CODE_TZ[p.code])||(p.country&&COUNTRY_TZ[p.country.toUpperCase()])||null:null;
/** Zones offered for an online event, which has no city. */
export const ONLINE_ZONES=['Europe/Berlin','Europe/Moscow','Europe/London','Europe/Kyiv','Europe/Istanbul','Asia/Tbilisi','Asia/Dubai','Asia/Almaty','Asia/Tashkent','Asia/Yekaterinburg','Asia/Novosibirsk','Asia/Krasnoyarsk','Asia/Irkutsk','Asia/Vladivostok','Asia/Bangkok','Asia/Singapore','Asia/Tokyo','Australia/Sydney','Pacific/Auckland','America/Sao_Paulo','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','UTC'];

const placesRes=z.object({ok:z.literal(true),places:z.array(z.object({id:z.uuid(),ru:z.string().nullable(),en:z.string().nullable()}).passthrough())}).passthrough();
let placesCache:Promise<Map<string,{ru:string|null,en:string|null}>>|null=null;
/** City names of approved places, loaded once for every card on the screen. */
export function usePlaces(){
 const {call}=useFe();const [m,setM]=useState<Map<string,{ru:string|null,en:string|null}>|null>(null);
 useEffect(()=>{
  placesCache??=call('catalog.get',{},placesRes,{asAccount:true}).then(r=>new Map(r.places.map(p=>[p.id,{ru:p.ru,en:p.en}] as const)));
  let live=true;placesCache.then(x=>{if(live)setM(x);}).catch(()=>{placesCache=null;});
  return ()=>{live=false;};
 },[call]);
 return m;
}
/** «Берлин · Кройцберг» — the city and the district, never the exact address. */
export function evWhere(e:{format:string,area?:string|null|undefined,place_id?:string|null|undefined,placeId?:string|null|undefined},
 places:Map<string,{ru:string|null,en:string|null}>|null,locale:string,online:string,fallback:string){
 if(e.format==='online')return online;
 const p=places?.get((e.place_id??e.placeId)??'');const city=p?((locale==='en'?p.en??p.ru:p.ru??p.en)??''):'';
 const area=(e.area??'').trim();
 return [city,area&&area!==city?area:''].filter(Boolean).join(' · ')||fallback;
}
