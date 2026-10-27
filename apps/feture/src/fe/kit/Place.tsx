import {useMemo,useState} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ChevronDown,ChevronLeft,Globe,MapPin,Plus,EyeOff,Check,X} from 'lucide-react';
import {Btn} from '../ui';
import {Card,Chip,Chips,Row,SearchInput,SectionLabel,Sheet,Note} from './index';

/** A city of the catalog (`catalog.get` places) or one the person added (pending until staff checks the spelling). */
export type Place={id:string,country?:string|null|undefined,ru:string|null,en:string|null,pending?:boolean|undefined};
export const placeName=(p:{ru:string|null,en:string|null},locale:string)=>(locale==='en'?p.en??p.ru:p.ru??p.en)??'';

const CODES='AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
/** Country names from the browser (Intl), in the app's language — no country list to keep up to date. */
function countries(locale:string){
 const dn=new Intl.DisplayNames([locale==='en'?'en':'ru'],{type:'region'}),other=new Intl.DisplayNames([locale==='en'?'ru':'en'],{type:'region'});
 return CODES.map(c=>({code:c,name:dn.of(c)??c,alt:other.of(c)??c})).sort((a,b)=>a.name.localeCompare(b.name,locale));
}
const norm=(x:string)=>x.toLowerCase().replace(/ё/g,'е').replace(/[-‐–]/g,' ').trim();
const POPULAR=['moscow','spb','berlin','denpasar','tbilisi','istanbul','dubai','bangkok','almaty','belgrade','limassol','barcelona'];

/** The city picker (V21 s-location): one field for a city or a country; a country narrows the list; a city that is
 * not listed is added after choosing its country (`add` → place.submit, checked by staff). `clear` offers «Не показывать». */
export function PlacePicker({places,current,onPick,onClose,add,clear,title}:{places:readonly (Place&{code?:string|null|undefined})[],current:string|null,
 onPick:(p:Place|null)=>void,onClose:()=>void,/** Adds a city that is not listed; returns it (pending). */ add?:(country:string,name:string)=>Promise<Place>,
 clear?:string,title?:string}){
 const {t,locale}=useI18n();
 const [q,setQ]=useState('');const [country,setCountry]=useState('');const [ask,setAsk]=useState(false);const [cq,setCq]=useState('');
 const [busy,setBusy]=useState(false);const [err,setErr]=useState('');
 const all=useMemo(()=>countries(locale),[locale]);
 const cname=(c?:string|null)=>c?all.find(x=>x.code===c)?.name??c:'';
 const n=norm(q);
 const inCountry=places.filter(p=>!country||p.country===country);
 const hits=n?inCountry.filter(p=>{const s=norm((p.ru??'')+' '+(p.en??''));return s.split(/\s+/).some(w=>w.startsWith(n))||s.includes(n);})
  :country?inCountry:POPULAR.map(c=>places.find(p=>p.code===c)).filter((p):p is Place=>!!p);
 const sorted=[...hits].sort((a,b)=>placeName(a,locale).localeCompare(placeName(b,locale),locale)).slice(0,40);
 const cHits=n&&!country?all.filter(c=>norm(c.name+' '+c.alt).split(/\s+/).some(w=>w.startsWith(n))).slice(0,3):[];
 const exact=hits.some(p=>norm(p.ru??'')===n||norm(p.en??'')===n);
 const typed=q.trim();
 const addIn=async(c:string)=>{if(!add||typed.length<2)return;setBusy(true);setErr('');
  try{const nm=typed[0]!.toUpperCase()+typed.slice(1);onPick(await add(c,nm));}catch{setErr(t('fe.kit.place.addFail'));}finally{setBusy(false);}};
 if(ask){const cn=norm(cq);const list=all.filter(c=>!cn||norm(c.name+' '+c.alt+' '+c.code).includes(cn)).slice(0,60);
  return <Sheet title={title??t('fe.kit.place.title')} full onClose={onClose}>
   <SectionLabel>{t('fe.kit.place.whichCountry',{name:typed})}</SectionLabel>
   <SearchInput label={t('fe.kit.place.country')} placeholder={t('fe.kit.place.countryPh')} value={cq} onChange={e=>setCq(e.target.value)} autoFocus/>
   {err&&<Note className="mt8">{err}</Note>}
   <Card list>{list.map(c=><Row key={c.code} icon={Globe} title={c.name} noChev disabled={busy} val={<Plus aria-hidden="true"/>} onClick={()=>void addIn(c.code)}/>)}</Card>
   <Btn kind="text" fit icon={ChevronLeft} onClick={()=>setAsk(false)}>{t('fe.kit.place.back')}</Btn>
  </Sheet>;}
 return <Sheet title={title??t('fe.kit.place.title')} full onClose={onClose}
  search={<SearchInput label={t('fe.kit.place.search')} placeholder={t('fe.kit.place.searchPh')} value={q} autoComplete="off" autoFocus onChange={e=>setQ(e.target.value)}/>}>
  {country&&<Chips className="mt8"><Chip on icon={Globe} label={t('fe.kit.place.allCountries')} onClick={()=>setCountry('')}>{cname(country)}<X aria-hidden="true"/></Chip></Chips>}
  {clear&&current&&!q&&<Card list><Row icon={EyeOff} title={clear} noChev onClick={()=>onPick(null)}/></Card>}
  {!q&&!country&&<SectionLabel>{t('fe.kit.place.popular')}</SectionLabel>}
  <Card list>
   {cHits.map(c=><Row key={c.code} icon={Globe} title={c.name} sub={t('fe.kit.place.showCities')} onClick={()=>{setCountry(c.code);setQ('');}}/>)}
   {sorted.map(p=><Row key={p.id} icon={MapPin} title={placeName(p,locale)} sub={cname(p.country)} pressed={current===p.id} noChev
    val={current===p.id?<span className="ico g"><Check/></span>:undefined} onClick={()=>onPick(p)}/>)}
   {add&&typed.length>=2&&!exact&&<Row icon={Plus} title={t('fe.kit.place.add',{name:typed})} sub={country?cname(country):t('fe.kit.place.addSub')} noChev disabled={busy}
    onClick={()=>country?void addIn(country):(setAsk(true),setCq(''))}/>}
  </Card>
  {n&&!sorted.length&&!cHits.length&&!add&&<Note className="mt12">{t('fe.kit.place.none')}</Note>}
 </Sheet>;
}

/** The form field that opens a picker (city, country…): looks like an input, shows the value or a placeholder. */
export function PickField({label,value,placeholder,onClick,icon:Icon=MapPin,error,id}:{label:string,value:string|null|undefined,placeholder:string,onClick:()=>void,
 icon?:typeof MapPin,error?:string|undefined,id?:string}){
 return <div className={'field'+(error?' err':'')}><span className="flabel">{label}</span>
  <button id={id} type="button" className="inp sel-btn" aria-haspopup="dialog" onClick={onClick}><Icon/><span className={value?'':'sel-ph'}>{value||placeholder}</span><ChevronDown/></button>
  {error&&<div className="ferr" role="alert">{error}</div>}</div>;
}
