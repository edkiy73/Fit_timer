import {Fragment,useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {useNavigate,useParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Ban,Check,ChevronDown,ChevronLeft,ChevronRight,Clock,Ellipsis,Flag,Heart,History,Info,Link as LinkIcon,Lock,LockOpen,MapPin,MessageCircle,ShieldCheck,Undo2,Users,X} from 'lucide-react';
import {Av,Bar,Btn,Empty,Seg,View,plate,Layer,Skel} from './ui';
import {useFe} from './session';
import {PhotoBadge} from './photo-check';
import {PostCard,postSchema,type Post} from './feed';
import type {Removal} from './post-menu';

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
 return <Layer>
  <div className="scrim on" onClick={onClose}/>
  <div ref={ref} className={'sheet on'+(full?' full':'')} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
   <div className="grab"/>
   <div className="sh-h"><div className="sh-ht"><h2>{title}</h2></div><button type="button" className="ibtn ghost sm" aria-label={t('fe.px.close')} onClick={onClose}><X/></button></div>
   <div className="sh-b">{children}</div>
   {foot&&<div className="sh-f">{foot}</div>}
  </div>
 </Layer>;
}

/* ---------- the person card shared by PersonScreen and «Как видят» ---------- */
const media=z.object({src:z.record(z.string(),z.string()).nullable(),pending:z.boolean().optional()}).passthrough();
export const personProfile=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),bio:z.string(),
 age:z.number().nullable(),city:z.object({ru:z.string().nullable(),en:z.string().nullable()}).nullable(),avatar:media.nullable(),photos:z.array(media),details:z.record(z.string(),z.unknown()),photoVerified:z.boolean().optional()}).passthrough();
export const personProfileRes=z.object({ok:z.literal(true),profile:personProfile});
export type PersonProfile=z.infer<typeof personProfile>;
export const mediaSrc=(m:z.infer<typeof media>|null|undefined)=>m&&!m.pending?m.src?.card??m.src?.full??m.src?.thumb??null:null;
export const personName=(p:{name:string|null,handle:string|null}|null)=>p?.name||(p?.handle?'@'+p.handle:'');

export function PersonBio({p}:{p:PersonProfile}){return p.bio?<div className="p-bio"><div className="md bio">{p.bio.split(/\n{2,}/).map((x,i)=><p key={i}>{x}</p>)}</div></div>:null;}
const cityOf=(p:{city:{ru:string|null,en:string|null}|null},locale:string)=>p.city?(locale==='en'?p.city.en||p.city.ru:p.city.ru||p.city.en):null;
const photosOf=(p:PersonProfile)=>{const list=p.photos.filter(ph=>mediaSrc(ph));const a=mediaSrc(p.avatar);return list.length?list:a&&p.avatar?[p.avatar]:[];};

/* ---------- what the acting profile has with another one: follows, likes, a match (SC.P01 / D03 card) ---------- */
const followRow=z.object({id:z.uuid(),kind:z.string(),handle:z.string().nullable(),name:z.string().nullable()}).passthrough();
const followersRes=z.object({ok:z.literal(true),items:z.array(followRow)});
const FOLLOW_PAGE=50;
const withProfile=z.object({ok:z.literal(true),items:z.array(z.object({profile:z.object({id:z.uuid()}).passthrough()}).passthrough())});
const chatsRes=z.object({ok:z.literal(true),items:z.array(z.object({id:z.uuid(),other:z.object({id:z.uuid()}).passthrough()}).passthrough())});
const likeRes=z.object({ok:z.literal(true),state:z.string().optional(),conversationId:z.uuid().optional()}).passthrough();
export type Relation={followers:number,following:number,iFollow:boolean,liked:boolean,mutual:boolean};
/** Counts are the length of the lists P10 opens (the server gives the newest 50; more shows as «50+»). */
export const countWord=(n:number)=>n>=FOLLOW_PAGE?FOLLOW_PAGE+'+':String(n);
export function useRelation(id:string){
 const {call,acting}=useFe();const [rel,setRel]=useState<Relation|null>(null);
 const load=useCallback(()=>{if(!acting||!id)return;
  Promise.all([call('profile.followers',{profileId:id},followersRes),call('profile.followers',{profileId:id,following:true},followersRes),
   call('profile.followers',{profileId:acting.id,following:true},followersRes).catch(()=>null),
   call('likes.outgoing',{},withProfile).catch(()=>null),call('matches.list',{},withProfile).catch(()=>null)])
   .then(([a,b,mine,out,m])=>setRel({followers:a.items.length,following:b.items.length,
    iFollow:!!mine?.items.some(x=>x.id===id)||a.items.some(x=>x.id===acting.id),
    liked:!!out?.items.some(x=>x.profile.id===id),mutual:!!m?.items.some(x=>x.profile.id===id)})).catch(()=>{});},[call,acting,id]);
 useEffect(()=>{setRel(null);load();},[load]);
 return [rel,setRel,load] as const;
}

/** `.pc-stats` — the two numbers under the name; each opens P10. */
export function FollowCounts({id,rel,inert}:{id:string,rel:Relation|null,inert?:boolean|undefined}){
 const {t,locale}=useI18n();const navigate=useNavigate();
 const go=(tab:string)=>inert?undefined:()=>navigate('/n/people/'+id+'/follows?tab='+tab);
 const word=(base:string,n:number)=>plural(t,locale,base,n);
 return <div className="pc-stats">
  <button type="button" onClick={go('followers')} disabled={inert} aria-disabled={inert||undefined}><b>{rel?countWord(rel.followers):'·'}</b>{word('fe.px.st.fr',rel?.followers??5)}</button>
  <button type="button" onClick={go('following')} disabled={inert} aria-disabled={inert||undefined}><b>{rel?countWord(rel.following):'·'}</b>{word('fe.px.st.fg',rel?.following??5)}</button>
 </div>;
}

