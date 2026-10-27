import {useCallback,useEffect,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Ban,EyeOff,History,KeyRound,MessageCircle,Pencil,Plus,Sparkles,Trash2,X} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Bar,Btn,Empty,View} from './ui';
import {useFe} from './session';
import {when} from './feed';

/** Interests (V21 X01 #meJars, X02, X04) with the prototype's markup: one capsule per interest — the fill is the
 * level 1–10; «обсудить» and «граница» are marks, never levels. Everything comes from the server. */
const VIS=['public','granted','only'] as const;
const DIRS=['give','get','watch'] as const;
type Vis=typeof VIS[number];type Dir=typeof DIRS[number];
type Answer=number|'discuss'|'hard'|null;

const item=z.object({topicId:z.string(),value:z.number().nullable().optional(),mark:z.enum(['discuss','hard']).nullable().optional(),
 dir:z.array(z.string()).nullable().optional(),vis:z.enum(VIS).nullable().optional()});
export type Interest=z.infer<typeof item>;
const listRes=z.object({ok:z.literal(true),items:z.array(item)});
const category=z.object({id:z.string(),ru:z.string(),en:z.string()});
const topic=z.object({id:z.string(),categoryId:z.string(),ru:z.string(),en:z.string(),descRu:z.string().nullable().optional(),descEn:z.string().nullable().optional()});
const catalogRes=z.object({ok:z.literal(true),categories:z.array(category),topics:z.array(topic)});
type Topic=z.infer<typeof topic>;type Category=z.infer<typeof category>;
const setRes=z.object({ok:z.literal(true),pending:z.unknown().optional()}).passthrough();
const ok=z.object({ok:z.literal(true)}).passthrough();
const state=z.record(z.string(),z.unknown()).nullable().optional();
const histRes=z.object({ok:z.literal(true),items:z.array(z.object({id:z.string(),topicId:z.string(),kind:z.string(),from:state,to:state,archived:z.boolean().optional(),at:z.string()})),next:z.string().nullable()});
type HistItem=z.infer<typeof histRes>['items'][number];

const LIMITS='limits';
const visOf=(j:Interest):Vis=>j.vis==='granted'||j.vis==='only'?j.vis:'public';
const dirsOf=(d:unknown):Dir[]=>Array.isArray(d)?DIRS.filter(x=>d.includes(x)):[];
/** Levels first (high to low), then «обсудить», then «граница». */
export const sortJars=(list:Interest[])=>[...list.filter(j=>!j.mark).sort((a,b)=>(b.value??0)-(a.value??0)),...list.filter(j=>j.mark==='discuss'),...list.filter(j=>j.mark==='hard')];

/** Catalog topics and the acting profile's interests. */
export function useInterests(){
 const {call,acting}=useFe();
 const [items,setItems]=useState<Interest[]|null>(null);const [cats,setCats]=useState<Category[]>([]);const [topics,setTopics]=useState<Topic[]>([]);
 const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{
  if(!acting)return;setError(null);
  call('interests.list',{profileId:acting.id},listRes).then(r=>setItems(r.items)).catch(setError);
 },[call,acting]);
 useEffect(()=>{setItems(null);load();},[load]);
 useEffect(()=>{call('catalog.get',{},catalogRes,{asAccount:true}).then(r=>{setCats(r.categories);setTopics(r.topics);}).catch(()=>{});},[call]);
 return {items,cats,topics,error,load};
}

function useTopicName(topics:Topic[]){
 const {locale}=useI18n();
 return (id:string)=>{const x=topics.find(o=>o.id===id);return x?(locale==='en'?x.en:x.ru):id;};
}

