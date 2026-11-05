import {useEffect,useMemo,useState} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ChevronDown,Globe,LocateFixed,MapPin,EyeOff,Check,X} from 'lucide-react';
import {Card,Chip,Chips,Row,SearchInput,SectionLabel,Sheet,Skel,Note} from './index';
import {useToast} from '../toast';

/** A city of the catalog (`place.search`: the GeoNames cities of 15 000+ people and the seats of regions). */
export type Place={id:string,country?:string|null|undefined,ru:string|null,en:string|null,pending?:boolean|undefined,lat?:number|null|undefined,lon?:number|null|undefined,/** People living there: the biggest city is listed first. */ pop?:number|null|undefined,
 /** The city's time zone (an event's time follows it). */ tz?:string|null|undefined};
/** What the city picker needs from the app, so the kit itself never calls a server: the search of the catalog, the nearest
 * city to a point, the city chosen now (its name) and a way to remember a picked one (`useCityApi` in places.ts). */
export type CityApi={search:(q:string,country:string,signal?:AbortSignal)=>Promise<Place[]>,nearest:(lat:number,lon:number)=>Promise<Place|null>,
 current?:Place|undefined,remember:(p:Place)=>void};
export const placeName=(p:{ru:string|null,en:string|null},locale:string)=>(locale==='en'?p.en??p.ru:p.ru??p.en)??'';

const CODES='AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
/** Country names from the browser (Intl), in the app's language — no country list to keep up to date. */
function countries(locale:string){
 const dn=new Intl.DisplayNames([locale==='en'?'en':'ru'],{type:'region'}),other=new Intl.DisplayNames([locale==='en'?'ru':'en'],{type:'region'});
 return CODES.map(c=>({code:c,name:dn.of(c)??c,alt:other.of(c)??c})).sort((a,b)=>a.name.localeCompare(b.name,locale));
}
const norm=(x:string)=>x.toLowerCase().replace(/ё/g,'е').replace(/[-‐–]/g,' ').trim();
const POPULAR=['moscow','spb','berlin','denpasar','tbilisi','istanbul','dubai','bangkok','almaty','belgrade','limassol','barcelona'];

/** The city picker (V21 s-location): one field for a city or a country; a country narrows the list. The catalog is the
 * GeoNames list (30 000+ cities) searched on the server as the person types — never loaded whole (owner 06.11.2026);
 * nobody adds a city by hand. Empty: the popular cities. `clear` offers «Не показывать». */
export function PlacePicker({api,current,onPick,onClose,clear,title,locate,locating,none}:{api:Pick<CityApi,'search'|'remember'>,current:string|null,
 onPick:(p:Place|null)=>void,onClose:()=>void,
 /** The top row that picks «no city» («Не показывать», «Везде», «Онлайн»). */ clear?:string,title?:string,
 /** «Определить по месту» at the top: finds the city by the phone's position and picks it. */ locate?:()=>void,locating?:boolean|undefined,
 /** «No city» is a choice of its own here (the row is ticked while nothing is picked). */ none?:boolean}){
 const {t,locale}=useI18n();const search=api.search;
 const [q,setQ]=useState('');const [country,setCountry]=useState('');
 const [list,setList]=useState<Place[]|null>(null);const [failed,setFailed]=useState(false);
 const all=useMemo(()=>countries(locale),[locale]);
 const cname=(c?:string|null)=>c?all.find(x=>x.code===c)?.name??c:'';
 const n=norm(q);
 // The server answers what is typed (a short pause after the last key); a slow answer never overwrites a newer one.
 useEffect(()=>{
  const ctl=new AbortController();setFailed(false);
  const id=window.setTimeout(()=>{search(q.trim(),country,ctl.signal).then(setList).catch(e=>{if(!ctl.signal.aborted){setFailed(true);setList([]);}void e;});},q.trim()?220:0);
  return ()=>{window.clearTimeout(id);ctl.abort();};
 },[q,country,search]);
 const cHits=n&&!country?all.filter(c=>norm(c.name+' '+c.alt).split(/\s+/).some(w=>w.startsWith(n))).slice(0,3):[];
 return <Sheet title={title??t('fe.kit.place.title')} full onClose={onClose}
  search={<SearchInput label={t('fe.kit.place.search')} placeholder={t('fe.kit.place.searchPh')} value={q} autoComplete="off" autoFocus onChange={e=>setQ(e.target.value)}/>}>
  {country&&<Chips className="mt8"><Chip on icon={Globe} label={t('fe.kit.place.allCountries')} onClick={()=>setCountry('')}>{cname(country)}<X aria-hidden="true"/></Chip></Chips>}
  {(locate||clear)&&!q&&<Card list>
   {locate&&<Row icon={LocateFixed} title={t('fe.kit.place.locate')} noChev disabled={!!locating} onClick={locate}/>}
   {clear&&<Row icon={EyeOff} title={clear} noChev pressed={!!none&&!current} val={none&&!current?<span className="ico g"><Check/></span>:undefined} onClick={()=>onPick(null)}/>}
  </Card>}
  {!q&&!country&&<SectionLabel>{t('fe.kit.place.popular')}</SectionLabel>}
  {list===null?<Skel kind="list" rows={5}/>:<Card list>
   {cHits.map(c=><Row key={c.code} icon={Globe} title={c.name} sub={t('fe.kit.place.showCities')} onClick={()=>{setCountry(c.code);setQ('');}}/>)}
   {list.map(p=><Row key={p.id} icon={MapPin} title={placeName(p,locale)} sub={cname(p.country)} pressed={current===p.id} noChev
    val={current===p.id?<span className="ico g"><Check/></span>:undefined} onClick={()=>{api.remember(p);onPick(p);}}/>)}
  </Card>}
  {failed&&<Note className="mt12">{t('fe.kit.place.failed')}</Note>}
  {list&&n&&!list.length&&!cHits.length&&!failed&&<Note className="mt12">{t('fe.kit.place.none')}</Note>}
 </Sheet>;
}

