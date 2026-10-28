import {Fragment,useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import type {LucideIcon} from 'lucide-react';
import {useLocation,useNavigate,useParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {publicBase} from '../api-url';
import {Ban,Check,ChevronDown,Crown,ChevronLeft,ChevronRight,Clock,Ellipsis,Eye,EyeOff,Flag,Heart,History,Info,KeyRound,Link as LinkIcon,Lock,LockOpen,MapPin,MessageCircle,ShieldCheck,Undo2,Users,X} from 'lucide-react';
import {ActingAv,Alert,Av,Bar,Btn,Card,Empty,Group,H,IconBtn,Layer,Note,PersonName,PhotoBars,PhotoTrack,Pill,Row,Seg,Skel,Text,ToggleRow,Veil,View,plate} from './kit';
import {onReadsDropped,useFe,useKeyChange} from './session';
import {ReportSheet} from './report';
import {PhotoBadge} from './photo-check';
import {faceFields,NameBadges} from './faces';
import {PostCard,postSchema,type Post} from './feed';
import {ActivityCardOf,activitySchema,type Act} from './feed-activity';
import type {Removal} from './post-menu';
import {useToast as useAppToast} from './toast';
import {PrivateVault} from './private';
import {GiftSheet,openPaywall} from './premium';
import {CompareSheet,asInterest} from './compare';
import {useWriteTo} from './write-to';

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

/** A toast with an optional «Отменить» (undo) action. */
export type PxToast=(m:string,err?:boolean,action?:{label:string,fn:()=>void})=>void;
/** The app's toast (toast.tsx: one at a time, «Отменить» / «Вернуть», above sheets) in the shape these screens use:
 * `[node, toast(text, err?, action?)]`; the node is kept for the callers' layout and is always empty. */
export function useToast(){
 const app=useAppToast();
 const show=useCallback<PxToast>((text,err=false,action)=>app(text,{...(err?{type:'err' as const}:{}),...(action?{action}:{})}),[app]);
 return [null as ReactNode,show] as const;
}

/** `div.layer > div.scrim.on + div.sheet.on` — the prototype's sheet; Esc, ✕ and the scrim close it. */
import {Sheet} from './kit';
export {Sheet};

/* ---------- the person card shared by PersonScreen and «Как видят» ---------- */
const media=z.object({src:z.record(z.string(),z.string()).nullable(),pending:z.boolean().optional()}).passthrough();
export const personProfile=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),bio:z.string(),
 age:z.number().nullable(),city:z.object({ru:z.string().nullable(),en:z.string().nullable()}).nullable(),avatar:media.nullable(),photos:z.array(media),details:z.record(z.string(),z.unknown()),photoVerified:z.boolean().optional(),premium:z.boolean().optional()}).passthrough();
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
const likeRes=z.object({ok:z.literal(true),state:z.string().optional(),conversationId:z.uuid().optional()}).passthrough();
export type Relation={followers:number,following:number,iFollow:boolean,liked:boolean,mutual:boolean};
/** Counts are the length of the lists P10 opens (the server gives the newest 50; more shows as «50+»). */
export const countWord=(n:number)=>n>=FOLLOW_PAGE?FOLLOW_PAGE+'+':String(n);
/** `known`: the relation already in hand (a Discover card carries its counts), so nothing is read; `skip`: not yet
 * (a deck card reads it only once someone scrolls into it). */
export function useRelation(id:string,opts:{known?:Relation|null|undefined,skip?:boolean}={}){
 const {call,acting}=useFe();const known=opts.known??null;const [rel,setRel]=useState<Relation|null>(known);
 const knownRef=useRef(known);knownRef.current=known;const has=known!==null;const skip=!!opts.skip;
 const load=useCallback(()=>{if(!acting||!id)return;if(knownRef.current){setRel(knownRef.current);return;}if(skip)return;
  Promise.all([call('profile.followers',{profileId:id},followersRes),call('profile.followers',{profileId:id,following:true},followersRes),
   call('profile.followers',{profileId:acting.id,following:true},followersRes).catch(()=>null),
   call('likes.outgoing',{},withProfile).catch(()=>null),call('matches.list',{},withProfile).catch(()=>null)])
   .then(([a,b,mine,out,m])=>setRel({followers:a.items.length,following:b.items.length,
    iFollow:!!mine?.items.some(x=>x.id===id)||a.items.some(x=>x.id===acting.id),
    liked:!!out?.items.some(x=>x.profile.id===id),mutual:!!m?.items.some(x=>x.profile.id===id)})).catch(()=>{});},[call,acting,id,skip]);
 useEffect(()=>{setRel(knownRef.current);load();},[load,has]);
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
  <div className="pair"><ActingAv p={acting??{id:'me',kind:'person',name:me}}/><span className="heart"><Heart fill="currentColor"/></span><Av name={other.name} seed={other.id} src={other.src}/></div>
  <H level={2}>{t('fe.px.m.title')}</H><p>{fill(t(acting?.kind==='couple'?'fe.px.m.textUs':'fe.px.m.text'),{name:other.name})}</p>
  <Btn ref={first} icon={MessageCircle} onClick={()=>{onClose();navigate(conversationId?'/n/chats/'+conversationId:'/n/chats');}}>{t(acting?.kind==='couple'?'fe.px.m.writeUs':'fe.px.m.write')}</Btn>
  <Btn kind="soft" onClick={onClose}>{t('fe.px.m.later')}</Btn>
 </div></Layer>;
}