/** `jarsHTML()` — capsules; a tap opens the interest sheet. */
export function Jars({list,topics,onOpen,onAdd}:{list:Interest[],topics:Topic[],onOpen:(topicId:string)=>void,onAdd?:()=>void}){
 const {t}=useI18n();const name=useTopicName(topics);
 const limitTopic=(id:string)=>topics.find(x=>x.id===id)?.categoryId===LIMITS;
 const role=(j:Interest)=>{const d=dirsOf(j.dir);if(!d.length||limitTopic(j.topicId))return '';return d.length===DIRS.length?t('fe.int.role.all'):d.map(x=>t('fe.int.role.'+x)).join(' · ');};
 const vis=(j:Interest)=>j.vis==='granted'?<span className="sc-vis"><KeyRound/></span>:j.vis==='only'?<span className="sc-vis"><EyeOff/></span>:null;
 return <div className="jars caps">
  {list.map((j,i)=>{
   const n=name(j.topicId);
   if(j.mark){const word=t('fe.int.mark.'+j.mark);
    return <button key={j.topicId} type="button" className={'sc '+(j.mark==='hard'?'hard':'soft')} aria-label={`${n}: ${word}`} onClick={()=>onOpen(j.topicId)}>
     <span className="sc-l"><span className="sc-n">{n}</span>{vis(j)}<span className={'sc-lim '+(j.mark==='hard'?'t':'s')}>{word}</span></span></button>;}
   const lv=j.value??1;const rw=role(j);
   return <button key={j.topicId} type="button" className={'sc'+(lv>=10?' full':'')} aria-label={`${n}: ${t('fe.int.ed.level',{n:lv})}${rw?', '+rw:''}`}
    style={{'--v':lv,'--lv':lv,'--d':`${(i%8)*.04}s`} as CSSProperties} onClick={()=>onOpen(j.topicId)}>
    <span className="sc-f"/><span className="sc-l"><span className="sc-n">{n}</span>{vis(j)}<span className="sc-v"><b>{lv}</b>{rw&&<em>{rw}</em>}</span></span></button>;
  })}
  {onAdd&&<button type="button" className="sc add" onClick={onAdd}><span className="sc-l c"><Plus/>{t('fe.int.add')}</span></button>}
 </div>;
}

/** The legend under a list with non-public interests. */
export function JarLegend({couple,extra}:{couple:boolean,extra?:string}){
 const {t}=useI18n();
 return <p className="grp-n jar-legend21"><EyeOff/> {t(couple?'fe.int.legend.onlyUs':'fe.int.legend.only')} · <KeyRound/> {t('fe.int.legend.granted')} · {t('fe.int.legend.none')}{extra?'. '+extra:''}</p>;
}