/** The form field that opens a picker (city, country…): looks like an input, shows the value or a placeholder. */
export function PickField({label,value,placeholder,onClick,icon:Icon=MapPin,error,id}:{label:string,value:string|null|undefined,placeholder:string,onClick:()=>void,
 icon?:typeof MapPin,error?:string|undefined,id?:string}){
 return <div className={'field'+(error?' err':'')}><span className="flabel">{label}</span>
  <button id={id} type="button" className="inp sel-btn" aria-haspopup="dialog" onClick={onClick}><Icon/><span className={value?'':'sel-ph'}>{value||placeholder}</span><ChevronDown/></button>
  {error&&<div className="ferr" role="alert">{error}</div>}</div>;
}

const here=()=>new Promise<{lat:number,lon:number}>((res,rej)=>{if(!('geolocation' in navigator)){rej(new Error('unsupported'));return;}
 navigator.geolocation.getCurrentPosition(p=>res({lat:p.coords.latitude,lon:p.coords.longitude}),rej,{enableHighAccuracy:false,maximumAge:600000,timeout:15000});});

/** The one «Город» field of the app (owner 05.11.2026): a row that opens the picker, and the aim icon right of it that
 * fills the nearest listed city from the phone's position (only the city is kept; the position never leaves the phone).
 * The picker has the same «Определить по месту» on top. `clear` is the picker's «no city» row (profile «Не показывать»,
 * filter «Везде»); `none` makes that state a choice of its own. A city the person adds stays pending until staff checks it. */
export function CityField({api,value,onChange,label,placeholder,clear,none,error,id,name,fallbackName,hint}:{api:CityApi,value:string|null,
 /** The chosen city's id (null: «no city») and the city itself (its time zone, country, coordinates). */ onChange:(id:string|null,place?:Place)=>void,label:string,placeholder:string,clear?:string,none?:boolean,error?:string|undefined,id?:string,name?:string,
 /** The name of a city that is not in the catalog (one chosen before the catalog was complete). */ fallbackName?:string|null,hint?:string}){
 const {t,locale}=useI18n();const toast=useToast();
 const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);
 const cur=value&&api.current?.id===value?api.current:null;
 const shown=cur?placeName(cur,locale):value?fallbackName??null:none&&clear?clear:null;
 const locate=async()=>{
  if(busy)return;setBusy(true);
  try{const c=await here();const x=await api.nearest(c.lat,c.lon);
   if(x){api.remember(x);onChange(x.id,x);setOpen(false);toast(t('fe.kit.place.found',{name:placeName(x,locale)}),{type:'ok'});}
   else toast(t('fe.kit.place.nearNone'),{type:'info'});}
  catch{toast(t('fe.kit.place.locDenied'),{type:'info'});}finally{setBusy(false);}
 };
 return <div className={'field k-city'+(error?' err':'')} data-field={name}><span className="flabel">{label}</span>
  <div className="k-city-row">
   <button id={id} type="button" className="inp sel-btn" aria-haspopup="dialog" onClick={()=>setOpen(true)}><MapPin/><span className={shown?'':'sel-ph'}>{shown||placeholder}</span><ChevronDown/></button>
   <button type="button" className="k-city-loc" aria-label={t('fe.kit.place.locate')} title={t('fe.kit.place.locate')} aria-busy={busy||undefined} disabled={busy} onClick={()=>void locate()}><LocateFixed/></button>
  </div>
  {hint&&!error&&<p className="fhint">{hint}</p>}
  {error&&<div className="ferr" role="alert">{error}</div>}
  {open&&<PlacePicker api={api} current={value} {...(clear?{clear}:{})} {...(none?{none}:{})} locate={()=>void locate()} locating={busy}
   onPick={x=>{onChange(x?.id??null,x??undefined);setOpen(false);}} onClose={()=>setOpen(false)}/>}
 </div>;
}