/** «Это взаимно» (D08): both avatars, then «Написать» opens the conversation the server just created. */
export function MatchOverlay({other,conversationId,onClose}:{other:{id:string,name:string,src?:string|null},conversationId?:string|undefined,onClose:()=>void}){
 const {t}=useI18n();const {acting}=useFe();const navigate=useNavigate();const first=useRef<HTMLButtonElement>(null);
 useEffect(()=>{first.current?.focus({preventScroll:true});const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};addEventListener('keydown',k);return ()=>removeEventListener('keydown',k);},[onClose]);
 const me=acting?.name||acting?.handle||'?';
 return <Layer><div className="match" role="dialog" aria-modal="true" aria-label={t('fe.px.m.title')}>
  <div className="pair"><Av name={me} seed={acting?.id} src={acting?.avatar??null}/><span className="heart"><Heart fill="currentColor"/></span><Av name={other.name} seed={other.id} src={other.src}/></div>
  <h2>{t('fe.px.m.title')}</h2><p>{fill(t('fe.px.m.text'),{name:other.name})}</p>
  <button ref={first} type="button" className="btn primary" onClick={()=>{onClose();navigate(conversationId?'/n/chats/'+conversationId:'/n/chats');}}><MessageCircle/>{t('fe.px.m.write')}</button>
  <Btn kind="soft" onClick={onClose}>{t('fe.px.m.later')}</Btn>
 </div></Layer>;
}

/** `.p-acts` of another profile: «Нравится / Отправлено / Написать» and «Подписаться / В подписках». */
export function PersonActions({p,rel,setRel,toast,inert}:{p:PersonProfile,rel:Relation|null,setRel:(f:(r:Relation|null)=>Relation|null)=>void,toast:(m:string,err?:boolean)=>void,inert?:boolean|undefined}){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const [busy,setBusy]=useState<''|'like'|'follow'>('');const [why,setWhy]=useState<string|null>(null);const [match,setMatch]=useState<{conversationId?:string}|null>(null);
 const op=useRef(newOpId());const name=personName(p);const asUs=acting?.kind==='couple';
 const like=async()=>{if(busy)return;setBusy('like');
  try{const r=await call('like.send',{opId:op.current,profileId:p.id,source:'profile'},likeRes);op.current=newOpId();
   if(r.state==='matched'){setRel(x=>x&&{...x,mutual:true});setMatch(r.conversationId?{conversationId:r.conversationId}:{});}
   else{setRel(x=>x&&{...x,liked:true});toast(fill(t('fe.px.lkd.sent'),{name}));}}
  catch(e){op.current=newOpId();const rule=e instanceof FeError?e.rule:undefined;
   if(rule==='likes_not_accepted'||rule==='couples_via_discover_only'||rule==='own_discover_off')setWhy(rule);
   else if(rule==='already_matched')setRel(x=>x&&{...x,mutual:true});else toast(pxError(e,t),true);}
  finally{setBusy('');}};
 const unlike=async()=>{if(busy)return;setBusy('like');
  try{await call('like.withdraw',{opId:newOpId(),profileId:p.id},ok);setRel(x=>x&&{...x,liked:false});toast(t('fe.px.lkd.withdrawn'));}catch(e){toast(pxError(e,t),true);}finally{setBusy('');}};
 const write=async()=>{try{const r=await call('chats.list',{filter:'all'},chatsRes,{asAccount:true});const c=r.items.find(x=>x.other.id===p.id);navigate(c?'/n/chats/'+c.id:'/n/chats');}catch{navigate('/n/chats');}};
 const follow=async()=>{if(busy||!rel)return;setBusy('follow');const on=!rel.iFollow;
  try{await call('follow.set',{opId:newOpId(),profileId:p.id,on},ok);setRel(x=>x&&{...x,iFollow:on,followers:Math.max(0,x.followers+(on?1:-1))});toast(fill(t(on?'fe.px.fl.on':'fe.px.fl.off'),{name}));}
  catch(e){toast(pxError(e,t),true);}finally{setBusy('');}};
 const likeBtn=rel?.mutual?<Btn icon={MessageCircle} onClick={inert?undefined:write} disabled={inert}>{t('fe.px.act.write')}</Btn>
  :rel?.liked?<button type="button" className="btn on" aria-pressed="true" title={t('fe.px.act.unlikeHint')} onClick={inert?undefined:unlike} disabled={inert||busy==='like'}><Heart fill="currentColor"/>{t('fe.px.act.sent')}</button>
  :why?null:<button type="button" className={'btn primary'+(busy==='like'?' busy':'')} onClick={inert?undefined:like} disabled={inert||busy==='like'}><Heart fill="currentColor"/>{asUs&&!inert?t('fe.px.act.likeUs'):t('fe.people.like')}</button>;
 const iF=!!rel?.iFollow;
 return <>
  <div className="p-acts" inert={inert||undefined}>{likeBtn}
   <button type="button" className={'btn soft'+(busy==='follow'?' busy':'')} aria-pressed={iF} title={iF?t('fe.px.act.unfollowHint'):undefined} onClick={inert?undefined:follow} disabled={inert||!rel}>
    {iF?<><Check/>{t('fe.px.act.following')}</>:asUs&&!inert?t('fe.px.act.followUs'):t('fe.people.follow')}</button>
  </div>
  {why&&<p className="profile-like-note"><Heart/><span>{why==='couples_via_discover_only'?<>{t('fe.px.act.coupleVia')} <button type="button" className="linkbtn" onClick={()=>navigate('/n/me?layer=vis')}>{t('fe.px.act.turnOn')}</button></>
   :why==='own_discover_off'?<>{t('fe.px.act.ownOff')} <button type="button" className="linkbtn" onClick={()=>navigate('/n/me?layer=vis')}>{t('fe.px.act.turnOn')}</button></>:t('fe.px.act.likesOff')}</span></p>}
  {match&&<MatchOverlay other={{id:p.id,name,src:mediaSrc(p.avatar)}} conversationId={match.conversationId} onClose={()=>setMatch(null)}/>}
 </>;
}

