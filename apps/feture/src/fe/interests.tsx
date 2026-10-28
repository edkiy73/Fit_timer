import {useCallback,useEffect,useRef,useState,type CSSProperties} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Ban,EyeOff,KeyRound,MessageCircle,Pencil,Plus,Sparkles,Trash2,X} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {AddCard,Alert,AnswerScale,Bar,Btn,Card,Chip,Chips,Empty,Group,IconBtn,Note,Progress,Row,SearchInput,SectionLabel,Sheet,Skel,View} from './kit';
import {useFe,usePartnerApproves,useShown} from './session';
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

const LIMITS='limits';
const visOf=(j:Interest):Vis=>j.vis==='granted'||j.vis==='only'?j.vis:'public';
const dirsOf=(d:unknown):Dir[]=>Array.isArray(d)?DIRS.filter(x=>d.includes(x)):[];
/** Levels first (high to low), then «обсудить», then «граница». */
export const sortJars=(list:Interest[])=>[...list.filter(j=>!j.mark).sort((a,b)=>(b.value??0)-(a.value??0)),...list.filter(j=>j.mark==='discuss'),...list.filter(j=>j.mark==='hard')];

/** Catalog topics and the acting profile's interests. */
export function useInterests(){
 const {call,acting,peek}=useFe();
 // The last answers on the first frame («Я» and the interests screen draw whole on a revisit), then read again.
 const [items,setItems]=useShown<Interest[]|null>('int.items',()=>acting?peek('interests.list',{profileId:acting.id},listRes)?.items??null:null);
 const cat0=()=>peek('catalog.get',{},catalogRes,{asAccount:true});
 const [cats,setCats]=useState<Category[]>(()=>cat0()?.categories??[]);const [topics,setTopics]=useState<Topic[]>(()=>cat0()?.topics??[]);
 const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{
  if(!acting)return;setError(null);
  call('interests.list',{profileId:acting.id},listRes).then(r=>setItems(r.items)).catch(setError);
 },[call,acting]);
 useEffect(()=>{load();},[load]);
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
export function InterestSheet({topicId,topics,cats,current,defaultVis='public',onClose,onDone}:{topicId:string,topics:Topic[],cats:Category[],current:Interest|undefined,defaultVis?:Vis,onClose:()=>void,onDone:(msg:string)=>void}){
 const {call,acting}=useFe();const {t,locale}=useI18n();
 const tp=topics.find(x=>x.id===topicId);const cat=cats.find(c=>c.id===tp?.categoryId);
 const limit=tp?.categoryId===LIMITS;const couple=acting?.kind==='couple';const toPartner=usePartnerApproves();
 const name=tp?(locale==='en'?tp.en:tp.ru):topicId;const desc=tp?(locale==='en'?tp.descEn:tp.descRu):null;
 const [v,setV]=useState<Answer>(current?current.mark??current.value??null:null);
 const [dir,setDir]=useState<Dir[]>(()=>{const d=dirsOf(current?.dir);return d.length?d:[...DIRS];});
 const [vis,setVis]=useState<Vis>(current?visOf(current):defaultVis);
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [asking,setAsking]=useState(false);
 const opId=useRef(newOpId());
 const save=async()=>{
  if(v==null)return;setBusy(true);setFailure('');
  try{
   const input:Record<string,unknown>={opId:opId.current,topicId,vis,...(typeof v==='number'?{value:v,...(limit?{}:{dir})}:{mark:v})};
   const r=await call('interests.set',input,setRes);onDone(r.pending?t('fe.int.pending'):t(couple?'fe.int.savedUs':'fe.int.saved'));
  }catch(e){setFailure(feErrorMessage(e,t));opId.current=newOpId();}finally{setBusy(false);}
 };
 const remove=async()=>{
  setBusy(true);setFailure('');
  try{await call('interests.remove',{opId:newOpId(),topicId},ok);onDone(t('fe.int.removed'));}
  catch(e){setFailure(feErrorMessage(e,t));setAsking(false);}finally{setBusy(false);}
 };
 // The kit sheet (in the app layer, above the phone dock); Escape, ✕ and the scrim close it — after asking, when
 // something was changed and not saved (V21 editJar).
 const init=useRef({v,dir:dir.join(),vis});
 const dirty=!busy&&(v!==init.current.v||dir.join()!==init.current.dir||vis!==init.current.vis);
 return <Sheet title={name} sub={cat?(locale==='en'?cat.en:cat.ru):undefined} onClose={onClose} dirty={dirty} foot={<>
  {failure&&<Alert kind="err" noIcon>{failure}</Alert>}
  {asking?<>
   <Note><b>{t('fe.int.ed.removeQ',{topic:name})}</b> {t('fe.int.ed.removeText')}</Note>
   <div className="row g8"><Btn kind="soft" onClick={()=>setAsking(false)} disabled={busy}>{t('fe.cancel')}</Btn><Btn kind="danger" onClick={remove} disabled={busy}>{t('fe.int.ed.remove')}</Btn></div>
  </>:<>
   {v==null&&<Note className="jar-need">{t('fe.int.ed.need')}</Note>}
   <div className="row g8">
    {current&&<Btn kind="soft" square icon={Trash2} aria-label={t('fe.int.ed.remove')} onClick={()=>setAsking(true)} disabled={busy}/>}
    <Btn className={v==null?'off':undefined} busy={busy} onClick={save} disabled={v==null||busy} aria-disabled={v==null||undefined}>{toPartner?t('fe.ca.toPartner'):current?t('fe.int.ed.save'):t('fe.int.ed.addOne')}</Btn>
   </div>
  </>}
 </>}>
  {desc&&<p className="topic-desc">{desc}</p>}
  <InterestFields limit={limit} couple={couple} v={v} setV={setV} dir={dir} setDir={setDir} vis={vis} setVis={setVis}/>
 </Sheet>;
}

