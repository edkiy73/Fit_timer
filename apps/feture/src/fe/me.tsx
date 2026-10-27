import {Fragment,useCallback,useEffect,useState,type ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Camera,Check,ChevronDown,ChevronRight,Clock,Eye,EyeOff,Users,Image as ImageIcon,KeyRound,Plus,Settings,Star,Trash2,X,type LucideIcon} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Av,Btn,Empty,Layer,Skel} from './ui';
import {AgeCheckLink} from './age-check';
import {useFe,useRealtime} from './session';
import {PrivateLayer} from './private';
import {BellButton,countsRes} from './inbox';
import {MineLayer} from './mine';
import {MeJars} from './interests';
import {StaffEntry} from './staff';
import {LinksBlock,waitingCount} from './links';
import {CoupleMembers,CouplePending,CoupleVisGroup} from './couple';
import {SelectRow} from './create-community';
import {Sheet,linksMineRes} from './profile-extras';
import {useToast} from './toast';
import './css/me.css';

/** V21 X01 «Я» with the prototype's markup (`meHead18`, `meProfileLayer`, `meVisLayer`): the header with the avatar,
 * bell, «Как видят» and settings; «Нужно решить»; the four layers with their red dots; photos, basics, details,
 * interests, gallery and links. The editors (P02/P04) live in me-edit.tsx. Everything comes from the server. */
export const media=z.object({id:z.uuid(),pending:z.boolean(),blurred:z.boolean().optional(),src:z.record(z.string(),z.string()).nullable()});
export const profile=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),own:z.boolean(),bio:z.string(),
 age:z.number().nullable(),city:z.object({ru:z.string().nullable(),en:z.string().nullable(),pending:z.boolean()}).nullable(),avatar:media.nullable(),photos:z.array(media),
 details:z.record(z.string(),z.unknown()),rev:z.number().optional(),detailsVis:z.string().nullable().optional(),showAge:z.boolean().optional(),cityId:z.string().nullable().optional()}).passthrough();
export const profileRes=z.object({ok:z.literal(true),profile});
export const settingsShape=z.object({discoverMode:z.enum(['visible','hidden','off']),privateOn:z.boolean(),acceptProfileLikes:z.boolean().optional(),requestsFrom:z.enum(['all','matches','none']).optional(),
 linksFrom:z.string().optional(),mentionsFrom:z.enum(['all','follow','none']).optional(),activityVis:z.enum(['all','followers','off']).optional(),showLikes:z.boolean().optional()}).passthrough();
export const settingsRes=z.object({ok:z.literal(true),settings:settingsShape});
export const option=z.object({kind:z.string(),code:z.string(),ru:z.string(),en:z.string()});
export const place=z.object({id:z.string(),country:z.string().optional(),ru:z.string(),en:z.string()});
export const catalogRes=z.object({ok:z.literal(true),options:z.array(option),places:z.array(place).optional()});
export const ok=z.object({ok:z.literal(true)}).passthrough();
const accessIn=z.object({ok:z.literal(true),items:z.array(z.object({id:z.uuid()}).passthrough())});
const approvalsRes=z.object({ok:z.literal(true),items:z.array(z.object({id:z.uuid(),kind:z.string()}).passthrough())});
const coupleRes=z.object({ok:z.literal(true),couple:z.object({members:z.array(z.object({me:z.boolean(),handle:z.string().nullable(),name:z.string().nullable()}).passthrough())}).passthrough()});
export type Profile=z.infer<typeof profile>;
export type Settings=z.infer<typeof settingsShape>;
type Layer='profile'|'priv'|'vis'|'mine';
/** Profile fields → catalog option kinds; a couple keeps only the shared ones (prototype COUPLE_FIELDS). */
export const DETAIL_ROWS:[string,string][]=[['genders','gender'],['orients','orient'],['roles','role'],['status','status'],['formats','format'],['seeks','seek']];
export const COUPLE_ROWS=['roles','formats','seeks'];
export const MAX_PHOTOS=6;
const STAT_HINT_KEY='feture.fe.statHintOff';

/** `audTag()` — who sees a block. */
export function AudTag({k}:{k:'all'|'granted'|'only'|string|null|undefined}){
 const {t}=useI18n();const key=k==='granted'||k==='only'?k:'all';
 return <span className={'aud'+(key==='granted'?' k':key==='only'?' w':'')}>{key==='granted'?<KeyRound/>:key==='only'?<EyeOff/>:null}{t('fe.mx.aud.'+key)}</span>;
}

