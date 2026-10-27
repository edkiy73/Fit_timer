import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate,useParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Check,CheckCheck,ChevronLeft,Eye,MessageCircle,SendHorizontal,X} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Av,Bar,Btn,Empty,Seg,View} from './ui';
import {useFe} from './session';

/** Slice G (V21 H01, H02) with the prototype's markup. A conversation exists only after a mutual like (server).
 * Until realtime signals land, an open chat asks for new messages every few seconds. */
const media=z.object({src:z.record(z.string(),z.string()).nullable()}).passthrough();
const chat=z.object({id:z.uuid(),state:z.string(),side:z.object({id:z.uuid(),kind:z.enum(['person','couple'])}),newMatch:z.boolean(),
 other:z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),avatar:media.nullable()}),
 unread:z.number(),muted:z.boolean(),last:z.object({body:z.string(),media:z.boolean(),mode:z.string(),mine:z.boolean()}).nullable(),at:z.string()});
type Chat=z.infer<typeof chat>;
const list=z.object({ok:z.literal(true),items:z.array(chat)});
const msg=z.object({id:z.uuid(),seq:z.number(),mine:z.boolean(),body:z.string(),at:z.string(),
 media:z.object({ephemeral:z.boolean().optional(),mode:z.string().optional(),state:z.string().optional(),src:z.record(z.string(),z.string()).nullable().optional()}).passthrough().nullable().optional()});
type Msg=z.infer<typeof msg>;
const msgs=z.object({ok:z.literal(true),state:z.string(),items:z.array(msg),otherRead:z.number(),lastSeq:z.number()});
const ok=z.object({ok:z.literal(true)}).passthrough();
const opened=z.object({ok:z.literal(true),media:z.object({src:z.record(z.string(),z.string()).nullable()}).passthrough().nullable()}).passthrough();

const nameOf=(o:{name?:string|null,handle?:string|null})=>o.name||(o.handle?'@'+o.handle:'?');
function ago(iso:string,locale:string){const s=(Date.now()-Date.parse(iso))/1000;const ru=locale!=='en';
 if(s<3600)return Math.max(1,Math.floor(s/60))+(ru?' мин':' min');if(s<86400)return Math.floor(s/3600)+(ru?' ч':' h');
 return new Date(iso).toLocaleDateString(ru?'ru':'en',{day:'numeric',month:'short'});}

export function ChatsTab(){
 const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const [filter,setFilter]=useState<'all'|'me'|'couple'>('all');const [items,setItems]=useState<Chat[]|null>(null);const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{setError(null);call('chats.list',{filter},list,{asAccount:true}).then(r=>setItems(r.items)).catch(setError);},[call,filter]);
 useEffect(()=>{load();const id=setInterval(load,15000);return ()=>clearInterval(id);},[load]);
 const fresh=(items??[]).filter(c=>c.newMatch);const rows=(items??[]).filter(c=>!c.newMatch);
 const preview=(c:Chat)=>!c.last?t('fe.chats.say'):c.last.media?(c.last.mode!=='normal'?t('fe.chats.ephemeral'):t('fe.chats.photo')):(c.last.mine?t('fe.chats.you')+': ':'')+c.last.body;
 return <>
  <Bar title={t('fe.nav.chats')}/>
  <View>
   <Seg small={false} value={filter} onChange={setFilter} options={[{id:'all',label:t('fe.chats.all')},{id:'me',label:t('fe.chats.personal')},{id:'couple',label:t('fe.chats.couple')}]}/>
   {error&&!items?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :items===null?<p className="note" role="status">{t('fe.loading')}</p>
    :!items.length?<Empty icon={MessageCircle} title={t('fe.chats.empty')} text={t('fe.chats.emptyText')}><Btn kind="soft" onClick={()=>navigate('/n/people')}>{t('fe.chats.toPeople')}</Btn></Empty>
    :<>
     {fresh.length>0&&<><div className="sec">{t('fe.chats.newMatches')}</div>
      <div className="matches">{fresh.map(c=><button key={c.id} type="button" onClick={()=>navigate('/n/chats/'+c.id)}>
       <span className="ring2"><Av name={nameOf(c.other)} seed={c.other.id} src={c.other.avatar?.src?.thumb}/></span><span className="mn">{nameOf(c.other)}</span>
      </button>)}</div></>}
     {rows.map(c=><button key={c.id} type="button" className={'chat-row'+(c.unread?' unread':'')} onClick={()=>navigate('/n/chats/'+c.id)}>
      <Av name={nameOf(c.other)} seed={c.other.id} size="lg" src={c.other.avatar?.src?.thumb}/>
      <span className="tx"><b>{nameOf(c.other)}</b><small>{c.state==='ended'?t('fe.chats.ended'):preview(c)}</small></span>
      <span className="side2">{c.unread>0&&<span className="unr">{c.unread}</span>}<time>{ago(c.at,locale)}</time></span>
     </button>)}
    </>}
  </View>
 </>;
}