/** How you like it (not for limits), who sees, then the answer — the same fields when adding one or several. */
function InterestFields({limit,couple,v,setV,dir,setDir,vis,setVis}:{limit:boolean,couple:boolean,v:Answer,setV:(v:Answer)=>void,dir:Dir[],setDir:(f:(d:Dir[])=>Dir[])=>void,vis:Vis,setVis:(v:Vis)=>void}){
 const {t}=useI18n();
 const mark=v==='discuss'||v==='hard';const n=typeof v==='number'?v:null;
 const allDir=dir.length===DIRS.length;
 const toggleDir=(k:'all'|Dir)=>{if(mark)return;
  setDir(d=>{if(k==='all')return [...DIRS];if(d.length===DIRS.length)return [k];const next=d.includes(k)?d.filter(x=>x!==k):[...d,k];return next.length?DIRS.filter(x=>next.includes(x)):[...DIRS];});};
 return <>
    {!limit&&<Group bare className={mark?'dim':''} title={t('fe.int.ed.dir')}><Card><Chips>
     {(['all',...DIRS] as const).map(k=>{const pressed=k==='all'?allDir:!allDir&&dir.includes(k);
      return <Chip key={k} on={pressed} inactive={mark} onClick={()=>toggleDir(k)}>{t('fe.int.ed.dir.'+k)}</Chip>;})}
    </Chips></Card></Group>}
    <Group bare title={t('fe.int.ed.vis')}><Card><div className="chips">
     {VIS.map(k=><Chip key={k} on={vis===k} onClick={()=>setVis(k)}>{t('fe.int.ed.vis.'+(k==='only'&&couple?'onlyUs':k))}</Chip>)}
    </div>{vis==='public'&&v==='hard'&&<Note className="mt8">{t('fe.int.ed.hardPublic')}</Note>}</Card></Group>
    <Group bare title={t(limit?'fe.int.ed.qLimit':'fe.int.ed.q')}><Card><div className="ans">
     <AnswerScale value={v} onChange={setV} label={t('fe.int.ed.scale')} low={t('fe.int.ed.low')} high={t('fe.int.ed.high')}
      marks={[{id:'discuss',label:t('fe.int.ed.discuss'),icon:MessageCircle},{id:'hard',label:t('fe.int.ed.hard'),icon:Ban,taboo:true}] as const}/>
     <p className="ans-word" aria-live="polite">{v==null?t('fe.int.ed.pick'):n?<><b>{t('fe.int.ed.level',{n})}</b><span>{t('fe.int.ed.levelText')}</span></>:t(v==='hard'?'fe.int.ed.hardText':'fe.int.ed.discussText')}</p>
    </div></Card></Group>
 </>;
}

