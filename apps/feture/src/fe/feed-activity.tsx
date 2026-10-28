import {useCallback,useRef,useState,type ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Calendar,Users} from 'lucide-react';
import {ActivityCard,ActivityItem,ActivityTile,type ActThumb} from './kit';
import {mdPlain,personName,plural} from './post-parts';
import {when} from './feed';
import {useFe} from './session';

/* «Подписки» activity (V21 followStream / actCard): what the people I follow liked, whom they followed, which events
 * and communities they show. The server folds a burst into one card with up to 20 things and the full count. */

const actPerson=z.object({id:z.uuid(),kind:z.string(),handle:z.string().nullable(),name:z.string().nullable(),avatar:z.string().nullable().optional()}).passthrough();
export const activitySchema=z.object({kind:z.literal('activity'),id:z.string(),activity:z.enum(['likes','events','communities','follows']),actor:actPerson,count:z.number(),at:z.string(),
 /** The card's first moment (with `at` it names the card for activity.items). */ from:z.string().optional(),
 items:z.array(z.object({id:z.string()}).passthrough())});
const itemsPage=z.object({ok:z.literal(true),items:z.array(z.object({id:z.string()}).passthrough()),next:z.string().nullable()});
/** Pages read when a card is opened: enough for a month of anyone's activity, never an endless loop. */
const MAX_PAGES=10;
export type Act=z.infer<typeof activitySchema>;

const s=(v:unknown)=>typeof v==='string'?v:'';
const num=(v:unknown)=>typeof v==='number'?v:0;
/** «за 1 человеком», «за 5 людьми» — the instrumental case «следит за» needs. */
const people=(n:number,locale:string)=>locale==='en'?`${n} ${n===1?'person':'people'}`:`${n} ${n%10===1&&n%100!==11?'человеком':'людьми'}`;

/** The card line with the name in bold: «**Мира**: нравится 12 публикаций». */
function line(tpl:string,name:string):ReactNode{
 const [a,b]=tpl.split('⁣');return <>{a}<b>{name}</b>{b}</>;
}

/** One «Подписки» activity card: liked posts and people followed as a sideways strip of thumbnails, events and
 * communities as rows; ⋯ opens «Открыть профиль / Не показывать активность». Wording is the same for everyone
 * (no «он/она»): «Мира: нравится 12 публикаций», «Мира теперь следит за 9 людьми». */
