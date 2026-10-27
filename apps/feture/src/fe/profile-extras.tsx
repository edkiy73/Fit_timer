import {Fragment,useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {useNavigate,useParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Ban,Check,ChevronRight,EyeOff,Flag,Heart,History,Info,Lock,LockOpen,MapPin,ShieldCheck,Undo2,Users,X} from 'lucide-react';
import {Av,Bar,Btn,Empty,Seg,View,plate} from './ui';
import {useFe} from './session';

/** Profile extras with the V21 prototype's markup: «Что у вас общего» (P05), the person menu (report / block / hide
 * from feed, S02), confirmed links and «Предложить связь» (F2, P21/P22), «Просмотренные» (D09) and «Как видят» (P03).
 * Everything shown comes from the server: no invented scores; hard limits are only ever named as boundaries. */

type T=(key:string)=>string;
const fill=(s:string,vars:Record<string,string|number>)=>Object.entries(vars).reduce((a,[k,v])=>a.split('{'+k+'}').join(String(v)),s);
const ok=z.object({ok:z.literal(true)}).passthrough();

/** Russian plural forms; English uses one/other. */
export function plural(t:T,locale:string,base:string,n:number){
 const m10=n%10,m100=n%100;
 const form=locale==='en'?(n===1?'1':'5'):m10===1&&m100!==11?'1':m10>=2&&m10<=4&&(m100<12||m100>14)?'2':'5';
 return fill(t(base+form),{n});
}

/** feErrorMessage plus the rules these screens know by name. */
export function pxError(e:unknown,t:T){
 if(e instanceof FeError){
  if(e.code==='premium_required')return t('fe.px.undo.limit');
  if(e.rule){const k='fe.px.rule.'+e.rule;const m=t(k);if(m!==k)return m;}
 }
 return feErrorMessage(e,t);
}

/** The prototype's toast (`.toasts > .toast`), gone after a few seconds. */
export function useToast(){
 const [msg,setMsg]=useState<{text:string,err:boolean}|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const show=useCallback((text:string,err=false)=>{setMsg({text,err});clearTimeout(timer.current);timer.current=setTimeout(()=>setMsg(null),3600);},[]);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 const node=msg?<div className="toasts nodock"><div className={'toast'+(msg.err?' err':'')} role={msg.err?'alert':'status'}>{msg.text}</div></div>:null;
 return [node,show] as const;
}

/** `div.layer > div.scrim.on + div.sheet.on` — the prototype's sheet; Esc, ✕ and the scrim close it. */
export function Sheet({title,onClose,children,foot,full}:{title:string,onClose:()=>void,children:ReactNode,foot?:ReactNode,full?:boolean}){
 const {t}=useI18n();const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{const opener=document.activeElement as HTMLElement|null;ref.current?.focus({preventScroll:true});
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onClose();}};
  document.addEventListener('keydown',key);
  return ()=>{document.removeEventListener('keydown',key);requestAnimationFrame(()=>opener?.focus?.({preventScroll:true}));};},[onClose]);
 return <div className="layer">
  <div className="scrim on" onClick={onClose}/>
  <div ref={ref} className={'sheet on'+(full?' full':'')} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
   <div className="grab"/>
   <div className="sh-h"><div className="sh-ht"><h2>{title}</h2></div><button type="button" className="ibtn ghost sm" aria-label={t('fe.px.close')} onClick={onClose}><X/></button></div>
   <div className="sh-b">{children}</div>
   {foot&&<div className="sh-f">{foot}</div>}
  </div>
 </div>;
}

/* ---------- the person card shared by PersonScreen and «Как видят» ---------- */
const media=z.object({src:z.record(z.string(),z.string()).nullable(),pending:z.boolean().optional()}).passthrough();
export const personProfile=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),bio:z.string(),
 age:z.number().nullable(),city:z.object({ru:z.string().nullable(),en:z.string().nullable()}).nullable(),avatar:media.nullable(),photos:z.array(media),details:z.record(z.string(),z.unknown())}).passthrough();
export const personProfileRes=z.object({ok:z.literal(true),profile:personProfile});
export type PersonProfile=z.infer<typeof personProfile>;
export const mediaSrc=(m:z.infer<typeof media>|null|undefined)=>m&&!m.pending?m.src?.card??m.src?.full??m.src?.thumb??null:null;
export const personName=(p:{name:string|null,handle:string|null}|null)=>p?.name||(p?.handle?'@'+p.handle:'');

