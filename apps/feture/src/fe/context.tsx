import {useCallback,useEffect,useState,type ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Bell,Calendar,Heart,Users} from 'lucide-react';
import {destination,entryFor,noteLine} from '../../contracts/notifications.mjs';
import {Av,Btn,ContextColumn,CtxBlock,CtxRow,Who,ProfileAv} from './kit';
import {useFe,useLive} from './session';
import type {LiveEntity} from './live';
import {EventCard,eventRow} from './communities';
import {CommPlate,pl} from './comm-kit';
import {countsRes} from './inbox';
import {when} from './feed';
import {NameBadges,faceFields} from './faces';

/** The desktop context column (V21 CTX): a few blocks about the open tab, from the reads the tabs already use —
 * «Лента»: upcoming events and communities to join; «Люди»: who likes the acting profile; «События»: upcoming and community
 * events; «Сообщества»: its communities and ones to join; «Чаты» / «Я»: the latest notifications and its own upcoming events. Everything
 * is the acting profile's (a couple sees the couple's), refreshed by live signals. The shell mounts it only on desktop. */

type Tab='feed'|'people'|'events'|'communities'|'chats'|'me'|'inbox';
/** Which blocks a section of the app shows; screens outside the five tabs take the nearest one. */
export function ctxTab(current:string):Tab{
 if(current==='people'||current==='events'||current==='communities'||current==='chats'||current==='me'||current==='inbox')return current;
 if(current==='settings'||current==='premium')return 'me';
 return 'feed';
}

/** One read for a block: the last answer at once (no skeleton on a revisit), then the server's; signals read again. */
function useRead<T>(action:string,input:Record<string,unknown>,schema:z.ZodType<T>,live:readonly LiveEntity[],asAccount=false){
 const {call,peek}=useFe();const key=JSON.stringify(input);
 const opts=asAccount?{asAccount:true}:{};
 const [data,setData]=useState<T|null>(()=>peek(action,input,schema,opts));const [failed,setFailed]=useState(false);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 const load=useCallback(()=>{call(action,JSON.parse(key) as Record<string,unknown>,schema,opts).then(d=>{setData(d);setFailed(false);}).catch(()=>setFailed(true));},[call,action,key,schema,asAccount]);
 useEffect(()=>{load();},[load]);
 useLive(live,load);
 return {data,loading:data===null&&!failed};
}

const soonRes=z.object({ok:z.literal(true),items:z.array(eventRow.passthrough())});
const evList=z.object({ok:z.literal(true),items:z.array(eventRow.passthrough())}).passthrough();
const media=z.object({src:z.record(z.string(),z.string()).nullable()}).passthrough();
const commCard=z.object({id:z.uuid(),name:z.string(),members:z.number(),joined:z.boolean(),plate:z.string().nullable().optional(),cover:media.nullable().optional()}).passthrough();
const catalogRes=z.object({ok:z.literal(true),items:z.array(commCard)}).passthrough();
const mineRow=z.object({id:z.uuid(),name:z.string(),role:z.string()}).passthrough();
const mineComm=z.object({ok:z.literal(true),hosting:z.array(mineRow),member:z.array(mineRow)}).passthrough();
const mineEvRow=z.object({id:z.uuid(),title:z.string(),format:z.enum(['online','offline']),area:z.string().nullable(),place_id:z.string().nullable().optional(),tz:z.string().nullable().optional(),
 starts_at:z.string(),ends_at:z.string(),state:z.string(),plate:z.string().nullable().optional()}).passthrough();
const mineEv=z.object({ok:z.literal(true),going:z.array(mineEvRow),waiting:z.array(mineEvRow),applications:z.array(mineEvRow),interested:z.array(mineEvRow),organizing:z.array(mineEvRow)}).passthrough();
const likeCard=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),avatar:media.nullable(),
 ages:z.array(z.number()).optional(),photoVerified:z.boolean().optional(),premium:z.boolean().optional()}).passthrough();
const incoming=z.object({ok:z.literal(true),items:z.array(z.object({profile:likeCard,at:z.string().nullable().optional()}).passthrough())}).passthrough();
const actor=z.object({id:z.uuid(),handle:z.string().nullable().optional(),name:z.string().nullable().optional(),...faceFields}).passthrough().nullable();
const ref=z.object({type:z.string(),id:z.uuid().nullable()}).passthrough();
const note=z.object({id:z.uuid(),type:z.string(),actor,data:z.record(z.string(),z.unknown()),object:ref.nullable(),sub:ref.nullable().optional(),addressee:z.uuid().nullable().optional(),
 couple:z.uuid().nullable().optional(),coupleName:z.string().nullable().optional(),at:z.string(),read:z.boolean()}).passthrough();