/** `ask()` — the confirmation dialog in the app layer. */
export function Ask({icon:Icon,title,text,ok:okLabel,danger,busy,onOk,onCancel}:{icon:LucideIcon,title:string,text:string,ok:string,danger?:boolean,busy?:boolean,onOk:()=>void,onCancel:()=>void}){
 const {t}=useI18n();
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onCancel();}};document.addEventListener('keydown',k);return ()=>document.removeEventListener('keydown',k);},[onCancel]);
 return <Layer>
  <div className="scrim on" onClick={onCancel}/>
  <div className="dialog on" role="alertdialog" aria-modal="true" aria-label={title}>
   <div className={'ico '+(danger?'l':'')}><Icon/></div><h2>{title}</h2><p>{text}</p>
   <div className="btns"><Btn kind={danger?'danger':'primary'} onClick={onOk} disabled={busy} busy={!!busy}>{okLabel}</Btn><Btn kind="soft" onClick={onCancel} autoFocus>{t('fe.cancel')}</Btn></div>
  </div>
 </Layer>;
}

/** `seg()` with the «Я» layers' red dots (the shared Seg takes plain labels). */
function LayerSeg({value,onChange,dots}:{value:Layer,onChange:(v:Layer)=>void,dots:Record<Layer,string>}){
 const {t}=useI18n();const ids=['profile','priv','vis','mine'] as const;const i=ids.indexOf(value);
 return <div className="seg" role="tablist" aria-label={t('fe.nav.me')}>
  <span className="knob" style={{width:`calc((100% - 8px)/${ids.length})`,transform:`translateX(${i*100}%)`}}/>
  {ids.map(id=><button key={id} type="button" role="tab" aria-selected={id===value} className={id===value?'on':''} onClick={()=>onChange(id)}>
   <span>{t('fe.me.layer.'+id)}{dots[id]&&<i className="tdot" role="img" aria-label={dots[id]}/>}</span>
  </button>)}
 </div>;
}