/** `.p-acts` of another profile: «Нравится / Отправлено / Написать» and «Подписаться / В подписках». */
export function PersonActions({p,rel,setRel,toast,inert}:{p:PersonProfile,rel:Relation|null,setRel:(f:(r:Relation|null)=>Relation|null)=>void,toast:PxToast,inert?:boolean|undefined}){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const [busy,setBusy]=useState<''|'like'|'follow'>('');const [why,setWhy]=useState<string|null>(null);const [match,setMatch]=useState<{conversationId?:string}|null>(null);
 const op=useRef(newOpId());const name=personName(p);const asUs=acting?.kind==='couple';
 // Owner R04 (28.10): with my own dating off a like from a profile still goes out — but the first time, a sheet says
 // what it means. Sending from it is remembered on this device only (a convenience, not a setting).
 const [ownOff,setOwnOff]=useState<boolean|null>(null);const [explain,setExplain]=useState(false);
 useEffect(()=>{if(inert||!acting)return;call('profile.settings',{},ownSettingsRes).then(r=>setOwnOff(r.settings.discoverMode==='off')).catch(()=>{});},[call,acting,inert]);
 const seenKey='feture.fe.offLikeSeen.'+(acting?.id??'');
 const seen=()=>{try{return localStorage.getItem(seenKey)==='1';}catch{return false;}};
 // A tap before my own settings arrived asks for them first, so the explanation is never skipped.
 const tapLike=async()=>{let off=ownOff;if(off===null){off=await call('profile.settings',{},ownSettingsRes).then(r=>r.settings.discoverMode==='off').catch(()=>false);setOwnOff(off);}
  if(off&&!seen()){setExplain(true);return;}void like();};
 const confirmLike=()=>{try{localStorage.setItem(seenKey,'1');}catch{/* per-viewer convenience only */}setExplain(false);void like();};
 const like=async()=>{if(busy)return;setBusy('like');
  try{const r=await call('like.send',{opId:op.current,profileId:p.id,source:'profile'},likeRes);op.current=newOpId();
   if(r.state==='matched'){setRel(x=>x&&{...x,mutual:true});setMatch(r.conversationId?{conversationId:r.conversationId}:{});}
   else{setRel(x=>x&&{...x,liked:true});toast(fill(t(asUs?'fe.px.lkd.sentUs':'fe.px.lkd.sent'),{name}));}}
  catch(e){op.current=newOpId();const rule=e instanceof FeError?e.rule:undefined;
   if(rule==='likes_not_accepted'||rule==='couples_via_discover_only'||rule==='own_discover_off')setWhy(rule);
   else if(rule==='already_matched')setRel(x=>x&&{...x,mutual:true});else toast(pxError(e,t),true);}
  finally{setBusy('');}};
 // «Отправлено» tapped again takes the like back; «Отменить» in the toast sends it again (V21 unlikeP).
 const relike=async()=>{try{const r=await call('like.send',{opId:newOpId(),profileId:p.id,source:'profile'},likeRes);
  if(r.state==='matched'){setRel(x=>x&&{...x,mutual:true});setMatch(r.conversationId?{conversationId:r.conversationId}:{});}else setRel(x=>x&&{...x,liked:true});}catch(e){toast(pxError(e,t),true);}};
 const unlike=async()=>{if(busy)return;setBusy('like');
  try{await call('like.withdraw',{opId:newOpId(),profileId:p.id},ok);setRel(x=>x&&{...x,liked:false});toast(t(asUs?'fe.px.lkd.withdrawnUs':'fe.px.lkd.withdrawn'),false,{label:t('fe.mx.undo'),fn:()=>void relike()});}catch(e){toast(pxError(e,t),true);}finally{setBusy('');}};
 // «Написать» (owner 29.10.2026): their chat, or the chat composer as a message request — with or without a mutual like.
 const writeTo=useWriteTo();const write=()=>void writeTo.open(p.id);
 const setFollow=async(on:boolean,undo:boolean)=>{
  try{await call('follow.set',{opId:newOpId(),profileId:p.id,on},ok);setRel(x=>x&&{...x,iFollow:on,followers:Math.max(0,x.followers+(on?1:-1))});
   if(!undo)toast(fill(t(on?(asUs?'fe.px.fl.onUs':'fe.px.fl.on'):(asUs?'fe.px.fl.offUs':'fe.px.fl.off')),{name}),false,{label:t('fe.mx.undo'),fn:()=>void setFollow(!on,true)});}
  catch(e){toast(pxError(e,t),true);}};
 const follow=async()=>{if(busy||!rel)return;setBusy('follow');try{await setFollow(!rel.iFollow,false);}finally{setBusy('');}};
 const likeBtn=rel?.mutual?<Btn icon={MessageCircle} onClick={inert?undefined:write} disabled={inert}>{t(asUs&&!inert?'fe.px.act.writeUs':'fe.px.act.write')}</Btn>
  :rel?.liked?<Btn pressed title={t(asUs?'fe.px.act.unlikeHintUs':'fe.px.act.unlikeHint')} onClick={inert?undefined:unlike} disabled={inert||busy==='like'}><Heart fill="currentColor"/>{t(asUs&&!inert?'fe.px.act.sentUs':'fe.px.act.sent')}</Btn>
  :why?null:<Btn busy={busy==='like'} onClick={inert?undefined:tapLike} disabled={inert||busy==='like'}><Heart fill="currentColor"/>{asUs&&!inert?t('fe.px.act.likeUs'):t('fe.people.like')}</Btn>;
 const iF=!!rel?.iFollow;
 return <>
  <div className="p-acts" inert={inert||undefined}>{likeBtn}
   <Btn kind="soft" busy={busy==='follow'} aria-pressed={iF} title={iF?t(asUs?'fe.px.act.unfollowHintUs':'fe.px.act.unfollowHint'):undefined} onClick={inert?undefined:follow} disabled={inert||!rel}>
    {iF?<><Check/>{t(asUs&&!inert?'fe.px.act.followingUs':'fe.px.act.following')}</>:asUs&&!inert?t('fe.px.act.followUs'):t('fe.people.follow')}</Btn>
   {!rel?.mutual&&<Btn kind="soft" square icon={MessageCircle} aria-label={t(asUs&&!inert?'fe.px.act.writeUs':'fe.px.act.write')} title={t(asUs&&!inert?'fe.px.act.writeUs':'fe.px.act.write')}
    busy={writeTo.busy===p.id} onClick={inert?undefined:write} disabled={inert}/>}
  </div>
  {why&&<p className="profile-like-note"><Heart/><span>{why==='couples_via_discover_only'?<>{t('fe.px.act.coupleVia')} <button type="button" className="linkbtn" onClick={()=>navigate('/n/me?layer=vis')}>{t('fe.px.act.turnOn')}</button></>
   :why==='own_discover_off'?<>{t('fe.px.act.ownOff')} <button type="button" className="linkbtn" onClick={()=>navigate('/n/me?layer=vis')}>{t('fe.px.act.turnOn')}</button></>:t('fe.px.act.likesOff')}</span></p>}
  {match&&<MatchOverlay other={{id:p.id,name,src:mediaSrc(p.avatar)}} conversationId={match.conversationId} onClose={()=>setMatch(null)}/>}
  {explain&&<Sheet title={t('fe.w7.offLike.title')} onClose={()=>setExplain(false)}
   foot={<><Btn icon={Heart} busy={busy==='like'} disabled={busy==='like'} onClick={confirmLike}>{t('fe.w7.offLike.send')}</Btn>
    <Btn kind="text" onClick={()=>{setExplain(false);navigate('/n/me?layer=vis');}}>{t('fe.w7.offLike.turnOn')}</Btn></>}>
   <Card list>
    <Row icon={MessageCircle} tone="l" title={t('fe.w7.offLike.chat')} sub={fill(t('fe.w7.offLike.chatSub'),{name})}/>
    <Row icon={EyeOff} title={t('fe.w7.offLike.hidden')} sub={t(asUs?'fe.w7.offLike.hiddenSubUs':'fe.w7.offLike.hiddenSub')}/>
    <Row icon={Heart} title={t('fe.w7.offLike.back')} sub={fill(t('fe.w7.offLike.backSub'),{name})}/>
    <Row icon={Undo2} tone="g" title={t('fe.w7.offLike.undo')} sub={fill(t('fe.w7.offLike.undoSub'),{name})}/>
   </Card>
  </Sheet>}
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
  <PhotoBars n={list.length} i={i} label={fill(t('fe.px.ph.n'),{i:i+1,n:list.length})} count/>
  {list.length>1&&<><button type="button" className="pc-zone l" aria-label={t('fe.px.ph.prev')} onClick={()=>setIx(Math.max(0,i-1))}/><button type="button" className="pc-zone r" aria-label={t('fe.px.ph.next')} onClick={()=>setIx(Math.min(list.length-1,i+1))}/></>}
  {src&&onOpen&&<button type="button" className="pc-zone c" aria-label={t('fe.px.ph.full')} onClick={()=>onOpen(i)}/>}
  <div className="pc-info"><PersonName name={name} age={p.age||undefined}><NameBadges p={p}/></PersonName>
   {city&&<div className="pc-who"><span className="pl"><MapPin/>{city}</span></div>}
   <FollowCounts id={p.id} rel={rel} inert={inert}/></div>
 </div>;
}

