import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {useNavigate,useParams,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Archive,ArchiveRestore,Ban,Camera,Check,CheckCheck,ChevronLeft,Clock,Ellipsis,Eye,Flag,Image as ImageIcon,Info,MessageCircle,Plus,SendHorizontal,User,X,type LucideIcon} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Av,Bar,Btn,Empty,Seg,View} from './ui';
import {AgeCheckLink} from './age-check';
import {useFe} from './session';

/** Slice G (V21 H01, H02, H05) with the prototype's markup. A conversation exists only after a mutual like (server).
 * Until realtime signals land, an open chat asks for new messages every few seconds. */
const media=z.object({src:z.record(z.string(),z.string()).nullable()}).passthrough();
const chat=z.object({id:z.uuid(),state:z.string(),side:z.object({id:z.uuid(),kind:z.enum(['person','couple'])}),newMatch:z.boolean(),
 other:z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),avatar:media.nullable()}),
 unread:z.number(),muted:z.boolean(),archived:z.boolean().optional(),last:z.object({body:z.string(),media:z.boolean(),mode:z.string(),mine:z.boolean()}).nullable(),at:z.string()});
type Chat=z.infer<typeof chat>;
const list=z.object({ok:z.literal(true),items:z.array(chat)});
const msg=z.object({id:z.uuid(),seq:z.number(),mine:z.boolean(),body:z.string(),at:z.string(),
 media:z.object({ephemeral:z.boolean().optional(),mode:z.string().optional(),state:z.string().optional(),src:z.record(z.string(),z.string()).nullable().optional()}).passthrough().nullable().optional()});
type Msg=z.infer<typeof msg>;
const msgs=z.object({ok:z.literal(true),state:z.string(),items:z.array(msg),otherRead:z.number(),lastSeq:z.number()});
const ok=z.object({ok:z.literal(true)}).passthrough();
const opened=z.object({ok:z.literal(true),media:z.object({src:z.record(z.string(),z.string()).nullable()}).passthrough().nullable()}).passthrough();
const uploadIntent=z.object({ok:z.literal(true),assetId:z.uuid(),upload:z.object({url:z.string(),method:z.string(),headers:z.record(z.string(),z.string())})});

const nameOf=(o:{name?:string|null,handle?:string|null})=>o.name||(o.handle?'@'+o.handle:'?');
function ago(iso:string,locale:string){const s=(Date.now()-Date.parse(iso))/1000;const ru=locale!=='en';
 if(s<3600)return Math.max(1,Math.floor(s/60))+(ru?' мин':' min');if(s<86400)return Math.floor(s/3600)+(ru?' ч':' h');
 return new Date(iso).toLocaleDateString(ru?'ru':'en',{day:'numeric',month:'short'});}