export function MeTab(){
 const {state,acting,setActing,call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const [p,setP]=useState<Profile|null>(null);const [settings,setSettings]=useState<Settings|null>(null);
 const [options,setOptions]=useState<z.infer<typeof option>[]>([]);
 const [error,setError]=useState<unknown>(null);
 const [layer,setLayerState]=useState<Layer>(()=>{const l=new URLSearchParams(location.hash.split('?')[1]??'').get('layer');return l==='priv'||l==='mine'||l==='vis'?l:'profile';});
 const [notice,setNotice]=useState('');const [tick,setTick]=useState(0);const [switching,setSwitching]=useState(false);
 const [todo,setTodo]=useState(0);const [dots,setDots]=useState<{links:number,reqs:number,vis:number}>({links:0,reqs:0,vis:0});
 const setLayer=(l:Layer)=>{setLayerState(l);setNotice('');const base=location.hash.split('?')[0]||'#/n/me';history.replaceState(history.state,'',l==='profile'?base:base+'?layer='+l);document.querySelector('.me18')?.scrollTo({top:0});};
 const load=useCallback(()=>{
  if(!acting)return;setError(null);setTick(n=>n+1);
  Promise.all([call('profile.get',{profileId:acting.id},profileRes),call('profile.settings',{},settingsRes)])
   .then(([a,b])=>{setP(a.profile);setSettings(b.settings);}).catch(setError);
 },[call,acting]);
 useEffect(()=>{setP(null);load();},[load]);
 useEffect(()=>{call('catalog.get',{},catalogRes,{asAccount:true}).then(r=>setOptions(r.options)).catch(()=>{});},[call]);
 // «Нужно решить» and the layers' dots: proposals of links, access requests, couple settings waiting for a partner.
 const pullCounts=useCallback(()=>{
  call('inbox.counts',{},countsRes,{asAccount:true}).then(r=>setTodo(r.decide)).catch(()=>{});
  if(!acting)return;
  Promise.all([call('links.mine',{},linksMineRes).then(waitingCount).catch(()=>0),call('access.lists',{tab:'incoming'},accessIn).then(r=>r.items.length).catch(()=>0),
   acting.kind==='couple'?call('decide.approvals',{},approvalsRes).then(r=>r.items.filter(a=>a.kind==='profile.setVisibility').length).catch(()=>0):Promise.resolve(0)])
   .then(([links,reqs,vis])=>setDots({links,reqs,vis}));
 },[call,acting]);
 useEffect(()=>{pullCounts();},[pullCounts,tick]);
 useRealtime(['decide','notify'],pullCounts);
 if(state.status!=='ready'||!acting)return null;
 const profiles=state.boot.profiles.filter(x=>x.state!=='deleted');
 const couple=profiles.find(x=>x.kind==='couple');const person=profiles.find(x=>x.kind==='person');
 const name=p?.name||acting.name||acting.handle||'?';
 const label=(kind:string,code:string)=>{const o=options.find(x=>x.kind===kind&&x.code===code);return o?(locale==='en'?o.en:o.ru):code;};
 const avatarSrc=p?(p.photos[0]?.src?.thumb??p.photos[0]?.src?.card??p.avatar?.src?.thumb):acting.avatar;
 const privOn=settings?.privateOn!==false;
 const layerDots:Record<Layer,string>={profile:dots.links?t('fe.mx.dot.links'):'',priv:privOn&&dots.reqs?t('fe.mx.dot.reqs'):'',vis:dots.vis?t('fe.mx.dot.vis'):'',mine:''};
 return <>
  <h1 className="sr-only" tabIndex={-1}>{t('fe.nav.me')}</h1>
  <div className="view me18 me-x01">
   <header className="me18-h wrap">
    <span className="av-wrap"><Av name={name} seed={acting.id} src={avatarSrc}/></span>
    {couple?<button type="button" className="me18-who" aria-haspopup="dialog" aria-label={t('fe.mx.whose')} onClick={()=>setSwitching(true)}>
      <b><span>{name}</span><ChevronDown/></b><small>{acting.kind==='couple'?t('fe.me.weCouple'):t('fe.me.iPersonal')}</small></button>
     :<div className="me18-who"><b><span>{name}</span></b><small>{t('fe.me.personalProfile')}</small></div>}
    <StaffEntry/>
    <BellButton/>
    <button type="button" className="ibtn" aria-label={t('fe.mx.howSeen')} title={t('fe.mx.howSeen')} onClick={()=>navigate('/n/me/preview')}><Eye/></button>
    <button type="button" className="ibtn" aria-label={t('fe.me.settings')} onClick={()=>navigate('/n/settings')}><Settings/></button>
   </header>
   <div className="wrap">
    {todo>0&&<button type="button" className="me-todo" onClick={()=>navigate('/n/inbox')}><i/><span>{t('fe.mx.todo')}</span><b>{todo}</b><ChevronRight/></button>}
    <div className="me18-seg me4"><LayerSeg value={layer} onChange={setLayer} dots={layerDots}/></div>
   </div>
   <div className="wrap">
    {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
     :!p||!settings?<MeSkel/>
     :layer==='profile'?<>
      {notice&&<div className="alert ok" role="status"><span>{notice}</span></div>}
      {acting.kind==='couple'&&<><CouplePending base={p} tick={tick} onDecided={msg=>{setNotice(msg);load();}}/><CoupleMembers/></>}
      <PhotosBlock p={p} settings={settings} onChanged={load}/>
      <section className="grp"><div className="grp-t"><span>{t('fe.me.basics')}</span><AudTag k="all"/></div>
       <button type="button" className="card blk-btn" aria-label={t('fe.me.editBasics')} onClick={()=>navigate('/n/me/edit?only=basics')}>
        <span className="blk-name">{name}{p.age&&p.showAge!==false?', '+p.age:''}{p.city&&(locale==='en'?p.city.en:p.city.ru)?' · '+(locale==='en'?p.city.en:p.city.ru):''}</span>
        <span className="blk-bio">{p.bio?p.bio.replace(/[*_~`>#[\]()]/g,'').slice(0,240):t('fe.mx.noBio')}</span><span className="chv"><ChevronRight/></span>
       </button>
      </section>
      <DetailsBlock p={p} label={label}/>
      {acting.kind==='person'&&couple&&<StatusHint p={p} coupleId={couple.id} onDone={msg=>{setNotice(msg);load();}}/>}
      <MeJars key={p.id}/>
      <GalleryBlock p={p}/>
      <LinksBlock key={'links'+p.id} onChanged={pullCounts}/>
     </>
     :layer==='priv'?<PrivateLayer profileId={p.id} on={privOn} requestsFrom={settings.requestsFrom??'all'} onChanged={()=>{load();pullCounts();}}/>
     :layer==='mine'?<MineLayer/>
     :<>{acting.kind==='couple'&&<CouplePending base={p} tick={tick} onDecided={()=>{load();pullCounts();}}/>}<Visibility p={p} settings={settings} onChanged={load}/>{acting.kind==='couple'&&<CoupleVisGroup/>}</>}
   </div>
  </div>
  {switching&&<Sheet title={t('fe.mx.whose')} onClose={()=>setSwitching(false)}>
   <div className="card list">
    {[person,couple].filter(Boolean).map(x=>{const on=x!.id===acting.id;
     return <button key={x!.id} type="button" className="li" aria-pressed={on} onClick={()=>{setSwitching(false);if(!on)setActing(x!.id);}}>
      <Av name={x!.name||x!.handle||'?'} seed={x!.id} src={x!.avatar} size="sm"/>
      <span className="tx"><b>{x!.name||x!.handle}</b><small>{x!.kind==='couple'?t('fe.me.coupleProfile'):t('fe.me.personalProfile')}</small></span>
      {on&&<span className="ico g"><Check/></span>}
     </button>;})}
   </div>
   <p className="note mt12">{t('fe.mx.whoseNote')}</p>
  </Sheet>}
 </>;
}

/** The loading state shaped like the profile layer: the photo grid, then two cards. */
function MeSkel(){
 return <div aria-busy="true"><section className="grp ph20"><div className="ph-slots"><i className="sk mi big" style={{display:'block',aspectRatio:'auto'}}/><i className="sk ph-add" style={{display:'block'}}/></div></section><Skel kind="card" rows={2}/></div>;
}

/** «Данные» — the filled rows only; the audience comes from the profile's `detailsVis`. */
function DetailsBlock({p,label}:{p:Profile,label:(kind:string,code:string)=>string}){
 const {t}=useI18n();const navigate=useNavigate();const cp=p.kind==='couple';
 const rows=DETAIL_ROWS.filter(([f])=>!cp||COUPLE_ROWS.includes(f)).map(([field,kind])=>{const v=p.details[field];const codes=Array.isArray(v)?v as string[]:typeof v==='string'?[v]:[];
  return codes.length?[field,t(kind==='status'?'fe.mx.f.status':'fe.reg.kind.'+kind),codes.map(c=>label(kind,c)).join(', ')]:null;}).filter((x):x is string[]=>!!x);
 const title=cp?t('fe.mx.detailsCouple'):t('fe.me.details');
 return <section className="grp"><div className="grp-t"><span>{title}</span><AudTag k={p.detailsVis??'all'}/></div>
  <button type="button" className="card blk-btn" aria-label={t('fe.mx.editOf',{title})} onClick={()=>navigate('/n/me/edit?only=details')}>
   {rows.length?<dl className="kv">{rows.map(([f,k,v])=><Fragment key={f}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
    :<p className="blk-empty">{cp?t('fe.mx.detailsEmptyCouple'):t('fe.mx.detailsEmpty')}</p>}
   <span className="chv"><ChevronRight/></span>
  </button>
 </section>;
}

/** V21.1 ME-047: a person in a couple whose status says «single» or nothing gets one sentence and one tap to fix it. */
function StatusHint({p,coupleId,onDone}:{p:Profile,coupleId:string,onDone:(msg:string)=>void}){
 const {call}=useFe();const {t}=useI18n();
 const [off,setOff]=useState(()=>{try{return localStorage.getItem(STAT_HINT_KEY)===p.id;}catch{return false;}});
 const [partner,setPartner]=useState('');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const status=typeof p.details.status==='string'?p.details.status:null;
 const show=!off&&(!status||status==='single');
 useEffect(()=>{if(!show)return;call('couple.get',{},coupleRes,{profileId:coupleId}).then(r=>{const o=r.couple.members.find(m=>!m.me);setPartner(o?(o.name||(o.handle?'@'+o.handle:'')):'');}).catch(()=>{});},[call,coupleId,show]);
 if(!show)return null;
 const fix=async()=>{setBusy(true);setFailure('');try{await call('profile.update',{opId:newOpId(),rev:p.rev,status:'partnered'},ok);onDone(t('fe.me.saved'));}catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy(false);}};
 const keep=()=>{try{localStorage.setItem(STAT_HINT_KEY,p.id);}catch{/* per-viewer convenience only */}setOff(true);};
 return <div className="alert info me-stat21"><Users/><span><b>{t(status?'fe.mx.stat.single':'fe.mx.stat.none',{name:partner||t('fe.mx.stat.partner')})}</b>
  <span className="me-stat21-a"><Btn size="sm" onClick={fix} disabled={busy} busy={busy}>{t('fe.mx.stat.fix')}</Btn><Btn size="sm" kind="soft" onClick={keep}>{t('fe.mx.stat.keep')}</Btn></span>
  {failure&&<span className="note">{failure}</span>}</span></div>;
}

export const photoSrc=(m:{src:Record<string,string>|null},size:'card'|'thumb'|'full'='card')=>m.src?(m.src[size]??m.src.card??m.src.thumb??m.src.blur??null):null;

/** `mePhotos20()` — the grid of profile photos: the main one big, «Ещё фото» next to it; a tap opens what can be done
 * with that photo; «Изменить» opens the photo editor (P02 `only:'media'`). */
function PhotosBlock({p,settings,onChanged}:{p:Profile,settings:Settings,onChanged:()=>void}){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const toast=useToast();
 const [open,setOpen]=useState<number|null>(null);const [busy,setBusy]=useState(false);
 const cp=p.kind==='couple';const items=p.photos;
 const edit=()=>navigate('/n/me/edit?only=media');
 const head=(more?:ReactNode)=><div className="grp-t"><span>{t('fe.me.photos')}</span><AudTag k="all"/>{more}</div>;
 if(!items.length)return <section className="grp ph20" id="mePh">{head()}
  <button type="button" className="ph-empty" onClick={edit}><span className="pe-ic"><Camera/></span>
   <span className="tx"><b>{cp?t('fe.mx.ph.addCouple'):t('fe.me.photoAdd')}</b><small>{settings.discoverMode==='visible'?(cp?t('fe.mx.ph.needCouple'):t('fe.mx.ph.need')):t('fe.mx.ph.mainHint')}</small></span><Plus/></button>
 </section>;
 const write=async(ids:string[],msg:string,prev?:string[])=>{
  setBusy(true);
  try{const r=await call('profile.photosSet',{opId:newOpId(),assetIds:ids},ok);onChanged();
   toast(r.pending?t('fe.cw.waitPartner'):msg,{type:'ok',...(prev&&!r.pending?{action:{label:t('fe.mx.undo'),fn:()=>{void call('profile.photosSet',{opId:newOpId(),assetIds:prev},ok).then(onChanged).catch(e=>toast(feErrorMessage(e,t),{type:'err'}));}}}:{})});}
  catch(e){toast(feErrorMessage(e,t),{type:'err'});}finally{setBusy(false);}
 };
 const ids=items.map(x=>x.id);
 const nCells=items.length===1?2:Math.min(MAX_PHOTOS,Math.max(items.length+1,3));
 // The small thumb paints first, so the slot never sits empty while the card-size picture loads.
 const slots:ReactNode[]=items.map((ph,i)=><div key={ph.id} className={'mi'+(i===0?' big':'')} style={ph.src?.thumb?{backgroundImage:`url("${ph.src.thumb}")`,backgroundSize:'cover',backgroundPosition:'center'}:undefined}>
  {photoSrc(ph)&&<img src={photoSrc(ph)!} alt="" draggable={false}/>}
  {i===0&&<span className="mainph">{t('fe.me.mainPhoto')}</span>}
  {ph.pending&&<span className="ph-rev"><Clock/><span>{t('fe.mx.ph.review')}</span></span>}
  <button type="button" className="vw" aria-label={t('fe.mx.ph.nOf',{n:i+1,total:items.length})} onClick={()=>setOpen(i)}/>
 </div>);
 for(let i=items.length;i<nCells;i++)slots.push(i===items.length
  ?<button key="add" type="button" className={'ph-add'+(items.length===1?' tall':'')} onClick={edit} aria-label={t('fe.mx.ph.addAria')}><Plus/>{items.length===1&&<small>{t('fe.me.morePhotos')}</small>}</button>
  :<span key={'g'+i} className="ph-add ghost" aria-hidden="true"/>);
 const x=open!==null?items[open]:undefined;
 return <section className="grp ph20" id="mePh">
  {head(<button type="button" onClick={edit}>{t('fe.mx.edit')}</button>)}
  <div className="ph-slots">{slots}</div>
  {x&&open!==null&&<Sheet title={open===0?t('fe.mx.ph.main'):t('fe.mx.ph.nOf',{n:open+1,total:items.length})} onClose={()=>setOpen(null)}>
   <div className="ph-sheet-prev">{photoSrc(x)&&<img src={photoSrc(x)!} alt="" draggable={false}/>}{x.pending&&<span className="ph-rev"><Clock/><span>{t('fe.mx.ph.review')}</span></span>}</div>
   <div className="card list">
    <button type="button" className="li" onClick={()=>{setOpen(null);navigate(`/n/people/${acting?.id??p.id}/gallery`);}}><span className="ico"><Eye/></span><span className="tx"><b>{t('fe.mx.ph.view')}</b></span></button>
    {open>0&&!x.pending&&<button type="button" className="li" disabled={busy} onClick={()=>{const i=open;setOpen(null);void write([ids[i]!,...ids.filter((_,k)=>k!==i)],t('fe.mx.ph.mainDone'),ids);}}>
     <span className="ico"><Star/></span><span className="tx"><b>{t('fe.mx.ph.makeMain')}</b><small>{t('fe.mx.ph.makeMainSub')}</small></span></button>}
    <button type="button" className="li danger" disabled={busy} onClick={()=>{const i=open;setOpen(null);void write(ids.filter((_,k)=>k!==i),t('fe.mx.ph.removed'),ids);}}>
     <span className="ico"><Trash2/></span><span className="tx"><b>{t('fe.mx.ph.remove')}</b></span></button>
   </div>
  </Sheet>}
 </section>;
}

/** `galleryOwn20()` — the server has no albums yet: one «Все» card with the photos the profile shows. */
function GalleryBlock({p}:{p:Profile}){
 const {t}=useI18n();const navigate=useNavigate();
 const list=p.photos.filter(x=>photoSrc(x));
 const upload=()=>navigate('/n/feed/new');
 if(!list.length)return <section className="grp gal20" id="meGal"><div className="grp-t"><span>{t('fe.mx.gal')}</span></div>
  <button type="button" className="ph-empty" onClick={upload}><span className="pe-ic"><ImageIcon/></span><span className="tx"><b>{t('fe.mx.gal.first')}</b><small>{p.kind==='couple'?t('fe.mx.gal.firstSubCouple'):t('fe.mx.gal.firstSub')}</small></span><Plus/></button></section>;
 return <section className="grp gal20" id="meGal"><div className="grp-t"><span>{t('fe.mx.gal')}</span><button type="button" onClick={upload}><Plus/>{t('fe.mx.gal.upload')}</button></div>
  <div className="alb-row alb20"><button type="button" className="alb" aria-pressed={false} onClick={()=>navigate(`/n/people/${p.id}/gallery`)}>
   <span className="alb-c">{list.length===1?<img src={photoSrc(list[0]!,'thumb')!} alt="" loading="lazy"/>:<ImageIcon/>}</span><b>{t('fe.mx.gal.all')}</b><small>{list.length}</small></button></div>
 </section>;
}

/** `meVisLayer()` — Discover, the profile card, likes, activity, mentions; the couple's own group comes after. */
function Visibility({p,settings,onChanged}:{p:Profile,settings:Settings,onChanged:()=>void}){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();const toast=useToast();
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const cp=p.kind==='couple';
 const set=async(setting:string,value:string|boolean)=>{
  if(busy)return;setBusy(true);setFailure('');
  try{const r=await call(setting==='detailsVis'?'profile.update':'profile.setVisibility',setting==='detailsVis'?{opId:newOpId(),rev:p.rev,detailsVis:value}:{opId:newOpId(),setting,value},ok);
   toast(r.pending?t('fe.cw.waitPartner'):t('fe.mx.saved'),{type:'ok'});onChanged();}
  catch(e){setFailure(e instanceof FeError&&e.rule==='age_not_verified'?t('fe.age.couple'):feErrorMessage(e,t));}finally{setBusy(false);}
 };
 const hasPhoto=p.photos.some(x=>!x.pending);
 const mode=settings.discoverMode;
 const toggle=(k:string,title:string,sub:string,on:boolean)=><button type="button" className="li" role="switch" aria-checked={on} disabled={busy} onClick={()=>set(k,!on)}>
  <span className="tx"><b>{title}</b><small>{sub}</small></span><span className={'sw'+(on?' on':'')} aria-hidden="true"/></button>;
 const modeSub=mode==='visible'&&!hasPhoto?(cp?t('fe.mx.v.noPhotoCouple'):t('fe.mx.v.noPhoto')):mode==='off'&&cp?t('fe.mx.v.offCouple'):cp?t('fe.mx.v.offNow'):t('fe.mx.v.modeSub');
 return <>
  <section className="grp"><div className="grp-t"><span>{t('fe.reg.discover.title')}</span></div><div className="card list">
   <div className="li"><SelectRow label={t('fe.mx.v.mode')} sub={modeSub} value={mode} onChange={v=>void set('discoverMode',v)}
    items={(['visible','hidden','off'] as const).map(v=>[v,t('fe.mx.v.mode.'+v+(cp?'Us':''))] as ['visible'|'hidden'|'off',string])}/></div>
   {mode==='visible'&&!hasPhoto&&<button type="button" className="li" onClick={()=>navigate('/n/me/edit?only=media')}><span className="ico"><Camera/></span><span className="tx"><b>{t('fe.me.photoAdd')}</b><small>{t('fe.mx.v.addPhotoSub')}</small></span><ChevronRight/></button>}
   <button type="button" className="li" onClick={()=>navigate('/n/me/preview')}><span className="tx"><b>{cp?t('fe.mx.v.cardUs'):t('fe.mx.v.card')}</b><small>{cp?t('fe.mx.v.cardSubUs'):t('fe.mx.v.cardSub')}</small></span><ChevronRight/></button>
   {toggle('acceptProfileLikes',t('fe.mx.v.likes'),cp?t('fe.mx.v.likesSubUs'):t('fe.mx.v.likesSub'),settings.acceptProfileLikes!==false)}
  </div></section>
  <section className="grp"><div className="grp-t"><span>{t('fe.me.layer.profile')}</span></div><div className="card list">
   <div className="li"><SelectRow label={t('fe.mx.v.activity')} sub={t('fe.mx.v.activitySub')} value={settings.activityVis??'all'} onChange={v=>void set('activityVis',v)}
    items={(['all','followers','off'] as const).map(v=>[v,t('fe.mx.v.act.'+v)] as ['all'|'followers'|'off',string])}/></div>
   <div className="li"><SelectRow label={cp?t('fe.mx.v.mentionUs'):t('fe.mx.v.mention')} sub={t('fe.mx.v.mentionSub')} value={settings.mentionsFrom??'all'} onChange={v=>void set('mentionsFrom',v)}
    items={(['all','follow','none'] as const).map(v=>[v,t('fe.mx.v.from.'+v+(v==='follow'&&cp?'Us':''))] as ['all'|'follow'|'none',string])}/></div>
   {!cp&&<div className="li"><SelectRow label={t('fe.mx.v.details')} sub={t('fe.mx.v.detailsSub')} value={(p.detailsVis??'all') as 'all'|'granted'|'only'} onChange={v=>void set('detailsVis',v)}
    items={(['all','granted','only'] as const).map(v=>[v,t('fe.reg.vis.'+v)] as ['all'|'granted'|'only',string])}/></div>}
   {toggle('showLikes',cp?t('fe.mx.v.showLikesUs'):t('fe.mx.v.showLikes'),cp?t('fe.mx.v.showLikesSubUs'):t('fe.mx.v.showLikesSub'),settings.showLikes!==false)}
  </div>{cp&&<p className="grp-n">{t('fe.mx.v.footUs')}</p>}</section>
  {failure&&<div className="alert err" role="alert"><span>{failure}{failure===t('fe.age.couple')&&<><br/><AgeCheckLink/></>}</span></div>}
 </>;
}