/** The hero (photo with name, age, city) or the initials block, as on another person's profile. */
export function PersonHero({p}:{p:PersonProfile}){
 const {locale}=useI18n();const name=personName(p);const ph=mediaSrc(p.avatar);const city=p.city?(locale==='en'?p.city.en:p.city.ru):null;
 return ph?<div className="hero"><img className="mbg" src={ph} alt="" aria-hidden="true" draggable={false}/><img src={ph} alt={name} draggable={false}/>
   <div className="pc-info"><h2 className="pc-name" tabIndex={-1}><span className="pcn">{name}</span>{p.age?<span>{p.age}</span>:null}</h2>{city&&<div className="pc-who"><span className="pl"><MapPin/>{city}</span></div>}</div></div>
  :<div className="empty"><Av name={name} seed={p.id} size="xl"/><h3>{name}{p.age?', '+p.age:''}</h3>{city&&<p>{city}</p>}</div>;
}
export function PersonBio({p}:{p:PersonProfile}){return p.bio?<div className="p-bio"><div className="md bio"><p>{p.bio}</p></div></div>:null;}
export function PersonPhotos({p}:{p:PersonProfile}){
 const list=p.photos.filter(ph=>mediaSrc(ph));
 return list.length>1?<section className="grp ph20"><div className="ph-slots">{list.map((ph,i)=><div key={i} className={'mi'+(i===0?' big':'')}><img src={ph.src?.card??ph.src?.thumb} alt="" draggable={false}/></div>)}</div></section>:null;
}

/* ---------- «Что у вас общего» (P05) ---------- */
const side=z.object({value:z.number().nullable().optional(),mark:z.string().nullable().optional(),dir:z.array(z.string()).nullable().optional()});
const GROUPS=['complement','match','try','discuss','bound'] as const;
type Group=typeof GROUPS[number];
const CLS:Record<Group,string>={complement:'k-comp',match:'k-match',try:'k-try',discuss:'k-disc',bound:'k-bound'};
const compatItem=z.object({topicId:z.string(),group:z.enum(GROUPS),mine:side,theirs:side});
type CompatItem=z.infer<typeof compatItem>;
const compatRes=z.discriminatedUnion('few',[
 z.object({ok:z.literal(true),few:z.literal(true),topics:z.array(z.string())}),
 z.object({ok:z.literal(true),few:z.literal(false),count:z.number(),items:z.array(compatItem)}),
]);
type Compat=z.infer<typeof compatRes>;
const topicsRes=z.object({ok:z.literal(true),topics:z.array(z.object({id:z.string(),ru:z.string().nullable(),en:z.string().nullable()}).passthrough())});

function useTopics(){
 const {call}=useFe();const {locale}=useI18n();const [names,setNames]=useState<Map<string,string>>(new Map());
 useEffect(()=>{call('catalog.get',{},topicsRes,{asAccount:true}).then(r=>setNames(new Map(r.topics.map(x=>[x.id,(locale==='en'?x.en||x.ru:x.ru||x.en)||x.id])))).catch(()=>{});},[call,locale]);
 return (id:string)=>names.get(id)??id;
}
const byGroup=(c:Compat)=>{const out:Record<Group,CompatItem[]>={complement:[],match:[],try:[],discuss:[],bound:[]};if(!c.few)for(const i of c.items)out[i.group].push(i);
 const min=(i:CompatItem)=>Math.min(i.mine.value??0,i.theirs.value??0);for(const g of GROUPS)out[g].sort((a,b)=>min(b)-min(a));return out;};

/** compatWords / sharedHead: one number («N общих тем»), then how they split; never a score. */
function compatWords(c:Compat,t:T,locale:string,consent:boolean){
 if(c.few)return t('fe.px.cmp.fewText');
 const g=byGroup(c),m=g.match.length,k=g.complement.length,n=m+k,parts:string[]=[];
 if(n)parts.push(plural(t,locale,'fe.px.topic',n)+(m&&k?fill(t('fe.px.cmp.alikeComp'),{m,c:k}):k?t('fe.px.cmp.compOnly'):''));
 if(g.try.length)parts.push(fill(t('fe.px.cmp.tryN'),{n:g.try.length}));
 if(g.discuss.length)parts.push(fill(t('fe.px.cmp.discussN'),{n:g.discuss.length}));
 const s=parts.join(' · ')||t('fe.px.cmp.something');
 return consent?s+'. '+t('fe.px.cmp.notConsent'):s;
}
function Venn({n}:{n:number|string}){return <div className="venn mini"><i/><i/><b>{n}</b></div>;}

