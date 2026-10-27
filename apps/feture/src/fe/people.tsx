import {useCallback,useEffect,useRef,useState} from 'react';
import {Link,useNavigate,useParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Icon} from '../feture/components/Icon';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {ActionButton,Avatar,ScreenHeader,StateCard} from './components';
import {useFe} from './session';

/** Slice F (V21 D03–D09) plus people search (F2): Discover cards from the server's mutual pool, like / pass,
 * «It's mutual» → chat, incoming likes, nickname search and another person's profile. The client shows only what
 * the server returned: no invented matches, counters or scores. */
const media=z.object({src:z.record(z.string(),z.string()).nullable(),pending:z.boolean().optional()}).passthrough();
const card=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),ages:z.array(z.number()),
 city:z.object({ru:z.string().nullable(),en:z.string().nullable()}).nullable(),avatar:media.nullable(),likedMe:z.boolean(),shared:z.number()});
type Card=z.infer<typeof card>;
const deck=z.object({ok:z.literal(true),off:z.boolean(),items:z.array(card)});
const decided=z.object({ok:z.literal(true),decision:z.enum(['like','pass']),state:z.string().optional(),conversationId:z.uuid().optional()}).passthrough();
const list=z.object({ok:z.literal(true),items:z.array(card)});
const incoming=z.object({ok:z.literal(true),items:z.array(z.object({profile:card}).passthrough())}).passthrough();
const ok=z.object({ok:z.literal(true)}).passthrough();

function photo(c:{avatar:z.infer<typeof media>|null}){return c.avatar?.src?.card??c.avatar?.src?.full??c.avatar?.src?.thumb??null;}
function sub(c:Card,locale:string){return [c.ages.length?c.ages.join(' · '):null,c.city?(locale==='en'?c.city.en:c.city.ru):null].filter(Boolean).join(', ');}

export function PeopleTab(){
 const {t}=useI18n();const [tab,setTab]=useState<'discover'|'likes'|'search'>('discover');
 return <>
  <ScreenHeader title={t('fe.nav.people')}/>
  <div className="fe-body">
   <div className="fe-seg" role="tablist">{(['discover','likes','search'] as const).map(k=><button key={k} type="button" role="tab" aria-selected={tab===k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{t('fe.people.tab.'+k)}</button>)}</div>
   {tab==='discover'?<Discover/>:tab==='likes'?<Likes/>:<Search/>}
  </div>
 </>;
}

function Discover(){
 const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const [cards,setCards]=useState<Card[]|null>(null);const [off,setOff]=useState(false);const [error,setError]=useState<unknown>(null);
 const [match,setMatch]=useState<{card:Card,conversationId?:string}|null>(null);const [busy,setBusy]=useState(false);
 const load=useCallback(()=>{setError(null);setCards(null);call('discover.deck',{limit:10},deck).then(r=>{setOff(r.off);setCards(r.items);}).catch(setError);},[call]);
 useEffect(()=>{load();},[load]);
 const decide=async(c:Card,decision:'like'|'pass')=>{
  if(busy)return;setBusy(true);
  try{
   const r=await call('discover.decide',{opId:newOpId(),profileId:c.id,decision},decided);
   setCards(list=>list?.filter(x=>x.id!==c.id)??null);
   if(r.state==='matched')setMatch({card:c,...(r.conversationId?{conversationId:r.conversationId}:{})});
  }catch(e){setError(e);}finally{setBusy(false);}
 };
 if(match)return <StateCard icon="heart" title={t('fe.people.match')} text={t('fe.people.matchText').replace('{name}',match.card.name||'@'+match.card.handle)}
  action={<div className="fe-row"><ActionButton onClick={()=>navigate(match.conversationId?'/n/chats/'+match.conversationId:'/n/chats')}>{t('fe.people.write')}</ActionButton><ActionButton variant="text" onClick={()=>setMatch(null)}>{t('fe.people.later')}</ActionButton></div>}/>;
 if(error&&!cards)return <StateCard icon="close" role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)} action={<ActionButton variant="soft" onClick={load}>{t('fe.retry')}</ActionButton>}/>;
 if(cards===null)return <p className="fe-mute" role="status">{t('fe.loading')}</p>;
 if(off)return <StateCard icon="eye" title={t('fe.people.off')} text={t('fe.people.offText')} action={<ActionButton variant="soft" onClick={()=>navigate('/n/me')}>{t('fe.people.openMe')}</ActionButton>}/>;
 const c=cards[0];
 if(!c)return <StateCard icon="users" title={t('fe.people.empty')} text={t('fe.people.emptyText')} action={<ActionButton variant="soft" onClick={load}>{t('fe.people.refresh')}</ActionButton>}/>;
 const src=photo(c);
 return <article className="fe-dcard">
  <Link to={'/n/people/'+c.id} className="fe-dcard-photo">
   {src?<img src={src} alt=""/>:<Avatar name={c.name||c.handle||'?'} size="xl"/>}
   <div className="fe-dcard-info">
    <h2>{c.name||'@'+c.handle}</h2>
    {sub(c,locale)&&<p>{sub(c,locale)}</p>}
    <div className="fe-row">{c.likedMe&&<span className="fe-pill fe-pill-accent">{t('fe.people.likedMe')}</span>}{c.shared>0&&<span className="fe-pill">{t('fe.people.shared').replace('{n}',String(c.shared))}</span>}</div>
   </div>
  </Link>
  <div className="fe-dcard-actions">
   <button type="button" className="fe-round" onClick={()=>decide(c,'pass')} disabled={busy} aria-label={t('fe.people.pass')}><Icon name="close" size={26}/></button>
   <button type="button" className="fe-round fe-round-like" onClick={()=>decide(c,'like')} disabled={busy} aria-label={t('fe.people.like')}><Icon name="heart" size={28}/></button>
  </div>
 </article>;
}