/** The hero of SC.P01: photos with bars and side zones, the name, age, badge, city and the two counts. */
export function ProfileHero({p,rel,inert,onOpen}:{p:PersonProfile,rel:Relation|null,inert?:boolean|undefined,onOpen?:(i:number)=>void}){
 const {t,locale}=useI18n();const name=personName(p);const list=photosOf(p);const [ix,setIx]=useState(0);const i=Math.min(ix,Math.max(0,list.length-1));
 const src=list[i]?mediaSrc(list[i]):null;const city=cityOf(p,locale);
 return <div className="hero">
  {src?<><img className="mbg" src={src} alt="" aria-hidden="true" draggable={false}/><img src={src} alt={name} draggable={false}/></>
   :p.kind==='couple'?<><div className="plate" style={plate(p.id)}/><div className="hero-pairav"><Av name={name} seed={p.id} size="xl"/></div></>
   :<div className="plate" style={plate(p.id)}/>}
  {list.length>1&&<div className="pc-bars" aria-label={fill(t('fe.px.ph.n'),{i:i+1,n:list.length})}>{list.map((_,k)=><i key={k} className={k===i?'on':''}/>)}</div>}
  {list.length>1&&<><button type="button" className="pc-zone l" aria-label={t('fe.px.ph.prev')} onClick={()=>setIx(Math.max(0,i-1))}/><button type="button" className="pc-zone r" aria-label={t('fe.px.ph.next')} onClick={()=>setIx(Math.min(list.length-1,i+1))}/></>}
  {src&&onOpen&&<button type="button" className="pc-zone c" aria-label={t('fe.px.ph.full')} onClick={()=>onOpen(i)}/>}
  <div className="pc-info"><h2 className="pc-name"><span className="pcn">{name}</span>{p.age?<span>{p.age}</span>:null}{p.photoVerified&&<PhotoBadge/>}</h2>
   {city&&<div className="pc-who"><span className="pl"><MapPin/>{city}</span></div>}
   <FollowCounts id={p.id} rel={rel} inert={inert}/></div>
 </div>;
}

/** `openViewer()` — full-screen photos: ‹ ›, arrows, swipe, Esc. */
export function PhotoViewer({srcs,index,onClose}:{srcs:string[],index:number,onClose:()=>void}){
 const {t}=useI18n();const [i,setI]=useState(index);const [on,setOn]=useState(false);const closeBtn=useRef<HTMLButtonElement>(null);const sx=useRef<number|null>(null);
 const step=useCallback((d:number)=>setI(v=>Math.max(0,Math.min(srcs.length-1,v+d))),[srcs.length]);
 useEffect(()=>{const r=requestAnimationFrame(()=>{setOn(true);closeBtn.current?.focus({preventScroll:true});});return ()=>cancelAnimationFrame(r);},[]);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();else if(e.key==='ArrowLeft')step(-1);else if(e.key==='ArrowRight')step(1);};addEventListener('keydown',k);return ()=>removeEventListener('keydown',k);},[onClose,step]);
 return <Layer><div className={'viewer'+(on?' on':'')} role="dialog" aria-modal="true" aria-label={t('fe.px.ph.viewer')}
  onPointerDown={e=>{sx.current=e.clientX;}} onPointerUp={e=>{if(sx.current==null)return;const dx=e.clientX-sx.current;sx.current=null;if(Math.abs(dx)>50)step(dx<0?1:-1);}}>
  <div className="vw-track" style={{transform:`translateX(${-i*100}%)`}}>{srcs.map((s,k)=><figure key={k}><img src={s} alt="" draggable={false}/></figure>)}</div>
  <div className="vw-top"><span className="vw-n">{i+1} / {srcs.length}</span><button ref={closeBtn} type="button" className="ibtn glass" aria-label={t('fe.px.close')} onClick={onClose}><X/></button></div>
  {srcs.length>1&&<>
   <button type="button" className="vw-nav l" aria-label={t('fe.px.ph.prev')} disabled={i===0} onClick={()=>step(-1)}><ChevronLeft/></button>
   <button type="button" className="vw-nav r" aria-label={t('fe.px.ph.next')} disabled={i===srcs.length-1} onClick={()=>step(1)}><ChevronRight/></button>
   <div className="vw-dots">{srcs.map((_,k)=><i key={k} className={k===i?'on':undefined}/>)}</div>
  </>}
 </div></Layer>;
}

