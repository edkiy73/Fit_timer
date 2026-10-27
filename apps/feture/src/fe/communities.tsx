import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate,useParams,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Plus,Calendar,CircleCheck,Clock,Globe,Link as LinkIcon,Lock,MapPin,Ticket,Users,Video,X,ChevronLeft,Star,Check,Ban} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Av,Bar,Btn,Empty,Seg,View,plate} from './ui';
import {useFe} from './session';
import {when} from './feed';
import {CommunityHostEntry,CommunityJoin,DiscussionHostTools,EventAnnouncements,EventApplication,EventHostEntry,isCommunityHost} from './host';

/** Slice D (V21 C01, C03, E03) with the prototype's markup: community catalogue and page (discussions, rules,
 * join), events catalogue and event page (RSVP; the exact address or link only for admitted people — server). */
const card=z.object({id:z.uuid(),name:z.string(),topics:z.array(z.string()),privacy:z.string(),members:z.number(),joined:z.boolean(),plate:z.string().nullable().optional()});
const catalog=z.object({ok:z.literal(true),items:z.array(card),next:z.string().nullable()});
const community=z.object({id:z.uuid(),name:z.string(),description:z.string(),topics:z.array(z.string()),privacy:z.string(),rules:z.array(z.string()),members:z.number(),
 me:z.object({role:z.string(),state:z.string()}).nullable(),request:z.object({id:z.uuid()}).nullable(),joinQuestion:z.string().nullable(),state:z.string().optional()}).passthrough();
const commRes=z.object({ok:z.literal(true),community});
const disc=z.object({id:z.uuid(),title:z.string().nullable(),excerpt:z.string(),pinned:z.boolean(),published_at:z.string().nullable(),replies:z.number()});
const discRes=z.object({ok:z.literal(true),locked:z.boolean(),items:z.array(disc)});
const ev=z.object({id:z.uuid(),title:z.string(),kind:z.string(),format:z.enum(['online','offline']),area:z.string().nullable(),starts_at:z.string(),ends_at:z.string(),
 price:z.object({kind:z.string()}).passthrough(),requires_application:z.boolean(),state:z.string()});
const evList=z.object({ok:z.literal(true),items:z.array(ev),next:z.string().nullable()});
const event=z.object({id:z.uuid(),title:z.string(),kind:z.string(),description:z.string(),format:z.enum(['online','offline']),area:z.string().nullable(),tz:z.string(),
 startsAt:z.string(),endsAt:z.string(),price:z.object({kind:z.string(),amount:z.number().optional(),currency:z.string().optional()}).passthrough(),requiresApplication:z.boolean(),
 requirements:z.string().nullable(),state:z.string(),past:z.boolean(),going:z.number(),interested:z.number(),exactAddress:z.string().nullable(),joinUrl:z.string().nullable(),locked:z.boolean(),
 organizer:z.object({id:z.uuid(),name:z.string().nullable(),handle:z.string().nullable()}).passthrough().nullable().optional(),
 me:z.object({rsvp:z.string().nullable().optional()}).passthrough()}).passthrough();
const evRes=z.object({ok:z.literal(true),event});
const topicsRes=z.object({ok:z.literal(true),topics:z.array(z.object({id:z.string(),ru:z.string(),en:z.string()}).passthrough())});
const ok=z.object({ok:z.literal(true)}).passthrough();

function useTopics(){
 const {call}=useFe();const [topics,setTopics]=useState<z.infer<typeof topicsRes>['topics']>([]);
 useEffect(()=>{call('catalog.get',{},topicsRes,{asAccount:true}).then(r=>setTopics(r.topics)).catch(()=>{});},[call]);
 return topics;
}
const plural=(n:number,ru:[string,string,string],en:[string,string],locale:string)=>{
 if(locale==='en')return `${n} ${n===1?en[0]:en[1]}`;
 const m=n%10,h=n%100;return `${n} ${m===1&&h!==11?ru[0]:m>=2&&m<=4&&(h<12||h>14)?ru[1]:ru[2]}`;
};

