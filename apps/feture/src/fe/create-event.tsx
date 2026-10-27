import {useEffect,useState,type ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Calendar,Check,ChevronLeft,Clock,EyeOff,Link as LinkIcon,Lock,MapPin,Ticket,Unlock,Video} from 'lucide-react';
import {FeError,feErrorMessage} from '../feture/fe-api';
import {Av,Btn,Seg} from './ui';
import {useFe} from './session';
import {ChipGroup,CoverField,FErr,Field,SelectRow,namedPlate,placeName,shakeFirstErr,useCatalog,useOp,type Cover,type PlateKey} from './create-community';

/** V21 E11 «Новое событие»: four steps (basics, time and place, admission, review), the draft saved on the server at
 * every step and on «В черновик», then `event.submit` (staff review). The client checks the limits of `eventFields`;
 * the server decides. */

type Kind='meetup'|'workshop'|'talk'|'party';
type Price='free'|'door'|'ext';
type Form={title:string,kind:Kind|'',description:string,communityId:string,plate:PlateKey,cover:Cover|null,
 format:'offline'|'online',date:string,date2:string,t1:string,t2:string,tz:string,placeId:string,area:string,exactAddress:string,joinUrl:string,
 requiresApplication:boolean,question:string,price:Price,amount:string,currency:string,ticketUrl:string,requirements:string};
type Key=keyof Form;
type Errors=Partial<Record<Key,string>>;

