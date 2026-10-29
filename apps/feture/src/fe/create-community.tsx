import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {useNavigate,useParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {CircleAlert,Clock,Image as ImageIcon,Lock,RefreshCw,X,type LucideIcon} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Alert,Av,Bar,Btn,Card,Chip,Chips,Counter,Empty,FilePick,Group,Input,Note,SelectRow as KitSelectRow,Skel,Stack,Swatches,TextArea,View,useLeaveGuard} from './kit';
import {useFe} from './session';
import {Uploader} from './kit/Uploader';
import {useSendPhoto} from './media-upload';

/** V21 C08 «Новое сообщество» with the prototype's markup (field(), chipGroup(), selectRow(), the cover picker);
 * also the form pieces E11 «Новое событие» shares. The server decides; the client only checks the same limits. */

// The named cover plates (prototype PL) live in the kit (ui.tsx namedPlate) and contracts/_plates.mjs.
import {PLATE_KEYS,namedPlate,type PlateKey} from './ui';
export {PLATE_KEYS,namedPlate,type PlateKey};

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

/** shakeFirstErr lives in the kit's validation layer; re-exported for the screens that import it from here. */
import {FIELD,serverFields,shakeFirstErr,softMax,textError,textErrorMessage,textLength,type FieldName,type TextRule} from './kit/validate';
export {shakeFirstErr};

export const FErr=({children}:{children:ReactNode})=><div className="ferr"><CircleAlert/>{children}</div>;

type FieldProps={name:string,label:string,value:string,onChange:(v:string)=>void,err?:string|undefined,opt?:boolean,hint?:string,max?:number,ph?:string,
 type?:'text'|'email'|'tel'|'url'|'number'|'password'|'date'|'time',textarea?:boolean,rows?:number,icon?:LucideIcon,inputMode?:'url'|'decimal'|'text',min?:string,
 /** Kit validation (kit/validate): the server's rule for this field, or a check of its own — the error shows on blur;
  * the form's submit check fills `err` with the same message. */
 check?:FieldName|TextRule|((v:string)=>string|undefined)};