const notesRes=z.object({ok:z.literal(true),items:z.array(note)}).passthrough();
const okRes=z.object({ok:z.literal(true)}).passthrough();

const pname=(p:{name?:string|null|undefined,handle?:string|null|undefined}|null|undefined)=>p?.name||(p?.handle?'@'+p.handle:'?');
const coverOf=(c:z.infer<typeof commCard>)=>c.cover?.src?(c.cover.src.thumb??c.cover.src.card??null):null;

function Soon(){
 const {t}=useI18n();const r=useRead('event.soon',{},soonRes,['post','decide']);
 return <CtxBlock title={t('fe.ctx.soon')} loading={r.loading} empty={{icon:Calendar,title:t('fe.ctx.none')}}>
  {r.data?.items.map(e=><EventCard key={e.id} e={e} row brief/>)}
 </CtxBlock>;
}

function ForYou(){
 const {t,locale}=useI18n();const navigate=useNavigate();const {acting}=useFe();
 const r=useRead('community.catalog',{},catalogRes,['decide','notify']);
 const items=r.data?.items.filter(c=>!c.joined).slice(0,3)??[];
 return <CtxBlock rows title={t(acting?.kind==='couple'?'fe.ctx.forYouUs':'fe.ctx.forYou')} loading={r.loading} empty={{icon:Users,title:t('fe.ctx.none')}}>
  {items.map(c=>{const src=coverOf(c);return <CtxRow key={c.id} pic={src?<img className="evimg" src={src} alt=""/>:<CommPlate k={c.plate}/>} title={c.name}
   sub={pl(c.members,t('fe.cm.members'),locale)} onClick={()=>navigate('/n/communities/'+c.id)}/>;})}
 </CtxBlock>;
}

function Likes(){
 const {t,locale}=useI18n();const navigate=useNavigate();const {acting}=useFe();const us=acting?.kind==='couple';
 const r=useRead('likes.incoming',{},incoming,['notify','counts']);
 const items=r.data?.items.slice(0,6)??[];
 return <CtxBlock rows title={t(us?'fe.ctx.likesUs':'fe.ctx.likes')} loading={r.loading} empty={{icon:Heart,title:t('fe.ctx.likesEmpty')}}
  more={(r.data?.items.length??0)>items.length?<Btn kind="text" auto onClick={()=>navigate('/n/people?sub=likes')}>{t('fe.ctx.all',{n:String(r.data!.items.length)})}</Btn>:null}>
  {items.map(({profile:p,at})=><CtxRow key={p.id} av={<Av name={pname(p)} seed={p.id} size="sm" src={p.avatar?.src?.thumb}/>} title={<Who name={pname(p)} age={p.ages?.length?p.ages.join(' · '):undefined}><NameBadges p={p}/></Who>}
   sub={[p.kind==='couple'?t('fe.ctx.couple'):null,at?when(at,locale):null].filter(Boolean).join(' · ')||undefined} onClick={()=>navigate('/n/people/'+p.id)}/>)}
 </CtxBlock>;
}

function MyCommunities(){
 const {t}=useI18n();const navigate=useNavigate();const {acting}=useFe();const us=acting?.kind==='couple';
 const r=useRead('community.mine',{},mineComm,['decide','notify']);
 const items=r.data?[...r.data.hosting,...r.data.member]:[];
 return <CtxBlock rows title={t(us?'fe.cc.mineCouple':'fe.cc.mine')} loading={r.loading} empty={{icon:Users,title:t(us?'fe.ctx.commEmptyUs':'fe.ctx.commEmpty')}}
  more={items.length>5?<Btn kind="text" auto onClick={()=>navigate('/n/me/communities')}>{t('fe.ctx.all',{n:String(items.length)})}</Btn>:null}>
  {items.slice(0,5).map(c=><CtxRow key={c.id} pic={<CommPlate k={null}/>} title={c.name}
   sub={c.role==='member'?t(us?'fe.cm.memberCouple':'fe.comm.member'):t(us?'fe.cm.youHostCouple':'fe.cm.youHost')} onClick={()=>navigate('/n/communities/'+c.id)}/>)}
 </CtxBlock>;
}

