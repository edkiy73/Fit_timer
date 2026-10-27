import {useCallback,useEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {useNavigate,useParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {CircleAlert,Clock,Image as ImageIcon,Lock,MapPin,RefreshCw,X,type LucideIcon} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Alert,Av,Bar,Btn,Card,Chip,Chips,Empty,FilePick,Group,Input,SelectRow as KitSelectRow,Skel,TextArea,View} from './kit';
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
 type?:'text'|'email'|'tel'|'url'|'number'|'password'|'date'|'time',textarea?:boolean,rows?:number,icon?:LucideIcon,inputMode?:'url'|'decimal'|'text',min?:string};
/** `field()` — label, input or textarea, then the error (or hint) and the counter. */
export function Field({name,label,value,onChange,err,opt,hint,max,ph,type='text',textarea,rows,icon:Icon,inputMode,min}:FieldProps){
 const {t}=useI18n();
 const input=textarea
  ?<TextArea name={name} rows={rows} maxLength={max?max+50:undefined} placeholder={ph} value={value} onChange={e=>onChange(e.target.value)} invalid={!!err}/>
  :<Input name={name} type={type} value={value} placeholder={ph} inputMode={inputMode} min={min} maxLength={max?max+50:undefined} onChange={e=>onChange(e.target.value)} invalid={!!err}/>;
 return <label className={'field'+(err?' err':'')} data-field={name}>
  <span>{label}{opt&&<i>{t('fe.cc.optional')}</i>}</span>
  {Icon?<div className="inwrap"><Icon/>{input}</div>:input}
  {err?<FErr>{err}</FErr>:hint?<div className="fhint">{hint}</div>:null}
  {max?<div className="counter">{value.length} / {max}</div>:null}
 </label>;
}

/** The kit's SelectRow under the item-list props other screens import from here (no label = the `solo` variant). */
export function SelectRow<T extends string>({label,value,items,onChange,sub,aria,icon}:{label?:string,value:T,items:[T,string][],onChange:(v:T)=>void,sub?:string,aria?:string,icon?:LucideIcon}){
 return <KitSelectRow {...(label||aria?{label:(label||aria)!}:{})} {...(icon?{icon}:{})} solo={!label} sub={sub} value={value} options={items} onChange={onChange}/>;
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
  }catch(e){setErr(feErrorMessage(e,t));}finally{setBusy(false);}
 };
 return <div className={'field'+(err?' err':'')} data-field="cover"><span className="flabel">{t('fe.cc.cover')}</span>
  {cover&&<div className="evcov"><img src={cover.preview} alt=""/><button type="button" className="rm" aria-label={t('fe.cc.coverRemove')} onClick={()=>setCover(null)}><X/></button></div>}
  <FilePick ref={file} accept="image/jpeg,image/png,image/webp" onFiles={fs=>{const f=fs[0];if(f)void add(f);}}/>
  <Btn kind="soft" size="md" icon={ImageIcon} style={{marginBottom:10}} onClick={()=>file.current?.click()} disabled={busy}>{busy?t('fe.cc.coverUploading'):cover?t('fe.cc.coverReplace'):t('fe.cc.coverUpload')}</Btn>
  {err&&<FErr>{err}</FErr>}
  <div className="note" style={{marginBottom:8}}>{t('fe.cc.coverOr')}</div>
  <Chips>{PLATE_KEYS.map(k=><button key={k} type="button" aria-label={t('fe.cc.plate.'+k)} aria-pressed={!cover&&plate===k} onClick={()=>{setPlate(k);setCover(null);}}
   style={{position:'relative',width:52,height:52,borderRadius:16,overflow:'hidden',outline:!cover&&plate===k?'3px solid var(--ink)':'0',outlineOffset:2}}><div className="plate" style={namedPlate(k)}/></button>)}</Chips>
 </div>;
}

/** `chipGroup()` — the first eight chips and the chosen ones; «Все · N» shows the rest. */
export function ChipGroup({items,selected,onToggle}:{items:[string,string][],selected:string[],onToggle:(id:string)=>void}){
 const {t}=useI18n();const [all,setAll]=useState(false);
 const short=items.length>10&&!all;
 const shown=short?items.filter(([id],i)=>i<8||selected.includes(id)):items;
 return <Chips>
  {shown.map(([id,l])=><Chip key={id} on={selected.includes(id)} onClick={()=>onToggle(id)}>{l}</Chip>)}
  {items.length>10&&<Chip more onClick={()=>setAll(v=>!v)}>{all?t('fe.cc.topicsLess'):t('fe.cc.topicsAll').replace('{n}',String(items.length))}</Chip>}
 </Chips>;
}

