import {useCallback,useEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {CircleAlert,Image as ImageIcon,Lock,MapPin,X,type LucideIcon} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Av,Bar,Btn} from './ui';
import {useFe} from './session';

/** V21 C08 «Новое сообщество» with the prototype's markup (field(), chipGroup(), selectRow(), the cover picker);
 * also the form pieces E11 «Новое событие» shares. The server decides; the client only checks the same limits. */

// Prototype PL: the named cover plates a community or an event can have instead of a photo.
const NAMED:Record<string,readonly [string,string,string,string]>={
 lilac:['#5C47D6','#FF5A7A','#F6B49B','#1A0F3A'],rose:['#7A1236','#FF5A7A','#B9A6FF','#2A0D1F'],sea:['#1F3A4A','#7FE0B9','#B9A6FF','#0E1A22'],
 amber:['#4A2A12','#FFB25A','#FF5A7A','#1F120A'],moss:['#25403A','#C6F27F','#2A2A55','#0D1714'],coal:['#2B2B2B','#FF6B3D','#6F6F6F','#0F0F0F'],
};
export const PLATE_KEYS=['lilac','rose','sea','amber','moss','coal'] as const;
export type PlateKey=typeof PLATE_KEYS[number];
export function namedPlate(k:string):CSSProperties{
 const p=NAMED[k]??NAMED.rose!;
 return {'--p1':p[0],'--p2':p[1],'--p3':p[2],'--p4':p[3],position:'absolute',inset:0} as CSSProperties;
}

const catalogRes=z.object({ok:z.literal(true),
 topics:z.array(z.object({id:z.string(),ru:z.string(),en:z.string()}).passthrough()),
 places:z.array(z.object({id:z.uuid(),country:z.string().nullable().optional(),ru:z.string().nullable(),en:z.string().nullable()}).passthrough())}).passthrough();
export type Catalog=z.infer<typeof catalogRes>;
/** Topics and approved places (`catalog.get`). */
export function useCatalog(){
 const {call}=useFe();const [c,setC]=useState<Catalog|null>(null);
 useEffect(()=>{call('catalog.get',{},catalogRes,{asAccount:true}).then(setC).catch(()=>{});},[call]);
 return c;
}
export const placeName=(p:{ru:string|null,en:string|null},locale:string)=>(locale==='en'?p.en??p.ru:p.ru??p.en)??'';

/** One opId per user action: a retry of the same payload reuses it, a changed payload gets a new one. */
export function useOp(){
 const ref=useRef<{key:string,op:string}|null>(null);
 const opFor=useCallback((payload:unknown)=>{const key=JSON.stringify(payload);if(ref.current?.key!==key)ref.current={key,op:newOpId()};return ref.current.op;},[]);
 const done=useCallback(()=>{ref.current=null;},[]);
 return {opFor,done};
}

/** shakeFirstErr(): the first field with an error shakes, gets focus and scrolls into view. */
export function shakeFirstErr(){
 requestAnimationFrame(()=>{
  const e=document.querySelector<HTMLElement>('.v21 .field.err');if(!e)return;
  e.classList.remove('shake');void e.offsetWidth;e.classList.add('shake');
  e.querySelector<HTMLElement>('.inp,input,textarea,select,button')?.focus({preventScroll:true});
  e.scrollIntoView({block:'center',behavior:'smooth'});
 });
}

export const FErr=({children}:{children:ReactNode})=><div className="ferr"><CircleAlert/>{children}</div>;

type FieldProps={name:string,label:string,value:string,onChange:(v:string)=>void,err?:string|undefined,opt?:boolean,hint?:string,max?:number,ph?:string,
 type?:string,textarea?:boolean,rows?:number,icon?:LucideIcon,inputMode?:'url'|'decimal'|'text',min?:string};