export function ChatsTab(){
 const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const [params]=useSearchParams();const archived=params.get('archived')==='1';
 const [filter,setFilter]=useState<'all'|'me'|'couple'>('all');const [items,setItems]=useState<Chat[]|null>(null);const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{setError(null);call('chats.list',{filter,archived},list,{asAccount:true}).then(r=>setItems(r.items)).catch(setError);},[call,filter,archived]);
 useEffect(()=>{setItems(null);},[archived]);
 useEffect(()=>{load();const id=setInterval(load,15000);return ()=>clearInterval(id);},[load]);
 const fresh=archived?[]:(items??[]).filter(c=>c.newMatch);const rows=(items??[]).filter(c=>archived||!c.newMatch);
 const preview=(c:Chat)=>!c.last?t('fe.chats.say'):c.last.media?(c.last.mode!=='normal'?t('fe.chats.ephemeral'):t('fe.chats.photo')):(c.last.mine?t('fe.chats.you')+': ':'')+c.last.body;
 return <>
  {archived?<Bar title={t('fe.chx.archiveTitle')} back="/n/chats"/>
   :<Bar title={t('fe.nav.chats')}><button type="button" className="ibtn" aria-label={t('fe.chx.archiveTitle')} onClick={()=>navigate('/n/chats?archived=1')}><Archive/></button></Bar>}
  <View>
   <Seg small={false} value={filter} onChange={setFilter} options={[{id:'all',label:t('fe.chats.all')},{id:'me',label:t('fe.chats.personal')},{id:'couple',label:t('fe.chats.couple')}]}/>
   {error&&!items?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :items===null?<p className="note" role="status">{t('fe.loading')}</p>
    :!items.length?(archived?<Empty icon={Archive} title={t('fe.chx.archiveEmpty')} text={t('fe.chx.archiveEmptyText')}/>
     :<Empty icon={MessageCircle} title={t('fe.chats.empty')} text={t('fe.chats.emptyText')}><Btn kind="soft" onClick={()=>navigate('/n/people')}>{t('fe.chats.toPeople')}</Btn></Empty>)
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

/** The prototype's sheet (`#scrim` + `#sheet`) as `div.layer`: Esc and the scrim close it. */
function Sheet({title,lead,onClose,foot,children}:{title:string,lead?:ReactNode,onClose:()=>void,foot?:ReactNode,children:ReactNode}){
 const {t}=useI18n();const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{const opener=document.activeElement as HTMLElement|null;ref.current?.focus({preventScroll:true});return ()=>{opener?.focus?.({preventScroll:true});};},[]);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onClose();}};addEventListener('keydown',k);return ()=>removeEventListener('keydown',k);},[onClose]);
 return <div className="layer">
  <div className="scrim on" onClick={onClose}/>
  <div ref={ref} className="sheet on" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
   <div className="grab"/>
   <div className="sh-h">{lead}<div className="sh-ht"><h2>{title}</h2></div><button type="button" className="ibtn ghost sm" aria-label={t('fe.chx.close')} onClick={onClose}><X/></button></div>
   <div className="sh-b">{children}</div>
   {foot&&<div className="sh-f">{foot}</div>}
  </div>
 </div>;
}
/** `linkRow()` without a chevron. */
function Li({icon:Icon,tone,danger,title,sub,onClick}:{icon:LucideIcon,tone?:string,danger?:boolean,title:string,sub?:string,onClick:()=>void}){
 return <button type="button" className={'li'+(danger?' danger':'')} onClick={onClick}><span className={'ico'+(tone?' '+tone:'')}><Icon/></span><span className="tx"><b>{title}</b>{sub&&<small>{sub}</small>}</span></button>;
}
/** `toggleRow()` */
function Toggle({title,sub,on,onClick}:{title:string,sub?:string,on:boolean,onClick:()=>void}){
 return <button type="button" className="li" role="switch" aria-checked={on} onClick={onClick}><span className="tx"><b>{title}</b>{sub&&<small>{sub}</small>}</span><span className={'sw'+(on?' on':'')} aria-hidden="true"/></button>;
}

type Mode='normal'|'once'|'t15'|'t120'|'t1440';
const MODES:Mode[]=['normal','once','t15','t120','t1440'];
const REASONS=['threat','private','minor','spam','other'] as const;
type Reason=typeof REASONS[number];
/** A photo on its way: the asset is kept between attempts, so a retry after review only sends the message. */
type Outgoing={file:File,preview:string,mode:Mode,assetId?:string,assetMode?:Mode,opId:string,pending?:boolean};
type SheetKind='attach'|'send'|'menu'|'end'|'report'|'block';
const PHOTO_TYPES=['image/jpeg','image/png','image/webp'];