type Privacy='open'|'closed'|'hidden';
type Errors=Partial<Record<'name'|'desc'|'topics'|'q0'|'rules'|'where',string>>;
const created=z.object({ok:z.literal(true),id:z.uuid().optional(),state:z.string().optional(),pending:z.unknown().optional()}).passthrough();
const ruleLines=(s:string)=>s.split('\n').map(x=>x.trim()).filter(Boolean);

const updated=z.object({ok:z.literal(true),rev:z.number(),review:z.array(z.string()).default([])}).passthrough();
const editable=z.object({ok:z.literal(true),community:z.object({id:z.uuid(),name:z.string(),description:z.string(),topics:z.array(z.string()),
 privacy:z.enum(['open','closed','hidden']),joinQuestion:z.string().nullable(),rules:z.array(z.string()),placeId:z.uuid().nullable(),plate:z.string().nullable(),
 cover:z.object({id:z.uuid(),src:z.record(z.string(),z.string()).nullable().optional()}).passthrough().nullable().optional(),
 me:z.object({role:z.string(),state:z.string()}).passthrough().nullable(),state:z.string().optional(),rev:z.number().optional(),pendingChange:z.unknown().optional()}).passthrough()});
type EditableCommunity=z.infer<typeof editable>['community'];

/** What `community.update` sent to staff, in words: «Название, описание ждут проверки…». */
export function reviewNotice(review:string[],t:(k:string)=>string){
 const names=review.filter(k=>k!=='joinQuestion').map(k=>t('fe.ece.field.'+k));
 return names.length?t('fe.ece.c.review').replace('{fields}',names.join(', ')):t('fe.ece.c.saved');
}

export function CreateCommunityScreen(){return <CommunityForm/>;}

/** C08 in edit mode: the community as `community.get` gives it to its owner; only what changed goes to `community.update`. */
export function EditCommunityScreen(){
 const {id=''}=useParams();const {call}=useFe();const {t}=useI18n();
 const [c,setC]=useState<EditableCommunity|null>(null);const [error,setError]=useState<unknown>(null);const [nonce,setNonce]=useState(0);
 useEffect(()=>{setC(null);setError(null);call('community.get',{communityId:id},editable).then(r=>setC(r.community)).catch(setError);},[call,id,nonce]);
 const reload=()=>setNonce(n=>n+1);
 if(c&&c.me?.role==='owner'&&c.me.state==='active'&&typeof c.rev==='number')return <CommunityForm key={`${c.id}:${c.rev}`} edit={{...c,rev:c.rev}} reload={reload}/>;
 return <>
  <Bar title={t('fe.ece.c.title')} back small/>
  <View className="nodock">{error?<Empty icon={CircleAlert} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={reload}>{t('fe.retry')}</Btn></Empty>
   :c?<Empty icon={Lock} title={t('fe.ece.c.onlyOwner')} text={t('fe.ece.c.onlyOwnerText')}/>:<Skel kind="list"/>}</View>
 </>;
}

/** What the owner sent last and staff have not checked yet: the form shows it instead of the published value. */
const pendingOf=(e:EditableCommunity|undefined)=>{
 const p=e?.pendingChange;if(!p||typeof p!=='object')return {} as {name?:string,description?:string,privacy?:Privacy,joinQuestion?:string|null};
 const o=p as Record<string,unknown>;const str=(v:unknown)=>typeof v==='string'?v:undefined;
 const priv=(['open','closed','hidden'] as const).find(k=>k===o.privacy);
 return {...(str(o.name)?{name:str(o.name)!}:{}),...(str(o.description)?{description:str(o.description)!}:{}),...(priv?{privacy:priv}:{}),
  ...('joinQuestion' in o&&(o.joinQuestion===null||typeof o.joinQuestion==='string')?{joinQuestion:o.joinQuestion as string|null}:{})};
};
const coverOf=(e:EditableCommunity|undefined):Cover|null=>{const c=e?.cover;if(!c)return null;const s=c.src;return {id:c.id,preview:s?.card??s?.full??s?.thumb??''};};