/** The compact block on a profile (compatBlock compact); opens the full comparison. */
export function CompatSummary({profileId}:{profileId:string}){
 const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const [c,setC]=useState<Compat|null>(null);
 useEffect(()=>{setC(null);call('profile.compat',{profileId},compatRes).then(setC).catch(()=>{});},[call,profileId]);
 if(!c)return null;
 return <div className="mt12"><section className="compat v14c"><button type="button" className="cp-h" onClick={()=>navigate('/n/people/'+profileId+'/compat')}>
  <Venn n={c.few?'?':c.count}/><span className="grow"><b>{c.few?t('fe.px.cmp.few'):t('fe.px.cmp.hasTalk')}</b><span>{compatWords(c,t,locale,true)}</span></span><ChevronRight/>
 </button></section></div>;
}

function roleWord(s:z.infer<typeof side>,t:T){if(s.mark)return '';if(!s.dir||s.dir.length===3)return t('fe.px.cmp.role.all');return s.dir.map(d=>t('fe.px.cmp.role.'+d)).join(' · ');}
function explain(i:CompatItem,t:T,name:string){
 const a=i.mine,b=i.theirs,has=(s:typeof a,x:string)=>!s.dir||s.dir.includes(x);
 switch(i.group){
  case 'complement':return has(a,'give')&&has(b,'get')&&!(has(a,'get')&&has(b,'give'))?fill(t('fe.px.cmp.w.give'),{name})
   :has(a,'get')&&has(b,'give')&&!(has(a,'give')&&has(b,'get'))?fill(t('fe.px.cmp.w.get'),{name}):t('fe.px.cmp.w.roles');
  case 'match':return Math.min(a.value??0,b.value??0)>=8?t('fe.px.cmp.w.very'):t('fe.px.cmp.w.into');
  case 'try':return t('fe.px.cmp.w.try');
  case 'discuss':return a.mark==='discuss'?t('fe.px.cmp.w.softMe'):b.mark==='discuss'?fill(t('fe.px.cmp.w.softThem'),{name})
   :a.value!=null&&b.value!=null&&Math.abs(a.value-b.value)>=4?t('fe.px.cmp.w.gap'):'';
  case 'bound':return a.mark==='hard'&&b.mark==='hard'?t('fe.px.cmp.w.both'):a.mark==='hard'?t('fe.px.cmp.w.me'):fill(t('fe.px.cmp.w.them'),{name});
 }
}

/** cmpRow: my fill with the topic inside, both values at the ends; a limit is a word, never a number. */
function CmpRow({i,topic,me,them,t}:{i:CompatItem,topic:string,me:{name:string,id:string,src?:string|null},them:{name:string,id:string,src?:string|null},t:T}){
 const lim=i.group==='bound'||!!i.mine.mark;const lv=lim?0:(i.mine.value??0);
 const val=(s:z.infer<typeof side>)=>s.mark==='hard'?<small className="lim t">{t('fe.px.cmp.taboo')}</small>:s.mark==='discuss'?<small className="lim s">{t('fe.px.cmp.negot')}</small>:<b>{s.value??'—'}</b>;
 const why=explain(i,t,them.name);const ra=roleWord(i.mine,t),rb=roleWord(i.theirs,t);
 const hard=i.mine.mark==='hard'||i.theirs.mark==='hard',soft=i.mine.mark==='discuss'||i.theirs.mark==='discuss';
 return <div className="cr-item">
  <span className={['cr',hard?'hard':'',soft?'soft':''].filter(Boolean).join(' ')} style={{'--v':lv,'--lv':lv} as React.CSSProperties}>
   {lv?<span className="cr-f"/>:null}
   <div className="cr-l">
    <i className="cr-av me"><Av name={me.name} seed={me.id} src={me.src}/></i>
    <span className="cr-v">{val(i.mine)}{ra&&<em>{ra}</em>}</span>
    <span className="cr-n">{topic}</span>
    <span className="cr-v r">{val(i.theirs)}{rb&&<em>{rb}</em>}</span>
    <i className="cr-av them"><Av name={them.name} seed={them.id} src={them.src}/></i>
   </div>
  </span>
  {why&&<p className="cr-why">{why}</p>}
 </div>;
}