export function ChatScreen(){
 const {id=''}=useParams();const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const [meta,setMeta]=useState<Chat|null>(null);const [items,setItems]=useState<Msg[]>([]);const [state,setState]=useState('active');const [otherRead,setOtherRead]=useState(0);
 const [error,setError]=useState<unknown>(null);const [text,setText]=useState('');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const [notice,setNotice]=useState('');
 const [open,setOpen]=useState<Record<string,string>>({});
 const [sheet,setSheet]=useState<SheetKind|null>(null);const [sheetErr,setSheetErr]=useState('');const [sheetBusy,setSheetBusy]=useState(false);
 const [out,setOut]=useState<Outgoing|null>(null);const outRef=useRef<Outgoing|null>(null);outRef.current=out;
 const [rp,setRp]=useState<{why:Reason|null,details:string,block:boolean,sel:string[]}>({why:null,details:'',block:true,sel:[]});
 const bottom=useRef<HTMLDivElement>(null);const last=useRef(0);const opId=useRef(newOpId());
 const gallery=useRef<HTMLInputElement>(null);const camera=useRef<HTMLInputElement>(null);
 const profileId=meta?.side.id;
 useEffect(()=>{
  // An archived conversation is opened from «Архив» too, so both lists are asked.
  Promise.all([call('chats.list',{filter:'all'},list,{asAccount:true}),call('chats.list',{filter:'all',archived:true},list,{asAccount:true})])
   .then(([a,b])=>{const c=[...a.items,...b.items].find(x=>x.id===id);if(c)setMeta(c);else setError(new Error('not_found'));}).catch(setError);
 },[call,id]);
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
 useEffect(()=>()=>{if(outRef.current)URL.revokeObjectURL(outRef.current.preview);},[]);
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
 const closeSheet=useCallback(()=>{setSheet(null);setSheetErr('');},[]);

 /* ---- photos: uploadIntent → PUT → commit → chat.sendMedia ---- */
 const pick=(f:File|undefined)=>{
  if(gallery.current)gallery.current.value='';if(camera.current)camera.current.value='';
  if(!f)return;setSheetErr('');
  if(!PHOTO_TYPES.includes(f.type)){setFailure(t('fe.chx.photoType'));setSheet(null);return;}
  if(f.size>20*1024*1024){setFailure(t('fe.chx.photoSize'));setSheet(null);return;}
  if(outRef.current)URL.revokeObjectURL(outRef.current.preview);
  setFailure('');setOut({file:f,preview:URL.createObjectURL(f),mode:'normal',opId:newOpId()});setSheet('send');
 };
 const dropOut=(o:Outgoing|null)=>{
  if(!o)return;URL.revokeObjectURL(o.preview);setOut(null);
  // The uploaded file is not needed any more; best effort.
  if(o.assetId&&profileId)call('media.remove',{opId:newOpId(),assetId:o.assetId},ok,{profileId}).catch(()=>{});
 };
 /** One attempt; resolves to 'sent' or 'pending', throws other errors. */
 const deliver=useCallback(async(o:Outgoing):Promise<'sent'|'pending'>=>{
  if(!profileId)throw new FeError('unavailable');
  let cur=o;
  if(!cur.assetId||cur.assetMode!==cur.mode){
   // The view rule is fixed at upload: a new mode means a new upload.
   if(cur.assetId)call('media.remove',{opId:newOpId(),assetId:cur.assetId},ok,{profileId}).catch(()=>{});
   const rule=cur.mode==='normal'?{}:cur.mode==='once'?{viewRule:'once'}:{viewRule:'timer',viewSeconds:60};
   const i=await call('media.uploadIntent',{opId:newOpId(),purpose:'chat',kind:'image',mime:cur.file.type,bytes:cur.file.size,...rule},uploadIntent,{profileId});
   const put=await fetch(i.upload.url,{method:i.upload.method,headers:i.upload.headers,body:cur.file}).catch(()=>null);
   if(!put?.ok)throw new Error('upload');
   await call('media.commit',{assetId:i.assetId},ok,{profileId});
   cur={...cur,assetId:i.assetId,assetMode:cur.mode,opId:newOpId()};setOut(cur);
  }
  try{await call('chat.sendMedia',{opId:cur.opId,conversationId:id,assetId:cur.assetId,mode:cur.mode},ok,{profileId});}
  catch(e){if(e instanceof FeError&&e.code==='conflict'&&e.rule==='pending'){setOut({...cur,pending:true});return 'pending';}throw e;}
  URL.revokeObjectURL(cur.preview);setOut(null);
  return 'sent';
 },[call,id,profileId]);
 const photoError=(e:unknown)=>e instanceof FeError?(e.code==='rule_violation'&&e.rule==='age_required'?t('fe.chx.ageRequired'):feErrorMessage(e,t)):e instanceof Error&&e.message==='upload'?t('fe.chx.uploadFailed'):feErrorMessage(e,t);
 const sendPhoto=async()=>{
  const o=outRef.current;if(!o||sheetBusy)return;setSheetBusy(true);setSheetErr('');
  try{const r=await deliver(o);setSheet(null);if(r==='sent')await pull(false);}
  catch(e){setSheetErr(photoError(e));}finally{setSheetBusy(false);}
 };
 const retryPending=async(silent:boolean)=>{
  const o=outRef.current;if(!o||busy)return;if(!silent){setBusy(true);setFailure('');}
  try{if(await deliver(o)==='sent')await pull(false);}
  catch(e){if(!silent)setFailure(photoError(e));}finally{if(!silent)setBusy(false);}
 };
 // «отправится, когда модератор посмотрит»: while the chat is open, try again now and then.
 const pendingNow=!!out?.pending;
 const retryRef=useRef(retryPending);retryRef.current=retryPending;
 useEffect(()=>{if(!pendingNow)return;const tick=setInterval(()=>{void retryRef.current(true);},20000);return ()=>clearInterval(tick);},[pendingNow]);

 /* ---- the chat menu ---- */
 const run=async(fn:()=>Promise<void>)=>{setSheetBusy(true);setSheetErr('');try{await fn();}catch(e){setSheetErr(feErrorMessage(e,t));}finally{setSheetBusy(false);}};
 const toggleMute=()=>meta&&run(async()=>{const on=!meta.muted;await call('chat.mute',{conversationId:id,on},ok,{profileId:meta.side.id});setMeta({...meta,muted:on});setNotice(on?t('fe.chx.muted'):t('fe.chx.unmuted'));});
 const toggleArchive=()=>meta&&run(async()=>{const on=!meta.archived;await call('chat.archive',{conversationId:id,on},ok,{profileId:meta.side.id});
  if(on)navigate('/n/chats');else{setMeta({...meta,archived:false});setSheet(null);setNotice(t('fe.chx.restored'));}});
 const endConn=()=>meta&&run(async()=>{await call('match.end',{opId:newOpId(),profileId:meta.other.id},ok,{profileId:meta.side.id});
  setState('ended');setSheet(null);setNotice(t('fe.chx.endDone'));dropOut(outRef.current);});
 const block=()=>meta&&run(async()=>{await call('block.set',{opId:newOpId(),profileId:meta.other.id,on:true},ok,{profileId:meta.side.id});navigate('/n/chats');});
 const theirs=items.filter(m=>!m.mine).slice(-20).reverse();
 const openReport=()=>{setRp({why:null,details:'',block:true,sel:[]});setSheetErr('');setSheet('report');};
 const sendReport=()=>{
  if(!meta)return;
  if(!rp.why){setSheetErr(t('fe.chx.needWhy'));return;}
  if(theirs.length&&!rp.sel.length){setSheetErr(t('fe.chx.needMsg'));return;}
  void run(async()=>{
   const base={opId:newOpId(),reason:rp.why,details:rp.details.trim().slice(0,500),alsoBlock:rp.block};
   // A chat is reported as its conversation with the selected messages; with nothing of theirs to show, the profile is.
   const input=theirs.length?{...base,targetType:'conversation',targetId:id,messageIds:rp.sel}:{...base,targetType:'profile',targetId:meta.other.id};
   await call('report.create',input,ok,{profileId:meta.side.id});
   if(rp.block)navigate('/n/chats');else{setSheet(null);setNotice(t('fe.chx.reportDone'));}
  });
 };

 const day=(iso:string)=>{const d=new Date(iso),n=new Date();return d.toDateString()===n.toDateString()?t('fe.chats.today'):d.toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'short'});};
 const time=(iso:string)=>new Date(iso).toLocaleTimeString(locale==='en'?'en':'ru',{hour:'2-digit',minute:'2-digit'});
 const fill=(s:string)=>s.replace('{name}',meta?nameOf(meta.other):'');
 if(error)return <><Bar title={t('fe.nav.chats')} back="/n/chats"/><View><Empty icon={X} title={t('fe.feed.unavailable')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={()=>navigate('/n/chats')}>{t('fe.chats.back')}</Btn></Empty></View></>;
 const sheetAlert=sheetErr?<div className="alert err mt12" role="alert"><span>{sheetErr}{sheetErr===t('fe.chx.ageRequired')&&<><br/><AgeCheckLink/></>}</span></div>:null;
 return <>
  <header className="bar solid">
   <button type="button" className="ibtn ghost" aria-label={t('fe.back')} onClick={()=>navigate(meta?.archived?'/n/chats?archived=1':'/n/chats')}><ChevronLeft/></button>
   {meta&&<button type="button" className="row grow" style={{gap:10,textAlign:'left',minWidth:0}} onClick={()=>navigate('/n/people/'+meta.other.id)}>
    <Av name={nameOf(meta.other)} seed={meta.other.id} size="sm" src={meta.other.avatar?.src?.thumb}/>
    <span style={{display:'grid',minWidth:0}}><b style={{fontSize:16,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{nameOf(meta.other)}</b>{meta.side.kind==='couple'&&<small style={{fontSize:12,color:'var(--mute)'}}>{t('fe.chats.asCouple')}</small>}</span>
   </button>}
   {meta&&<button type="button" className="ibtn ghost" aria-label={t('fe.chx.menu')} onClick={()=>{setSheetErr('');setSheet('menu');}}><Ellipsis/></button>}
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
       {m.mine&&<div className="st">{time(m.at)}<span aria-label={m.seq<=otherRead?t('fe.chats.read'):t('fe.chats.delivered')}>{m.seq<=otherRead?<CheckCheck/>:<Check/>}</span></div>}
      </div>
     </div>;})}
    {out?.pending&&<div className="msg me has-media sending"><span className="mtile"><img src={out.preview} alt="" draggable={false}/></span></div>}
    <div ref={bottom}/>
   </div>
   {out?.pending&&<div className="alert info" role="status"><Clock/><div><b>{t('fe.chx.pending')}</b>
    <div className="row" style={{gap:8,flexWrap:'wrap'}}><Btn kind="soft" size="sm" auto disabled={busy} onClick={()=>void retryPending(false)}>{t('fe.chx.retry')}</Btn><Btn kind="text" size="sm" auto onClick={()=>dropOut(out)}>{t('fe.chx.drop')}</Btn></div></div></div>}
   {notice&&<div className="alert ok" role="status"><Check/><span>{notice}</span></div>}
   {failure&&<div className="alert err" role="alert"><span>{failure}</span></div>}
  </View>
  {state==='active'?<div className="inputbar">
   <button type="button" className="ibtn ghost" aria-label={t('fe.chx.attach')} disabled={!meta||!!out?.pending} onClick={()=>{setSheetErr('');setSheet('attach');}}><Plus/></button>
   <textarea rows={1} maxLength={2000} value={text} onChange={e=>setText(e.target.value)} placeholder={t('fe.chats.messagePh')} aria-label={t('fe.chats.messagePh')}
    onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send();}}}/>
   <button type="button" className="ibtn send" onClick={send} disabled={busy||!text.trim()} aria-label={t('fe.feed.send')}><SendHorizontal/></button>
  </div>:<div className="ctabar"><div className="wrap"><p className="note">{t('fe.chats.endedNote')}</p></div></div>}
  <input ref={gallery} type="file" accept={PHOTO_TYPES.join(',')} hidden onChange={e=>pick(e.target.files?.[0])}/>
  <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={e=>pick(e.target.files?.[0])}/>

  {sheet==='attach'&&<Sheet title={t('fe.chx.attachTitle')} onClose={closeSheet}>
   <div className="card list">
    <Li icon={ImageIcon} tone="v" title={t('fe.chx.gallery')} sub={t('fe.chx.gallerySub')} onClick={()=>gallery.current?.click()}/>
    <Li icon={Camera} title={t('fe.chx.camera')} onClick={()=>camera.current?.click()}/>
   </div>
  </Sheet>}

  {sheet==='send'&&out&&<Sheet title={t('fe.chx.sendTitle')} onClose={()=>{if(sheetBusy)return;dropOut(out);closeSheet();}}
   foot={<Btn icon={SendHorizontal} onClick={sendPhoto} disabled={sheetBusy}>{sheetBusy?t('fe.chx.sending'):t('fe.chx.send')}</Btn>}>
   <div className="cm-prev"><img src={out.preview} alt=""/></div>
   <section className="grp"><div className="grp-t"><span>{t('fe.chx.howView')}</span></div><div className="card">
    <label className="selrow solo"><span className="selv" aria-hidden="true">{t('fe.chx.mode.'+out.mode)}</span>
     <select value={out.mode} disabled={sheetBusy} aria-label={t('fe.chx.howView')} onChange={e=>{setSheetErr('');setOut({...out,mode:e.target.value as Mode});}}>
      {MODES.map(m=><option key={m} value={m}>{t('fe.chx.mode.'+m)}</option>)}
     </select></label>
   </div><p className="grp-n">{t('fe.chx.modeSub.'+(out.mode==='normal'||out.mode==='once'?out.mode:'timer'))}{out.mode!=='normal'?' · '+t('fe.chx.ephNote'):''}</p></section>
   <p className="note">{t('fe.chx.shotNote')}</p>
   {sheetAlert}
  </Sheet>}

  {sheet==='menu'&&meta&&<Sheet title={nameOf(meta.other)} lead={<Av name={nameOf(meta.other)} seed={meta.other.id} size="sm" src={meta.other.avatar?.src?.thumb}/>} onClose={closeSheet}>
   <div className="card list"><Li icon={User} title={t('fe.chx.profile')} onClick={()=>navigate('/n/people/'+meta.other.id)}/></div>
   <div className="card list mt12">
    <Toggle title={t('fe.chx.mute')} sub={t('fe.chx.muteSub')} on={meta.muted} onClick={()=>{if(!sheetBusy)void toggleMute();}}/>
    <Li icon={meta.archived?ArchiveRestore:Archive} title={meta.archived?t('fe.chx.unarchive'):t('fe.chx.archive')} sub={t('fe.chx.archiveSub')} onClick={()=>{if(!sheetBusy)void toggleArchive();}}/>
   </div>
   <div className="card list mt12">
    {state==='active'&&<Li icon={X} danger title={t('fe.chx.end')} sub={t('fe.chx.endSub')} onClick={()=>{setSheetErr('');setSheet('end');}}/>}
    <Li icon={Flag} danger title={t('fe.chx.report')} onClick={openReport}/>
    <Li icon={Ban} danger title={t('fe.chx.block')} onClick={()=>{setSheetErr('');setSheet('block');}}/>
   </div>
   {sheetAlert}
  </Sheet>}

  {sheet==='end'&&meta&&<Sheet title={t('fe.chx.endTitle')} lead={<span className="ico l"><X/></span>} onClose={closeSheet}
   foot={<><Btn kind="danger" onClick={()=>void endConn()} disabled={sheetBusy}>{t('fe.chx.end')}</Btn><Btn kind="soft" onClick={closeSheet}>{t('fe.chx.cancel')}</Btn></>}>
   <p className="lead">{fill(t('fe.chx.endLead'))}</p>
   <div className="card flat">
    {(['endFact1','endFact2','endFact3'] as const).map(k=><div key={k} className="fact"><i className="g"><Check/></i><span>{t('fe.chx.'+k)}</span></div>)}
    <div className="fact"><i className="v"><Info/></i><span>{t('fe.chx.endFact4')}</span></div>
   </div>
   <p className="note mt12">{t('fe.chx.endNote')}</p>
   {sheetAlert}
  </Sheet>}

  {sheet==='report'&&meta&&<Sheet title={t('fe.chx.report')} onClose={closeSheet}
   foot={<Btn kind="danger" onClick={sendReport} disabled={sheetBusy}>{t('fe.chx.reportSend')}</Btn>}>
   {theirs.length?<section className="grp bare"><div className="grp-t"><span>{t('fe.chx.reportPick')}</span></div><div className="card">
    {theirs.map(m=>{const on=rp.sel.includes(m.id);
     return <button key={m.id} type="button" className={'check'+(on?' on':'')} role="checkbox" aria-checked={on}
      onClick={()=>setRp(r=>({...r,sel:on?r.sel.filter(x=>x!==m.id):r.sel.length>=20?r.sel:[...r.sel,m.id]}))}>
      <i><Check/></i><span>{m.body||(m.media?t('fe.chats.photo'):'')}<small style={{display:'block',color:'var(--mute)'}}>{day(m.at)} · {time(m.at)}</small></span></button>;})}
   </div><p className="grp-n">{t('fe.chx.reportPickNote')}</p></section>
   :<p className="note">{t('fe.chx.reportNoMsgs')}</p>}
   <section className="grp bare" role="radiogroup" aria-label={t('fe.chx.reason')}><div className="grp-t"><span>{t('fe.chx.reason')}</span></div>
    {REASONS.map(k=><button key={k} type="button" className={'radio'+(rp.why===k?' on':'')} role="radio" aria-checked={rp.why===k} onClick={()=>setRp(r=>({...r,why:k}))}><i/><span className="tx">{t('fe.chx.reason.'+k)}</span></button>)}
   </section>
   <label className="field mt16"><span>{t('fe.chx.details')}<i>{t('fe.chx.optional')}</i></span>
    <textarea className="inp" rows={3} maxLength={500} value={rp.details} onChange={e=>setRp(r=>({...r,details:e.target.value}))}/></label>
   <div className="card list"><Toggle title={t('fe.chx.alsoBlock')} sub={t('fe.chx.alsoBlockSub')} on={rp.block} onClick={()=>setRp(r=>({...r,block:!r.block}))}/></div>
   {sheetAlert}
  </Sheet>}

  {sheet==='block'&&meta&&<Sheet title={fill(t('fe.chx.blockTitle'))} lead={<span className="ico l"><Ban/></span>} onClose={closeSheet}
   foot={<><Btn kind="danger" onClick={()=>void block()} disabled={sheetBusy}>{t('fe.chx.block')}</Btn><Btn kind="soft" onClick={closeSheet}>{t('fe.chx.cancel')}</Btn></>}>
   <p className="lead">{t('fe.chx.blockText')}</p>
   {sheetAlert}
  </Sheet>}
 </>;
}