/** `openJar()` — the interest sheet: what it is → how you like it → who sees → the answer. */
export function InterestSheet({topicId,topics,cats,current,onClose,onDone}:{topicId:string,topics:Topic[],cats:Category[],current:Interest|undefined,onClose:()=>void,onDone:(msg:string)=>void}){
 const {call,acting}=useFe();const {t,locale}=useI18n();
 const tp=topics.find(x=>x.id===topicId);const cat=cats.find(c=>c.id===tp?.categoryId);
 const limit=tp?.categoryId===LIMITS;const couple=acting?.kind==='couple';
 const name=tp?(locale==='en'?tp.en:tp.ru):topicId;const desc=tp?(locale==='en'?tp.descEn:tp.descRu):null;
 const [v,setV]=useState<Answer>(current?current.mark??current.value??null:null);
 const [dir,setDir]=useState<Dir[]>(()=>{const d=dirsOf(current?.dir);return d.length?d:[...DIRS];});
 const [vis,setVis]=useState<Vis>(current?visOf(current):'public');
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [asking,setAsking]=useState(false);const [on,setOn]=useState(false);
 const opId=useRef(newOpId());const sheet=useRef<HTMLDivElement>(null);
 // Over the whole column like the prototype's #sheet, not inside the scrolling view.
 const [host,setHost]=useState<Element|null>(null);
 useEffect(()=>{setHost(document.querySelector('.fe-v21 main.main')??document.body);},[]);
 useEffect(()=>{if(!host)return;const r=requestAnimationFrame(()=>{setOn(true);sheet.current?.focus({preventScroll:true});});return ()=>cancelAnimationFrame(r);},[host]);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};addEventListener('keydown',k);return ()=>removeEventListener('keydown',k);},[onClose]);
 const mark=v==='discuss'||v==='hard';const n=typeof v==='number'?v:null;
 const allDir=dir.length===DIRS.length;
 const toggleDir=(k:'all'|Dir)=>{if(mark)return;
  setDir(d=>{if(k==='all')return [...DIRS];if(d.length===DIRS.length)return [k];const next=d.includes(k)?d.filter(x=>x!==k):[...d,k];return next.length?DIRS.filter(x=>next.includes(x)):[...DIRS];});};
 const save=async()=>{
  if(v==null)return;setBusy(true);setFailure('');
  try{
   const input:Record<string,unknown>={opId:opId.current,topicId,vis,...(typeof v==='number'?{value:v,...(limit?{}:{dir})}:{mark:v})};
   const r=await call('interests.set',input,setRes);onDone(r.pending?t('fe.int.pending'):t('fe.int.saved'));
  }catch(e){setFailure(feErrorMessage(e,t));opId.current=newOpId();}finally{setBusy(false);}
 };
 const remove=async()=>{
  setBusy(true);setFailure('');
  try{await call('interests.remove',{opId:newOpId(),topicId},ok);onDone(t('fe.int.removed'));}
  catch(e){setFailure(feErrorMessage(e,t));setAsking(false);}finally{setBusy(false);}
 };
 if(!host)return null;
 return createPortal(<>
  <div id="scrim" className={'scrim'+(on?' on':'')} onClick={onClose}/>
  <div id="sheet" ref={sheet} className={'sheet'+(on?' on':'')} role="dialog" aria-modal="true" aria-label={name} tabIndex={-1}>
   <div className="grab"/>
   <div className="sh-h"><div className="sh-ht"><h2>{name}</h2>{cat&&<p>{locale==='en'?cat.en:cat.ru}</p>}</div>
    <button type="button" className="ibtn ghost sm" aria-label={t('fe.int.ed.close')} onClick={onClose}><X/></button></div>
   <div className="sh-b">
    {desc&&<p className="topic-desc">{desc}</p>}
    {!limit&&<section className={'grp bare'+(mark?' dim':'')}><div className="grp-t"><span>{t('fe.int.ed.dir')}</span></div><div className="card"><div className="chips">
     {(['all',...DIRS] as const).map(k=>{const pressed=k==='all'?allDir:!allDir&&dir.includes(k);
      return <button key={k} type="button" className={'chip'+(pressed?' on':'')} aria-pressed={pressed} tabIndex={mark?-1:undefined} aria-disabled={mark||undefined} onClick={()=>toggleDir(k)}>{t('fe.int.ed.dir.'+k)}</button>;})}
    </div></div></section>}
    <section className="grp bare"><div className="grp-t"><span>{t('fe.int.ed.vis')}</span></div><div className="card"><div className="chips">
     {VIS.map(k=><button key={k} type="button" className={'chip'+(vis===k?' on':'')} aria-pressed={vis===k} onClick={()=>setVis(k)}>{t('fe.int.ed.vis.'+(k==='only'&&couple?'onlyUs':k))}</button>)}
    </div>{vis==='public'&&v==='hard'&&<p className="note" style={{marginTop:6}}>{t('fe.int.ed.hardPublic')}</p>}</div></section>
    <section className="grp bare"><div className="grp-t"><span>{t(limit?'fe.int.ed.qLimit':'fe.int.ed.q')}</span></div><div className="card"><div className="ans">
     <div className="ans-scale" role="radiogroup" aria-label={t('fe.int.ed.scale')}>
      {[1,2,3,4,5,6,7,8,9,10].map(k=><button key={k} type="button" className={[n&&k<=n?'fill':'',n===k?'on':''].filter(Boolean).join(' ')} role="radio" aria-checked={n===k} onClick={()=>setV(k)}>{k}</button>)}
     </div>
     <div className="ans-l"><span>{t('fe.int.ed.low')}</span><span>{t('fe.int.ed.high')}</span></div>
     <div className="ans-marks">
      <button type="button" className={'ans-m'+(v==='discuss'?' on':'')} aria-pressed={v==='discuss'} onClick={()=>setV('discuss')}><MessageCircle/><span>{t('fe.int.ed.discuss')}</span></button>
      <button type="button" className={'ans-m taboo'+(v==='hard'?' on':'')} aria-pressed={v==='hard'} onClick={()=>setV('hard')}><Ban/><span>{t('fe.int.ed.hard')}</span></button>
     </div>
     <p className="ans-word" aria-live="polite">{v==null?t('fe.int.ed.pick'):n?<><b>{t('fe.int.ed.level',{n})}</b><span>{t('fe.int.ed.levelText')}</span></>:t(v==='hard'?'fe.int.ed.hardText':'fe.int.ed.discussText')}</p>
    </div></div></section>
   </div>
   <div className="sh-f">
    {failure&&<div className="alert err" role="alert"><span>{failure}</span></div>}
    {asking?<>
     <p className="note"><b>{t('fe.int.ed.removeQ',{topic:name})}</b> {t('fe.int.ed.removeText')}</p>
     <div className="row g8"><Btn kind="soft" onClick={()=>setAsking(false)} disabled={busy}>{t('fe.cancel')}</Btn><Btn kind="danger" onClick={remove} disabled={busy}>{t('fe.int.ed.remove')}</Btn></div>
    </>:<>
     {v==null&&<p className="note jar-need">{t('fe.int.ed.need')}</p>}
     <div className="row g8">
      {current&&<button type="button" className="btn secondary icon" aria-label={t('fe.int.ed.remove')} onClick={()=>setAsking(true)} disabled={busy}><Trash2/></button>}
      <button type="button" className={'btn primary'+(v==null?' off':'')} onClick={save} disabled={v==null||busy} aria-disabled={v==null||undefined}>{busy?t('fe.loading'):current?t('fe.int.ed.save'):t('fe.int.ed.addOne')}</button>
     </div>
    </>}
   </div>
  </div>
 </>,host);
}