function Row({c,locale,extra}:{c:Card,locale:string,extra?:React.ReactNode}){
 return <Link to={'/n/people/'+c.id} className="fe-prow">
  <Avatar name={c.name||c.handle||'?'} size="m" couple={c.kind==='couple'} src={c.avatar?.src?.thumb??null}/>
  <div><b>{c.name||'@'+c.handle}</b><span className="fe-mute">{[c.handle&&'@'+c.handle,sub(c,locale)].filter(Boolean).join(' · ')}</span></div>
  {extra}
 </Link>;
}

function Likes(){
 const {call}=useFe();const {t,locale}=useI18n();
 const [items,setItems]=useState<Card[]|null>(null);const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{setError(null);call('likes.incoming',{},incoming).then(r=>setItems(r.items.map(i=>i.profile))).catch(setError);},[call]);
 useEffect(()=>{load();},[load]);
 if(error)return <StateCard icon="close" role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)} action={<ActionButton variant="soft" onClick={load}>{t('fe.retry')}</ActionButton>}/>;
 if(items===null)return <p className="fe-mute" role="status">{t('fe.loading')}</p>;
 if(!items.length)return <StateCard icon="heart" title={t('fe.people.noLikes')} text={t('fe.people.noLikesText')}/>;
 return <div className="fe-list">{items.map(c=><Row key={c.id} c={c} locale={locale}/>)}</div>;
}