/* ---------- the profile body (profileView: details, links, interests, gallery, private part, posts) ---------- */
const DETAILS:[string,string][]=[['genders','gender'],['orients','orient'],['roles','role'],['status','status'],['formats','format'],['seeks','seek']];
const COUPLE_DETAILS=new Set(['roles','formats','seeks']);
const optionsRes=z.object({ok:z.literal(true),options:z.array(z.object({kind:z.string(),code:z.string(),ru:z.string().nullable(),en:z.string().nullable()}))});
function useOptions(){
 const {call}=useFe();const {locale}=useI18n();const [opts,setOpts]=useState<z.infer<typeof optionsRes>['options']>([]);
 useEffect(()=>{call('catalog.get',{},optionsRes,{asAccount:true}).then(r=>setOpts(r.options)).catch(()=>{});},[call]);
 return (kind:string,code:string)=>{const o=opts.find(x=>x.kind===kind&&x.code===code);return o?((locale==='en'?o.en||o.ru:o.ru||o.en)??code):code;};
}
/** detailsGroup: every chosen detail in one card; a couple shows role, format and «в поиске». */
export function DetailsGroup({p}:{p:PersonProfile}){
 const {t}=useI18n();const label=useOptions();
 const rows=DETAILS.filter(([f])=>p.kind==='person'||COUPLE_DETAILS.has(f)).map(([f,kind])=>{const v=p.details[f];const codes=Array.isArray(v)?v as string[]:typeof v==='string'?[v]:[];
  return codes.length?[t('fe.px.f.'+kind),codes.map(c=>label(kind,c)).join(', ')] as const:null;}).filter(x=>!!x);
 if(!rows.length)return null;
 return <section className="grp"><div className="grp-t"><span>{t(p.kind==='couple'?'fe.px.f.titleCouple':'fe.px.f.title')}</span></div>
  <div className="card"><dl className="kv">{rows.map(([k,v])=><Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl></div></section>;
}

const jarItem=z.object({topicId:z.string(),value:z.number().nullable().optional(),mark:z.string().nullable().optional(),dir:z.array(z.string()).nullable().optional()}).passthrough();
const jarsRes=z.object({ok:z.literal(true),items:z.array(jarItem)});
type Jar=z.infer<typeof jarItem>;
const sortJars=(l:Jar[])=>[...l.filter(j=>!j.mark).sort((a,b)=>(b.value??0)-(a.value??0)),...l.filter(j=>j.mark==='discuss'),...l.filter(j=>j.mark==='hard')];
/** jarsHTML: one capsule per interest — fill = level, the topic inside, level and role at the end; a limit is a word. */
export function Jars({items,topic,max,onTopic}:{items:Jar[],topic:(id:string)=>string,max?:number,onTopic?:(id:string)=>void}){
 const {t}=useI18n();const [all,setAll]=useState(false);const [pre,setPre]=useState(true);
 useEffect(()=>{const x=setTimeout(()=>setPre(false),90);return ()=>clearTimeout(x);},[]);
 const list=sortJars(items);const shown=all||!max?list:list.slice(0,max);const more=list.length-shown.length;
 return <div className={'jars caps'+(pre?' pre':'')}>{shown.map((j,i)=>{const name=topic(j.topicId);
  const Tag=onTopic?'button':'div';const go=onTopic?{type:'button' as const,onClick:()=>onTopic(j.topicId)}:{};
  if(j.mark==='hard'||j.mark==='discuss'){const w=j.mark==='hard'?t('fe.px.jar.no'):t('fe.px.jar.negot');
   return <Tag key={j.topicId} className={'sc '+(j.mark==='hard'?'hard':'soft')} aria-label={name+': '+w} {...go}><span className="sc-l"><span className="sc-n">{name}</span><span className={'sc-lim '+(j.mark==='hard'?'t':'s')}>{w}</span></span></Tag>;}
  const lv=j.value??0;const rw=roleWord({dir:j.dir??null,mark:null},t);
  return <Tag key={j.topicId} className={'sc'+(lv>=10?' full':'')} style={{'--v':lv,'--lv':lv,'--d':`${(i%8)*.04}s`} as React.CSSProperties} aria-label={name+': '+lv} {...go}>
   <span className="sc-f"/><span className="sc-l"><span className="sc-n">{name}</span><span className="sc-v"><b>{lv}</b>{rw&&<em>{rw}</em>}</span></span></Tag>;})}
  {more>0&&<button type="button" className="sc more" onClick={()=>setAll(true)}><span className="sc-l c">{fill(t('fe.px.jar.more'),{n:more})}</span></button>}
 </div>;
}

const privRes=z.object({ok:z.literal(true),exists:z.boolean(),own:z.boolean().optional(),on:z.boolean().optional(),scopes:z.array(z.string()).optional(),until:z.string().nullable().optional(),
 text:z.string().nullable().optional(),media:z.array(media.extend({kind:z.string().optional()})).optional(),available:z.array(z.string()).optional(),canRequest:z.boolean().optional(),reason:z.string().nullable().optional()}).passthrough();
type Priv=z.infer<typeof privRes>;
const outReqRes=z.object({ok:z.literal(true),items:z.array(z.object({id:z.uuid(),state:z.string(),profile:z.object({id:z.uuid()}).passthrough().nullable()}).passthrough())}).passthrough();
const accessReq=z.object({ok:z.literal(true)}).passthrough();
/** vaultHTML + veilBlock / privOpenHTML: the private part from the outside. Before access nothing real is sent — the
 * veil hides placeholders only. `preview` draws it as a viewer would see it, with inert buttons. */
export function PrivateVault({profileId,name,preview}:{profileId:string,name:string,preview?:'all'|'granted'|undefined}){
 const {call}=useFe();const {t,locale}=useI18n();const [p,setP]=useState<Priv|null>(null);const [busy,setBusy]=useState(false);const [err,setErr]=useState('');
 const [view,setView]=useState<number|null>(null);const op=useRef(newOpId());
 const load=useCallback(()=>{call('private.get',{profileId},privRes).then(setP).catch(()=>setP(null));},[call,profileId]);
 useEffect(()=>{load();},[load]);
 if(!p||!p.exists)return null;
 if(preview&&(!p.on||!(p.available??[]).length))return null;
 const ask=async()=>{setBusy(true);setErr('');try{await call('access.request',{opId:op.current,profileId,scopes:p.available??['info']},accessReq);op.current=newOpId();load();}
  catch(e){setErr(pxError(e,t));op.current=newOpId();}finally{setBusy(false);}};
 const cancel=async()=>{setBusy(true);setErr('');try{const r=await call('access.lists',{tab:'out'},outReqRes);const q=r.items.find(x=>x.state==='pending'&&x.profile?.id===profileId);
  if(q)await call('access.cancel',{opId:newOpId(),requestId:q.id},accessReq);load();}catch(e){setErr(pxError(e,t));}finally{setBusy(false);}};
 const scopes=preview==='granted'?(p.available??[]):preview?[]:(p.scopes??[]);
 const head=(open:boolean,badge?:ReactNode)=><div className="vault-h"><span className="vi">{open?<LockOpen/>:<Lock/>}</span><div><b>{t('fe.px.pr.title')}</b></div>{badge&&<span className="vst">{badge}</span>}</div>;
 if(scopes.length){
  const photos=(p.media??[]).filter(m=>m.kind!=='video'&&mediaSrc(m)&&(preview||scopes.includes('photos')));
  const until=!preview&&p.until?<span className="pill v">{fill(t('fe.px.pr.until'),{date:new Date(p.until).toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'short'})})}</span>:undefined;
  const desc=scopes.includes('info')&&p.text?<section className="grp"><div className="grp-t"><span>{t('fe.px.pr.desc')}</span></div><div className="card"><div className="md bio">{p.text.split(/\n{2,}/).map((x,i)=><p key={i}>{x}</p>)}</div></div></section>:null;
  return <section className="vault open" id="priv">{head(true,until)}<div className="vault-b">
   {desc}
   {photos.length>0&&<section className="grp bare"><div className="grp-t"><span>{t('fe.px.pr.photos')} · {photos.length}</span></div>
    <div className="ggrid">{photos.map((m,i)=><button key={i} type="button" className="gtile" onClick={preview?undefined:()=>setView(i)} disabled={!!preview}><img src={mediaSrc(m)!} alt="" loading="lazy" draggable={false}/></button>)}</div>
    <p className="grp-n">{preview?t('fe.px.pr.wmPreview'):t('fe.px.pr.wm')}</p></section>}
   {!desc&&!photos.length&&<p className="note">{t('fe.px.pr.nothing')}</p>}
  </div>
  {view!==null&&<PhotoViewer srcs={photos.map(m=>m.src?.full??mediaSrc(m)!)} index={view} onClose={()=>setView(null)}/>}</section>;
 }
 const reason=preview?null:p.reason??null;
 const action=preview?<button type="button" className="btn dark" disabled aria-disabled="true">{t('fe.px.pr.ask')}</button>
  :reason==='pending'?<><span className="pill wait"><Clock/>{t('fe.px.pr.pending')}</span><Btn kind="soft" size="sm" onClick={cancel} busy={busy}>{t('fe.px.pr.cancel')}</Btn></>
  :reason==='not_accepting'?<span className="pill"><Lock/>{t('fe.px.pr.notAccepting')}</span>
  :reason==='cooldown'?<span className="pill"><Clock/>{t('fe.px.pr.cooldown')}</span>
  :reason?<span className="pill"><Lock/>{t('fe.px.pr.r.'+reason)}</span>
  :p.canRequest?<button type="button" className={'btn dark'+(busy?' busy':'')} onClick={ask} disabled={busy}>{t('fe.px.pr.ask')}</button>:null;
 return <section className="vault closed" id="priv">{head(false)}<div className="vault-b"><div className="veil">
  <div className="veil-content" aria-hidden="true"><div className="bar-sk" style={{width:'72%'}}/><div className="bar-sk"/><div className="bar-sk" style={{width:'46%'}}/><div className="vt"><i/><i/><i/></div></div>
  <div className="veil-glass"><b>{fill(t('fe.px.pr.decides'),{name})}</b><p>{t('fe.px.pr.decidesText')}</p><div className="veil-act">{action}</div>{err&&<p className="note" role="alert">{err}</p>}</div>
 </div></div></section>;
}