const KINDS:Kind[]=['meetup','workshop','talk','party'];
const CURRENCIES:[string,string][]=[['€','EUR'],['$','USD'],['£','GBP'],['₽','RUB'],['CHF','CHF']];
const ZONES:[string,string][]=[['Europe/Berlin','fe.ce.tz.berlin'],['Europe/Moscow','fe.ce.tz.moscow'],['Europe/London','fe.ce.tz.london']];
const DAY=864e5;
const HTTPS=/^https:\/\/[^\s]+$/;
const userTz=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}catch{return 'UTC';}};
const isoDay=(ms:number)=>{const d=new Date(ms);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const knownZone=(tz:string)=>{try{return tz==='UTC'||Intl.supportedValuesOf('timeZone').includes(tz);}catch{return true;}};

/** How far `tz` is from UTC at the instant `ms`. */
function tzOffset(ms:number,tz:string){
 const p=new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(new Date(ms));
 const g=(k:string)=>Number(p.find(x=>x.type===k)?.value);
 return Date.UTC(g('year'),g('month')-1,g('day'),g('hour'),g('minute'),g('second'))-ms;
}
/** The instant of a wall-clock date and time in `tz` (prototype zonedTime). */
function zonedTime(date:string,time:string,tz:string){
 const [y,m,d]=date.split('-').map(Number);const [h,mi]=time.split(':').map(Number);
 if(![y,m,d,h,mi].every(Number.isFinite))return NaN;
 try{const guess=Date.UTC(y!,m!-1,d!,h!,mi!);const first=guess-tzOffset(guess,tz);return guess-tzOffset(first,tz);}catch{return NaN;}
}
const times=(f:Form)=>({start:zonedTime(f.date,f.t1,f.tz),end:zonedTime(f.date2||f.date,f.t2,f.tz)});
const amountOf=(s:string)=>Number(s.replace(',','.').replace(/[^\d.]/g,''));
const ticketHref=(s:string)=>{const v=s.trim();return !v||/^https?:\/\//i.test(v)?v:'https://'+v;};
const fresh=():Form=>({title:'',kind:'',description:'',communityId:'',plate:'rose',cover:null,format:'offline',date:isoDay(Date.now()+7*DAY),date2:'',t1:'19:00',t2:'21:00',
 tz:userTz(),placeId:'',area:'',exactAddress:'',joinUrl:'',requiresApplication:false,question:'',price:'free',amount:'',currency:'€',ticketUrl:'',requirements:''});

/** `evfValidate()` for one step, with the server's limits. */
function validate(f:Form,step:number,t:(k:string)=>string):Errors{
 const e:Errors={};
 if(step===1){
  const ti=f.title.trim(),d=f.description.trim();
  if(ti.length<5)e.title=t('fe.ce.err.title');else if(ti.length>80)e.title=t('fe.ce.err.titleLong');
  if(!f.kind)e.kind=t('fe.ce.err.type');
  if(d.length<20)e.description=t('fe.ce.err.desc');else if(d.length>1500)e.description=t('fe.ce.err.descLong');
 }
 if(step===2){
  const {start,end}=times(f);
  if(!f.date)e.date=t('fe.ce.err.date');else if(Number.isFinite(start)&&start<Date.now())e.date=t('fe.ce.err.past');
  if(!knownZone(f.tz))e.tz=t('fe.ce.err.tz');
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)e.t2=t('fe.ce.err.end');else if(end-start>14*DAY)e.t2=t('fe.ce.err.long');
  if(f.format==='offline'){
   if(!f.placeId)e.placeId=t('fe.ce.err.city');
   if(!f.area.trim())e.area=t('fe.ce.err.area');else if(f.area.trim().length>120)e.area=t('fe.ce.err.areaLong');
   if(!f.exactAddress.trim())e.exactAddress=t('fe.ce.err.addr');else if(f.exactAddress.trim().length>300)e.exactAddress=t('fe.ce.err.addrLong');
  }else if(!HTTPS.test(f.joinUrl.trim())||f.joinUrl.trim().length>500)e.joinUrl=t('fe.ce.err.link');
 }
 if(step===3){
  if(f.price!=='free'){const a=amountOf(f.amount);if(!(a>0&&a<=100000))e.amount=t('fe.ce.err.amount');}
  if(f.price==='ext'){const u=ticketHref(f.ticketUrl);if(!HTTPS.test(u)||!/\S+\.\S+/.test(u)||u.length>500)e.ticketUrl=t('fe.ce.err.ticket');}
  if(f.requiresApplication){if(!f.question.trim())e.question=t('fe.ce.err.question');else if(f.question.trim().length>120)e.question=t('fe.ce.err.questionLong');}
  if(f.requirements.trim().length>500)e.requirements=t('fe.ce.err.reqsLong');
 }
 return e;
}
const STEP_OF:Partial<Record<Key,number>>={title:1,kind:1,description:1,communityId:1,cover:1,date:2,t2:2,tz:2,placeId:2,area:2,exactAddress:2,joinUrl:2,amount:3,ticketUrl:3,question:3,requirements:3};

/** The event as `event.submit` takes it (contracts/events.mjs eventFields). */
function eventOf(f:Form){
 const {start,end}=times(f);const off=f.format==='offline';const cur=CURRENCIES.find(([s])=>s===f.currency)?.[1]??'EUR';
 return {title:f.title.trim(),kind:f.kind,description:f.description.trim(),format:f.format,
  placeId:off?f.placeId:null,area:off?f.area.trim():null,exactAddress:off?f.exactAddress.trim():null,joinUrl:off?null:f.joinUrl.trim(),
  tz:f.tz,startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString(),
  price:f.price==='free'?{kind:'free'}:f.price==='door'?{kind:'door',amount:amountOf(f.amount),currency:cur}:{kind:'external',amount:amountOf(f.amount),currency:cur,ticketUrl:ticketHref(f.ticketUrl)},
  requiresApplication:f.requiresApplication,questions:f.requiresApplication&&f.question.trim()?[f.question.trim()]:[],
  requirements:f.requirements.trim()||null,coverAssetId:f.cover?.id??null,plate:f.plate,communityId:f.communityId||null};
}
/** What a draft keeps: the form as typed (a draft needs only a title), with the instants when they are known. */
function draftOf(f:Form){
 const {cover,...rest}=f;const {start,end}=times(f);
 return {...rest,coverAssetId:cover?.id??null,...(Number.isFinite(start)?{startsAt:new Date(start).toISOString()}:{}),...(Number.isFinite(end)?{endsAt:new Date(end).toISOString()}:{})};
}

const saved=z.object({ok:z.literal(true),id:z.uuid()}).passthrough();
const submitted=z.object({ok:z.literal(true),id:z.uuid().optional(),state:z.string().optional()}).passthrough();
const okRes=z.object({ok:z.literal(true)}).passthrough();
const comms=z.object({ok:z.literal(true),hosting:z.array(z.object({id:z.uuid(),name:z.string(),state:z.string(),role:z.string()}).passthrough())}).passthrough();

export function CreateEventScreen(){
 const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const catalog=useCatalog();
 const draftOp=useOp(),submitOp=useOp(),deleteOp=useOp();
 const [f,setF]=useState<Form>(fresh);const [step,setStep]=useState(1);const [err,setErr]=useState<Errors>({});
 const [draftId,setDraftId]=useState<string|null>(null);const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState<{kind:'ok'|'warn'|'err',text:string}|null>(null);const [pv,setPv]=useState<'all'|'ok'>('all');const [asking,setAsking]=useState(false);
 const [hosting,setHosting]=useState<{id:string,name:string}[]>([]);
 const couple=acting?.kind==='couple';
 useEffect(()=>{call('community.mine',{},comms).then(r=>setHosting(r.hosting.filter(c=>c.state==='published'&&(c.role==='owner'||c.role==='host')))).catch(()=>{});},[call]);
 // The first approved place is the default city, as the prototype starts with one.
 useEffect(()=>{const first=catalog?.places[0];if(first)setF(x=>x.placeId?x:{...x,placeId:first.id});},[catalog]);
 useEffect(()=>{document.querySelector('.v21 .view')?.scrollTo({top:0});},[step]);

 const set=<K extends Key>(k:K,v:Form[K])=>{setF(x=>({...x,[k]:v}));setErr(e=>{if(!e[k])return e;const n={...e};delete n[k];return n;});};
 const saveDraft=async(nextStep:number)=>{
  const payload={...(draftId?{draftId}:{}),step:nextStep,form:draftOf(f)};
  const r=await call('event.draftSave',{opId:draftOp.opFor(payload),...payload},saved);draftOp.done();
  setDraftId(r.id);return r.id;
 };
 const toDraft=async()=>{
  if(busy)return;setNotice(null);
  if(!f.title.trim()){setErr(e=>({...e,title:t('fe.ce.err.draftTitle')}));if(step!==1)setStep(1);shakeFirstErr();return;}
  setBusy(true);
  try{await saveDraft(step);setNotice({kind:'ok',text:couple?t('fe.ce.draftSavedCouple'):t('fe.ce.draftSaved')});}
  catch(e){setNotice({kind:'err',text:feErrorMessage(e,t)});}
  finally{setBusy(false);}
 };
 const next=async()=>{
  if(busy)return;setNotice(null);
  const e=validate(f,step,t);setErr(e);
  if(Object.keys(e).length){shakeFirstErr();return;}
  setBusy(true);
  // The draft follows every step; a failed save does not hold the person back, it only says so.
  try{await saveDraft(step+1);}catch(x){setNotice({kind:'warn',text:t('fe.ce.draftFailed').replace('{reason}',feErrorMessage(x,t))});}
  finally{setBusy(false);}
  setStep(step+1);
 };
 const back=()=>{if(step>1){setErr({});setNotice(null);setStep(step-1);}else navigate(-1);};
 const submit=async()=>{
  if(busy)return;setNotice(null);
  for(const s of [1,2,3]){const e=validate(f,s,t);if(Object.keys(e).length){setErr(e);setStep(s);shakeFirstErr();return;}}
  const payload={...(draftId?{draftId}:{}),event:eventOf(f)};
  setBusy(true);
  try{
   const r=await call('event.submit',{opId:submitOp.opFor(payload),...payload},submitted);submitOp.done();
   navigate('/n/me?layer=mine&part=events',{replace:true,state:{notice:r.state==='pending_partner'?t('fe.ce.donePending'):t('fe.ce.done')}});
  }catch(x){
   if(x instanceof FeError&&x.code==='invalid_input'&&x.fields?.length){
    const map:Record<string,Key>={title:'title',kind:'kind',description:'description',communityId:'communityId',coverAssetId:'cover',startsAt:'date',endsAt:'t2',tz:'tz',placeId:'placeId',
     area:'area',exactAddress:'exactAddress',joinUrl:'joinUrl',price:'amount',questions:'question',requirements:'requirements',format:'t2'};
    const e:Errors={};for(const fl of x.fields){const k=map[fl.split('.')[0]!];if(k)e[k]=k==='cover'?t('fe.ce.err.cover'):k==='date'?t('fe.ce.err.past'):k==='tz'?t('fe.ce.err.tz'):t('fe.ce.err.fields');}
    const steps=Object.keys(e).map(k=>STEP_OF[k as Key]??4);
    if(steps.length){setErr(e);setStep(Math.min(...steps));shakeFirstErr();}else setNotice({kind:'err',text:feErrorMessage(x,t)});
   }else setNotice({kind:'err',text:feErrorMessage(x,t)});
  }finally{setBusy(false);}
 };
 const removeDraft=async()=>{
  if(!draftId||busy)return;setBusy(true);setNotice(null);
  const payload={draftId};
  try{await call('event.draftDelete',{opId:deleteOp.opFor(payload),...payload},okRes);deleteOp.done();navigate('/n/me?layer=mine&part=events',{replace:true});}
  catch(e){setNotice({kind:'err',text:feErrorMessage(e,t)});setAsking(false);}
  finally{setBusy(false);}
 };

 const names=[1,2,3,4].map(i=>t('fe.ce.step.'+i));
 const places:[string,string][]=(catalog?.places??[]).map(p=>[p.id,placeName(p,locale)]);
 const tzItems:[string,string][]=[...(!ZONES.some(([z])=>z===f.tz)?[[f.tz,`${f.tz} · ${t('fe.ce.tzSelected')}`] as [string,string]]:[]),...ZONES.map(([z,k])=>[z,t(k)] as [string,string])];
 const chip=(on:boolean,label:string,onClick:()=>void,key:string)=><button key={key} type="button" className={'chip'+(on?' on':'')} aria-pressed={on} onClick={onClick}>{label}</button>;

 let body:ReactNode=null;
 if(step===1)body=<>
  {couple&&acting&&<p className="as-line full"><Av name={acting.name} seed={acting.id} size="xs" src={acting.avatar}/><span>{t('fe.ce.organiser')} <b>{acting.name}</b></span></p>}
  <Field name="title" label={t('fe.ce.name')} ph={t('fe.ce.namePh')} max={80} value={f.title} onChange={v=>set('title',v)} err={err.title}/>
  <div className={'field'+(err.kind?' err':'')} data-field="type"><span className="flabel">{t('fe.ce.type')}</span>
   <ChipGroup items={KINDS.map(k=>[k,t('fe.ce.kind.'+k)])} selected={f.kind?[f.kind]:[]} onToggle={k=>set('kind',k as Kind)}/>
   {err.kind&&<FErr>{err.kind}</FErr>}</div>
  <Field name="desc" label={t('fe.ce.desc')} ph={t('fe.ce.descPh')} max={1500} textarea rows={6} value={f.description} onChange={v=>set('description',v)} err={err.description}/>
  {(hosting.length>0||f.communityId)&&<div className={'field'+(err.communityId?' err':'')}>
   <SelectRow label={t('fe.ce.community')} sub={t('fe.ce.communitySub')} value={f.communityId} onChange={v=>set('communityId',v)} items={[['',t('fe.ce.communityNone')],...hosting.map(c=>[c.id,c.name] as [string,string])]}/>
   {err.communityId&&<FErr>{err.communityId}</FErr>}</div>}
  <CoverField purpose="event" plate={f.plate} setPlate={k=>set('plate',k)} cover={f.cover} setCover={c=>set('cover',c)}/>
  {err.cover&&<FErr>{err.cover}</FErr>}
 </>;
 if(step===2)body=<>
  <div className="field"><span className="flabel">{t('fe.ce.format')}</span><div className="chips">
   {(['offline','online'] as const).map(k=>chip(f.format===k,t('fe.ce.'+k),()=>set('format',k),k))}</div></div>
  <Field name="date" label={t('fe.ce.date')} type="date" min={isoDay(Date.now())} value={f.date} onChange={v=>set('date',v)} err={err.date}/>
  <Field name="date2" label={t('fe.ce.date2')} type="date" opt min={f.date} value={f.date2} onChange={v=>{set('date2',v);setErr(e=>({...e,t2:''}));}}/>
  <div className="row g8" style={{alignItems:'flex-start'}}>
   <div className="grow"><Field name="t1" label={t('fe.ce.t1')} type="time" value={f.t1} onChange={v=>{set('t1',v);setErr(e=>({...e,t2:''}));}}/></div>
   <div className="grow"><Field name="t2" label={t('fe.ce.t2')} type="time" value={f.t2} onChange={v=>set('t2',v)} err={err.t2||undefined}/></div>
  </div>
  <label className={'field'+(err.tz?' err':'')} data-field="tz"><span>{t('fe.ce.tz')}</span>
   <select className="inp" name="tz" value={f.tz} onChange={e=>set('tz',e.target.value)}>{tzItems.map(([z,l])=><option key={z} value={z}>{l}</option>)}</select>
   {err.tz?<FErr>{err.tz}</FErr>:<div className="fhint">{t('fe.ce.tzHint')}</div>}</label>
  {f.format==='offline'?<>
   <label className={'field'+(err.placeId?' err':'')} data-field="city"><span>{t('fe.ce.city')}</span>
    <select className="inp" name="city" value={f.placeId} onChange={e=>set('placeId',e.target.value)}>{!f.placeId&&<option value="">—</option>}{places.map(([id,l])=><option key={id} value={id}>{l}</option>)}</select>
    {err.placeId&&<FErr>{err.placeId}</FErr>}</label>
   <Field name="area" label={t('fe.ce.area')} ph={t('fe.ce.areaPh')} value={f.area} onChange={v=>set('area',v)} err={err.area}/>
   <Field name="addr" label={t('fe.ce.addr')} icon={Lock} ph={t('fe.ce.addrPh')} value={f.exactAddress} onChange={v=>set('exactAddress',v)} err={err.exactAddress}/>
  </>:<Field name="link" label={t('fe.ce.link')} icon={LinkIcon} type="url" inputMode="url" ph="https://" value={f.joinUrl} onChange={v=>set('joinUrl',v)} err={err.joinUrl}/>}
 </>;
 if(step===3)body=<>
  <div className="card list"><button type="button" className="li" role="switch" aria-checked={f.requiresApplication} onClick={()=>set('requiresApplication',!f.requiresApplication)}>
   <span className="tx"><b>{t('fe.ce.approval')}</b><small>{t('fe.ce.approvalSub')}</small></span><span className={'sw'+(f.requiresApplication?' on':'')} aria-hidden="true"/></button></div>
  {f.requiresApplication&&<><div style={{height:12}}/><Field name="q0" label={t('fe.ce.question')} ph={t('fe.ce.questionPh')} max={120} value={f.question} onChange={v=>set('question',v)} err={err.question}/></>}
  <div className="field mt12"><span className="flabel">{t('fe.ce.price')}</span><div className="chips">
   {(['free','door','ext'] as const).map(k=>chip(f.price===k,t('fe.ce.price.'+k),()=>set('price',k),k))}</div></div>
  {f.price!=='free'&&<div className="row g8 ev-price" style={{alignItems:'flex-start'}}>
   <div className="grow"><Field name="amount" label={t('fe.ce.amount')} ph="15" inputMode="decimal" value={f.amount} onChange={v=>set('amount',v)} err={err.amount}/></div>
   <div className="ev-cur"><SelectRow aria={t('fe.ce.currency')} value={f.currency} onChange={v=>set('currency',v)} items={CURRENCIES.map(([s])=>[s,s])}/></div>
  </div>}
  {f.price==='ext'&&<Field name="ext" label={t('fe.ce.ticket')} icon={LinkIcon} ph="tickets.example.org" hint={t('fe.ce.ticketHint')} value={f.ticketUrl} onChange={v=>set('ticketUrl',v)} err={err.ticketUrl}/>}
  <Field name="reqs" label={t('fe.ce.reqs')} opt textarea rows={3} max={500} ph={t('fe.ce.reqsPh')} value={f.requirements} onChange={v=>set('requirements',v)} err={err.requirements}/>
  <div className="alert mt8"><EyeOff/><span>{t('fe.ce.listsHidden')}</span></div>
 </>;
 if(step===4){
  const {start,end}=times(f);const ok=Number.isFinite(start)&&Number.isFinite(end);
  const tzView=f.format==='online'?undefined:f.tz;
  const fmt=(ms:number,o:Intl.DateTimeFormatOptions)=>{try{return new Date(ms).toLocaleString(locale==='en'?'en':'ru',{...o,timeZone:tzView});}catch{return new Date(ms).toLocaleString(locale==='en'?'en':'ru',o);}};
  const priceText=f.price==='free'?t('fe.ce.price.free'):`${f.amount.trim()} ${f.currency}`;
  const site=f.price==='ext'?ticketHref(f.ticketUrl).replace(/^https?:\/\//i,'').split('/')[0]??'':'';
  const area=f.format==='online'?t('fe.ce.online'):f.area.trim()||(catalog?placeName(catalog.places.find(p=>p.id===f.placeId)??{ru:'',en:''},locale):'');
  body=<>
   <Seg value={pv} onChange={setPv} options={[{id:'all',label:t('fe.ce.pv.all')},{id:'ok',label:t('fe.ce.pv.ok')}]}/>
   <div style={{pointerEvents:'none'}}><div className="evc" aria-hidden="true">
    <div className="cv">{f.cover?<img className="evimg" src={f.cover.preview} alt="" draggable={false}/>:<div className="plate" style={namedPlate(f.plate)}><span className="pi"><Calendar/></span></div>}
     {ok&&<div className="date"><b>{fmt(start,{day:'numeric'})}</b><small>{fmt(start,{month:'short'})}</small></div>}
     <div className="fmt"><span>{f.format==='online'?<Video/>:<MapPin/>}{area}</span></div></div>
    <div className="bd"><small>{f.kind?t('fe.ce.kind.'+f.kind):''}{acting?' · '+acting.name:''}</small><b>{f.title.trim()}</b>
     <div className="meta"><span><Clock/>{ok?fmt(start,{hour:'2-digit',minute:'2-digit'}):''}</span><span><Ticket/>{priceText}</span></div></div>
   </div></div>
   <div className="card list mt12"><div className="li"><span className={'ico'+(pv==='ok'?' g':'')}>{pv==='ok'?<Unlock/>:<Lock/>}</span>
    <span className="tx"><b>{f.format==='online'?t('fe.ce.pv.link'):t('fe.ce.pv.address')}</b><small>{pv==='ok'?(f.format==='online'?f.joinUrl.trim():f.exactAddress.trim()):t('fe.ce.pv.hidden')}</small></span></div></div>
   <div className="card list mt12">
    <div className="li"><span className="ico l"><Calendar/></span><span className="tx"><b>{ok?fmt(start,{weekday:'short',day:'numeric',month:'long'}):''}</b>
     <small>{ok?`${fmt(start,{hour:'2-digit',minute:'2-digit'})}–${fmt(end,{hour:'2-digit',minute:'2-digit'})}`:''} {f.format==='online'?t('fe.ce.pv.yourTime'):t('fe.ce.pv.localTime')}</small></span></div>
    <div className="li"><span className="ico a"><Ticket/></span><span className="tx"><b>{priceText}</b>
     <small>{f.price==='ext'?t('fe.ce.pv.ticketOn').replace('{site}',site):f.requiresApplication?t('fe.ce.pv.byApplication'):t('fe.ce.pv.justCome')}</small></span></div>
   </div>
   {f.description.trim()&&<><div className="sec">{t('fe.ce.pv.about')}</div><div className="md bio"><p>{f.description.trim()}</p></div></>}
   {f.requirements.trim()&&<><div className="sec">{t('fe.ce.reqs')}</div><div className="card"><div className="fact"><i className="v"><Check/></i><span>{f.requirements.trim()}</span></div></div></>}
   {f.requiresApplication&&f.question.trim()&&<><div className="sec">{t('fe.ce.question')}</div><p className="note">{f.question.trim()}</p></>}
   <div className="alert warn mt12"><Clock/><span>{couple?t('fe.ce.reviewCouple'):t('fe.ce.review')}</span></div>
  </>;
 }

 return <>
  <header className="bar">
   <button type="button" className="ibtn ghost" aria-label={t('fe.back')} onClick={back}><ChevronLeft/></button>
   <h1 className="sm" tabIndex={-1}>{draftId?t('fe.ce.titleDraft'):t('fe.ce.title')}</h1>
   <button type="button" className="btn text auto" onClick={toDraft} disabled={busy}>{t('fe.ce.toDraft')}</button>
  </header>
  <div className="view nodock cta1"><div className="wrap">
   <div className="stepper"><span>{step}/4 · {names[step-1]}</span><div className="qprog"><i style={{width:`${step*25}%`}}/></div></div>
   {step<4?<section className="grp"><div className="card form-card">{body}</div></section>:body}
   {notice&&<div className={'alert mt12 '+notice.kind} role={notice.kind==='ok'?'status':'alert'}><span>{notice.text}</span></div>}
   {draftId&&(asking
    ?<div className="alert warn mt12" role="alertdialog"><span>{t('fe.ce.draftDeleteAsk')}</span><div className="row g8 mt8"><Btn kind="danger" size="sm" auto onClick={removeDraft} disabled={busy}>{t('fe.ce.draftDeleteOk')}</Btn><Btn kind="text" size="sm" auto onClick={()=>setAsking(false)}>{t('fe.ce.cancel')}</Btn></div></div>
    :<div className="row mt12"><Btn kind="text" size="sm" auto onClick={()=>setAsking(true)} disabled={busy}>{t('fe.ce.draftDelete')}</Btn></div>)}
  </div></div>
  <div className="ctabar"><div className="wrap"><div className="row g8">
   {step>1&&<button type="button" className="btn soft" style={{flex:'0 0 auto',width:'auto'}} onClick={back} disabled={busy}><ChevronLeft/>{t('fe.ce.back')}</button>}
   <Btn onClick={step<4?next:submit} disabled={busy}>{busy?(step<4?t('fe.ce.saving'):t('fe.ce.sending')):step<4?t('fe.ce.next'):t('fe.ce.submit')}</Btn>
  </div></div></div>
 </>;
}
