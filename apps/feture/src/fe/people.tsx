import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate,useParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Eye,Heart,Lock,MapPin,Search as SearchIcon,Undo2,Users,X} from 'lucide-react';
import {Av,Bar,Btn,Empty,Seg,View} from './ui';
import {useFe} from './session';
import {PrivateOf} from './private';

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
  <header className="bar dating-bar">
   <Seg small={false} value={tab} onChange={setTab} options={(['discover','likes','search'] as const).map(id=>({id,label:t('fe.people.tab.'+id)}))}/>
  </header>
  {tab==='discover'?<Discover/>:<View>{tab==='likes'?<Likes/>:<Search/>}</View>}
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
 const box=(node:React.ReactNode)=><View>{node}</View>;
 if(match)return box(<Empty icon={Heart} title={t('fe.people.match')} text={t('fe.people.matchText').replace('{name}',match.card.name||'@'+match.card.handle)}>
  <Btn onClick={()=>navigate(match.conversationId?'/n/chats/'+match.conversationId:'/n/chats')}>{t('fe.people.write')}</Btn><Btn kind="text" onClick={()=>setMatch(null)}>{t('fe.people.later')}</Btn></Empty>);
 if(error&&!cards)return box(<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>);
 if(cards===null)return box(<p className="note" role="status">{t('fe.loading')}</p>);
 if(off)return box(<Empty icon={Eye} title={t('fe.people.off')} text={t('fe.people.offText')}><Btn kind="soft" onClick={()=>navigate('/n/me')}>{t('fe.people.openMe')}</Btn></Empty>);
 const [c,next]=cards;
 if(!c)return box(<Empty icon={Users} title={t('fe.people.empty')} text={t('fe.people.emptyText')}><Btn kind="soft" onClick={load}>{t('fe.people.refresh')}</Btn></Empty>);
 const card=(x:Card,top:boolean)=>{const src=photo(x);const name=x.name||'@'+x.handle;
  return <article key={x.id} className={'pc '+(top?'top':'next')} aria-label={top?name:undefined} aria-hidden={top?undefined:true} inert={top?undefined:true}>
   <div className="pc-ph" onClick={()=>top&&navigate('/n/people/'+x.id)}>
    {src?<><img className="mbg" src={src} alt="" aria-hidden="true" draggable={false}/><img src={src} alt={name} draggable={false}/></>:<div className="fe-pc-ini"><Av name={name} seed={x.id} size="xl"/></div>}
    {(x.likedMe||x.shared>0)&&<div className="pc-tags">{x.likedMe&&<span className="pc-liked"><Heart/>{t('fe.people.likedMe')}</span>}{x.shared>0&&<span className="pc-score"><b>{x.shared}</b><small>{t('fe.people.sharedTopics')}</small></span>}</div>}
    <div className="pc-info">
     <h2 className="pc-name"><span className="pcn">{name}</span>{x.ages.length>0&&<span>{x.ages.join(' · ')}</span>}</h2>
     {x.city&&<div className="pc-who"><span className="pl"><MapPin/>{locale==='en'?x.city.en:x.city.ru}</span></div>}
    </div>
   </div>
  </article>;};
 return <div className="view deckmode"><div className="deck">
  {next&&card(next,false)}{card(c,true)}
  <div className="acts onphoto">
   <button type="button" className="act undo off" aria-label={t('fe.people.undo')} disabled><Undo2/></button>
   <button type="button" className="act pass" aria-label={t('fe.people.pass')} onClick={()=>decide(c,'pass')} disabled={busy}><X/></button>
   <button type="button" className="act like" aria-label={t('fe.people.like')} onClick={()=>decide(c,'like')} disabled={busy}><Heart/></button>
  </div>
 </div></div>;
}

function Row({c,locale}:{c:Card,locale:string}){
 const navigate=useNavigate();
 return <button type="button" className="li" onClick={()=>navigate('/n/people/'+c.id)}>
  <Av name={c.name||c.handle||'?'} seed={c.id} src={c.avatar?.src?.thumb}/>
  <span className="tx"><b>{c.name||'@'+c.handle}</b><small>{[c.handle&&'@'+c.handle,sub(c,locale)].filter(Boolean).join(' · ')}</small></span>
 </button>;
}