const postsRes=z.object({ok:z.literal(true),items:z.array(postSchema),next:z.string().nullable().optional()}).passthrough();
/** activityBlock: «Публикации / Статьи» as tabs with counts; the first three of each. */
function Activity({profileId,inert}:{profileId:string,inert?:boolean|undefined}){
 const {call}=useFe();const {t}=useI18n();const [items,setItems]=useState<Post[]|null>(null);const [tab,setTab]=useState<'posts'|'notes'>('posts');
 useEffect(()=>{setItems(null);call('profile.posts',{profileId},postsRes).then(r=>setItems(r.items)).catch(()=>setItems([]));},[call,profileId]);
 if(!items)return null;
 const posts=items.filter(x=>x.type!=='note'),notes=items.filter(x=>x.type==='note');
 const on=([['posts',t('fe.px.act.posts'),posts],['notes',t('fe.px.act.notes'),notes]] as const).filter(x=>x[2].length);
 if(!on.length)return null;
 const cur=on.find(x=>x[0]===tab)??on[0]!;
 const change=(p:Post)=>setItems(l=>l&&l.map(x=>x.id===p.id?p:x));const remove=(r:Removal)=>setItems(l=>l&&l.filter(x=>x.id!==r.postId&&x.author.id!==r.authorId));
 return <section className="grp activity">
  {on.length>1?<Seg value={cur[0]} onChange={v=>setTab(v)} options={on.map(x=>({id:x[0],label:x[1]}))}/>:<div className="grp-t"><span>{cur[1]}</span></div>}
  <div className="posts" inert={inert||undefined}>{cur[2].slice(0,3).map(x=><PostCard key={x.id} post={x} onChange={change} onRemove={remove}/>)}</div>
 </section>;
}