/** `field()` — label, input or textarea, then the error (or hint) and the counter. */
export function Field({name,label,value,onChange,err,opt,hint,max,ph,type='text',textarea,rows,icon:Icon,inputMode,min,className,check}:FieldProps&{className?:string}){
 const {t}=useI18n();const [touched,setTouched]=useState(false);
 const rule=typeof check==='function'?undefined:check;
 const own=touched&&check&&value.trim()?(typeof check==='function'?check(value):textError(t,check,value)):undefined;
 const error=err??own;const limit=max??(rule?FIELD_RULE(rule).max:undefined);
 const cap=rule?softMax(rule):limit?limit*2:undefined;
 const input=textarea
  ?<TextArea name={name} rows={rows} maxLength={cap} placeholder={ph} value={value} onChange={e=>onChange(e.target.value)} onBlur={()=>setTouched(true)} invalid={!!error}/>
  :<Input name={name} type={type} value={value} placeholder={ph} inputMode={inputMode} min={min} maxLength={cap} onChange={e=>onChange(e.target.value)} onBlur={()=>setTouched(true)} invalid={!!error}/>;
 return <label className={'field'+(error?' err':'')+(className?' '+className:'')} data-field={name}>
  <span>{label}{opt&&<i>{t('fe.cc.optional')}</i>}</span>
  {Icon?<div className="inwrap"><Icon/>{input}</div>:input}
  {error?<FErr>{error}</FErr>:hint?<div className="fhint">{hint}</div>:null}
  {limit&&textLength(value)>=limit*0.8?<Counter n={textLength(value)} max={limit}/>:null}
 </label>;
}
const FIELD_RULE=(r:FieldName|TextRule)=>typeof r==='string'?FIELD[r]:r;

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
 // A cover is one 16:9 photo through the kit uploader (crop, compress, no metadata).
 const [picked,setPicked]=useState<File[]|null>(null);const send=useSendPhoto(purpose);
 const add=(f:File)=>{setErr('');setPicked([f]);};
 return <div className={'field'+(err?' err':'')} data-field="cover"><span className="flabel">{t('fe.cc.cover')}</span>
  {cover&&<div className="evcov"><img src={cover.preview} alt=""/><button type="button" className="rm" aria-label={t('fe.cc.coverRemove')} onClick={()=>setCover(null)}><X/></button></div>}
  <FilePick ref={file} accept="image/*" onFiles={fs=>{const f=fs[0];if(f)add(f);}}/>
  {picked&&<Uploader files={picked} aspects={['16:9']} max={1} send={send} title={t('fe.cc.cover')} onClose={()=>setPicked(null)}
   onDone={got=>{setPicked(null);const g=got[0];if(g)setCover({id:g.id,preview:g.url});}}/>}
  <Stack gap={2}>
  <Btn kind="soft" size="md" icon={ImageIcon} onClick={()=>file.current?.click()} disabled={busy}>{busy?t('fe.cc.coverUploading'):cover?t('fe.cc.coverReplace'):t('fe.cc.coverUpload')}</Btn>
  {err&&<FErr>{err}</FErr>}
  <Note as="div">{t('fe.cc.coverOr')}</Note>
  <Swatches label={t('fe.cc.coverOr')} value={cover?null:plate as PlateKey} onChange={k=>{setPlate(k);setCover(null);}} options={PLATE_KEYS.map(k=>[k,t('fe.cc.plate.'+k),namedPlate(k)] as const)}/>
  </Stack>
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
 /** Rules, one per line: each by the server's rule, up to 20, 1000 characters together. */
 const rulesError=(v:string)=>{const rl=ruleLines(v);
  if(!rl.length)return t('fe.cc.err.rules');if(rl.length>20)return t('fe.cc.err.rulesMany');
  for(const r of rl){const m=textError(t,'communityRule',r);if(m)return m;}
  return textLength(rl.join(''))>1000?t('fe.cc.err.rulesLong'):undefined;};
 const validate=()=>{
  const e:Errors={};const nm=name.trim(),d=desc.trim();
  const en=textError(t,'communityName',nm);if(en)e.name=en;
  const ed=textError(t,'communityDescription',d);if(ed)e.desc=ed;
  if(!topics.length)e.topics=t('fe.cc.err.topics');
  const eq=privacy!=='open'?textError(t,'joinQuestion',q0):undefined;if(eq)e.q0=eq;
  const er=rulesError(rules);if(er)e.rules=er;
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
   const rule:Record<string,FieldName>={name:'communityName',description:'communityDescription',joinQuestion:'joinQuestion',rules:'communityRule'};
   const next:Errors={};for(const {path,code} of serverFields(e)){const head=path.split('.')[0]!;const k=map[head];if(!k||next[k])continue;
    next[k]=k==='where'?t('fe.cc.err.place'):path==='rules'&&code==='too_long'?t('fe.cc.err.rulesLong'):rule[head]?textErrorMessage(t,code,FIELD[rule[head]!]):t('fe.val.invalid');}
   if(Object.keys(next).length){setErr(next);shakeFirstErr();}else setFailure(feErrorMessage(e,t));
  }else setFailure(feErrorMessage(e,t));
 };
 const dirty=!busy&&(edit?Object.keys(changes(edit)).length>0:!!(name.trim()||desc.trim()||topics.length||rules.trim()||cover));
 const guard=useLeaveGuard(dirty);
 const save=async()=>{
  if(busy)return;setFailure('');setStale(false);
  if(!validate()){shakeFirstErr();return;}
  if(edit){
   const diff=changes(edit);
   if(!Object.keys(diff).length){guard.pass(()=>navigate(`/n/communities/${edit.id}/manage`,{replace:true,state:{notice:t('fe.ece.c.nothing')}}));return;}
   const input={communityId:edit.id,rev:edit.rev,...diff};
   setBusy(true);
   try{
    const r=await call('community.update',{opId:opFor(input),...input},updated);done();
    guard.pass(()=>navigate(`/n/communities/${edit.id}/manage`,{replace:true,state:{notice:reviewNotice(r.review,t)}}));
   }catch(e){fail(e);}finally{setBusy(false);}
   return;
  }
  const input={name:name.trim(),description:desc.trim(),topics,privacy,...(privacy!=='open'&&q0.trim()?{joinQuestion:q0.trim()}:{}),
   rules:ruleLines(rules),placeId:where==='online'?null:where,coverAssetId:cover?.id??null,plate};
  setBusy(true);
  try{
   const r=await call('community.create',{opId:opFor(input),...input},created);done();
   const notice=r.pending?t('fe.cc.pending'):couple?t('fe.cc.doneCouple'):t('fe.cc.done');
   guard.pass(()=>navigate('/n/me/communities',{replace:true,state:{notice}}));
  }catch(e){fail(e);}finally{setBusy(false);}
 };

 const topicItems:[string,string][]=(catalog?.topics??[]).map(x=>[x.id,locale==='en'?x.en:x.ru]);
 const known=(catalog?.places??[]).map(p=>[p.id,placeName(p,locale)] as [string,string]);
 // A place that is not approved yet (the owner's own suggestion) is not in the catalog but stays selectable.
 const extra:[string,string][]=where!=='online'&&catalog&&!known.some(([id])=>id===where)?[[where,t('fe.ece.c.placeCurrent')]]:[];
 const places:[string,string][]=[...known,...extra,['online',t('fe.cc.online')]];
 const published=edit?.state==='published';
 return <>
  {guard.node}
  <Bar title={edit?t('fe.ece.c.title'):t('fe.cc.title')} back small/>
  <div className="view nodock cta1"><div className="wrap">
   {!edit&&couple&&acting&&<p className="as-line full"><Av name={acting.name} seed={acting.id} size="xs" src={acting.avatar}/><span>{t('fe.cc.asCouple')} <b>{acting.name}</b></span></p>}
   {edit&&published&&<Alert icon={Clock}>{t('fe.ece.c.reviewHint')}</Alert>}
   {edit&&edit.pendingChange!=null&&<Alert kind="warn" role="none" icon={Clock}>{t('fe.ece.c.pendingChange')}</Alert>}
   <Group><Card form>
    <Field name="name" label={t('fe.cc.name')} ph={t('fe.cc.namePh')} check="communityName" value={name} onChange={v=>{setName(v);clear('name');}} err={err.name}/>
    <Field name="desc" label={t('fe.cc.desc')} ph={t('fe.cc.descPh')} check="communityDescription" textarea rows={5} value={desc} onChange={v=>{setDesc(v);clear('desc');}} err={err.desc}/>
    <div className={'field'+(err.topics?' err':'')} data-field="topics"><span className="flabel">{t('fe.cc.topics')}<i>{t('fe.cc.topicsRange')}</i></span>
     <ChipGroup items={topicItems} selected={topics} onToggle={toggleTopic}/>
     {err.topics?<FErr>{err.topics}</FErr>:topicsMax?<div className="fhint" role="status">{t('fe.cc.topicsMax')}</div>:null}
    </div>
    <div className="field" data-field="privacy"><SelectRow label={t('fe.cc.privacy')} value={privacy} onChange={setPrivacy} items={(['open','closed','hidden'] as const).map(k=>[k,t('fe.cc.privacy.'+k)])}/></div>
    {privacy!=='open'&&<Field name="q0" label={t('fe.cc.question')} opt ph={t('fe.cc.questionPh')} check="joinQuestion" value={q0} onChange={v=>{setQ0(v);clear('q0');}} err={err.q0}/>}
    <div className={'field'+(err.where?' err':'')} data-field="where"><SelectRow label={t('fe.cc.where')} value={where} onChange={v=>{setWhere(v);clear('where');}} items={places}/>{err.where&&<FErr>{err.where}</FErr>}</div>
    <Field name="rules" label={t('fe.cc.rules')} ph={t('fe.cc.rulesPh')} max={1000} check={rulesError} textarea rows={4} value={rules} onChange={v=>{setRules(v);clear('rules');}} err={err.rules}/>
    <CoverField purpose="community" plate={plate} setPlate={setPlate} cover={cover} setCover={setCover}/>
   </Card></Group>
   {failure&&<Alert kind="err" noIcon action={stale&&reload?<Btn kind="text" auto icon={RefreshCw} onClick={reload}>{t('fe.ece.reload')}</Btn>:undefined}>{failure}</Alert>}
  </div></div>
  <div className="ctabar"><div className="wrap"><Btn onClick={save} disabled={busy}>{busy?t('fe.cc.sending'):edit?t('fe.ece.save'):t('fe.cc.submit')}</Btn></div></div>
 </>;
}