export function ChatScreen(){
 const {id=''}=useParams();const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const [meta,setMeta]=useState<Chat|null>(null);const [items,setItems]=useState<Msg[]>([]);const [state,setState]=useState('active');const [otherRead,setOtherRead]=useState(0);
 const [error,setError]=useState<unknown>(null);const [text,setText]=useState('');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const [open,setOpen]=useState<Record<string,string>>({});
 const bottom=useRef<HTMLDivElement>(null);const last=useRef(0);const opId=useRef(newOpId());
 useEffect(()=>{call('chats.list',{filter:'all'},list,{asAccount:true}).then(r=>{const c=r.items.find(x=>x.id===id);if(c)setMeta(c);else setError(new Error('not_found'));}).catch(setError);},[call,id]);
 const pull=useCallback(async(initial:boolean)=>{
  if(!meta)return;
  const r=await call('chat.messages',initial?{conversationId:id}:{conversationId:id,afterSeq:last.current},msgs,{profileId:meta.side.id});
  setState(r.state);setOtherRead(r.otherRead);
  if(r.items.length){
   setItems(prev=>{const seen=new Set(prev.map(m=>m.id));return [...prev,...r.items.filter(m=>!seen.has(m.id))].sort((a,b)=>a.seq-b.seq);});
   last.current=Math.max(last.current,...r.items.map(m=>m.seq));
   call('chat.read',{conversationId:id,upToSeq:last.current},ok,{profileId:meta.side.id}).catch(()=>{});
  }
 },[call,id,meta]);
 useEffect(()=>{if(!meta)return;pull(true).catch(setError);const tick=setInterval(()=>{pull(false).catch(()=>{});},4000);return ()=>clearInterval(tick);},[meta,pull]);
 useEffect(()=>{bottom.current?.scrollIntoView({block:'end'});},[items.length]);
 const send=async()=>{
  const body=text.trim();if(!body||busy||!meta)return;setBusy(true);setFailure('');
  try{await call('chat.send',{opId:opId.current,conversationId:id,body},ok,{profileId:meta.side.id});setText('');opId.current=newOpId();await pull(false);}
  catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy(false);}
 };
 const openMedia=async(m:Msg)=>{
  if(!meta)return;
  try{const r=await call('chat.openMedia',{opId:newOpId(),messageId:m.id},opened,{profileId:meta.side.id});const src=r.media?.src?.full??r.media?.src?.card;if(src)setOpen(o=>({...o,[m.id]:src}));}
  catch(e){setFailure(feErrorMessage(e,t));}
 };
 const day=(iso:string)=>{const d=new Date(iso),n=new Date();return d.toDateString()===n.toDateString()?t('fe.chats.today'):d.toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'short'});};
 if(error)return <><Bar title={t('fe.nav.chats')} back="/n/chats"/><View><Empty icon={X} title={t('fe.feed.unavailable')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={()=>navigate('/n/chats')}>{t('fe.chats.back')}</Btn></Empty></View></>;
 return <>
  <header className="bar solid">
   <button type="button" className="ibtn ghost" aria-label={t('fe.back')} onClick={()=>navigate('/n/chats')}><ChevronLeft/></button>
   {meta&&<button type="button" className="row grow" style={{gap:10,textAlign:'left',minWidth:0}} onClick={()=>navigate('/n/people/'+meta.other.id)}>
    <Av name={nameOf(meta.other)} seed={meta.other.id} size="sm" src={meta.other.avatar?.src?.thumb}/>
    <span style={{display:'grid',minWidth:0}}><b style={{fontSize:16,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{nameOf(meta.other)}</b>{meta.side.kind==='couple'&&<small style={{fontSize:12,color:'var(--mute)'}}>{t('fe.chats.asCouple')}</small>}</span>
   </button>}
  </header>
  <View className="cta1">
   <div className="msgs">
    {items.length===0&&<div className="msg sys">{t('fe.chats.matchSys')}</div>}
    {items.map((m,i)=>{const prev=items[i-1];const sep=!prev||new Date(prev.at).toDateString()!==new Date(m.at).toDateString();
     const media=m.media;const src=open[m.id]??media?.src?.card??media?.src?.full;
     return <div key={m.id} style={{display:'contents'}}>
      {sep&&<div className="daysep">{day(m.at)}</div>}
      <div className={'msg'+(m.mine?' me':'')+(media?' has-media':'')}>
       {media&&(media.ephemeral&&!open[m.id]?<button type="button" className="mtile eph2 unopened" onClick={()=>!m.mine&&media.state!=='done'&&openMedia(m)} disabled={m.mine||media.state==='done'}>
         <span className="eph-veil"/><span className="eph-c"><Eye/><b>{media.state==='done'?t('fe.chats.viewed'):t('fe.chats.onceTitle')}</b>{!m.mine&&media.state!=='done'&&<small>{t('fe.chats.onceHint')}</small>}</span></button>
        :src?<span className="mtile"><img src={src} alt="" draggable={false}/></span>:<span className="mtx">{t('fe.chats.photo')}</span>)}
       {m.body&&<span className="mtx">{m.body}</span>}
       {m.mine&&<div className="st">{new Date(m.at).toLocaleTimeString(locale==='en'?'en':'ru',{hour:'2-digit',minute:'2-digit'})}<span aria-label={m.seq<=otherRead?t('fe.chats.read'):t('fe.chats.delivered')}>{m.seq<=otherRead?<CheckCheck/>:<Check/>}</span></div>}
      </div>
     </div>;})}
    <div ref={bottom}/>
   </div>
   {failure&&<div className="alert err" role="alert"><span>{failure}</span></div>}
  </View>
  {state==='active'?<div className="inputbar">
   <textarea rows={1} maxLength={2000} value={text} onChange={e=>setText(e.target.value)} placeholder={t('fe.chats.messagePh')} aria-label={t('fe.chats.messagePh')}
    onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send();}}}/>
   <button type="button" className="ibtn send" onClick={send} disabled={busy||!text.trim()} aria-label={t('fe.feed.send')}><SendHorizontal/></button>
  </div>:<div className="ctabar"><div className="wrap"><p className="note">{t('fe.chats.endedNote')}</p></div></div>}
 </>;
}