/** Gallery (galleryBlock): the profile photos the viewer may see; «Все · N» opens P20. */
function GalleryGroup({p,onOpen,inert}:{p:PersonProfile,onOpen:(i:number)=>void,inert?:boolean|undefined}){
 const {t}=useI18n();const navigate=useNavigate();const list=photosOf(p);
 if(!list.length)return null;
 return <section className="grp bare"><div className="grp-t"><span>{t('fe.px.gal.title')}</span>{!inert&&<button type="button" onClick={()=>navigate('/n/people/'+p.id+'/gallery')}>{t('fe.px.all')} · {list.length}</button>}</div>
  <div className="card"><div className="ggrid">{list.slice(0,12).map((m,i)=><button key={i} type="button" className="gtile" disabled={inert} onClick={()=>onOpen(i)}><img src={mediaSrc(m)!} alt="" loading="lazy" draggable={false}/></button>)}</div>
   {list.length>12&&!inert&&<Btn kind="soft" className="mt12" onClick={()=>navigate('/n/people/'+p.id+'/gallery')}>{fill(t('fe.px.gal.all'),{n:list.length})}</Btn>}</div></section>;
}

/** Interests group of another profile (pubJars → jarShelf, six then «Ещё N»). */
function InterestsGroup({profileId,inert}:{profileId:string,inert?:boolean|undefined}){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();const topic=useTopics();const [items,setItems]=useState<Jar[]>([]);
 useEffect(()=>{setItems([]);call('interests.list',{profileId},jarsRes).then(r=>setItems(r.items)).catch(()=>{});},[call,profileId]);
 if(!items.length)return null;
 return <section className="grp"><div className="grp-t"><span>{t('fe.px.int.title')}</span></div>
  <div className="card"><Jars items={items} topic={topic} max={6} {...(inert?{}:{onTopic:(id:string)=>navigate('/n/topics/'+id)})}/></div></section>;
}

/** Everything under the photo and the buttons — the same body on the profile page and under a Discover card. */
export function ProfileBody({p,inert,preview,onOpen}:{p:PersonProfile,inert?:boolean|undefined,preview?:'all'|'granted'|undefined,onOpen:(i:number)=>void}){
 return <>
  <DetailsGroup p={p}/>
  <LinksSection profileId={p.id} inert={inert}/>
  <InterestsGroup profileId={p.id} inert={inert}/>
  <GalleryGroup p={p} onOpen={onOpen} inert={inert}/>
  <PrivateVault profileId={p.id} name={personName(p)} {...(preview?{preview}:{})}/>
  <Activity profileId={p.id} inert={inert}/>
 </>;
}

/** SC.P01 profileView: the floating ‹ and ⋯ sit on the photo and turn into a solid bar with the name past it
 * (PRF-007); hero, description, buttons, «что общего», then the body. `preview` is «Как видят» — everything drawn,
 * nothing pressable. */