function Likes(){
 const {call}=useFe();const {t,locale}=useI18n();
 const [items,setItems]=useState<Card[]|null>(null);const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{setError(null);call('likes.incoming',{},incoming).then(r=>setItems(r.items.map(i=>i.profile))).catch(setError);},[call]);
 useEffect(()=>{load();},[load]);
 if(error)return <Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>;
 if(items===null)return <p className="note" role="status">{t('fe.loading')}</p>;
 if(!items.length)return <Empty icon={Heart} title={t('fe.people.noLikes')} text={t('fe.people.noLikesText')}/>;
 return <div className="card list">{items.map(c=><Row key={c.id} c={c} locale={locale}/>)}</div>;
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
  <div className="field"><div className="inwrap"><SearchIcon/><input className="inp" type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder={t('fe.people.searchPh')} aria-label={t('fe.people.searchPh')} autoCapitalize="off" spellCheck={false}/></div></div>
  {error?<div className="alert err" role="alert"><span>{feErrorMessage(error,t)}</span></div>
   :items===null?<p className="note">{t('fe.people.searchHint')}</p>
   :!items.length?<Empty icon={SearchIcon} title={t('fe.people.nobody')}/>
   :<div className="card list">{items.map(c=><Row key={c.id} c={c} locale={locale}/>)}</div>}
 </>;
}

const profileRes=z.object({ok:z.literal(true),profile:z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),bio:z.string(),
 age:z.number().nullable(),city:z.object({ru:z.string().nullable(),en:z.string().nullable()}).nullable(),avatar:media.nullable(),photos:z.array(media),details:z.record(z.string(),z.unknown())}).passthrough()});
export function PersonScreen(){
 const {id=''}=useParams();const {call}=useFe();const {t,locale}=useI18n();
 const [p,setP]=useState<z.infer<typeof profileRes>['profile']|null>(null);const [error,setError]=useState<unknown>(null);
 const [following,setFollowing]=useState(false);const [note,setNote]=useState('');const [busy,setBusy]=useState(false);
 const op=useRef(newOpId());
 const load=useCallback(()=>{setError(null);call('profile.get',{profileId:id},profileRes).then(r=>setP(r.profile)).catch(setError);},[call,id]);
 useEffect(()=>{load();},[load]);
 const follow=async()=>{setBusy(true);const on=!following;try{await call('follow.set',{opId:newOpId(),profileId:id,on},ok);setFollowing(on);}catch(e){setNote(feErrorMessage(e,t));}finally{setBusy(false);}};
 const like=async()=>{setBusy(true);setNote('');try{const r=await call('like.send',{opId:op.current,profileId:id,source:'profile'},ok);setNote(r.state==='matched'?t('fe.people.match'):t('fe.people.liked'));}catch(e){setNote(feErrorMessage(e,t));op.current=newOpId();}finally{setBusy(false);}};
 const name=p?.name||(p?.handle?'@'+p.handle:'');
 return <>
  <Bar title={name} back/>
  <View>
   {error?<Empty icon={Lock} title={t('fe.feed.unavailable')} text={feErrorMessage(error,t)}/>
    :!p?<p className="note" role="status">{t('fe.loading')}</p>
    :<>
     {photo(p)?<div className="hero"><img className="mbg" src={photo(p)!} alt="" aria-hidden="true" draggable={false}/><img src={photo(p)!} alt={name} draggable={false}/>
      <div className="pc-info"><h2 className="pc-name" tabIndex={-1}><span className="pcn">{name}</span>{p.age?<span>{p.age}</span>:null}</h2>{p.city&&<div className="pc-who"><span className="pl"><MapPin/>{locale==='en'?p.city.en:p.city.ru}</span></div>}</div></div>
      :<div className="empty"><Av name={name} seed={p.id} size="xl"/><h3>{name}{p.age?', '+p.age:''}</h3>{p.city&&<p>{locale==='en'?p.city.en:p.city.ru}</p>}</div>}
     <div className="p-acts">
      <Btn kind={following?'soft':'primary'} onClick={follow} disabled={busy}>{following?t('fe.people.unfollow'):t('fe.people.follow')}</Btn>
      <Btn kind="soft" icon={Heart} onClick={like} disabled={busy}>{t('fe.people.like')}</Btn>
     </div>
     {note&&<div className="alert ok" role="status"><span>{note}</span></div>}
     {p.bio&&<div className="p-bio"><div className="md bio"><p>{p.bio}</p></div></div>}
     <PrivateOf profileId={p.id}/>
     {p.photos.length>1&&<section className="grp ph20"><div className="ph-slots">{p.photos.filter(ph=>ph.src).map((ph,i)=><div key={i} className={'mi'+(i===0?' big':'')}><img src={ph.src?.card??ph.src?.thumb} alt="" draggable={false}/></div>)}</div></section>}
    </>}
  </View>
 </>;
}