export function CommunitiesTab(){
 const {t}=useI18n();const [tab,setTab]=useState<'discover'|'events'>('discover');
 return <>
  <Bar title={t('fe.nav.communities')}/>
  <View>
   <Seg small={false} value={tab} onChange={setTab} options={[{id:'discover',label:t('fe.comm.catalog')},{id:'events',label:t('fe.comm.events')}]}/>
   {tab==='discover'?<Catalog/>:<Events/>}
  </View>
 </>;
}

/** `collectionShortcut()` — «Мои сообщества» / «Мои события» and the «+» that creates one. */
function MyShortcut({kind}:{kind:'communities'|'events'}){
 const {t}=useI18n();const navigate=useNavigate();const {acting}=useFe();const couple=acting?.kind==='couple';
 const k=kind==='communities'?'fe.cc':'fe.ce';const Icon=kind==='communities'?Users:Calendar;
 return <div className="myev">
  <button type="button" className="myev-main" onClick={()=>navigate('/n/me?layer=mine&part='+kind)}><span className="ico g"><Icon/></span><span className="tx"><b>{t(k+(couple?'.mineCouple':'.mine'))}</b></span></button>
  <button type="button" className="ibtn add" aria-label={t(k+'.create')} onClick={()=>navigate(kind==='communities'?'/n/communities/new':'/n/events/new')}><Plus/></button>
 </div>;
}

function Catalog(){
 const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const topics=useTopics();
 const [topic,setTopic]=useState('');const [items,setItems]=useState<z.infer<typeof card>[]|null>(null);const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{setError(null);setItems(null);call('community.catalog',topic?{topics:[topic]}:{},catalog).then(r=>setItems(r.items)).catch(setError);},[call,topic]);
 useEffect(()=>{load();},[load]);
 const tname=(id:string)=>{const x=topics.find(v=>v.id===id);return x?(locale==='en'?x.en:x.ru):id;};
 return <>
  <MyShortcut kind="communities"/>
  <div className="filterline"><div className="chips scroll">
   <button type="button" className={'chip filter'+(topic===''?' on':'')} aria-pressed={topic===''} onClick={()=>setTopic('')}>{t('fe.comm.allTopics')}</button>
   {topics.slice(0,12).map(x=><button key={x.id} type="button" className={'chip filter'+(topic===x.id?' on':'')} aria-pressed={topic===x.id} onClick={()=>setTopic(x.id)}>{locale==='en'?x.en:x.ru}</button>)}
  </div></div>
  {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
   :items===null?<p className="note" role="status">{t('fe.loading')}</p>
   :!items.length?<Empty icon={Globe} title={t('fe.comm.empty')} text={t('fe.comm.emptyText')}/>
   :items.map(c=><button key={c.id} type="button" className="cmc" onClick={()=>navigate('/n/communities/'+c.id)}>
    <div className="cv" style={{position:'relative'}}><div className="plate" style={plate(c.id)}/></div>
    <div className="tx"><b>{c.name}</b><small>{c.topics.map(tname).map(x=>'#'+x).join(' ')}</small>
     <div className="meta"><span>{plural(c.members,['участник','участника','участников'],['member','members'],locale)}</span>{c.privacy!=='open'&&<><span>·</span><span>{t('fe.comm.closed')}</span></>}
      {c.joined&&<span className="pill ok"><CircleCheck/>{t('fe.comm.member')}</span>}</div>
    </div>
   </button>)}
 </>;
}