function CommunityEvents(){
 const {t}=useI18n();const r=useRead('event.catalog',{},evList,['decide','notify']);
 const items=r.data?.items.filter(e=>e.community_id&&e.state==='published').slice(0,3)??[];
 return <CtxBlock title={t('fe.ctx.commEvents')} loading={r.loading} empty={{icon:Calendar,title:t('fe.ctx.none')}}>
  {items.map(e=><EventCard key={e.id} e={e} row brief/>)}
 </CtxBlock>;
}

function MyEvents(){
 const {t}=useI18n();const navigate=useNavigate();const {acting}=useFe();const us=acting?.kind==='couple';
 const r=useRead('event.mine',{},mineEv,['decide','notify']);
 const now=Date.now();
 const up=r.data?[...new Map([...r.data.going,...r.data.waiting,...r.data.applications,...r.data.interested,...r.data.organizing]
  .filter(e=>e.state==='published'&&Date.parse(e.ends_at)>now).map(e=>[e.id,e])).values()].sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)):[];
 return <CtxBlock title={t(us?'fe.ce.mineCouple':'fe.ce.mine')} loading={r.loading}
  empty={{icon:Calendar,title:t('fe.ctx.none'),action:<Btn kind="soft" onClick={()=>navigate('/n/communities?sub=events')}>{t('fe.ctx.browse')}</Btn>}}
  more={up.length>3?<Btn kind="text" auto onClick={()=>navigate('/n/me/events')}>{t('fe.ctx.all',{n:String(up.length)})}</Btn>:null}>
  {up.slice(0,3).map(e=><EventCard key={e.id} e={e} row brief/>)}
 </CtxBlock>;
}

function Notifications(){
 const {t,locale}=useI18n();const navigate=useNavigate();const {call}=useFe();
 const r=useRead('notifications.list',{},notesRes,['notify','counts'],true);
 const c=useRead('inbox.counts',{},countsRes,['counts','notify','decide','chat'],true);
 const open=(n:z.infer<typeof note>)=>{
  if(!n.read)call('notifications.read',{id:n.id},okRes,{asAccount:true}).catch(()=>{/* the row stays unread; the center reads it again */});
  navigate(destination({type:n.type,id:n.id,data:n.data,object:n.object,sub:n.sub??null,actor:n.actor?.id??null,addressee:n.addressee??null,couple:n.couple??null}));
 };
 const line=(n:z.infer<typeof note>)=>{const e=entryFor(n.type,n.data);if(!e)return t('fe.inbox.type.other');
  return noteLine(e,locale,{name:n.actor?pname(n.actor):null,couple:n.actor?.kind==='couple',vars:{couple:n.coupleName||t('fe.inbox.whom.couple')}});};
 const counts=c.data;
 const centerSub=[counts?.decide?t('fe.ctx.decide',{n:String(counts.decide)}):'',counts?.notifications?t('fe.ctx.centerNew',{n:String(counts.notifications)}):''].filter(Boolean).join(' · ');
 return <CtxBlock rows title={t('fe.ctx.notes')} loading={r.loading}>
  {r.data?.items.slice(0,3).map(n=><CtxRow key={n.id} unread={!n.read} icon={n.actor?undefined:Bell} av={n.actor?<ProfileAv p={n.actor} size="sm"/>:undefined}
   title={line(n)} sub={when(n.at,locale)} onClick={()=>open(n)}/>)}
  <CtxRow icon={Bell} title={t('fe.ctx.center')} sub={centerSub||undefined} onClick={()=>navigate('/n/inbox')}/>
 </CtxBlock>;
}

const BLOCKS:Record<Tab,()=>ReactNode>={
 feed:()=><><Soon/><ForYou/></>,
 people:()=><Likes/>,
 events:()=><><Soon/><CommunityEvents/></>,
 communities:()=><><MyCommunities/><ForYou/></>,
 chats:()=><><Notifications/><MyEvents/></>,
 me:()=><><MyEvents/><Notifications/></>,
 inbox:()=><MyEvents/>,
};

/** The column itself, for the shell (`current` — the section the shell highlights). */
export function ContextPanel({current}:{current:string}){
 const {t}=useI18n();const navigate=useNavigate();
 return <ContextColumn label={t('fe.ctx.label')} foot={{text:'KINHAZE · 18+',links:[{label:t('fe.ctx.help'),onClick:()=>navigate('/n/help')}]}}>
  {BLOCKS[ctxTab(current)]()}
 </ContextColumn>;
}