/** X02 — all interests grouped by answer; «+» (and the empty state's button) opens the topic picker, never both at
 * once. `?add=1` opens the picker on arrival, `&vis=granted` presets the audience (from the private part's editor). */
export function InterestsScreen(){
 const {acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const [params,setParams]=useSearchParams();
 const {items,cats,topics,error,load}=useInterests();
 const [open,setOpen]=useState<string|null>(null);const [notice,setNotice]=useState('');
 const picking=params.get('add')==='1';const presetVis:Vis=params.get('vis')==='granted'?'granted':params.get('vis')==='only'?'only':'public';
 const setPicking=(on:boolean)=>setParams(p=>{const n=new URLSearchParams(p);if(on)n.set('add','1');else{n.delete('add');n.delete('vis');}return n;},{replace:true});
 if(!acting)return null;
 const couple=acting.kind==='couple';
 const all=sortJars(items??[]);const have=new Set(all.map(j=>j.topicId));
 const groups=([['level',all.filter(j=>!j.mark)],['discuss',all.filter(j=>j.mark==='discuss')],['hard',all.filter(j=>j.mark==='hard')]] as const).filter(g=>g[1].length);
 const toAdd=()=>{setNotice('');setPicking(true);};
 return <>
  <Bar title={t(couple?'fe.int.screenCouple':'fe.int.screen')} back="/n/me">
   <IconBtn icon={Plus} label={t('fe.int.add')} onClick={toAdd}/>
  </Bar>
  <View className="nodock">
   {notice&&<Alert kind="ok" noIcon>{notice}</Alert>}
   {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!items?<Skel kind="list"/>
    :all.length?<>
     {groups.map(([g,l])=><Group key={g} title={<>{t('fe.int.group.'+g)} · {l.length}</>}>
      <Card><Jars list={l} topics={topics} onOpen={setOpen}/></Card></Group>)}
     <JarLegend couple={couple} extra={t('fe.int.hardNote')}/>
    </>
    :<Empty icon={Sparkles} title={t('fe.int.empty.title')} text={t(couple?'fe.int.empty.textCouple':'fe.int.empty.text')}><Btn onClick={toAdd}>{t('fe.int.add')}</Btn></Empty>}
  </View>
  {picking&&items&&!open&&<TopicPicker cats={cats} topics={topics} have={have} presetVis={presetVis} onClose={()=>setPicking(false)} onDone={msg=>{setPicking(false);setNotice(msg);load();}}/>}
  {open&&<InterestSheet key={open} topicId={open} topics={topics} cats={cats} current={items?.find(j=>j.topicId===open)} defaultVis={presetVis}
   onClose={()=>setOpen(null)} onDone={msg=>{setOpen(null);setPicking(false);setNotice(msg);load();}}/>}
 </>;
}

/** `topicPicker()` — pick several topics the profile has not marked yet (by category, with a search), answer each in
 * turn (progress bar; an answer moves on), check them as jars, then save all. A tap on a jar in the check goes back to
 * that one. Each topic keeps its own opId, so a retry after a failure never saves twice. */
type Draft={v:Answer,dir:Dir[],vis:Vis};
export function TopicPicker({cats,topics,have,presetVis,onClose,onDone}:{cats:Category[],topics:Topic[],have:Set<string>,presetVis:Vis,onClose:()=>void,onDone:(msg:string)=>void}){
 const {call,acting}=useFe();const {t,locale}=useI18n();const [q,setQ]=useState('');
 const [sel,setSel]=useState<string[]>([]);const [stage,setStage]=useState<'pick'|'answer'|'review'>('pick');const [step,setStep]=useState(0);
 const [fromReview,setFromReview]=useState(false);const [drafts,setDrafts]=useState<Record<string,Draft>>({});
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const ops=useRef<Record<string,string>>({});
 const couple=acting?.kind==='couple';const toPartner=usePartnerApproves();
 const nq=q.trim().toLowerCase();const label=(x:{ru:string,en:string})=>locale==='en'?x.en:x.ru;
 const left=topics.filter(x=>!have.has(x.id));
 const sections=cats.map(c=>({c,ts:left.filter(x=>x.categoryId===c.id&&(!nq||label(x).toLowerCase().includes(nq)))})).filter(s=>s.ts.length);
 const toggle=(id:string)=>setSel(l=>l.includes(id)?l.filter(x=>x!==id):[...l,id]);
 const cur=sel[step];const d=cur?drafts[cur]??{v:null,dir:[...DIRS],vis:presetVis}:null;
 const put=(f:(d:Draft)=>Draft)=>{if(!cur)return;setDrafts(all=>({...all,[cur]:f(all[cur]??{v:null,dir:[...DIRS],vis:presetVis})}));};
 const next=()=>{if(fromReview){setFromReview(false);setStage('review');}else if(step<sel.length-1)setStep(step+1);else setStage('review');};
 const back=()=>{if(stage==='review'){setStage('answer');setStep(sel.length-1);}else if(fromReview){setFromReview(false);setStage('review');}else if(step>0)setStep(step-1);else setStage('pick');};
 const stepRef=useRef(step);stepRef.current=step;const stageRef=useRef(stage);stageRef.current=stage;const nextRef=useRef(next);nextRef.current=next;
 // Answering moves on after a short pause, so the choice is visible.
 const answer=(v:Answer)=>{put(x=>({...x,v}));const at=step;window.setTimeout(()=>{if(stepRef.current===at&&stageRef.current==='answer')nextRef.current();},260);};
 const save=async()=>{
  setBusy(true);setFailure('');let pending=0;
  try{
   for(const id of sel){const x=drafts[id];if(!x||x.v==null)continue;const limit=topics.find(tp=>tp.id===id)?.categoryId===LIMITS;
    ops.current[id]??=newOpId();
    const r=await call('interests.set',{opId:ops.current[id],topicId:id,vis:x.vis,...(typeof x.v==='number'?{value:x.v,...(limit?{}:{dir:x.dir})}:{mark:x.v})},setRes);
    if(r.pending)pending++;}
   onDone(pending?t('fe.int.pending'):t('fe.int.addedN',{n:sel.length}));
  }catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy(false);}
 };
 if(stage==='pick')return <Sheet title={t('fe.int.addMany')} onClose={onClose} full dirty={sel.length>0}
  foot={<Btn className={sel.length?undefined:'off'} disabled={!sel.length} onClick={()=>{setStep(0);setStage('answer');setQ('');}}>{t('fe.int.continue')}{sel.length?` · ${sel.length}`:''}</Btn>}>
  <Note>{t('fe.int.addManyHint')}</Note>
  {left.length>0&&<div className="mt12"><SearchInput label={t('fe.int.searchPh')} value={q} onChange={e=>setQ(e.target.value)}/></div>}
  {!topics.length?<Skel kind="list" rows={2}/>
   :sections.length?sections.map(({c,ts})=><section key={c.id} className="fsec"><SectionLabel>{label(c)}</SectionLabel>
    <div className="chips">{ts.map(x=><Chip key={x.id} on={sel.includes(x.id)} onClick={()=>toggle(x.id)}>{label(x)}</Chip>)}</div></section>)
   :<Note className="mt12">{left.length?t('fe.int.notFound'):t('fe.int.allAdded')}</Note>}
 </Sheet>;
 if(stage==='answer'&&cur&&d){const tp=topics.find(x=>x.id===cur);const desc=tp?(locale==='en'?tp.descEn:tp.descRu):null;
  return <Sheet key={cur} title={tp?label(tp):cur} onClose={onClose} full dirty
   foot={fromReview?<Btn onClick={next}>{t('fe.int.toReview')}</Btn>
    :<div className="row g8"><Btn kind="soft" onClick={back}>{t('fe.back')}</Btn>
     {d.v!=null&&<Btn onClick={next}>{step===sel.length-1?t('fe.int.review'):t('fe.int.next')}</Btn>}</div>}>
   <Note className="int-step">{t('fe.int.stepOf',{i:step+1,n:sel.length})}</Note>
   <Progress value={(step+1)/sel.length}/>
   {desc&&<p className="topic-desc">{desc}</p>}
   <InterestFields limit={tp?.categoryId===LIMITS} couple={couple} v={d.v} setV={answer} dir={d.dir} setDir={f=>put(x=>({...x,dir:f(x.dir)}))} vis={d.vis} setVis={vis=>put(x=>({...x,vis}))}/>
  </Sheet>;}
 const list:Interest[]=sel.map(id=>{const x=drafts[id]!;return {topicId:id,vis:x.vis,...(typeof x.v==='number'?{value:x.v,dir:x.dir}:{mark:x.v as 'discuss'|'hard'})};});
 return <Sheet title={t('fe.int.check')} onClose={onClose} dirty={!busy}
  foot={<>{failure&&<Alert kind="err" noIcon>{failure}</Alert>}
   <div className="row g8"><Btn kind="soft" fit onClick={back} disabled={busy}>{t('fe.back')}</Btn><Btn busy={busy} onClick={save}>{toPartner?t('fe.ca.toPartner'):t('fe.int.saveAll')}</Btn></div></>}>
  <Note>{t('fe.int.checkHint',{n:sel.length})}</Note>
  <Card className="mt12"><Jars list={sortJars(list)} topics={topics} onOpen={id=>{setStep(sel.indexOf(id));setFromReview(true);setStage('answer');}}/></Card>
 </Sheet>;
}