/** `field()` — label, input or textarea, then the error (or hint) and the counter. */
export function Field({name,label,value,onChange,err,opt,hint,max,ph,type='text',textarea,rows,icon:Icon,inputMode,min}:FieldProps){
 const {t}=useI18n();
 const input=textarea
  ?<textarea className="inp" name={name} rows={rows} maxLength={max?max+50:undefined} placeholder={ph} value={value} onChange={e=>onChange(e.target.value)} aria-invalid={err?true:undefined}/>
  :<input className="inp" name={name} type={type} value={value} placeholder={ph} inputMode={inputMode} min={min} maxLength={max?max+50:undefined} onChange={e=>onChange(e.target.value)} aria-invalid={err?true:undefined}/>;
 return <label className={'field'+(err?' err':'')} data-field={name}>
  <span>{label}{opt&&<i>{t('fe.cc.optional')}</i>}</span>
  {Icon?<div className="inwrap"><Icon/>{input}</div>:input}
  {err?<FErr>{err}</FErr>:hint?<div className="fhint">{hint}</div>:null}
  {max?<div className="counter">{value.length} / {max}</div>:null}
 </label>;
}

/** `selectRow()` — a native select showing its current text. */
export function SelectRow<T extends string>({label,value,items,onChange,sub,aria}:{label?:string,value:T,items:[T,string][],onChange:(v:T)=>void,sub?:string,aria?:string}){
 const sel=items.find(([k])=>k===value);
 return <label className={'selrow'+(label?'':' solo')}>
  {label&&<span className="selt">{label}{sub&&<small>{sub}</small>}</span>}
  <span className="selv" aria-hidden="true">{sel?sel[1]:''}</span>
  <select value={value} onChange={e=>onChange(e.target.value as T)} aria-label={label||aria}>{items.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
 </label>;
}

const uploadIntent=z.object({ok:z.literal(true),assetId:z.uuid(),upload:z.object({url:z.string(),method:z.string(),headers:z.record(z.string(),z.string())})});
const okOnly=z.object({ok:z.literal(true)}).passthrough();
export type Cover={id:string,preview:string};

/** The cover block: a 16:9 photo (reviewed like any photo) or one of the colour plates. */
export function CoverField({purpose,plate,setPlate,cover,setCover}:{purpose:'community'|'event',plate:string,setPlate:(k:PlateKey)=>void,cover:Cover|null,setCover:(c:Cover|null)=>void}){
 const {call}=useFe();const {t}=useI18n();const file=useRef<HTMLInputElement>(null);
 const [busy,setBusy]=useState(false);const [err,setErr]=useState('');
 const add=async(f:File)=>{
  setErr('');
  if(!['image/jpeg','image/png','image/webp'].includes(f.type)){setErr(t('fe.cc.coverType'));return;}
  if(f.size>20*1024*1024){setErr(t('fe.cc.coverSize'));return;}
  setBusy(true);
  try{
   const i=await call('media.uploadIntent',{opId:newOpId(),purpose,kind:'image',mime:f.type,bytes:f.size},uploadIntent);
   const put=await fetch(i.upload.url,{method:i.upload.method,headers:i.upload.headers,body:f});
   if(!put.ok)throw new FeError('unavailable');
   await call('media.commit',{assetId:i.assetId},okOnly);
   setCover({id:i.assetId,preview:URL.createObjectURL(f)});
  }catch(e){setErr(feErrorMessage(e,t));}finally{setBusy(false);if(file.current)file.current.value='';}
 };
 return <div className={'field'+(err?' err':'')} data-field="cover"><span className="flabel">{t('fe.cc.cover')}</span>
  {cover&&<div className="evcov"><img src={cover.preview} alt=""/><button type="button" className="rm" aria-label={t('fe.cc.coverRemove')} onClick={()=>setCover(null)}><X/></button></div>}
  <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{const f=e.target.files?.[0];if(f)void add(f);}}/>
  <button type="button" className="btn soft md" style={{marginBottom:10}} onClick={()=>file.current?.click()} disabled={busy}><ImageIcon/>{busy?t('fe.cc.coverUploading'):cover?t('fe.cc.coverReplace'):t('fe.cc.coverUpload')}</button>
  {err&&<FErr>{err}</FErr>}
  <div className="note" style={{marginBottom:8}}>{t('fe.cc.coverOr')}</div>
  <div className="chips">{PLATE_KEYS.map(k=><button key={k} type="button" aria-label={t('fe.cc.plate.'+k)} aria-pressed={!cover&&plate===k} onClick={()=>{setPlate(k);setCover(null);}}
   style={{position:'relative',width:52,height:52,borderRadius:16,overflow:'hidden',outline:plate===k?'3px solid var(--ink)':'0',outlineOffset:2}}><div className="plate" style={namedPlate(k)}/></button>)}</div>
 </div>;
}