export function CommunityScreen(){
 const {id=''}=useParams();const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const topics=useTopics();const invite=useSearchParams()[0].get('invite')??undefined;
 const [c,setC]=useState<z.infer<typeof community>|null>(null);const [discs,setDiscs]=useState<z.infer<typeof discRes>|null>(null);const [error,setError]=useState<unknown>(null);
 const [tab,setTab]=useState<'disc'|'events'|'rules'>('disc');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const load=useCallback(()=>{setError(null);Promise.all([call('community.get',{communityId:id,...(invite?{invite}:{})},commRes),call('community.discussions',{communityId:id},discRes).catch(e=>{if(invite)return {ok:true as const,locked:true,items:[]};throw e;})])
  .then(([a,b])=>{setC(a.community);setDiscs(b);}).catch(setError);},[call,id,invite]);
 useEffect(()=>{load();},[load]);
 const leave=async()=>{setBusy(true);setFailure('');try{await call('community.leave',{opId:newOpId(),communityId:id},ok);load();}catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy(false);}};
 const tname=(x:string)=>{const v=topics.find(o=>o.id===x);return v?(locale==='en'?v.en:v.ru):x;};
 const member=c?.me?.state==='active';const host=isCommunityHost(c);
 return <>
  <header className="bar overlay ev-bar">
   <button type="button" className="ibtn glass" aria-label={t('fe.back')} onClick={()=>navigate('/n/communities')}><ChevronLeft/></button>
   <b className="ev-bar-t" aria-hidden="true">{c?.name}</b><span style={{flex:1}}/>
  </header>
  <div className="view top0"><div className="wrap">
   {error?<Empty icon={Lock} title={t('fe.feed.unavailable')} text={feErrorMessage(error,t)}/>
    :!c?<p className="note" role="status">{t('fe.loading')}</p>
    :<>
     <div className="cm-hero"><div className="plate" style={plate(c.id)}/></div>
     <div className="cm-head"><div className="cv" style={{position:'relative'}}><div className="plate" style={plate(c.id+'x')}/></div><h2 tabIndex={-1}>{c.name}</h2>
      <div className="cm-meta"><span><Users/><b>{plural(c.members,['участник','участника','участников'],['member','members'],locale)}</b></span><span>{c.privacy==='open'?<Globe/>:<Lock/>}{t('fe.comm.privacy.'+c.privacy)}</span></div></div>
     <div className="md bio cdesc"><p>{c.description}</p></div>
     <div className="chips mt12">{c.topics.map(x=><span key={x} className="chip tag">#{tname(x)}</span>)}</div>
     {member?<div className="row g8 mt16 cm-act">
      {host?<CommunityHostEntry c={c}/>:<><span className="pill ok"><CircleCheck/>{t('fe.comm.member')}</span>{c.me?.role==='member'&&<Btn kind="text" size="sm" auto onClick={leave} disabled={busy}>{t('fe.comm.leave')}</Btn>}</>}
     </div>:<CommunityJoin c={c} invite={invite} onChange={load}/>}
     {failure&&<div className="alert err" role="alert"><span>{failure}</span></div>}
     <div style={{height:14}}/>
     <div className="tabs14" role="tablist">{(['disc','events','rules'] as const).map(k=><button key={k} type="button" role="tab" aria-selected={tab===k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{t('fe.comm.tab.'+k)}</button>)}</div>
     {tab==='disc'?(discs?.locked?<Empty icon={Lock} title={t('fe.comm.locked')} text={t('fe.comm.lockedText')}/>:<>
      {member&&<div className="composer c-composer"><button type="button" className="cmp-main" onClick={()=>navigate('/n/feed/new?community='+c.id)}><span>{t('fe.comm.newTopic')}</span></button></div>}
      {discs&&discs.items.length===0?<Empty icon={Users} title={t('fe.comm.noDisc')} text={member?t('fe.comm.noDiscMember'):t('fe.comm.noDiscGuest')}/>
       :<div className="card list">{discs?.items.map(d=><div key={d.id}><button type="button" className="disc" onClick={()=>navigate('/n/feed/post/'+d.id)}>
        {d.pinned&&<span className="pill v" style={{marginBottom:6}}>{t('fe.comm.pinned')}</span>}
        {d.title&&<b>{d.title}</b>}<p>{d.excerpt}</p><small className="note">{when(d.published_at,locale)} · {t('fe.feed.repliesCount').replace('{n}',String(d.replies))}</small>
       </button>{host&&<DiscussionHostTools postId={d.id} pinned={d.pinned} onDone={load}/>}</div>)}</div>}
     </>)
     :tab==='events'?<EventList communityId={c.id}/>
     :<div className="card">{c.rules.map((r,i)=><div key={i} className="fact"><i className="v"><Check/></i><span>{r}</span></div>)}</div>}
    </>}
  </div></div>
 </>;
}

function EventCard({e}:{e:z.infer<typeof ev>}){
 const {t,locale}=useI18n();const navigate=useNavigate();const d=new Date(e.starts_at);
 return <button type="button" className="evc" onClick={()=>navigate('/n/events/'+e.id)}>
  <div className="cv"><div className="plate" style={plate(e.id)}/><div className="date"><b>{d.getDate()}</b><small>{d.toLocaleDateString(locale==='en'?'en':'ru',{month:'short'})}</small></div>
   <div className="fmt"><span>{e.format==='online'?<Video/>:<MapPin/>}{e.format==='online'?t('fe.ev.online'):e.area}</span></div>
   {e.state==='cancelled'&&<div className="my"><span className="pill err">{t('fe.ev.cancelled')}</span></div>}</div>
  <div className="bd"><small>{t('fe.ev.kind.'+e.kind)}</small><b>{e.title}</b>
   <div className="meta"><span><Clock/>{d.toLocaleTimeString(locale==='en'?'en':'ru',{hour:'2-digit',minute:'2-digit'})}</span><span><Ticket/>{e.price.kind==='free'?t('fe.ev.free'):t('fe.ev.paid')}</span></div></div>
 </button>;
}

function EventList({communityId}:{communityId?:string}){
 const {call}=useFe();const {t}=useI18n();
 const [format,setFormat]=useState<'all'|'offline'|'online'>('all');const [items,setItems]=useState<z.infer<typeof ev>[]|null>(null);const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{setError(null);setItems(null);call('event.catalog',{format,...(communityId?{communityId}:{})},evList).then(r=>setItems(r.items)).catch(setError);},[call,format,communityId]);
 useEffect(()=>{load();},[load]);
 return <>
  {!communityId&&<MyShortcut kind="events"/>}
  {!communityId&&<div className="filterline"><div className="chips scroll">{(['all','offline','online'] as const).map(f=><button key={f} type="button" className={'chip filter'+(format===f?' on':'')} aria-pressed={format===f} onClick={()=>setFormat(f)}>{t('fe.ev.format.'+f)}</button>)}</div></div>}
  {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
   :items===null?<p className="note" role="status">{t('fe.loading')}</p>
   :!items.length?<Empty icon={Calendar} title={t('fe.ev.empty')} text={t('fe.ev.emptyText')}/>
   :items.map(e=><EventCard key={e.id} e={e}/>)}
 </>;
}
function Events(){return <EventList/>;}

export function EventScreen(){
 const {id=''}=useParams();const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const [e,setE]=useState<z.infer<typeof event>|null>(null);const [error,setError]=useState<unknown>(null);const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const op=useRef(newOpId());
 const load=useCallback(()=>{setError(null);call('event.get',{eventId:id},evRes).then(r=>setE(r.event)).catch(setError);},[call,id]);
 useEffect(()=>{load();},[load]);
 const rsvp=async(status:'interested'|'going'|'not_going'|null)=>{setBusy(true);setFailure('');try{await call('event.rsvp',{opId:op.current,eventId:id,status},ok);op.current=newOpId();load();}catch(x){setFailure(feErrorMessage(x,t));op.current=newOpId();}finally{setBusy(false);}};
 const fmt=(iso:string,o:Intl.DateTimeFormatOptions)=>new Date(iso).toLocaleString(locale==='en'?'en':'ru',o);
 return <>
  <header className="bar overlay ev-bar">
   <button type="button" className="ibtn glass" aria-label={t('fe.back')} onClick={()=>navigate(-1)}><ChevronLeft/></button>
   <b className="ev-bar-t" aria-hidden="true">{e?.title}</b><span style={{flex:1}}/>
  </header>
  <div className="view top0"><div className="wrap">
   {error?<Empty icon={Lock} title={t('fe.feed.unavailable')} text={feErrorMessage(error,t)}/>
    :!e?<p className="note" role="status">{t('fe.loading')}</p>
    :<>
     <div className="ev-hero"><div className="plate" style={plate(e.id)}/><div className="pc-info">
      <div className="row g8" style={{marginBottom:10}}><span className="pill" style={{background:'rgba(255,255,255,.2)',color:'#fff'}}>{e.format==='online'?<Video/>:<MapPin/>}{e.format==='online'?t('fe.ev.online'):t('fe.ev.offline')}</span><span className="pill" style={{background:'rgba(255,255,255,.2)',color:'#fff'}}>{t('fe.ev.kind.'+e.kind)}</span></div>
      <h2 className="ev-title" tabIndex={-1}>{e.title}</h2>
      {e.me.rsvp&&<div className="ev-hero-st"><span className="pill v">{t('fe.ev.rsvp.'+e.me.rsvp)}</span></div>}
     </div></div>
     <EventHostEntry e={e}/>
     {e.organizer&&<div className="card list mt16"><button type="button" className="li" onClick={()=>navigate('/n/people/'+e.organizer!.id)}><Av name={e.organizer.name||e.organizer.handle||'?'} seed={e.organizer.id} size="sm"/><span className="tx"><b>{e.organizer.name||'@'+e.organizer.handle}</b><small>{t('fe.ev.organizer')}</small></span></button></div>}
     {e.state==='cancelled'?<div className="alert err mt12"><Ban/><span>{t('fe.ev.cancelledText')}</span></div>
      :!e.past&&!e.requiresApplication&&<section className="rsvp-box"><div className="rsvp-h"><b>{t('fe.ev.question')}</b>{e.me.rsvp&&<Btn kind="text" auto onClick={()=>rsvp(null)} disabled={busy}>{t('fe.ev.clear')}</Btn>}</div>
       <div className={'rsvp'+(e.me.rsvp?' has':'')} role="radiogroup" aria-label={t('fe.ev.question')}>
        {([['interested','r-interested',Star],['going','r-going',CircleCheck],['not_going','r-not',X]] as const).map(([v,cls,Ic])=>
         <button key={v} type="button" className={cls+(e.me.rsvp===v?' on':'')} role="radio" aria-checked={e.me.rsvp===v} onClick={()=>rsvp(v)} disabled={busy}><Ic/><span>{t('fe.ev.rsvp.'+v)}</span></button>)}
       </div></section>}
     {failure&&<div className="alert err" role="alert"><span>{failure}</span></div>}
     <EventApplication e={e} onChange={load}/>
     <div className="card list mt12">
      <div className="li"><span className="ico l"><Calendar/></span><span className="tx"><b>{fmt(e.startsAt,{weekday:'short',day:'numeric',month:'long'})}</b><small>{fmt(e.startsAt,{hour:'2-digit',minute:'2-digit'})}–{fmt(e.endsAt,{hour:'2-digit',minute:'2-digit'})} {t('fe.ev.yourTime')}</small></span></div>
      <div className="li"><span className="ico v">{e.format==='online'?<Video/>:<MapPin/>}</span><span className="tx"><b>{e.format==='online'?t('fe.ev.online'):e.area}</b>
       <small>{e.joinUrl?<a href={e.joinUrl} target="_blank" rel="noreferrer noopener"><LinkIcon/> {t('fe.ev.join')}</a>:e.exactAddress??(e.locked?(e.format==='online'?t('fe.ev.linkLocked'):t('fe.ev.addressLocked')):'')}</small></span>{e.locked&&<span className="lockpill"><Lock/></span>}</div>
      <div className="li"><span className="ico a"><Ticket/></span><span className="tx"><b>{e.price.kind==='free'?t('fe.ev.free'):`${e.price.amount??''} ${e.price.currency??''}`}</b></span></div>
     </div>
     <div className="sec">{t('fe.ev.about')}</div><div className="md bio"><p>{e.description}</p></div>
     {e.requirements&&<><div className="sec">{t('fe.ev.requirements')}</div><div className="card"><p className="note">{e.requirements}</p></div></>}
     <EventAnnouncements items={e.announcements}/>
     <p className="note mt12">{t('fe.ev.counts').replace('{going}',String(e.going)).replace('{interested}',String(e.interested))}</p>
    </>}
  </div></div>
 </>;
}