function Search(){
 const {call}=useFe();const {t,locale}=useI18n();
 const [q,setQ]=useState('');const [items,setItems]=useState<Card[]|null>(null);const [error,setError]=useState<unknown>(null);
 useEffect(()=>{
  setError(null);if(q.trim().length<2){setItems(null);return;}
  const ctl=new AbortController();const timer=setTimeout(()=>call('people.search',{q:q.trim()},list,{signal:ctl.signal}).then(r=>setItems(r.items)).catch(e=>{if(!ctl.signal.aborted)setError(e);}),300);
  return ()=>{clearTimeout(timer);ctl.abort();};
 },[q,call]);
 return <>
  <input className="fe-inp" type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder={t('fe.people.searchPh')} aria-label={t('fe.people.searchPh')} autoCapitalize="off" spellCheck={false}/>
  {error?<p className="fe-alert" role="alert">{feErrorMessage(error,t)}</p>
   :items===null?<p className="fe-fhint">{t('fe.people.searchHint')}</p>
   :!items.length?<p className="fe-mute">{t('fe.people.nobody')}</p>
   :<div className="fe-list">{items.map(c=><Row key={c.id} c={c} locale={locale}/>)}</div>}
 </>;
}

const profileRes=z.object({ok:z.literal(true),profile:z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),bio:z.string(),
 age:z.number().nullable(),city:z.object({ru:z.string().nullable(),en:z.string().nullable()}).nullable(),avatar:media.nullable(),photos:z.array(media),details:z.record(z.string(),z.unknown())}).passthrough()});
export function PersonScreen(){
 const {id=''}=useParams();const {call}=useFe();const {t,locale}=useI18n();
 const [p,setP]=useState<z.infer<typeof profileRes>['profile']|null>(null);const [error,setError]=useState<unknown>(null);
 const [following,setFollowing]=useState<boolean|null>(null);const [note,setNote]=useState('');const [busy,setBusy]=useState(false);
 const op=useRef(newOpId());
 const load=useCallback(()=>{setError(null);call('profile.get',{profileId:id},profileRes).then(r=>setP(r.profile)).catch(setError);
},[call,id]);
 useEffect(()=>{load();},[load]);
 const follow=async()=>{setBusy(true);const on=!following;try{await call('follow.set',{opId:newOpId(),profileId:id,on},ok);setFollowing(on);}catch(e){setNote(feErrorMessage(e,t));}finally{setBusy(false);}};
 const like=async()=>{setBusy(true);setNote('');try{const r=await call('like.send',{opId:op.current,profileId:id,source:'profile'},ok);setNote(r.state==='matched'?t('fe.people.match'):t('fe.people.liked'));}catch(e){setNote(feErrorMessage(e,t));op.current=newOpId();}finally{setBusy(false);}};
 return <>
  <ScreenHeader title={p?.name||(p?.handle?'@'+p.handle:'')} back/>
  <div className="fe-body">
   {error?<StateCard icon="lock" title={t('fe.feed.unavailable')} text={feErrorMessage(error,t)}/>
    :!p?<p className="fe-mute" role="status">{t('fe.loading')}</p>
    :<>
     <section className="fe-me-card">
      <Avatar name={p.name||p.handle||'?'} size="xl" couple={p.kind==='couple'} src={photo(p)}/>
      <div><h2>{p.name||'@'+p.handle}</h2><p className="fe-mute">{[p.handle&&'@'+p.handle,p.age&&t('fe.me.age').replace('{age}',String(p.age)),p.city&&(locale==='en'?p.city.en:p.city.ru)].filter(Boolean).join(' · ')}</p></div>
     </section>
     <div className="fe-row">
      <ActionButton size="md" variant={following?'soft':'primary'} onClick={follow} disabled={busy}>{following?t('fe.people.unfollow'):t('fe.people.follow')}</ActionButton>
      <ActionButton size="md" variant="soft" icon="heart" onClick={like} disabled={busy}>{t('fe.people.like')}</ActionButton>
     </div>
     {note&&<p className="fe-okbox" role="status">{note}</p>}
     {p.bio&&<p className="fe-post-body">{p.bio}</p>}
     {p.photos.length>1&&<div className="fe-photos">{p.photos.filter(ph=>ph.src).map((ph,i)=><figure key={i} className="fe-photo"><img src={ph.src?.card??ph.src?.thumb} alt=""/></figure>)}</div>}
    </>}
  </div>
 </>;
}