/** `chipGroup()` — the first eight chips and the chosen ones; «Все · N» shows the rest. */
export function ChipGroup({items,selected,onToggle}:{items:[string,string][],selected:string[],onToggle:(id:string)=>void}){
 const {t}=useI18n();const [all,setAll]=useState(false);
 const short=items.length>10&&!all;
 const shown=short?items.filter(([id],i)=>i<8||selected.includes(id)):items;
 return <div className="chips">
  {shown.map(([id,l])=><button key={id} type="button" className={'chip'+(selected.includes(id)?' on':'')} aria-pressed={selected.includes(id)} onClick={()=>onToggle(id)}>{l}</button>)}
  {items.length>10&&<button type="button" className="chip more" onClick={()=>setAll(v=>!v)}>{all?t('fe.cc.topicsLess'):t('fe.cc.topicsAll').replace('{n}',String(items.length))}</button>}
 </div>;
}

type Privacy='open'|'closed'|'hidden';
type Errors=Partial<Record<'name'|'desc'|'topics'|'q0'|'rules'|'where',string>>;
const created=z.object({ok:z.literal(true),id:z.uuid().optional(),state:z.string().optional(),pending:z.unknown().optional()}).passthrough();
const ruleLines=(s:string)=>s.split('\n').map(x=>x.trim()).filter(Boolean);