function CommunityForm({edit,reload}:{edit?:EditableCommunity&{rev:number},reload?:()=>void}){
 const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const catalog=useCatalog();const {opFor,done}=useOp();
 const pend=pendingOf(edit);
 const [name,setName]=useState(pend.name??edit?.name??'');const [desc,setDesc]=useState(pend.description??edit?.description??'');const [topics,setTopics]=useState<string[]>(edit?.topics??[]);
 const [privacy,setPrivacy]=useState<Privacy>(pend.privacy??edit?.privacy??'open');const [q0,setQ0]=useState((pend.joinQuestion!==undefined?pend.joinQuestion:edit?.joinQuestion)??'');const [where,setWhere]=useState(edit?(edit.placeId??'online'):'online');
 const [rules,setRules]=useState(edit?.rules.join('\n')??'');const [plate,setPlate]=useState<PlateKey>(()=>PLATE_KEYS.find(k=>k===edit?.plate)??'lilac');const [cover,setCover]=useState<Cover|null>(()=>coverOf(edit));
 const [err,setErr]=useState<Errors>({});const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [stale,setStale]=useState(false);const [topicsMax,setTopicsMax]=useState(false);
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
 /** The edit as `community.update` takes it: only the fields that differ from what was loaded. */
 const changes=(e:EditableCommunity)=>{
  const next:Record<string,unknown>={name:name.trim(),description:desc.trim(),topics,privacy,rules:ruleLines(rules),placeId:where==='online'?null:where,plate};
  if(privacy!=='open')next.joinQuestion=q0.trim()||null;
  const was:Record<string,unknown>={name:e.name,description:e.description,topics:e.topics,privacy:e.privacy,rules:e.rules,placeId:e.placeId,plate:e.plate,joinQuestion:e.joinQuestion??null};
  const diff:Record<string,unknown>=Object.fromEntries(Object.entries(next).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(was[k])));
  // A new photo, or the photo taken off (✕ or a colour chosen instead): the plate shows only without a photo.
  const was0=e.cover?.id??null;if((cover?.id??null)!==was0)diff.coverAssetId=cover?.id??null;
  return diff;
 };
 const fail=(e:unknown)=>{
  if(e instanceof FeError&&e.code==='conflict'&&!edit){setErr({name:t('fe.cc.err.nameTaken')});shakeFirstErr();}
  else if(e instanceof FeError&&e.code==='conflict'){setStale(true);setFailure(feErrorMessage(e,t));}
  else if(e instanceof FeError&&e.code==='invalid_input'&&e.fields?.length){
   const map:Record<string,keyof Errors>={name:'name',description:'desc',topics:'topics',joinQuestion:'q0',rules:'rules',placeId:'where'};
   const next:Errors={};for(const f of e.fields){const k=map[f.split('.')[0]!];if(k)next[k]=k==='where'?t('fe.cc.err.place'):t('fe.cc.err.fields');}
   if(Object.keys(next).length){setErr(next);shakeFirstErr();}else setFailure(feErrorMessage(e,t));
  }else setFailure(feErrorMessage(e,t));
 };
 const save=async()=>{
  if(busy)return;setFailure('');setStale(false);
  if(!validate()){shakeFirstErr();return;}
  if(edit){
   const diff=changes(edit);
   if(!Object.keys(diff).length){navigate(`/n/communities/${edit.id}/manage`,{replace:true,state:{notice:t('fe.ece.c.nothing')}});return;}
   const input={communityId:edit.id,rev:edit.rev,...diff};
   setBusy(true);
   try{
    const r=await call('community.update',{opId:opFor(input),...input},updated);done();
    navigate(`/n/communities/${edit.id}/manage`,{replace:true,state:{notice:reviewNotice(r.review,t)}});
   }catch(e){fail(e);}finally{setBusy(false);}
   return;
  }
  const input={name:name.trim(),description:desc.trim(),topics,privacy,...(privacy!=='open'&&q0.trim()?{joinQuestion:q0.trim()}:{}),
   rules:ruleLines(rules),placeId:where==='online'?null:where,coverAssetId:cover?.id??null,plate};
  setBusy(true);
  try{
   const r=await call('community.create',{opId:opFor(input),...input},created);done();
   const notice=r.pending?t('fe.cc.pending'):couple?t('fe.cc.doneCouple'):t('fe.cc.done');
   navigate('/n/me?layer=mine&part=communities',{replace:true,state:{notice}});
  }catch(e){fail(e);}finally{setBusy(false);}
 };

 const topicItems:[string,string][]=(catalog?.topics??[]).map(x=>[x.id,locale==='en'?x.en:x.ru]);
 const known=(catalog?.places??[]).map(p=>[p.id,placeName(p,locale)] as [string,string]);
 // A place that is not approved yet (the owner's own suggestion) is not in the catalog but stays selectable.
 const extra:[string,string][]=where!=='online'&&catalog&&!known.some(([id])=>id===where)?[[where,t('fe.ece.c.placeCurrent')]]:[];
 const places:[string,string][]=[...known,...extra,['online',t('fe.cc.online')]];
 const published=edit?.state==='published';
 return <>
  <Bar title={edit?t('fe.ece.c.title'):t('fe.cc.title')} back small/>
  <div className="view nodock cta1"><div className="wrap">
   {!edit&&couple&&acting&&<p className="as-line full"><Av name={acting.name} seed={acting.id} size="xs" src={acting.avatar}/><span>{t('fe.cc.asCouple')} <b>{acting.name}</b></span></p>}
   {edit&&published&&<div className="alert" style={{marginBottom:12}}><Clock/><span>{t('fe.ece.c.reviewHint')}</span></div>}
   {edit&&edit.pendingChange!=null&&<div className="alert warn" style={{marginBottom:12}}><Clock/><span>{t('fe.ece.c.pendingChange')}</span></div>}
   <Group><Card form>
    <Field name="name" label={t('fe.cc.name')} ph={t('fe.cc.namePh')} max={50} value={name} onChange={v=>{setName(v);clear('name');}} err={err.name}/>
    <Field name="desc" label={t('fe.cc.desc')} ph={t('fe.cc.descPh')} max={500} textarea rows={5} value={desc} onChange={v=>{setDesc(v);clear('desc');}} err={err.desc}/>
    <div className={'field'+(err.topics?' err':'')} data-field="topics"><span className="flabel">{t('fe.cc.topics')}<i>{t('fe.cc.topicsRange')}</i></span>
     <ChipGroup items={topicItems} selected={topics} onToggle={toggleTopic}/>
     {err.topics?<FErr>{err.topics}</FErr>:topicsMax?<div className="fhint" role="status">{t('fe.cc.topicsMax')}</div>:null}
    </div>
    <Card list><SelectRow icon={Lock} label={t('fe.cc.privacy')} value={privacy} onChange={setPrivacy} items={(['open','closed','hidden'] as const).map(k=>[k,t('fe.cc.privacy.'+k)])}/></Card>
    {privacy!=='open'&&<Field name="q0" label={t('fe.cc.question')} opt ph={t('fe.cc.questionPh')} max={120} value={q0} onChange={v=>{setQ0(v);clear('q0');}} err={err.q0}/>}
    <Card list {...(err.where?{className:'field err'}:{})}><SelectRow icon={MapPin} label={t('fe.cc.where')} value={where} onChange={v=>{setWhere(v);clear('where');}} items={places}/>{err.where&&<FErr>{err.where}</FErr>}</Card>
    <Field name="rules" label={t('fe.cc.rules')} ph={t('fe.cc.rulesPh')} max={1000} textarea rows={4} value={rules} onChange={v=>{setRules(v);clear('rules');}} err={err.rules}/>
    <CoverField purpose="community" plate={plate} setPlate={setPlate} cover={cover} setCover={setCover}/>
   </Card></Group>
   {failure&&<Alert kind="err" noIcon>{failure}{stale&&reload&&<Btn kind="text" auto icon={RefreshCw} style={{display:'flex',marginTop:6}} onClick={reload}>{t('fe.ece.reload')}</Btn>}</Alert>}
  </div></div>
  <div className="ctabar"><div className="wrap"><Btn onClick={save} disabled={busy}>{busy?t('fe.cc.sending'):edit?t('fe.ece.save'):t('fe.cc.submit')}</Btn></div></div>
 </>;
}