/** `openViewer()` — full-screen photos: ‹ ›, arrows, swipe, Esc. */
export function PhotoViewer({srcs,index,onClose,wm}:{srcs:string[],index:number,onClose:()=>void,/** Someone else's private photos: the viewer's handle. */ wm?:string|null|undefined}){
 const {t}=useI18n();const [i,setI]=useState(index);const [on,setOn]=useState(false);const closeBtn=useRef<HTMLButtonElement>(null);const sx=useRef<number|null>(null);
 const step=useCallback((d:number)=>setI(v=>Math.max(0,Math.min(srcs.length-1,v+d))),[srcs.length]);
 useEffect(()=>{const r=requestAnimationFrame(()=>{setOn(true);closeBtn.current?.focus({preventScroll:true});});return ()=>cancelAnimationFrame(r);},[]);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();else if(e.key==='ArrowLeft')step(-1);else if(e.key==='ArrowRight')step(1);};addEventListener('keydown',k);return ()=>removeEventListener('keydown',k);},[onClose,step]);
 return <Layer><div className={'viewer'+(on?' on':'')} role="dialog" aria-modal="true" aria-label={t('fe.px.ph.viewer')}
  onPointerDown={e=>{sx.current=e.clientX;}} onPointerUp={e=>{if(sx.current==null)return;const dx=e.clientX-sx.current;sx.current=null;if(Math.abs(dx)>50)step(dx<0?1:-1);}}>
  <PhotoTrack srcs={srcs} index={i} wm={wm} onStep={step} onClose={onClose}/>
  <div className="vw-top"><span className="vw-n">{i+1} / {srcs.length}</span><IconBtn ref={closeBtn} icon={X} kind="glass" label={t('fe.px.close')} onClick={onClose}/></div>
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
const named={ru:z.string().nullable(),en:z.string().nullable()};
/** One schema for `catalog.get` on these screens: the read cache keys on the schema, so one object means one request. */
export const catalogRes=z.object({ok:z.literal(true),options:z.array(z.object({kind:z.string(),code:z.string(),...named})),
 topics:z.array(z.object({id:z.string(),categoryId:z.string(),...named}).passthrough()),
 categories:z.array(z.object({id:z.string(),...named}).passthrough()),
 places:z.array(z.object({id:z.string(),...named}).passthrough())}).passthrough();
export type Catalog=z.infer<typeof catalogRes>;
/** The catalog once read: option and topic names show on the first render (a name that turns from its code into a
 * word a moment later moves the lines under it). */