/** `/n/people/:id/compat` — the full comparison (SC.P05). */
export function CompatScreen(){
 const {id=''}=useParams();const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const topic=useTopics();
 const [c,setC]=useState<Compat|null>(null);const [p,setP]=useState<PersonProfile|null>(null);const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{setError(null);Promise.all([call('profile.compat',{profileId:id},compatRes),call('profile.get',{profileId:id},personProfileRes)])
  .then(([a,b])=>{setC(a);setP(b.profile);}).catch(setError);},[call,id]);
 useEffect(()=>{load();},[load]);
 const name=personName(p);
 const me={name:acting?.name||acting?.handle||'?',id:acting?.id??'me',src:acting?.avatar??null};
 const them={name:name||'?',id,src:mediaSrc(p?.avatar)};
 return <>
  <Bar title={t('fe.px.cmp.title')} back/>
  <View>
   {error?<Empty icon={Lock} role="alert" title={t('fe.feed.unavailable')} text={pxError(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!c||!p?<p className="note" role="status">{t('fe.loading')}</p>
    :<>
     <div className="cmp14"><Venn n={c.few?(c.topics.length||'?'):c.count}/><div className="cmp-head">
      <small>{fill(t('fe.px.cmp.you'),{name})}</small>
      <b>{c.few?(c.topics.length?fill(t('fe.px.cmp.fewN'),{topics:plural(t,locale,'fe.px.topic',c.topics.length)}):t('fe.px.cmp.few')):t('fe.px.cmp.talk')}</b>
      <span>{c.few?c.topics.map(topic).join(', '):compatWords(c,t,locale,false)}</span>
     </div></div>
     <p className="cmp-consent"><ShieldCheck/><span>{t('fe.px.cmp.consent')}</span></p>
     {c.few&&<div className="alert mt12"><Info/><span><b>{t('fe.px.cmp.fewTitle')}</b>{t('fe.px.cmp.fewBody')}</span></div>}
     {!c.few&&<div className="cmp-groups">{(()=>{const g=byGroup(c);return GROUPS.filter(k=>g[k].length).map(k=><div key={k} className="cg">
      <div className={'cg-h '+CLS[k]}><i/><span>{t('fe.px.cmp.g.'+k)}</span><b>{g[k].length}</b></div>
      <p className="cg-d">{t('fe.px.cmp.d.'+k)}</p>
      <div className="cg-rows">{g[k].map(i=><CmpRow key={i.topicId} i={i} topic={topic(i.topicId)} me={me} them={them} t={t}/>)}</div>
     </div>);})()}</div>}
     <div className="alert mt16"><Lock/><span>{t('fe.px.cmp.foot')}</span></div>
     {c.few&&<Btn kind="soft" className="mt12" onClick={()=>navigate('/n/me/interests')}>{t('fe.px.cmp.moreInt')}</Btn>}
    </>}
  </View>
 </>;
}

/* ---------- links (F2) ---------- */
export const KINDS=['partner','play','ds','mentor','meta','friend'] as const;
export type Kind=typeof KINDS[number];
export const SIDES:Partial<Record<Kind,readonly ['dom','sub']|readonly ['mentor','mentee']>>={ds:['dom','sub'],mentor:['mentor','mentee']};
export const OPPOSITE:Record<string,string>={dom:'sub',sub:'dom',mentor:'mentee',mentee:'mentor'};
/** «Наставничество · учит» — the kind, plus the other side's role (`side` is the own side) when the kind has sides. */
export const linkLabel=(t:T,kind:string,side?:string|null)=>{const theirs=side?OPPOSITE[side]:null;return t('fe.px.lk.k.'+kind)+(theirs?' · '+t('fe.px.lk.s.'+theirs).toLowerCase():'');};
const linkOther=z.object({id:z.uuid(),kind:z.string(),handle:z.string().nullable(),name:z.string().nullable()});
const linkView=z.object({id:z.uuid(),kind:z.string(),side:z.string().nullable(),vis:z.enum(['all','followers','us']),other:linkOther,
 change:z.object({kind:z.string(),mine:z.boolean()}).nullable()});
export type LinkView=z.infer<typeof linkView>;
/** `links.mine`: the acting profile's incoming proposals, sent ones and confirmed links (with its own visibility). */
export const linksMineRes=z.object({ok:z.literal(true),incoming:z.array(linkView),sent:z.array(linkView),confirmed:z.array(linkView)});
export type LinksMine=z.infer<typeof linksMineRes>;
const linksRes=z.object({ok:z.literal(true),items:z.array(z.object({id:z.string(),kind:z.string(),side:z.string().nullable(),
 other:z.object({id:z.uuid(),kind:z.string(),handle:z.string().nullable(),name:z.string().nullable()})}).passthrough())});

/** Confirmed links of a profile as far as both endpoints' visibility allows (linksBlock as another person sees it). */
export function LinksSection({profileId}:{profileId:string}){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const [items,setItems]=useState<z.infer<typeof linksRes>['items']>([]);
 useEffect(()=>{setItems([]);call('links.ofProfile',{profileId},linksRes).then(r=>setItems(r.items)).catch(()=>{});},[call,profileId]);
 if(!items.length)return null;
 return <section className="grp"><div className="grp-t"><span>{t('fe.px.lk.title')}</span></div>
  <div className="card list">{items.map(l=>{const name=l.other.name||(l.other.handle?'@'+l.other.handle:'?');
   // `side` is this profile's side; the row names the other one's, as in the prototype's linkLabel.
   const label=linkLabel(t,l.kind,l.side);
   return <button key={l.id} type="button" className="li" onClick={()=>navigate(l.other.id===acting?.id?'/n/me':'/n/people/'+l.other.id)}>
    <Av name={name} seed={l.other.id} size="sm"/><span className="tx"><b>{name}</b><small>{label}</small></span><ChevronRight/>
   </button>;})}</div>
  <p className="grp-n">{t('fe.px.lk.foot')}</p>
 </section>;
}

/* ---------- the person menu (S02) ---------- */
const REASONS=['threat','private','minor','spam','other'] as const;
const hideList=z.object({ok:z.literal(true),items:z.array(z.object({kind:z.string(),target_id:z.string()}).passthrough())}).passthrough();

function Report({profileId,onClose,onDone}:{profileId:string,onClose:()=>void,onDone:(msg:string,blocked:boolean)=>void}){
 const {call}=useFe();const {t}=useI18n();
 const [why,setWhy]=useState<typeof REASONS[number]|null>(null);const [details,setDetails]=useState('');const [alsoBlock,setAlso]=useState(true);
 const [busy,setBusy]=useState(false);const [err,setErr]=useState('');const op=useRef(newOpId());
 const send=async()=>{
  if(!why){setErr(t('fe.px.rp.choose'));return;}
  setBusy(true);setErr('');
  try{await call('report.create',{opId:op.current,targetType:'profile',targetId:profileId,reason:why,details:details.trim().slice(0,500),alsoBlock},ok);onDone(t('fe.px.rp.sent'),alsoBlock);}
  catch(e){setErr(pxError(e,t));op.current=newOpId();}finally{setBusy(false);}
 };
 return <Sheet title={t('fe.px.rp.title')} onClose={onClose} foot={<Btn kind="danger" onClick={send} disabled={busy}>{t('fe.px.rp.send')}</Btn>}>
  <div role="radiogroup" aria-label={t('fe.px.rp.reason')}>{REASONS.map(k=><button key={k} type="button" className={'radio'+(why===k?' on':'')} role="radio" aria-checked={why===k} onClick={()=>{setWhy(k);setErr('');}}><i/><span className="tx">{t('fe.px.rp.'+k)}</span></button>)}</div>
  <label className="field mt16"><span>{t('fe.px.rp.details')}<i>{t('fe.px.rp.optional')}</i></span><textarea className="inp" rows={3} maxLength={500} value={details} onChange={e=>setDetails(e.target.value)}/></label>
  <div className="card list"><button type="button" className="li" role="switch" aria-checked={alsoBlock} onClick={()=>setAlso(v=>!v)}>
   <span className="tx"><b>{t('fe.px.rp.alsoBlock')}</b><small>{t('fe.px.rp.alsoBlockSub')}</small></span><span className={'sw'+(alsoBlock?' on':'')} aria-hidden="true"/></button></div>
  {err&&<div className="alert err mt12" role="alert"><span>{err}</span></div>}
 </Sheet>;
}

function Block({profileId,name,onClose,onDone}:{profileId:string,name:string,onClose:()=>void,onDone:(msg:string)=>void}){
 const {call,acting,state}=useFe();const {t}=useI18n();
 const others=state.status==='ready'?state.boot.profiles.filter(p=>p.state!=='deleted'&&p.id!==acting?.id):[];
 const alsoFor:'partner'|'me'|null=acting?.kind==='person'&&others.some(p=>p.kind==='couple')?'partner':acting?.kind==='couple'&&others.some(p=>p.kind==='person')?'me':null;
 const [also,setAlso]=useState(false);const [busy,setBusy]=useState(false);const [err,setErr]=useState('');
 const go=async()=>{setBusy(true);setErr('');
  try{await call('block.set',{opId:newOpId(),profileId,on:true,...(also&&alsoFor?{alsoFor}:{})},ok);onDone(t('fe.px.bl.done'));}
  catch(e){setErr(pxError(e,t));}finally{setBusy(false);}};
 return <Sheet title={fill(t('fe.px.bl.title'),{name})} onClose={onClose} foot={<><Btn kind="danger" onClick={go} disabled={busy}>{t('fe.px.bl.ok')}</Btn><Btn kind="text" onClick={onClose}>{t('fe.px.cancel')}</Btn></>}>
  <p className="lead">{t('fe.px.bl.text')}</p>
  {alsoFor&&<div className="card list mt12"><button type="button" className="li" role="switch" aria-checked={also} onClick={()=>setAlso(v=>!v)}>
   <span className="tx"><b>{t(alsoFor==='partner'?'fe.px.bl.alsoPartner':'fe.px.bl.alsoMe')}</b><small>{t(alsoFor==='partner'?'fe.px.bl.alsoPartnerSub':'fe.px.bl.alsoMeSub')}</small></span><span className={'sw'+(also?' on':'')} aria-hidden="true"/></button></div>}
  {err&&<div className="alert err mt12" role="alert"><span>{err}</span></div>}
 </Sheet>;
}

type MenuStep='menu'|'report'|'block'|null;
/** The ⋯ menu of another person's profile and its sheets. `blocked` is kept by the screen: a blocked profile no
 * longer loads, so the screen shows its own blocked state with «Разблокировать». */
export function PersonMenu({profileId,name,step,setStep,blocked,setBlocked,toast}:{profileId:string,name:string,step:MenuStep,setStep:(s:MenuStep)=>void,
 blocked:boolean,setBlocked:(b:boolean)=>void,toast:(msg:string,err?:boolean)=>void}){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();const [hidden,setHidden]=useState<boolean|null>(null);const [busy,setBusy]=useState(false);
 useEffect(()=>{if(step!=='menu'||hidden!==null||blocked)return;call('feedHide.list',{},hideList).then(r=>setHidden(r.items.some(i=>i.kind==='author'&&i.target_id===profileId))).catch(()=>{});},[step,hidden,blocked,call,profileId]);
 const close=useCallback(()=>setStep(null),[setStep]);
 const hide=async()=>{setBusy(true);const on=!hidden;
  try{await call('feedHide.set',{opId:newOpId(),kind:'author',targetId:profileId,on},ok);setHidden(on);close();toast(on?t('fe.px.hidden'):t('fe.px.unhidden'));}
  catch(e){toast(pxError(e,t),true);}finally{setBusy(false);}};
 const unblock=async()=>{setBusy(true);
  try{await call('block.set',{opId:newOpId(),profileId,on:false},ok);setBlocked(false);close();toast(t('fe.px.bl.undone'));}
  catch(e){toast(pxError(e,t),true);}finally{setBusy(false);}};
 const row=(icon:React.ReactNode,title:string,onClick:()=>void,sub?:string,danger?:boolean)=><button type="button" className={'li'+(danger?' danger':'')} onClick={onClick} disabled={busy}>
  <span className="ico">{icon}</span><span className="tx"><b>{title}</b>{sub&&<small>{sub}</small>}</span></button>;
 if(step==='menu')return <Sheet title={name} onClose={close}><div className="card list">
  {blocked?row(<Ban/>,t('fe.px.menu.unblock'),unblock):<>
   {row(<Users/>,t('fe.px.menu.link'),()=>{close();navigate('/n/people/'+profileId+'/link');},t('fe.px.menu.linkSub'))}
   {row(<EyeOff/>,hidden?t('fe.px.menu.unhide'):t('fe.px.menu.hide'),hide,hidden?undefined:t('fe.px.menu.hideSub'))}
   {row(<Flag/>,t('fe.px.menu.report'),()=>setStep('report'),undefined,true)}
   {row(<Ban/>,t('fe.px.menu.block'),()=>setStep('block'),t('fe.px.menu.blockSub'),true)}
  </>}
 </div></Sheet>;
 if(step==='report')return <Report profileId={profileId} onClose={close} onDone={(msg,b)=>{close();if(b)setBlocked(true);toast(msg);}}/>;
 if(step==='block')return <Block profileId={profileId} name={name} onClose={close} onDone={msg=>{close();setBlocked(true);toast(msg);}}/>;
 return null;
}
export type {MenuStep};

/* ---------- «Просмотренные» (D09) ---------- */
const card=z.object({id:z.uuid(),kind:z.string(),handle:z.string().nullable(),name:z.string().nullable(),avatar:media.nullable()}).passthrough();
const historyRes=z.object({ok:z.literal(true),premium:z.boolean(),items:z.array(z.object({decision:z.enum(['like','pass']),decidedAt:z.string().optional(),profile:card}).passthrough())});

/** `/n/people/history`: free accounts see the newest decision, Premium seven days (the server decides). */
export function HistoryScreen(){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();const [toastNode,toast]=useToast();
 const [k,setK]=useState<'all'|'pass'|'like'>('all');const [r,setR]=useState<z.infer<typeof historyRes>|null>(null);const [error,setError]=useState<unknown>(null);
 const [back,setBack]=useState<Set<string>>(new Set());const [busy,setBusy]=useState(false);
 const load=useCallback(()=>{setError(null);setR(null);call('discover.history',{kind:k},historyRes).then(setR).catch(setError);},[call,k]);
 useEffect(()=>{load();},[load]);
 const restore=async(id:string,name:string)=>{setBusy(true);
  try{await call('discover.restore',{opId:newOpId(),profileId:id},ok);setBack(s=>new Set(s).add(id));toast(fill(t('fe.px.h.back'),{name}));}
  catch(e){toast(pxError(e,t),true);}finally{setBusy(false);}};
 return <>
  <Bar title={t('fe.px.h.title')} back/>
  <View>
   <Seg value={k} onChange={setK} options={(['all','pass','like'] as const).map(id=>({id,label:t('fe.px.h.'+id)}))}/>
   {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={pxError(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!r?<p className="note" role="status">{t('fe.loading')}</p>
    :!r.items.length?<Empty icon={History} title={t('fe.px.h.empty')} text={t('fe.px.h.emptyText')}/>
    :<div className="hist">{r.items.map(h=>{const p=h.profile;const name=personName(p)||'?';const ph=mediaSrc(p.avatar);const done=back.has(p.id);
     return <div key={p.id} className="hwrap">
      <button type="button" className="hcard" onClick={()=>navigate('/n/people/'+p.id)}>
       {ph?<img src={ph} alt="" draggable={false}/>:<div className="plate" style={plate(p.id)}/>}
       <span className={'mk'+(h.decision==='like'?' l':'')} aria-label={t(h.decision==='like'?'fe.px.h.liked':'fe.px.h.passed')}>{h.decision==='like'?<Heart/>:<X/>}</span>
       <span className="history-name">{name}</span>
      </button>
      {h.decision==='pass'&&<button type="button" className="hrest" disabled={done||busy} onClick={()=>restore(p.id,name)}
       aria-label={done?fill(t('fe.px.h.back'),{name}):fill(t('fe.px.h.restore'),{name})} title={done?fill(t('fe.px.h.back'),{name}):fill(t('fe.px.h.restore'),{name})}>{done?<Check/>:<Undo2/>}</button>}
     </div>;})}</div>}
   {r&&!r.premium&&r.items.length>0&&<div className="paywall"><b>{t('fe.px.h.payTitle')}</b><p>{t('fe.px.h.payText')}</p></div>}
  </View>
  {toastNode}
 </>;
}

/* ---------- «Как видят» (P03) ---------- */
type Lv='all'|'granted'|'card';
const previewProfileRes=z.object({ok:z.literal(true),profile:personProfile.extend({detailsVis:z.string().nullable().optional()})});
const ownPrivRes=z.object({ok:z.literal(true),exists:z.boolean(),on:z.boolean().optional(),text:z.string().nullable().optional(),available:z.array(z.string()).optional()}).passthrough();
const ownSettingsRes=z.object({ok:z.literal(true),settings:z.object({discoverMode:z.string()}).passthrough()});
const optionsRes=z.object({ok:z.literal(true),options:z.array(z.object({kind:z.string(),code:z.string(),ru:z.string().nullable(),en:z.string().nullable()}))});
const DETAIL_ROWS:[string,string][]=[['genders','gender'],['orients','orient'],['roles','role'],['status','status'],['formats','format'],['seeks','seek']];
type Preview={p:z.infer<typeof previewProfileRes>['profile'],links:LinksMine|null,priv:z.infer<typeof ownPrivRes>|null,discover:string|null,options:z.infer<typeof optionsRes>['options']};

/** `/n/me/preview`: the own profile as others see it, with the prototype's audience switch «Все / С доступом /
 * Знакомства». Everything is the server's own data about this profile, filtered by the owner's settings: details by
 * `detailsVis`, links by the own link visibility (the other side's choice may hide more), the private part from the
 * own `private.get` — the server has no «as a person with access» view, so «С доступом» is marked as a preview.
 * Photos still under review are left out; the buttons are inert. */
export function MePreviewScreen(){
 const {call,acting}=useFe();const {t,locale}=useI18n();
 const [lv,setLv]=useState<Lv>('all');const [d,setD]=useState<Preview|null>(null);const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{if(!acting)return;setError(null);
  Promise.all([call('profile.get',{profileId:acting.id},previewProfileRes),call('links.mine',{},linksMineRes).catch(()=>null),
   call('private.get',{profileId:acting.id},ownPrivRes).catch(()=>null),call('profile.settings',{},ownSettingsRes).catch(()=>null),
   call('catalog.get',{},optionsRes,{asAccount:true}).then(r=>r.options).catch(()=>[])])
   .then(([a,links,priv,s,options])=>setD({p:a.profile,links,priv,discover:s?.settings.discoverMode??null,options})).catch(setError);},[call,acting]);
 useEffect(()=>{load();},[load]);
 const label=(kind:string,code:string)=>{const o=d?.options.find(x=>x.kind===kind&&x.code===code);return o?((locale==='en'?o.en||o.ru:o.ru||o.en)??code):code;};
 const body=(p:Preview['p'],aud:'all'|'granted')=>{
  const dv=p.detailsVis??'only';const details=p.kind==='person'&&(dv==='all'||aud==='granted'&&dv==='granted');
  const confirmed=d?.links?.confirmed??[];const shown=confirmed.filter(l=>l.vis==='all');const hidden=confirmed.length-shown.length;
  const priv=d?.priv;const scopes=(priv?.available??[]).map(s=>t('fe.priv.scope.'+s)).join(', ');
  return <>
   <PersonBio p={p}/>
   {details&&<section className="grp"><div className="grp-t"><span>{t('fe.me.details')}</span></div>
    <div className="card"><dl className="kv">{DETAIL_ROWS.map(([field,kind])=>{const v=p.details[field];const codes=Array.isArray(v)?v as string[]:typeof v==='string'?[v]:[];
     return codes.length?<Fragment key={field}><dt>{t('fe.reg.kind.'+kind)}</dt><dd>{codes.map(c=>label(kind,c)).join(', ')}</dd></Fragment>:null;})}</dl></div>
   </section>}
   {confirmed.length>0&&<section className="grp"><div className="grp-t"><span>{t('fe.px.lk.title')}</span></div>
    {shown.length>0&&<div className="card list">{shown.map(l=>{const name=personName(l.other)||'?';
     return <div key={l.id} className="li"><Av name={name} seed={l.other.id} size="sm"/><span className="tx"><b>{name}</b><small>{linkLabel(t,l.kind,l.side)}</small></span></div>;})}</div>}
    <p className="grp-n">{[shown.length?t('fe.px.lk.foot'):'',hidden?fill(t('fe.ln.pv.linksHidden'),{n:hidden}):''].filter(Boolean).join(' ')}</p>
   </section>}
   {priv&&(priv.on?(aud==='granted'
     ?<section className="grp"><div className="grp-t"><span>{t('fe.priv.title')}</span></div>
      <div className="card">{priv.text?<div className="md bio"><p>{priv.text}</p></div>:<p className="note">{t('fe.priv.emptyText')}</p>}</div></section>
     :(priv.available??[]).length>0&&<section className="grp"><div className="grp-t"><span>{t('fe.priv.title')}</span></div>
      <div className="card"><div className="fact"><i className="v"><Lock/></i><span>{fill(t('fe.priv.closed'),{scopes})}</span></div>
       <div inert><Btn kind="soft" size="md" icon={LockOpen} className="mt12" aria-disabled="true">{t('fe.priv.ask')}</Btn></div></div></section>)
    :aud==='granted'&&<section className="grp"><div className="grp-t"><span>{t('fe.priv.title')}</span></div><p className="note">{t('fe.ln.pv.privOff')}</p></section>)}
   <PersonPhotos p={p}/>
  </>;
 };
 const p=d?.p;const ph=p?mediaSrc(p.avatar):null;const city=p?.city?(locale==='en'?p.city.en:p.city.ru):null;
 return <>
  <Bar title={t('fe.px.pv.title')} back/>
  <View>
   <Seg value={lv} onChange={setLv} label={t('fe.px.pv.title')} options={(['all','granted','card'] as const).map(id=>({id,label:t('fe.ln.pv.'+id)}))}/>
   {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={pxError(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!p?<p className="note" role="status">{t('fe.loading')}</p>
    :lv==='card'?<>
     <div className="mt12"><div className="card18">
      {ph?<><img className="mbg" src={ph} alt="" aria-hidden="true" draggable={false}/><img src={ph} alt={personName(p)} draggable={false}/></>:<div className="plate" style={plate(p.id)}/>}
      <div className="pc-info"><h2 className="pc-name"><span className="pcn">{personName(p)}</span>{p.age?<span>{p.age}</span>:null}</h2>
       {city&&<div className="pc-who"><span className="pl"><MapPin/>{city}</span></div>}</div>
     </div></div>
     <p className="note center mt12">{d?.discover!=='visible'?t('fe.ln.pv.cardOff'):!ph?t('fe.ln.pv.cardNoPhoto'):t('fe.ln.pv.cardOn')}</p>
     <div className="pc-body pc-full p3-card21">{body(p,'all')}</div>
    </>
    :<>
     <div className="alert info mt12"><Info/><span>{lv==='granted'?t('fe.ln.pv.noteGranted'):t('fe.ln.pv.noteAll')}</span></div>
     <PersonHero p={p}/>
     <div className="p-acts" inert>
      <Btn kind="primary" aria-disabled="true">{t('fe.people.follow')}</Btn>
      <Btn kind="soft" icon={Heart} aria-disabled="true">{t('fe.people.like')}</Btn>
     </div>
     {body(p,lv)}
    </>}
  </View>
 </>;
}