/** X02 — all interests grouped by answer, and the catalog's topics by category to add more. */
export function InterestsScreen(){
 const {acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const {items,cats,topics,error,load}=useInterests();
 const [open,setOpen]=useState<string|null>(null);const [notice,setNotice]=useState('');
 const addRef=useRef<HTMLDivElement>(null);
 if(!acting)return null;
 const couple=acting.kind==='couple';
 const all=sortJars(items??[]);const have=new Set(all.map(j=>j.topicId));
 const groups=([['level',all.filter(j=>!j.mark)],['discuss',all.filter(j=>j.mark==='discuss')],['hard',all.filter(j=>j.mark==='hard')]] as const).filter(g=>g[1].length);
 const sections=cats.map(c=>({c,ts:topics.filter(x=>x.categoryId===c.id&&!have.has(x.id))})).filter(s=>s.ts.length);
 const toAdd=()=>addRef.current?.scrollIntoView({behavior:'smooth',block:'start'});
 return <>
  <Bar title={t(couple?'fe.int.screenCouple':'fe.int.screen')} back="/n/me">
   <button type="button" className="ibtn" aria-label={t('fe.int.history')} onClick={()=>navigate('/n/me/interests/history')}><History/></button>
   <button type="button" className="ibtn" aria-label={t('fe.int.add')} onClick={toAdd}><Plus/></button>
  </Bar>
  <View className="nodock">
   {notice&&<div className="alert ok" role="status"><span>{notice}</span></div>}
   {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!items?<p className="note" role="status">{t('fe.loading')}</p>
    :<>
     {all.length?groups.map(([g,l])=><section key={g} className="grp"><div className="grp-t"><span>{t('fe.int.group.'+g)} · {l.length}</span></div>
      <div className="card"><Jars list={l} topics={topics} onOpen={setOpen}/></div></section>)
      :<Empty icon={Sparkles} title={t('fe.int.empty.title')} text={t(couple?'fe.int.empty.textCouple':'fe.int.empty.text')}><Btn onClick={toAdd}>{t('fe.int.add')}</Btn></Empty>}
     {all.length>0&&<JarLegend couple={couple} extra={t('fe.int.hardNote')}/>}
     <div ref={addRef}>
      <section className="grp"><div className="grp-t"><span>{t('fe.int.addTitle')}</span></div>
       <p className="note">{sections.length?t('fe.int.addHint'):cats.length?t('fe.int.allAdded'):t('fe.loading')}</p></section>
      {sections.map(({c,ts})=><section key={c.id} className="fsec"><div className="sec">{locale==='en'?c.en:c.ru}</div>
       <div className="chips">{ts.map(x=><button key={x.id} type="button" className="chip" aria-pressed={false} onClick={()=>setOpen(x.id)}>{locale==='en'?x.en:x.ru}</button>)}</div></section>)}
     </div>
    </>}
  </View>
  {open&&<InterestSheet key={open} topicId={open} topics={topics} cats={cats} current={items?.find(j=>j.topicId===open)} onClose={()=>setOpen(null)} onDone={msg=>{setOpen(null);setNotice(msg);load();}}/>}
 </>;
}

/** X04 — the interest history; only the profile's own members see it. */
export function InterestsHistoryScreen(){
 const {call,acting}=useFe();const {t,locale}=useI18n();
 const [items,setItems]=useState<HistItem[]|null>(null);const [next,setNext]=useState<string|null>(null);const [error,setError]=useState<unknown>(null);const [more,setMore]=useState(false);
 const [topics,setTopics]=useState<Topic[]>([]);const name=useTopicName(topics);
 const load=useCallback((cursor?:string)=>{
  setError(null);if(cursor)setMore(true);else setItems(null);
  call('interests.history',{limit:30,...(cursor?{cursor}:{})},histRes).then(r=>{setItems(prev=>cursor&&prev?[...prev,...r.items]:r.items);setNext(r.next);}).catch(setError).finally(()=>setMore(false));
 },[call]);
 useEffect(()=>{load();},[load,acting?.id]);
 useEffect(()=>{call('catalog.get',{},catalogRes,{asAccount:true}).then(r=>setTopics(r.topics)).catch(()=>{});},[call]);
 const couple=acting?.kind==='couple';
 const answer=(s:Record<string,unknown>|null|undefined)=>{
  if(!s)return '—';
  if(s.mark==='hard'||s.mark==='discuss')return t('fe.int.mark.'+s.mark);
  const d=dirsOf(s.dir);const dt=d.length?', '+(d.length===DIRS.length?t('fe.int.hist.dir.all'):d.map(x=>t('fe.int.hist.dir.'+x)).join(', ')):'';
  return typeof s.value==='number'?`${s.value}/10${dt}`:'—';
 };
 const visWord=(v:unknown)=>t('fe.int.hist.w.'+(v==='granted'?'granted':v==='only'?(couple?'onlyUs':'only'):'public'));
 const text=(h:HistItem)=>h.kind==='vis'?t('fe.int.hist.vis',{from:visWord(h.from?.vis),to:visWord(h.to?.vis)})
  :!h.from?t('fe.int.hist.added',{v:answer(h.to)}):!h.to?t('fe.int.hist.removed',{v:answer(h.from)}):`${answer(h.from)} → ${answer(h.to)}`;
 return <>
  <Bar title={t('fe.int.hist.title')} back="/n/me/interests"/>
  <View className="nodock">
   {error&&!items?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={()=>load()}>{t('fe.retry')}</Btn></Empty>
    :!items?<p className="note" role="status">{t('fe.loading')}</p>
    :<section className="grp"><div className="card list">
      {items.length?items.map(h=><div key={h.id} className="li static"><span className="ico">{h.archived?<Sparkles/>:<Pencil/>}</span>
       <span className="tx"><b>{name(h.topicId)}</b><small>{text(h)} · {t(h.archived?'fe.int.hist.archived':'fe.int.hist.manual')}</small></span><span className="val">{when(h.at,locale)}</span></div>)
       :<div className="li static"><span className="tx"><small>{t('fe.int.hist.empty')}</small></span></div>}
     </div><p className="grp-n">{t(couple?'fe.int.hist.footCouple':'fe.int.hist.foot')}</p>
     {error?<div className="alert err" role="alert"><span>{feErrorMessage(error,t)}</span></div>:null}
     {next&&<Btn kind="text" auto className="jar-more" disabled={more} onClick={()=>load(next)}>{more?t('fe.loading'):t('fe.int.hist.more')}</Btn>}
    </section>}
  </View>
 </>;
}

/** X01 `meJars18()` — the «Интересы» block in «Я»: up to 8 capsules, the «кто видит» filter when there are two kinds. */
export function MeJars(){
 const {acting}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const {items,cats,topics,load}=useInterests();
 const [f,setF]=useState<'all'|Vis>('all');const [openAll,setOpenAll]=useState(false);const [open,setOpen]=useState<string|null>(null);const [notice,setNotice]=useState('');
 if(!acting||!items)return null;
 const couple=acting.kind==='couple';
 const title=t(couple?'fe.int.titleCouple':'fe.int.title');
 const add=()=>navigate('/n/me/interests');
 if(!items.length)return <section className="grp bare" id="meJars"><div className="grp-t"><span>{title}</span></div><div className="card">
  <button type="button" className="ph-empty" onClick={add}><span className="pe-ic"><Sparkles/></span><span className="tx"><b>{t('fe.int.add')}</b><small>{t(couple?'fe.int.emptySubCouple':'fe.int.emptySub')}</small></span><Plus/></button>
 </div></section>;
 const n=(k:Vis)=>items.filter(j=>visOf(j)===k).length;
 const kinds=VIS.filter(k=>n(k));const multi=kinds.length>1;
 const list=sortJars(f==='all'||!multi?items:items.filter(j=>visOf(j)===f));const shown=openAll?list:list.slice(0,8);
 const chips:[('all'|Vis),string][]=[['all',t('fe.int.filter.all',{n:items.length})],...kinds.map(k=>[k,t('fe.int.filter.'+(k==='only'&&couple?'onlyUs':k),{n:n(k)})] as [Vis,string])];
 return <section className="grp bare" id="meJars">
  <div className="grp-t"><span>{title}{multi?'':` · ${items.length}`}</span><span className="jar-links21">
   <button type="button" onClick={()=>navigate('/n/me/interests')}>{t('fe.int.all')}</button>
   {!couple&&<button type="button" onClick={()=>navigate('/n/me/interests/history')}>{t('fe.int.history')}</button>}
  </span></div>
  {notice&&<div className="alert ok" role="status"><span>{notice}</span></div>}
  {multi&&<div className="jar-f"><div className="chips" role="group" aria-label={t('fe.int.filterAria')}>{chips.map(([id,l])=><button key={id} type="button" className={'chip'+(f===id?' on':'')} aria-pressed={f===id} onClick={()=>setF(id)}>{l}</button>)}</div></div>}
  <Jars list={shown} topics={topics} onOpen={setOpen} onAdd={add}/>
  {list.length>8&&<button type="button" className="btn text auto jar-more" onClick={()=>setOpenAll(o=>!o)}>{openAll?t('fe.int.less'):t('fe.int.more',{n:list.length-8})}</button>}
  {(n('granted')>0||n('only')>0)&&<JarLegend couple={couple}/>}
  {open&&<InterestSheet key={open} topicId={open} topics={topics} cats={cats} current={items.find(j=>j.topicId===open)} onClose={()=>setOpen(null)} onDone={msg=>{setOpen(null);setNotice(msg);load();}}/>}
 </section>;
}