let catalogMemo:Catalog|null=null;
export function readCatalog(call:ReturnType<typeof useFe>['call']){return call('catalog.get',{},catalogRes,{asAccount:true}).then(r=>{catalogMemo=r;return r;});}
function useOptions(){
 const {call}=useFe();const {locale}=useI18n();const [opts,setOpts]=useState<Catalog['options']>(()=>catalogMemo?.options??[]);
 useEffect(()=>{readCatalog(call).then(r=>setOpts(o=>o===r.options?o:r.options)).catch(()=>{});},[call]);
 return (kind:string,code:string)=>{const o=opts.find(x=>x.kind===kind&&x.code===code);return o?((locale==='en'?o.en||o.ru:o.ru||o.en)??code):code;};
}
/** detailsGroup: every chosen detail in one card; a couple shows role, format and «в поиске». */
export function DetailsGroup({p}:{p:PersonProfile}){
 const {t}=useI18n();const label=useOptions();
 const rows=DETAILS.filter(([f])=>p.kind==='person'||COUPLE_DETAILS.has(f)).map(([f,kind])=>{const v=p.details[f];const codes=Array.isArray(v)?v as string[]:typeof v==='string'?[v]:[];
  return codes.length?[t('fe.px.f.'+kind),codes.map(c=>label(kind,c)).join(', ')] as const:null;}).filter(x=>!!x);
 if(!rows.length)return null;
 return <Group title={t(p.kind==='couple'?'fe.px.f.titleCouple':'fe.px.f.title')}>
  <Card><dl className="kv">{rows.map(([k,v])=><Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl></Card></Group>;
}

const jarItem=z.object({topicId:z.string(),value:z.number().nullable().optional(),mark:z.string().nullable().optional(),dir:z.array(z.string()).nullable().optional(),vis:z.string().nullable().optional()}).passthrough();
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
/** Whether a profile has a private part and what of it is open to the viewer; the same read as PrivateVault's. */
export function usePrivate(profileId:string,skip=false){
 const {call}=useFe();const [p,setP]=useState<Priv|null>(null);useKeyChange(profileId,()=>setP(null));
 useEffect(()=>{if(skip)return;call('private.get',{profileId},privRes).then(setP).catch(()=>{});},[call,profileId,skip]);
 return p;
}
const postsRes=z.object({ok:z.literal(true),items:z.array(z.lazy(()=>postSchema)),next:z.string().nullable().optional()}).passthrough();
const actRes=z.object({ok:z.literal(true),items:z.array(z.unknown()),next:z.string().nullable().optional()}).passthrough();
const ownVis=z.object({ok:z.literal(true),settings:z.object({activityVis:z.enum(['all','followers','off']).optional()}).passthrough()});
/** activityBlock: «Публикации / Статьи / Активность» — tabs only when there is more than one of them; the first three
 * of each. «Активность» is the person's own activity cards (as «Подписки» shows them) by their «Кто видит мою
 * активность» and the viewer's relation (the server decides); on one's own profile it says who else sees it. «Как
 * видят» (`preview`) shows it only when everyone may. */
const actsOf=(r:z.infer<typeof actRes>)=>r.items.flatMap(x=>{const a=activitySchema.safeParse(x);return a.success?[a.data]:[];});
function Activity({profileId,inert,preview,pre}:{profileId:string,inert?:boolean|undefined,preview?:boolean|undefined,pre?:CardPre|undefined}){
 const {call,acting}=useFe();const {t}=useI18n();const [items,setItems]=useState<Post[]|null>(()=>pre?pre.posts?.items??[]:null);const [tab,setTab]=useState<'posts'|'notes'|'acts'>('posts');
 const [acts,setActs]=useState<Act[]|null>(()=>pre?pre.activity?actsOf(pre.activity):[]:null);const own=profileId===acting?.id;const [vis,setVis]=useState<string|null>(null);
 const given=!!pre;
 // Another profile starts empty; reading the same one again keeps what is shown until the answer comes.
 useEffect(()=>{if(given)return;const put=(r:z.infer<typeof postsRes>)=>setItems(r.items);call('profile.posts',{profileId},postsRes,{onFresh:put}).then(put).catch(()=>setItems(l=>l??[]));},[call,profileId,given]);
 useEffect(()=>{if(given)return;call('profile.activity',{profileId},actRes).then(r=>setActs(actsOf(r))).catch(()=>setActs(l=>l??[]));},[call,profileId,given]);
 useKeyChange(profileId,()=>{setItems(null);setActs(null);});
 useEffect(()=>{if(!own){setVis(null);return;}call('profile.settings',{},ownVis).then(r=>setVis(r.settings.activityVis??'all')).catch(()=>setVis('all'));},[call,own]);
 if(!items||!acts||(own&&!vis))return null;
 const shownActs=preview&&vis!=='all'?[]:acts;
 const posts=items.filter(x=>x.type!=='note'),notes=items.filter(x=>x.type==='note');
 const on=([['posts',t('fe.px.act.posts'),posts.length],['notes',t('fe.px.act.notes'),notes.length],['acts',t('fe.px.act.acts'),shownActs.length]] as const).filter(x=>x[2]>0);
 if(!on.length)return null;
 const cur=on.find(x=>x[0]===tab)??on[0]!;
 const change=(p:Post)=>setItems(l=>l&&l.map(x=>x.id===p.id?p:x));const remove=(r:Removal)=>setItems(l=>l&&l.filter(x=>x.id!==r.postId&&x.author.id!==r.authorId));
 const list=cur[0]==='posts'?posts:notes;
 return <Group className="activity" title={on.length>1?undefined:cur[1]}>
  {on.length>1&&<Seg value={cur[0]} onChange={v=>setTab(v)} options={on.map(x=>({id:x[0],label:x[1]}))}/>}
  {cur[0]==='acts'?<>
    {own&&!preview&&<Text size="sm" tone="mute">{t('fe.px.act.actsSees.'+vis)}</Text>}
    <div className="posts" inert={inert||undefined}>{shownActs.slice(0,3).map(a=><ActivityCardOf key={a.id} a={a}/>)}</div></>
   :<div className="posts" inert={inert||undefined}>{list.slice(0,3).map(x=><PostCard key={x.id} post={x} onChange={change} onRemove={remove}/>)}</div>}
 </Group>;
}

/** Gallery (galleryBlock): the profile photos the viewer may see; «Все · N» opens P20. */
function GalleryGroup({p,onOpen,inert}:{p:PersonProfile,onOpen:(i:number)=>void,inert?:boolean|undefined}){
 const {t}=useI18n();const navigate=useNavigate();const list=photosOf(p);
 if(!list.length)return null;
 return <Group bare title={t('fe.px.gal.title')} action={!inert&&<button type="button" onClick={()=>navigate('/n/people/'+p.id+'/gallery')}>{t('fe.px.all')} · {list.length}</button>}>
  <Card><div className="ggrid">{list.slice(0,12).map((m,i)=><button key={i} type="button" className="gtile" disabled={inert} onClick={()=>onOpen(i)}><img src={mediaSrc(m)!} alt="" loading="lazy" draggable={false}/></button>)}</div>
   {list.length>12&&!inert&&<Btn kind="soft" className="mt12" onClick={()=>navigate('/n/people/'+p.id+'/gallery')}>{fill(t('fe.px.gal.all'),{n:list.length})}</Btn>}</Card></Group>;
}

/** Interests group of another profile (pubJars → jarShelf, six then «Ещё N»). */
function InterestsGroup({profileId,name,avatar,inert,pre,preview}:{profileId:string,name:string,avatar?:string|null|undefined,inert?:boolean|undefined,pre?:CardPre|undefined,preview?:'all'|'granted'|undefined}){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const topic=useTopics();
 // «Как видят» reads the own list (every audience): keep only what that audience gets — public ones, plus «По доступу»
 // with access; «Только я» never; a hard limit only as a limit, as the server sends it to others.
 const audience=(l:Jar[])=>!preview?l:l.filter(j=>(j.vis??'public')==='public'||(preview==='granted'&&j.vis==='granted')).map(j=>j.mark==='hard'?{topicId:j.topicId,mark:'hard'}:j);
 const [items,setItems]=useState<Jar[]>(()=>audience(pre?.interests?.items??[]));
 const [open,setOpen]=useState<string|null>(null);const given=!!pre;
 useEffect(()=>{if(given)return;call('interests.list',{profileId},jarsRes).then(r=>setItems(audience(r.items))).catch(()=>{});
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[call,profileId,given,preview]);
 useKeyChange(profileId,()=>setItems([]));
 if(!items.length)return null;
 // Someone else's interest opens the comparison (V21 openTopic); the acting profile's own opens the topic.
 const own=profileId===acting?.id;
 const theirs=(id:string)=>{const j=items.find(x=>x.topicId===id);return j?asInterest(j):undefined;};
 return <Group title={t('fe.px.int.title')}>
  <Card><Jars items={items} topic={topic} max={6} {...(inert?{}:{onTopic:(id:string)=>own?navigate('/n/topics/'+id):setOpen(id)})}/></Card>
  {open&&<CompareSheet key={open} topicId={open} name={name} avatar={avatar} personId={profileId} theirs={theirs(open)} onClose={()=>setOpen(null)}/>}</Group>;
}

/** Everything under the photo and the buttons — the same body on the profile page and under a Discover card. */
export function ProfileBody({p,inert,preview,onOpen,pre}:{p:PersonProfile,inert?:boolean|undefined,preview?:'all'|'granted'|undefined,onOpen:(i:number)=>void,
 /** Everything already read in one go (a Discover card): the body appears whole, nothing pops in under the reader. */ pre?:CardPre|undefined}){
 return <>
  <DetailsGroup p={p}/>
  <LinksSection profileId={p.id} inert={inert} pre={pre}/>
  <InterestsGroup profileId={p.id} name={personName(p)||'?'} avatar={mediaSrc(p.avatar)} inert={inert} pre={pre} preview={preview}/>
  <GalleryGroup p={p} onOpen={onOpen} inert={inert}/>
  <PrivateVault profileId={p.id} name={personName(p)} {...(preview?{preview}:{})} {...(pre?{pre:pre.private??{ok:true,exists:false}}:{})}/>
  <Activity profileId={p.id} inert={inert} preview={!!preview} pre={pre}/>
 </>;
}

/* ---------- a Discover card's details in one read (discover.card) ---------- */
const linksRes0=z.object({ok:z.literal(true),items:z.array(z.unknown())}).passthrough();
const cardRes=z.object({ok:z.literal(true),profile:personProfileRes,compat:z.unknown().nullable(),links:linksRes0.nullable(),interests:jarsRes.nullable(),
 private:z.unknown().nullable(),posts:postsRes.nullable(),activity:actRes.nullable()});
export type CardPre={profile:PersonProfile,compat:Compat|null,links:z.infer<typeof linksRes>|null,interests:z.infer<typeof jarsRes>|null,
 private:unknown,posts:z.infer<typeof postsRes>|null,activity:z.infer<typeof actRes>|null};
const safe=<S extends z.ZodType>(schema:S,v:unknown):z.infer<S>|null=>{if(v==null)return null;const r=schema.safeParse(v);return r.success?r.data:null;};
/** Cards read (or being read) for the acting profile, newest last; a card read once is not asked again for a while. */
const cardMemo=new Map<string,{at:number,value:Promise<CardPre>,done?:CardPre}>();
// A write (an own post published, edited or deleted; a follow) makes a prefetched card stale like any read.
onReadsDropped(()=>cardMemo.clear());
const CARD_TTL=5*60000;
/** Whether the server has `discover.card` (null: not known yet). Without it a card costs seven reads, so the deck then
 * reads only the card someone stays on (`cardOneRead() === false`), never the next one ahead. */
let cardCmd:boolean|null=null;
export const cardOneRead=()=>cardCmd;
/** Everything under a Discover card's photo — the profile, «что общего», links, interests, the private part, posts and
 * activity — in one read (`discover.card`); a server without it answers with the same commands asked side by side.
 * Asked when the card is next in the deck, so it is there before the card is on top. */
export function readCard(call:ReturnType<typeof useFe>['call'],actingId:string,profileId:string):Promise<CardPre>{
 const key=actingId+':'+profileId;const hit=cardMemo.get(key);
 if(hit&&Date.now()-hit.at<CARD_TTL)return hit.value;
 const one=cardCmd===false?Promise.reject(new FeError('invalid_input')):call('discover.card',{profileId},cardRes).then(r=>({profile:r.profile.profile,compat:safe(compatRes,r.compat),links:safe(linksRes,r.links),interests:r.interests,
  private:r.private,posts:r.posts,activity:r.activity}));
 const each=()=>Promise.all([call('profile.get',{profileId},personProfileRes),
  call('profile.compat',{profileId},compatRes).catch(()=>null),call('links.ofProfile',{profileId},linksRes).catch(()=>null),
  call('interests.list',{profileId},jarsRes).catch(()=>null),call('private.get',{profileId},privRes).catch(()=>null),
  call('profile.posts',{profileId},postsRes).catch(()=>null),call('profile.activity',{profileId},actRes).catch(()=>null)])
  .then(([p,compat,links,interests,priv,posts,activity])=>({profile:p.profile,compat,links,interests,private:priv,posts,activity}));
 // Not found is final; anything else (an older server without the command) asks the parts one by one.
 const value=one.then(v=>{cardCmd=true;return v;},e=>{if(e instanceof FeError&&e.code==='not_found')throw e;
  if(e instanceof FeError&&e.code==='invalid_input')cardCmd=false;return each();});
 const entry:{at:number,value:Promise<CardPre>,done?:CardPre}={at:Date.now(),value};cardMemo.set(key,entry);
 value.then(v=>{entry.done=v;},()=>{if(cardMemo.get(key)===entry)cardMemo.delete(key);});
 if(cardMemo.size>60){const first=cardMemo.keys().next().value;if(first!==undefined)cardMemo.delete(first);}
 return value;
}
/** A card already read: the top card draws its whole body on the first render. */
export function cardRead(actingId:string,profileId:string){const hit=cardMemo.get(actingId+':'+profileId);return hit&&Date.now()-hit.at<CARD_TTL?hit.done??null:null;}

/** SC.P01 profileView: the floating ‹ and ⋯ sit on the photo and turn into a solid bar with the name past it
 * (PRF-007); hero, description, buttons, «что общего», then the body. `preview` is «Как видят» — everything drawn,
 * nothing pressable. */
export function ProfilePage({p,preview,seg,onMore,menu,toast,children}:{p:PersonProfile,preview?:'all'|'granted'|undefined,seg?:ReactNode,onMore?:(()=>void)|undefined,
 menu?:((rel:Relation|null,reload:()=>void)=>ReactNode)|undefined,toast:PxToast,children?:ReactNode}){
 const {t}=useI18n();const navigate=useNavigate();const [rel,setRel,reloadRel]=useRelation(p.id);const [view,setView]=useState<number|null>(null);
 const bar=useRef<HTMLElement>(null);const name=personName(p);const inert=!!preview;const list=photosOf(p);
 const onScroll=(e:React.UIEvent<HTMLDivElement>)=>{const h=e.currentTarget.querySelector('.hero');const b=bar.current;if(h&&b)b.classList.toggle('solid',h.getBoundingClientRect().bottom<b.getBoundingClientRect().bottom+8);};
 return <>
  <header ref={bar} className="bar overlay pbar">
   {/* Back to where the profile was opened (the deck, «Симпатии», a list, search); opened by a link, to «Люди». */}
   <IconBtn icon={ChevronLeft} kind="glass" label={t('fe.back')} onClick={()=>{if(((window.history.state as {idx?:number}|null)?.idx??0)>0)navigate(-1);else navigate('/n/people',{replace:true});}}/>
   <span className="pbar-t" aria-hidden="true"><Av name={name} seed={p.id} src={mediaSrc(p.avatar)} size="sm"/><b>{name}</b></span>
   {onMore&&<IconBtn icon={Ellipsis} kind="glass" aria-haspopup="dialog" label={t('fe.px.menu.more')} onClick={onMore}/>}
  </header>
  <div className="view nodock top0 profile-page" onScroll={onScroll}>{seg}<div className="wrap">
   <H level={1} className="sr-only" tabIndex={-1}>{name}</H>
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
export type CompatItem=z.infer<typeof compatItem>;
type Side=z.infer<typeof side>;
/** The group of one topic both answered — the same rule as the server's «Что у вас общего» (people.mjs `group`):
 * a hard limit on either side is a boundary, never a fit; «обсудить» or a gap of 4+ is to discuss; give↔receive fits;
 * both 6+ match; otherwise to try. */
export function compatGroup(mine:Side,theirs:Side):CompatItem['group']{
 if(mine.mark==='hard'||theirs.mark==='hard')return 'bound';
 if(mine.mark==='discuss'||theirs.mark==='discuss')return 'discuss';
 const md=mine.dir??[],td=theirs.dir??[];
 if((md.includes('give')&&td.includes('get'))||(md.includes('get')&&td.includes('give')))return 'complement';
 if(mine.value==null||theirs.value==null||Math.abs(mine.value-theirs.value)>=4)return 'discuss';
 return mine.value>=6&&theirs.value>=6?'match':'try';
}
const compatRes=z.discriminatedUnion('few',[
 z.object({ok:z.literal(true),few:z.literal(true),topics:z.array(z.string())}),
 z.object({ok:z.literal(true),few:z.literal(false),count:z.number(),items:z.array(compatItem)}),
]);
type Compat=z.infer<typeof compatRes>;

const topicNames=(c:Catalog,locale:string)=>new Map(c.topics.map(x=>[x.id,(locale==='en'?x.en||x.ru:x.ru||x.en)||x.id]));
function useTopics(){
 const {call}=useFe();const {locale}=useI18n();const [names,setNames]=useState<Map<string,string>>(()=>catalogMemo?topicNames(catalogMemo,locale):new Map());
 useEffect(()=>{readCatalog(call).then(r=>setNames(topicNames(r,locale))).catch(()=>{});},[call,locale]);
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
export function CompatSummary({profileId,pre}:{profileId:string,/** Already read (a Discover card): shown at once. */ pre?:Compat|null|undefined}){
 const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const [c,setC]=useState<Compat|null>(pre??null);const given=pre!==undefined;
 useEffect(()=>{if(given)return;call('profile.compat',{profileId},compatRes).then(setC).catch(()=>{});},[call,profileId,given]);
 useKeyChange(profileId,()=>setC(null));
 if(!c)return null;
 return <div className="mt12"><section className="compat v14c"><button type="button" className="cp-h" onClick={()=>navigate('/n/people/'+profileId+'/compat')}>
  <Venn n={c.few?'?':c.count}/><span className="grow"><b>{c.few?t('fe.px.cmp.few'):t('fe.px.cmp.hasTalk')}</b><span>{compatWords(c,t,locale,true)}</span></span><ChevronRight/>
 </button></section></div>;
}

function roleWord(s:z.infer<typeof side>,t:T){if(s.mark)return '';if(!s.dir||s.dir.length===3)return t('fe.px.cmp.role.all');return s.dir.map(d=>t('fe.px.cmp.role.'+d)).join(' · ');}
export function explain(i:CompatItem,t:T,name:string){
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
export function CmpRow({i,topic,me,them,t,why:showWhy=true,lock}:{i:CompatItem,topic:string,me:{name:string,id:string,src?:string|null},them:{name:string,id:string,src?:string|null},t:T,
 /** false: no line under the bar (the interest sheet says it in its verdict). */ why?:boolean,/** My answer is not public: a key on my avatar (its label says who sees it). */ lock?:string|undefined}){
 const lim=i.group==='bound'||!!i.mine.mark;const lv=lim?0:(i.mine.value??0);
 const val=(s:z.infer<typeof side>)=>s.mark==='hard'?<small className="lim t">{t('fe.px.cmp.taboo')}</small>:s.mark==='discuss'?<small className="lim s">{t('fe.px.cmp.negot')}</small>:<b>{s.value??'—'}</b>;
 const why=showWhy?explain(i,t,them.name):'';const ra=roleWord(i.mine,t),rb=roleWord(i.theirs,t);
 const hard=i.mine.mark==='hard'||i.theirs.mark==='hard',soft=i.mine.mark==='discuss'||i.theirs.mark==='discuss';
 return <div className="cr-item">
  <span className={['cr',hard?'hard':'',soft?'soft':''].filter(Boolean).join(' ')} style={{'--v':lv,'--lv':lv} as React.CSSProperties}>
   {lv?<span className="cr-f"/>:null}
   <div className="cr-l">
    <i className="cr-av me"><Av name={me.name} seed={me.id} src={me.src}/>{lock&&<span className="cr-key" role="img" aria-label={lock}><KeyRound/></span>}</i>
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
     {c.few&&<Alert icon={Info} className="mt12"><b>{t('fe.px.cmp.fewTitle')}</b>{t('fe.px.cmp.fewBody')}</Alert>}
     {!c.few&&<div className="cmp-groups">{(()=>{const g=byGroup(c);return GROUPS.filter(k=>g[k].length).map(k=><div key={k} className="cg">
      <div className={'cg-h '+CLS[k]}><i/><span>{t('fe.px.cmp.g.'+k)}</span><b>{g[k].length}</b></div>
      <p className="cg-d">{t('fe.px.cmp.d.'+k)}</p>
      <div className="cg-rows">{g[k].map(i=><CmpRow key={i.topicId} i={i} topic={topic(i.topicId)} me={me} them={them} t={t}/>)}</div>
     </div>);})()}</div>}
     <Alert icon={Lock} className="mt16">{t('fe.px.cmp.foot')}</Alert>
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
const linkOther=z.object({id:z.uuid(),kind:z.string(),handle:z.string().nullable(),name:z.string().nullable(),...faceFields});
const linkView=z.object({id:z.uuid(),kind:z.string(),side:z.string().nullable(),vis:z.enum(['all','followers','us']),other:linkOther,
 change:z.object({kind:z.string(),mine:z.boolean()}).nullable()});
export type LinkView=z.infer<typeof linkView>;
/** `links.mine`: the acting profile's incoming proposals, sent ones and confirmed links (with its own visibility). */
export const linksMineRes=z.object({ok:z.literal(true),incoming:z.array(linkView),sent:z.array(linkView),confirmed:z.array(linkView)});
export type LinksMine=z.infer<typeof linksMineRes>;
const linksRes=z.object({ok:z.literal(true),items:z.array(z.object({id:z.string(),kind:z.string(),side:z.string().nullable(),
 other:linkOther}).passthrough())});

/** Confirmed links of a profile as far as both endpoints' visibility allows (linksBlock as another person sees it). */
export function LinksSection({profileId,inert,pre}:{profileId:string,inert?:boolean|undefined,pre?:CardPre|undefined}){
 const {call,acting,state}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const [items,setItems]=useState<z.infer<typeof linksRes>['items']>(()=>pre?.links?.items??[]);const [all,setAll]=useState(false);const given=!!pre;
 useEffect(()=>{if(given)return;call('links.ofProfile',{profileId},linksRes).then(r=>setItems(r.items)).catch(()=>{});},[call,profileId,given]);
 useKeyChange(profileId,()=>setItems([]));
 if(!items.length)return null;
 const own=new Set(state.status==='ready'?state.boot.profiles.map(p=>p.id):[]);
 const shown=all?items:items.slice(0,4);
 return <Group title={t('fe.px.lk.title')} action={items.length>4&&!all&&<button type="button" onClick={()=>setAll(true)}>{t('fe.px.all')} · {items.length}</button>}>
  <Card list>{shown.map(l=>{const name=l.other.name||(l.other.handle?'@'+l.other.handle:'?');
   // `side` is this profile's side; the row names the other one's, as in the prototype's linkLabel.
   const label=linkLabel(t,l.kind,l.side);const mine=own.has(l.other.id);
   return <Row key={l.id} disabled={!!inert} av={<Av name={name} seed={l.other.id} size="sm" src={l.other.avatar}/>}
    title={<>{name}<NameBadges p={l.other}/>{mine?' · '+t(acting?.kind==='couple'?'fe.px.lk.you2':'fe.px.lk.you'):''}</>} sub={label}
    onClick={()=>navigate(mine?(l.other.id===acting?.id?'/n/me/preview':'/n/me'):'/n/people/'+l.other.id)}/>;})}</Card>
 </Group>;
}

/* ---------- the person menu (S02) ---------- */
const feedHiddenRes=z.object({ok:z.literal(true),items:z.array(z.object({kind:z.string(),target_id:z.string()}).passthrough())}).passthrough();

function Report({profileId,onClose,onDone}:{profileId:string,onClose:()=>void,onDone:(msg:string,blocked:boolean)=>void}){
 const {t}=useI18n();const {acting}=useFe();
 return <ReportSheet targetType="profile" targetId={profileId} block onClose={onClose} onDone={b=>onDone(t(acting?.kind==='couple'?'fe.ca.reported':'fe.px.rp.sent'),b)}/>;
}

function Block({profileId,name,onClose,onDone}:{profileId:string,name:string,onClose:()=>void,onDone:(msg:string)=>void}){
 const {call,acting,state}=useFe();const {t}=useI18n();
 const others=state.status==='ready'?state.boot.profiles.filter(p=>p.state!=='deleted'&&p.id!==acting?.id):[];
 const alsoFor:'partner'|'me'|null=acting?.kind==='person'&&others.some(p=>p.kind==='couple')?'partner':acting?.kind==='couple'&&others.some(p=>p.kind==='person')?'me':null;
 const [also,setAlso]=useState(false);const [busy,setBusy]=useState(false);const [err,setErr]=useState('');
 const go=async()=>{setBusy(true);setErr('');
  try{await call('block.set',{opId:newOpId(),profileId,on:true,...(also&&alsoFor?{alsoFor}:{})},ok);onDone(t(acting?.kind==='couple'?'fe.ca.blocked':'fe.px.bl.done'));}
  catch(e){setErr(pxError(e,t));}finally{setBusy(false);}};
 return <Sheet title={fill(t('fe.px.bl.title'),{name})} onClose={onClose} foot={<><Btn kind="danger" onClick={go} disabled={busy}>{t(acting?.kind==='couple'?'fe.ca.block':'fe.px.bl.ok')}</Btn><Btn kind="text" onClick={onClose}>{t('fe.px.cancel')}</Btn></>}>
  <p className="lead">{t(acting?.kind==='couple'?'fe.ca.blockText':'fe.px.bl.text')}</p>
  {alsoFor&&<Card list className="mt12"><ToggleRow title={t(alsoFor==='partner'?'fe.px.bl.alsoPartner':'fe.px.bl.alsoMe')} sub={t(alsoFor==='partner'?'fe.px.bl.alsoPartnerSub':'fe.px.bl.alsoMeSub')}
   on={also} onClick={()=>setAlso(v=>!v)}/></Card>}
  {err&&<Alert kind="err" noIcon className="mt12">{err}</Alert>}
 </Sheet>;
}

type MenuStep='menu'|'report'|'block'|'end'|'gift'|null;
/** End a connection (ACT.endConn): withdraws the like; for a match the chat closes too (`match.end`). */
function EndConnection({profileId,name,mutual,onClose,onDone}:{profileId:string,name:string,mutual:boolean,onClose:()=>void,onDone:(msg:string)=>void}){
 const {call,acting}=useFe();const {t}=useI18n();const us=acting?.kind==='couple';const u=(k:string)=>t(us?k+'Us':k);const [revoke,setRevoke]=useState(true);const [busy,setBusy]=useState(false);const [err,setErr]=useState('');
 const go=async()=>{setBusy(true);setErr('');
  try{if(mutual)await call('match.end',{opId:newOpId(),profileId,revokeMyGrant:revoke},ok);else await call('like.withdraw',{opId:newOpId(),profileId},ok);onDone(u('fe.px.ec.done'));}
  catch(e){setErr(pxError(e,t));}finally{setBusy(false);}};
 const fact=(ok:boolean,text:string)=><div className="fact"><i className={ok?'g':'v'}>{ok?<Check/>:<Info/>}</i><span>{text}</span></div>;
 return <Sheet title={t('fe.px.ec.title')} onClose={onClose} foot={<><Btn kind="danger" onClick={go} busy={busy}>{t('fe.px.ec.ok')}</Btn><Btn kind="soft" onClick={onClose}>{t('fe.px.cancel')}</Btn></>}>
  <p className="lead">{fill(u('fe.px.ec.lead'),{name})}</p>
  <Card className="flat">{mutual&&fact(true,t('fe.px.ec.chat'))}{fact(true,u(mutual?'fe.px.ec.likeMatch':'fe.px.ec.like'))}{mutual&&fact(true,t('fe.px.ec.history'))}{fact(false,t('fe.px.ec.notBlock'))}</Card>
  {mutual&&<Card list className="mt12"><ToggleRow title={u('fe.px.ec.revoke')} sub={t('fe.px.ec.revokeSub')} on={revoke} onClick={()=>setRevoke(v=>!v)}/></Card>}
  <Note className="mt12">{u('fe.px.ec.block')}</Note>
  {err&&<Alert kind="err" noIcon className="mt12">{err}</Alert>}
 </Sheet>;
}

/** The ⋯ menu of another person's profile (ACT.profileMenu) and its sheets. `blocked` is kept by the screen: a
 * blocked profile no longer loads, so the screen shows its own blocked state with «Разблокировать». */
export function PersonMenu({profileId,name,handle,step,setStep,blocked,setBlocked,toast,rel,onRel}:{profileId:string,name:string,/** A person's nick: «Подарить Premium» (couples have none to gift to). */ handle?:string|null|undefined,step:MenuStep,setStep:(s:MenuStep)=>void,
 blocked:boolean,setBlocked:(b:boolean)=>void,toast:(msg:string,err?:boolean)=>void,rel?:Relation|null|undefined,onRel?:(()=>void)|undefined}){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const [busy,setBusy]=useState(false);
 const [link,setLink]=useState<{state:'ok'|'sent'|'in',view:LinkView}|null>(null);const [hidden,setHidden]=useState<boolean|null>(null);
 useEffect(()=>{if(step!=='menu'||blocked)return;call('links.mine',{},linksMineRes).then(r=>{const f=(l:LinkView[])=>l.find(x=>x.other.id===profileId);
  const c=f(r.confirmed),s=f(r.sent),i=f(r.incoming);setLink(c?{state:'ok',view:c}:s?{state:'sent',view:s}:i?{state:'in',view:i}:null);}).catch(()=>{});
  call('feedHide.list',{},feedHiddenRes).then(r=>setHidden(r.items.some(x=>x.kind==='author'&&x.target_id===profileId))).catch(()=>setHidden(null));},[step,blocked,call,profileId]);
 const close=useCallback(()=>setStep(null),[setStep]);
 // «Скрыть из ленты» (the post menu's «Не показывать»): posts and activity leave the feed; the person is not told.
 const hide=async()=>{const on=!hidden;setBusy(true);
  try{await call('feedHide.set',{opId:newOpId(),kind:'author',targetId:profileId,on},ok);setHidden(on);close();toast(fill(t((on?'fe.px.menu.hidden':'fe.px.menu.unhidden')+(acting?.kind==='couple'?'Us':'')),{name}));}
  catch(e){toast(pxError(e,t),true);}finally{setBusy(false);}};
 const unblock=async()=>{setBusy(true);
  try{await call('block.set',{opId:newOpId(),profileId,on:false},ok);setBlocked(false);close();toast(t('fe.px.bl.undone'));}
  catch(e){toast(pxError(e,t),true);}finally{setBusy(false);}};
 const copy=async()=>{close();try{await navigator.clipboard.writeText(publicBase()+'#/n/people/'+profileId);toast(t('fe.px.menu.copied'));}catch{toast(t('fe.px.menu.copyFail'),true);}};
 const row=(icon:LucideIcon,title:string,onClick:()=>void,sub?:string,danger?:boolean)=><Row noChev icon={icon} title={title} sub={sub} danger={!!danger} onClick={onClick} disabled={busy}/>;
 if(step==='menu')return <Sheet title={name} onClose={close}><Card list>
  {blocked?row(Ban,t('fe.px.menu.unblock'),unblock):<>
   {row(LinkIcon,t('fe.px.menu.copy'),copy)}
   {link?.state==='ok'?row(Users,t('fe.px.menu.linkIs')+linkLabel(t,link.view.kind,link.view.side),()=>{close();navigate('/n/people/'+profileId+'/link');},t('fe.px.menu.linkIsSub'))
    :link?row(Users,t(link.state==='sent'?'fe.px.menu.linkSent':'fe.px.menu.linkIn'),()=>{close();navigate('/n/me/links');},link.state==='sent'?t('fe.px.menu.linkSentSub'):linkLabel(t,link.view.kind,link.view.side))
    :row(Users,t('fe.px.menu.link'),()=>{close();navigate('/n/people/'+profileId+'/link');},t('fe.px.menu.linkSub'))}
   {hidden!==null&&(hidden?row(Eye,t('fe.px.menu.unhide'),hide):row(EyeOff,t('fe.px.menu.hide'),hide,t('fe.px.menu.hideSub')))}
   {(rel?.liked||rel?.mutual)&&row(X,t('fe.px.menu.end'),()=>setStep('end'),t(rel.mutual?'fe.px.menu.endMatch':'fe.px.menu.endLike'))}
   {handle&&row(Crown,t('fe.w8.gift.menu'),()=>setStep('gift'))}
   {row(Flag,t('fe.px.menu.report'),()=>setStep('report'),undefined,true)}
   {row(Ban,t('fe.px.menu.block'),()=>setStep('block'),t('fe.px.menu.blockSub'),true)}
  </>}
 </Card></Sheet>;
 if(step==='end')return <EndConnection profileId={profileId} name={name} mutual={!!rel?.mutual} onClose={close} onDone={msg=>{close();toast(msg);onRel?.();}}/>;
 if(step==='report')return <Report profileId={profileId} onClose={close} onDone={(msg,b)=>{close();if(b)setBlocked(true);toast(msg);}}/>;
 if(step==='gift'&&handle)return <GiftSheet handle={handle} onClose={close}/>;
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
   {r&&!r.premium&&r.items.length>0&&<div className="paywall"><b>{t('fe.px.h.payTitle')}</b><p>{t('fe.px.h.payText')}</p><Btn onClick={()=>openPaywall('history')}>{t('fe.ax.prem.open')}</Btn></div>}
  </View>
  {toastNode}
 </>;
}

/* ---------- «Как видят» (P03) ---------- */
type Lv='all'|'granted'|'card';
const ownSettingsRes=z.object({ok:z.literal(true),settings:z.object({discoverMode:z.string()}).passthrough()});
function BackBtn(){const {t}=useI18n();const navigate=useNavigate();return <IconBtn icon={ChevronLeft} kind="ghost" label={t('fe.back')} onClick={()=>navigate(-1)}/>;}

/** `/n/me/preview`: the own profile as others see it, with the prototype's audience switch «Все / С доступом /
 * Знакомства». «Все» and «С доступом» are the profile page itself drawn as a viewer sees it (the server's own data,
 * filtered by the owner's settings; the private part from the own `private.get`); «Знакомства» is the Discover card
 * with the whole profile under it. Buttons are drawn but do nothing. */
function useProposal(){
 const st=useLocation().state as {proposal?:Record<string,unknown>}|null;const c=st?.proposal;
 return useMemo(()=>{if(!c)return null;const o:{name?:string,bio?:string}={};
  if(typeof c.name==='string')o.name=c.name;if(typeof c.bio==='string')o.bio=c.bio;return Object.keys(o).length?o:null;},[c]);
}
export function MePreviewScreen(){
 const {call,acting}=useFe();const {t,locale}=useI18n();const [toastNode,toast]=useToast();
 const [lv,setLv]=useState<Lv>(()=>{const v=new URLSearchParams(location.hash.split('?')[1]??'').get('lv');return v==='granted'||v==='card'?v:'all';});
 const [p,setP]=useState<PersonProfile|null>(null);const [mode,setMode]=useState<string|null>(null);const [error,setError]=useState<unknown>(null);
 const [rel]=useRelation(acting?.id??'');
 // V21 pairReview «Весь профиль после изменений»: a couple's proposed name / bio drawn over the live profile.
 const proposal=useProposal();
 const load=useCallback(()=>{if(!acting)return;setError(null);
  Promise.all([call('profile.get',{profileId:acting.id},personProfileRes),call('profile.settings',{},ownSettingsRes).catch(()=>null)])
   .then(([a,s])=>{setP(proposal?{...a.profile,...proposal}:a.profile);setMode(s?.settings.discoverMode??null);}).catch(setError);},[call,acting,proposal]);
 useEffect(()=>{load();},[load]);
 const seg=<Seg small={false} value={lv} onChange={setLv} label={t('fe.px.pv.title')} options={(['all','granted','card'] as const).map(id=>({id,label:t('fe.ln.pv.'+id)}))}/>;
 if(p&&!error&&lv!=='card')return <>
  {proposal&&<Alert kind="info" className="mt12">{t('fe.c6.previewNote')}</Alert>}
  <ProfilePage p={p} preview={lv} seg={<div className="p3-seg">{seg}</div>} toast={toast}/>
  {toastNode}
 </>;
 const ph=p?mediaSrc(p.avatar):null;const city=p?cityOf(p,locale):null;
 const note=mode!=='visible'?t('fe.px.pv.cardOff'):!ph?t('fe.px.pv.cardNoPhoto'):t(acting?.kind==='couple'?'fe.px.pv.cardOnUs':'fe.px.pv.cardOn');
 return <>
  <header className="bar"><BackBtn/><div className="bar-seg">{seg}</div><H level={1} className="sm" tabIndex={-1}><span className="sr-only">{t('fe.px.pv.title')}</span></H></header>
  <View className="nodock">
   {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={pxError(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!p?<div className="mt12"><Skel kind="card" rows={1}/></div>
    :<>
     <div className="mt12"><div className="card18">
      {ph?<><img className="mbg" src={ph} alt="" aria-hidden="true" draggable={false}/><img src={ph} alt={personName(p)} draggable={false}/></>:<div className="plate" style={plate(p.id)}/>}
      <div className="pc-info"><PersonName name={personName(p)} age={p.age||undefined}><NameBadges p={p}/></PersonName>
       {city&&<div className="pc-who"><span className="pl"><MapPin/>{city}</span></div>}
       <FollowCounts id={p.id} rel={rel} inert/>
       <div className="pc-hint"><ChevronDown/>{t('fe.px.card.hint')}</div></div>
     </div></div>
     <Note className="center mt12">{note}</Note>
     <div className="pc-body pc-full p3-card21"><PersonBio p={p}/><ProfileBody p={p} inert preview="all" onOpen={()=>{}}/></div>
    </>}
  </View>
  {toastNode}
 </>;
}