export function CreateCommunityScreen(){
 const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const catalog=useCatalog();const {opFor,done}=useOp();
 const [name,setName]=useState('');const [desc,setDesc]=useState('');const [topics,setTopics]=useState<string[]>([]);
 const [privacy,setPrivacy]=useState<Privacy>('open');const [q0,setQ0]=useState('');const [where,setWhere]=useState('online');
 const [rules,setRules]=useState('');const [plate,setPlate]=useState<PlateKey>('lilac');const [cover,setCover]=useState<Cover|null>(null);
 const [err,setErr]=useState<Errors>({});const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [topicsMax,setTopicsMax]=useState(false);
 const couple=acting?.kind==='couple';
 const clear=(k:keyof Errors)=>setErr(e=>{if(!e[k])return e;const n={...e};delete n[k];return n;});

 const toggleTopic=(id:string)=>{
  if(topics.includes(id)){setTopics(topics.filter(x=>x!==id));setTopicsMax(false);return;}
  if(topics.length>=3){setTopicsMax(true);return;}
  setTopics([...topics,id]);clear('topics');setTopicsMax(false);
 };
 const validate=()=>{
  const e:Errors={};const nm=name.trim(),d=desc.trim(),rl=ruleLines(rules);
  if(nm.length<3)e.name=t('fe.cc.err.name');else if(nm.length>50)e.name=t('fe.cc.err.nameLong');
  if(d.length<20)e.desc=t('fe.cc.err.desc');else if(d.length>500)e.desc=t('fe.cc.err.descLong');
  if(!topics.length)e.topics=t('fe.cc.err.topics');
  if(privacy!=='open'&&q0.trim().length>120)e.q0=t('fe.cc.err.question');
  if(!rl.length)e.rules=t('fe.cc.err.rules');else if(rl.length>20)e.rules=t('fe.cc.err.rulesMany');
  else if(rl.some(r=>r.length>300))e.rules=t('fe.cc.err.ruleLong');else if(rl.join('').length>1000)e.rules=t('fe.cc.err.rulesLong');
  setErr(e);return !Object.keys(e).length;
 };
 const save=async()=>{
  if(busy)return;setFailure('');
  if(!validate()){shakeFirstErr();return;}
  const input={name:name.trim(),description:desc.trim(),topics,privacy,...(privacy!=='open'&&q0.trim()?{joinQuestion:q0.trim()}:{}),
   rules:ruleLines(rules),placeId:where==='online'?null:where,coverAssetId:cover?.id??null,plate};
  setBusy(true);
  try{
   const r=await call('community.create',{opId:opFor(input),...input},created);done();
   const notice=r.pending?t('fe.cc.pending'):couple?t('fe.cc.doneCouple'):t('fe.cc.done');
   navigate('/n/me?layer=mine&part=communities',{replace:true,state:{notice}});
  }catch(e){
   if(e instanceof FeError&&e.code==='conflict'){setErr({name:t('fe.cc.err.nameTaken')});shakeFirstErr();}
   else if(e instanceof FeError&&e.code==='invalid_input'&&e.fields?.length){
    const map:Record<string,keyof Errors>={name:'name',description:'desc',topics:'topics',joinQuestion:'q0',rules:'rules',placeId:'where'};
    const next:Errors={};for(const f of e.fields){const k=map[f.split('.')[0]!];if(k)next[k]=k==='where'?t('fe.cc.err.place'):t('fe.cc.err.fields');}
    if(Object.keys(next).length){setErr(next);shakeFirstErr();}else setFailure(feErrorMessage(e,t));
   }else setFailure(feErrorMessage(e,t));
  }finally{setBusy(false);}
 };

 const topicItems:[string,string][]=(catalog?.topics??[]).map(x=>[x.id,locale==='en'?x.en:x.ru]);
 const places:[string,string][]=[...(catalog?.places??[]).map(p=>[p.id,placeName(p,locale)] as [string,string]),['online',t('fe.cc.online')]];
 return <>
  <Bar title={t('fe.cc.title')} back small/>
  <div className="view nodock cta1"><div className="wrap">
   {couple&&acting&&<p className="as-line full"><Av name={acting.name} seed={acting.id} size="xs" src={acting.avatar}/><span>{t('fe.cc.asCouple')} <b>{acting.name}</b></span></p>}
   <section className="grp"><div className="card form-card">
    <Field name="name" label={t('fe.cc.name')} ph={t('fe.cc.namePh')} max={50} value={name} onChange={v=>{setName(v);clear('name');}} err={err.name}/>
    <Field name="desc" label={t('fe.cc.desc')} ph={t('fe.cc.descPh')} max={500} textarea rows={5} value={desc} onChange={v=>{setDesc(v);clear('desc');}} err={err.desc}/>
    <div className={'field'+(err.topics?' err':'')} data-field="topics"><span className="flabel">{t('fe.cc.topics')}<i style={{fontStyle:'normal',fontWeight:500,color:'var(--faint)'}}>{t('fe.cc.topicsRange')}</i></span>
     <ChipGroup items={topicItems} selected={topics} onToggle={toggleTopic}/>
     {err.topics?<FErr>{err.topics}</FErr>:topicsMax?<div className="fhint" role="status">{t('fe.cc.topicsMax')}</div>:null}
    </div>
    <div className="card list"><div className="li"><span className="ico"><Lock/></span>
     <SelectRow label={t('fe.cc.privacy')} value={privacy} onChange={setPrivacy} items={(['open','closed','hidden'] as const).map(k=>[k,t('fe.cc.privacy.'+k)])}/></div></div>
    {privacy!=='open'&&<Field name="q0" label={t('fe.cc.question')} opt ph={t('fe.cc.questionPh')} max={120} value={q0} onChange={v=>{setQ0(v);clear('q0');}} err={err.q0}/>}
    <div className={'card list'+(err.where?' field err':'')} data-field="where"><div className="li"><span className="ico"><MapPin/></span>
     <SelectRow label={t('fe.cc.where')} value={where} onChange={v=>{setWhere(v);clear('where');}} items={places}/></div>{err.where&&<FErr>{err.where}</FErr>}</div>
    <Field name="rules" label={t('fe.cc.rules')} ph={t('fe.cc.rulesPh')} max={1000} textarea rows={4} value={rules} onChange={v=>{setRules(v);clear('rules');}} err={err.rules}/>
    <CoverField purpose="community" plate={plate} setPlate={setPlate} cover={cover} setCover={setCover}/>
   </div></section>
   {failure&&<div className="alert err" role="alert"><span>{failure}</span></div>}
  </div></div>
  <div className="ctabar"><div className="wrap"><Btn onClick={save} disabled={busy}>{busy?t('fe.cc.sending'):t('fe.cc.submit')}</Btn></div></div>
 </>;
}