export function ActivityCardOf({a,onMenu}:{a:Act,onMenu?:(()=>void)|undefined}){
 const {t,locale}=useI18n();const navigate=useNavigate();const {call}=useFe();
 // A card carries the newest 20 things; opening it («+N» / «Показать все») reads all of them (activity.items) once.
 const [all,setAll]=useState<Act['items']|null>(null);const [loading,setLoading]=useState(false);const asked=useRef(false);
 const openAll=useCallback(()=>{if(asked.current||!a.from||a.count<=a.items.length)return;asked.current=true;setLoading(true);
  const input={actorId:a.actor.id,activity:a.activity,from:a.from,to:a.at};
  void (async()=>{const got:Act['items']=[];let cursor:string|null=null;
   try{for(let i=0;i<MAX_PAGES;i++){const r:z.infer<typeof itemsPage>=await call('activity.items',{...input,...(cursor?{cursor}:{})},itemsPage);got.push(...r.items);cursor=r.next;if(!cursor)break;}}
   catch{/* what was read stays; the rest is named by «И ещё N» */}
   // Never fewer than the card already shows (things removed since are simply not there).
   if(got.length>a.items.length){const seen=new Set(got.map(x=>x.id));setAll([...got,...a.items.filter(x=>!seen.has(x.id))]);}
   setLoading(false);})();},[call,a]);
 const who=personName(a.actor);const n=a.count;const one=n===1;const M='⁣';
 const tpl=a.activity==='likes'?(one?t('fe.w3.act.likes1',{name:M}):t('fe.w3.act.likes',{name:M,n:plural(n,['публикация','публикации','публикаций'],['post','posts'],locale)}))
  :a.activity==='events'?(one?t('fe.w3.act.events1',{name:M}):t('fe.w3.act.events',{name:M,n:plural(n,['событие','события','событий'],['event','events'],locale)}))
  :a.activity==='communities'?(one?t('fe.w3.act.communities1',{name:M}):t('fe.w3.act.communities',{name:M,n:plural(n,['сообщество','сообщества','сообществ'],['community','communities'],locale)}))
  :one?t('fe.w3.act.follows1',{name:M}):t('fe.w3.act.follows',{name:M,n:people(n,locale)});
 const date=(v:unknown)=>v?new Date(s(v)).toLocaleString(locale==='en'?'en':'ru',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
 const strip=a.activity==='likes'||a.activity==='follows';
 const parts:{key:string,thumb:ActThumb,title:string,sub:string,label:string,go:string}[]=(all??a.items).map(x=>{
  if(a.activity==='likes'){
   const au=x.author as {name?:string|null,handle?:string|null}|undefined;const text=mdPlain(s(x.excerpt));const title=s(x.title)||text.slice(0,80)||t('fe.feed.post');
   const what=[x.article?t('fe.kit.act.article').toLowerCase():'',num(x.videos)?plural(num(x.videos),['видео','видео','видео'],['video','videos'],locale):'',num(x.photos)?plural(num(x.photos),['фото','фото','фото'],['photo','photos'],locale):'',
    x.poll?t('fe.kit.act.poll').toLowerCase():'',x.interests?t('fe.kit.act.interests').toLowerCase():''].filter(Boolean).join(' · ');
   const author=au?personName({name:au.name??null,handle:au.handle??null}):'';
   return {key:x.id,title,sub:[author,what].filter(Boolean).join(' · '),label:author?`${title} — ${author}`:title,go:'/n/feed/post/'+x.id,
    thumb:{src:s(x.thumb)||null,video:x.video===true,photos:num(x.photos),videos:num(x.videos),durationMs:typeof x.durationMs==='number'?x.durationMs:null,article:x.article===true,plate:s(x.plate)||null,poll:x.poll===true,interests:x.interests===true,text}};
  }
  if(a.activity==='events')return {key:x.id,title:s(x.title),sub:[date(x.startsAt),x.format==='online'?t('fe.w3.act.online'):''].filter(Boolean).join(' · '),label:s(x.title),go:'/n/events/'+x.id,
   thumb:{src:s(x.cover)||null,icon:Calendar}};
  if(a.activity==='communities')return {key:x.id,title:s(x.name),sub:plural(num(x.members),['участник','участника','участников'],['member','members'],locale),label:s(x.name),go:'/n/communities/'+x.id,
   thumb:{src:s(x.cover)||null,icon:Users}};
  const nm=personName({name:s(x.name)||null,handle:s(x.handle)||null});
  return {key:x.id,title:nm,sub:s(x.handle)?'@'+s(x.handle):'',label:nm,go:'/n/people/'+x.id,thumb:{person:{id:x.id,name:nm,avatar:s(x.avatar)||null}}};
 });
 const items=parts.map(p=><ActivityItem key={p.key} thumb={p.thumb} title={p.title} sub={p.sub||undefined} onClick={()=>navigate(p.go)}/>);
 const tiles=strip&&parts.length>1?parts.map(p=><ActivityTile key={p.key} thumb={p.thumb} label={p.label} onClick={()=>navigate(p.go)}/>):undefined;
 const rest=Math.max(0,n-parts.length);
 return <ActivityCard actor={{id:a.actor.id,name:who,avatar:a.actor.avatar??null}} text={line(tpl,who)} time={when(a.at,locale)} menuLabel={t('fe.more')} onMenu={onMenu}
  onActor={()=>navigate('/n/people/'+a.actor.id)} items={items} tiles={tiles} total={n} onOpen={openAll} loading={loading}
  more={tiles?t('fe.w3.act.more',{n}):t('fe.w3.act.moreN',{n:n-2})} less={t('fe.w3.act.less')} restText={rest?t('fe.w3.act.rest',{n:rest}):undefined}/>;
}