export function ProfilePage({p,preview,seg,onMore,menu,toast,children}:{p:PersonProfile,preview?:'all'|'granted'|undefined,seg?:ReactNode,onMore?:(()=>void)|undefined,
 menu?:((rel:Relation|null,reload:()=>void)=>ReactNode)|undefined,toast:(m:string,err?:boolean)=>void,children?:ReactNode}){
 const {t}=useI18n();const navigate=useNavigate();const [rel,setRel,reloadRel]=useRelation(p.id);const [view,setView]=useState<number|null>(null);
 const bar=useRef<HTMLElement>(null);const name=personName(p);const inert=!!preview;const list=photosOf(p);
 const onScroll=(e:React.UIEvent<HTMLDivElement>)=>{const h=e.currentTarget.querySelector('.hero');const b=bar.current;if(h&&b)b.classList.toggle('solid',h.getBoundingClientRect().bottom<b.getBoundingClientRect().bottom+8);};
 return <>
  <header ref={bar} className="bar overlay pbar">
   <button type="button" className="ibtn glass" aria-label={t('fe.back')} onClick={()=>navigate(-1)}><ChevronLeft/></button>
   <span className="pbar-t" aria-hidden="true"><Av name={name} seed={p.id} src={mediaSrc(p.avatar)} size="sm"/><b>{name}</b></span>
   {onMore&&<button type="button" className="ibtn glass" aria-haspopup="dialog" aria-label={t('fe.px.menu.more')} onClick={onMore}><Ellipsis/></button>}
  </header>
  <div className="view nodock top0 profile-page" onScroll={onScroll}>{seg}<div className="wrap">
   <h1 className="sr-only" tabIndex={-1}>{name}</h1>
   {children}
   <ProfileHero p={p} rel={rel} inert={inert} onOpen={setView}/>
   <PersonBio p={p}/>
   <PersonActions p={p} rel={rel} setRel={setRel} toast={toast} inert={inert}/>
   {!preview&&<CompatSummary profileId={p.id}/>}
   <ProfileBody p={p} inert={inert} preview={preview} onOpen={setView}/>
  </div></div>
  {view!==null&&<PhotoViewer srcs={list.map(m=>m.src?.full??mediaSrc(m)!)} index={view} onClose={()=>setView(null)}/>}
  {menu?.(rel,reloadRel)}
 </>;
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
    :!c||!p?<Skel kind="list"/>
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
export function LinksSection({profileId,inert}:{profileId:string,inert?:boolean|undefined}){
 const {call,acting,state}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const [items,setItems]=useState<z.infer<typeof linksRes>['items']>([]);const [all,setAll]=useState(false);
 useEffect(()=>{setItems([]);call('links.ofProfile',{profileId},linksRes).then(r=>setItems(r.items)).catch(()=>{});},[call,profileId]);
 if(!items.length)return null;
 const own=new Set(state.status==='ready'?state.boot.profiles.map(p=>p.id):[]);
 const shown=all?items:items.slice(0,4);
 return <section className="grp"><div className="grp-t"><span>{t('fe.px.lk.title')}</span>{items.length>4&&!all&&<button type="button" onClick={()=>setAll(true)}>{t('fe.px.all')} · {items.length}</button>}</div>
  <div className="card list">{shown.map(l=>{const name=l.other.name||(l.other.handle?'@'+l.other.handle:'?');
   // `side` is this profile's side; the row names the other one's, as in the prototype's linkLabel.
   const label=linkLabel(t,l.kind,l.side);const mine=own.has(l.other.id);
   return <button key={l.id} type="button" className="li" disabled={inert} onClick={()=>navigate(mine?(l.other.id===acting?.id?'/n/me/preview':'/n/me'):'/n/people/'+l.other.id)}>
    <Av name={name} seed={l.other.id} size="sm"/><span className="tx"><b>{name}{mine?' · '+t(acting?.kind==='couple'?'fe.px.lk.you2':'fe.px.lk.you'):''}</b><small>{label}</small></span><ChevronRight/>
   </button>;})}</div>
 </section>;
}

/* ---------- the person menu (S02) ---------- */
const REASONS=['threat','private','minor','spam','other'] as const;

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

type MenuStep='menu'|'report'|'block'|'end'|null;
/** End a connection (ACT.endConn): withdraws the like; for a match the chat closes too (`match.end`). */
function EndConnection({profileId,name,mutual,onClose,onDone}:{profileId:string,name:string,mutual:boolean,onClose:()=>void,onDone:(msg:string)=>void}){
 const {call}=useFe();const {t}=useI18n();const [revoke,setRevoke]=useState(true);const [busy,setBusy]=useState(false);const [err,setErr]=useState('');
 const go=async()=>{setBusy(true);setErr('');
  try{if(mutual)await call('match.end',{opId:newOpId(),profileId,revokeMyGrant:revoke},ok);else await call('like.withdraw',{opId:newOpId(),profileId},ok);onDone(t('fe.px.ec.done'));}
  catch(e){setErr(pxError(e,t));}finally{setBusy(false);}};
 const fact=(ok:boolean,text:string)=><div className="fact"><i className={ok?'g':'v'}>{ok?<Check/>:<Info/>}</i><span>{text}</span></div>;
 return <Sheet title={t('fe.px.ec.title')} onClose={onClose} foot={<><Btn kind="danger" onClick={go} busy={busy}>{t('fe.px.ec.ok')}</Btn><Btn kind="soft" onClick={onClose}>{t('fe.px.cancel')}</Btn></>}>
  <p className="lead">{fill(t('fe.px.ec.lead'),{name})}</p>
  <div className="card flat">{mutual&&fact(true,t('fe.px.ec.chat'))}{fact(true,t(mutual?'fe.px.ec.likeMatch':'fe.px.ec.like'))}{mutual&&fact(true,t('fe.px.ec.history'))}{fact(false,t('fe.px.ec.notBlock'))}</div>
  {mutual&&<div className="card list mt12"><button type="button" className="li" role="switch" aria-checked={revoke} onClick={()=>setRevoke(v=>!v)}>
   <span className="tx"><b>{t('fe.px.ec.revoke')}</b><small>{t('fe.px.ec.revokeSub')}</small></span><span className={'sw'+(revoke?' on':'')} aria-hidden="true"/></button></div>}
  <p className="note mt12">{t('fe.px.ec.block')}</p>
  {err&&<div className="alert err mt12" role="alert"><span>{err}</span></div>}
 </Sheet>;
}

/** The ⋯ menu of another person's profile (ACT.profileMenu) and its sheets. `blocked` is kept by the screen: a
 * blocked profile no longer loads, so the screen shows its own blocked state with «Разблокировать». */
export function PersonMenu({profileId,name,step,setStep,blocked,setBlocked,toast,rel,onRel}:{profileId:string,name:string,step:MenuStep,setStep:(s:MenuStep)=>void,
 blocked:boolean,setBlocked:(b:boolean)=>void,toast:(msg:string,err?:boolean)=>void,rel?:Relation|null|undefined,onRel?:(()=>void)|undefined}){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();const [busy,setBusy]=useState(false);
 const [link,setLink]=useState<{state:'ok'|'sent'|'in',view:LinkView}|null>(null);
 useEffect(()=>{if(step!=='menu'||blocked)return;call('links.mine',{},linksMineRes).then(r=>{const f=(l:LinkView[])=>l.find(x=>x.other.id===profileId);
  const c=f(r.confirmed),s=f(r.sent),i=f(r.incoming);setLink(c?{state:'ok',view:c}:s?{state:'sent',view:s}:i?{state:'in',view:i}:null);}).catch(()=>{});},[step,blocked,call,profileId]);
 const close=useCallback(()=>setStep(null),[setStep]);
 const unblock=async()=>{setBusy(true);
  try{await call('block.set',{opId:newOpId(),profileId,on:false},ok);setBlocked(false);close();toast(t('fe.px.bl.undone'));}
  catch(e){toast(pxError(e,t),true);}finally{setBusy(false);}};
 const copy=async()=>{close();try{await navigator.clipboard.writeText(location.origin+location.pathname+'#/n/people/'+profileId);toast(t('fe.px.menu.copied'));}catch{toast(t('fe.px.menu.copyFail'),true);}};
 const row=(icon:React.ReactNode,title:string,onClick:()=>void,sub?:string,danger?:boolean)=><button type="button" className={'li'+(danger?' danger':'')} onClick={onClick} disabled={busy}>
  <span className="ico">{icon}</span><span className="tx"><b>{title}</b>{sub&&<small>{sub}</small>}</span></button>;
 if(step==='menu')return <Sheet title={name} onClose={close}><div className="card list">
  {blocked?row(<Ban/>,t('fe.px.menu.unblock'),unblock):<>
   {row(<LinkIcon/>,t('fe.px.menu.copy'),copy)}
   {link?.state==='ok'?row(<Users/>,t('fe.px.menu.linkIs')+linkLabel(t,link.view.kind,link.view.side),()=>{close();navigate('/n/people/'+profileId+'/link');},t('fe.px.menu.linkIsSub'))
    :link?row(<Users/>,t(link.state==='sent'?'fe.px.menu.linkSent':'fe.px.menu.linkIn'),()=>{close();navigate('/n/me/links');},link.state==='sent'?t('fe.px.menu.linkSentSub'):linkLabel(t,link.view.kind,link.view.side))
    :row(<Users/>,t('fe.px.menu.link'),()=>{close();navigate('/n/people/'+profileId+'/link');},t('fe.px.menu.linkSub'))}
   {(rel?.liked||rel?.mutual)&&row(<X/>,t('fe.px.menu.end'),()=>setStep('end'),t(rel.mutual?'fe.px.menu.endMatch':'fe.px.menu.endLike'))}
   {row(<Flag/>,t('fe.px.menu.report'),()=>setStep('report'),undefined,true)}
   {row(<Ban/>,t('fe.px.menu.block'),()=>setStep('block'),t('fe.px.menu.blockSub'),true)}
  </>}
 </div></Sheet>;
 if(step==='end')return <EndConnection profileId={profileId} name={name} mutual={!!rel?.mutual} onClose={close} onDone={msg=>{close();toast(msg);onRel?.();}}/>;
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
    :!r?<Skel kind="list"/>
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
   {r&&!r.premium&&r.items.length>0&&<div className="paywall"><b>{t('fe.px.h.payTitle')}</b><p>{t('fe.px.h.payText')}</p><button type="button" className="btn" onClick={()=>navigate('/n/premium?for=history')}>{t('fe.ax.prem.open')}</button></div>}
  </View>
  {toastNode}
 </>;
}

/* ---------- «Как видят» (P03) ---------- */
type Lv='all'|'granted'|'card';
const ownSettingsRes=z.object({ok:z.literal(true),settings:z.object({discoverMode:z.string()}).passthrough()});
function BackBtn(){const {t}=useI18n();const navigate=useNavigate();return <button type="button" className="ibtn ghost" aria-label={t('fe.back')} onClick={()=>navigate(-1)}><ChevronLeft/></button>;}

/** `/n/me/preview`: the own profile as others see it, with the prototype's audience switch «Все / С доступом /
 * Знакомства». «Все» and «С доступом» are the profile page itself drawn as a viewer sees it (the server's own data,
 * filtered by the owner's settings; the private part from the own `private.get`); «Знакомства» is the Discover card
 * with the whole profile under it. Buttons are drawn but do nothing. */
export function MePreviewScreen(){
 const {call,acting}=useFe();const {t,locale}=useI18n();const [toastNode,toast]=useToast();
 const [lv,setLv]=useState<Lv>(()=>{const v=new URLSearchParams(location.hash.split('?')[1]??'').get('lv');return v==='granted'||v==='card'?v:'all';});
 const [p,setP]=useState<PersonProfile|null>(null);const [mode,setMode]=useState<string|null>(null);const [error,setError]=useState<unknown>(null);
 const [rel]=useRelation(acting?.id??'');
 const load=useCallback(()=>{if(!acting)return;setError(null);
  Promise.all([call('profile.get',{profileId:acting.id},personProfileRes),call('profile.settings',{},ownSettingsRes).catch(()=>null)])
   .then(([a,s])=>{setP(a.profile);setMode(s?.settings.discoverMode??null);}).catch(setError);},[call,acting]);
 useEffect(()=>{load();},[load]);
 const seg=<Seg small={false} value={lv} onChange={setLv} label={t('fe.px.pv.title')} options={(['all','granted','card'] as const).map(id=>({id,label:t('fe.ln.pv.'+id)}))}/>;
 if(p&&!error&&lv!=='card')return <>
  <ProfilePage p={p} preview={lv} seg={<div className="p3-seg">{seg}</div>} toast={toast}/>
  {toastNode}
 </>;
 const ph=p?mediaSrc(p.avatar):null;const city=p?cityOf(p,locale):null;
 const note=mode!=='visible'?t('fe.px.pv.cardOff'):!ph?t('fe.px.pv.cardNoPhoto'):t(acting?.kind==='couple'?'fe.px.pv.cardOnUs':'fe.px.pv.cardOn');
 return <>
  <header className="bar"><BackBtn/><div className="bar-seg">{seg}</div><h1 className="sm" tabIndex={-1}><span className="sr-only">{t('fe.px.pv.title')}</span></h1></header>
  <div className="view nodock"><div className="wrap">
   {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={pxError(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!p?<div className="mt12"><Skel kind="card" rows={1}/></div>
    :<>
     <div className="mt12"><div className="card18">
      {ph?<><img className="mbg" src={ph} alt="" aria-hidden="true" draggable={false}/><img src={ph} alt={personName(p)} draggable={false}/></>:<div className="plate" style={plate(p.id)}/>}
      <div className="pc-info"><h2 className="pc-name"><span className="pcn">{personName(p)}</span>{p.age?<span>{p.age}</span>:null}{p.photoVerified&&<PhotoBadge/>}</h2>
       {city&&<div className="pc-who"><span className="pl"><MapPin/>{city}</span></div>}
       <FollowCounts id={p.id} rel={rel} inert/>
       <div className="pc-hint"><ChevronDown/>{t('fe.px.card.hint')}</div></div>
     </div></div>
     <p className="note center mt12">{note}</p>
     <div className="pc-body pc-full p3-card21"><PersonBio p={p}/><ProfileBody p={p} inert preview="all" onOpen={()=>{}}/></div>
    </>}
  </div></div>
  {toastNode}
 </>;
}