/** X01 `meJars18()` — the «Интересы» block in «Я»: up to 8 capsules, the «кто видит» filter when there are two kinds. */
export function MeJars(){
 const {acting}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const {items,cats,topics,load}=useInterests();
 const [f,setF]=useState<'all'|Vis>('all');const [openAll,setOpenAll]=useState(false);const [open,setOpen]=useState<string|null>(null);const [notice,setNotice]=useState('');
 if(!acting||!items)return null;
 const couple=acting.kind==='couple';
 const title=t(couple?'fe.int.titleCouple':'fe.int.title');
 const add=()=>navigate('/n/me/interests?add=1');
 if(!items.length)return <Group id="meJars" title={title}>
  <AddCard icon={Sparkles} title={t('fe.int.add')} sub={t(couple?'fe.int.emptySubCouple':'fe.int.emptySub')} onClick={add}/></Group>;
 const n=(k:Vis)=>items.filter(j=>visOf(j)===k).length;
 const kinds=VIS.filter(k=>n(k));const multi=kinds.length>1;
 const list=sortJars(f==='all'||!multi?items:items.filter(j=>visOf(j)===f));const shown=openAll?list:list.slice(0,8);
 const chips:[('all'|Vis),string][]=[['all',t('fe.int.filter.all',{n:items.length})],...kinds.map(k=>[k,t('fe.int.filter.'+(k==='only'&&couple?'onlyUs':k),{n:n(k)})] as [Vis,string])];
 return <Group bare id="meJars" title={<>{title}{multi?'':` · ${items.length}`}</>} action={<button type="button" onClick={()=>navigate('/n/me/interests')}>{t('fe.int.all')}</button>}>
  {notice&&<Alert kind="ok" noIcon>{notice}</Alert>}
  {multi&&<div className="jar-f"><div className="chips" role="group" aria-label={t('fe.int.filterAria')}>{chips.map(([id,l])=><Chip key={id} on={f===id} onClick={()=>setF(id)}>{l}</Chip>)}</div></div>}
  <Jars list={shown} topics={topics} onOpen={setOpen} onAdd={add}/>
  {list.length>8&&<Btn kind="text" auto className="jar-more" onClick={()=>setOpenAll(o=>!o)}>{openAll?t('fe.int.less'):t('fe.int.more',{n:list.length-8})}</Btn>}
  {(n('granted')>0||n('only')>0)&&<JarLegend couple={couple}/>}
  {open&&<InterestSheet key={open} topicId={open} topics={topics} cats={cats} current={items.find(j=>j.topicId===open)} onClose={()=>setOpen(null)} onDone={msg=>{setOpen(null);setNotice(msg);load();}}/>}
 </Group>;
}
