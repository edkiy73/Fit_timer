import {Fragment,useCallback,useEffect,useState,type CSSProperties,type ReactNode} from 'react';
import {useLocation,useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Camera,ChevronDown,ChevronRight,ClipboardList,Clock,Eye,HeartOff,PenLine,Users,Newspaper,Settings,Star,Trash2,X} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {AddCard,Alert,Ask as KitAsk,Av,Btn,Card,Empty,Group,H,IconBtn,Note,PhotoAdd,PhotoSlot,PhotoSlots,Row,Seg,SelectRow,Sheet,Skel,ToggleRow} from './kit';
import {AgeCheckLink,useAgeResume} from './age-check';
import {dropReadCache,useFe,useRealtime} from './session';
import {PrivateLayer} from './private';
import {BellButton,countsRes} from './inbox';
import {MineLayer} from './mine';
import {MeJars} from './interests';
import {StaffEntry} from './staff';
import {LinksBlock,waitingCount} from './links';
import {ActAsSheet,CoupleMembers,CouplePending,CoupleVisGroup} from './couple';
import {linksMineRes} from './profile-extras';
import {useToast} from './toast';
import {DiscoverPhotoAsk} from './discover-photo';
import {useDragOrder} from './reorder';
import {MeGallery} from './gallery';
import {Viewer} from './post-parts';

/** V21 X01 «Я» with the prototype's markup (`meHead18`, `meProfileLayer`, `meVisLayer`): the header with the avatar,
 * bell, «Как видят» and settings; «Нужно решить»; the four layers with their red dots; photos, basics, details,
 * interests, gallery and links. The editors (P02/P04) live in me-edit.tsx. Everything comes from the server. */
export const media=z.object({id:z.uuid(),pending:z.boolean(),blurred:z.boolean().optional(),src:z.record(z.string(),z.string()).nullable(),
 /** A photo taken from one of the profile's own posts (wave 5): «Открыть публикацию». */ postId:z.uuid().optional()});
export const profile=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),own:z.boolean(),bio:z.string(),
 age:z.number().nullable(),city:z.object({id:z.string().optional(),ru:z.string().nullable(),en:z.string().nullable(),pending:z.boolean()}).nullable(),avatar:media.nullable(),photos:z.array(media),
 details:z.record(z.string(),z.unknown()),rev:z.number().optional(),detailsVis:z.string().nullable().optional(),showAge:z.boolean().optional(),cityId:z.string().nullable().optional()}).passthrough();
export const profileRes=z.object({ok:z.literal(true),profile});
export const settingsShape=z.object({discoverMode:z.enum(['visible','hidden','off']),privateOn:z.boolean(),acceptProfileLikes:z.boolean().optional(),requestsFrom:z.enum(['all','matches','none']).optional(),
 linksFrom:z.string().optional(),mentionsFrom:z.enum(['all','follow','none']).optional(),activityVis:z.enum(['all','followers','off']).optional(),showLikes:z.boolean().optional()}).passthrough();
export const settingsRes=z.object({ok:z.literal(true),settings:settingsShape});
export const option=z.object({kind:z.string(),code:z.string(),ru:z.string(),en:z.string()});
export const place=z.object({id:z.string(),code:z.string().nullable().optional(),country:z.string().optional(),ru:z.string(),en:z.string()});
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

// AudTag and Ask live in me-parts.tsx: screens that only need them do not pull the whole «Я» tab into the first load.
import {Ask,AudTag} from './me-parts';
export {Ask,AudTag};

/** The «Я» layers on the one tab control, with their red dots. */
function LayerSeg({value,onChange,dots}:{value:Layer,onChange:(v:Layer)=>void,dots:Record<Layer,string>}){
 const {t}=useI18n();
 return <Seg value={value} onChange={onChange} label={t('fe.nav.me')} options={(['profile','priv','vis','mine'] as const).map(id=>({id,label:t('fe.me.layer.'+id),dot:dots[id]||undefined}))}/>;
}

export function MeTab(){
 const {state,acting,setActing,call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const [p,setP]=useState<Profile|null>(null);const [settings,setSettings]=useState<Settings|null>(null);
 const [options,setOptions]=useState<z.infer<typeof option>[]>([]);
 const [error,setError]=useState<unknown>(null);
 const [layer,setLayerState]=useState<Layer>(()=>{const l=new URLSearchParams(location.hash.split('?')[1]??'').get('layer');return l==='priv'||l==='mine'||l==='vis'?l:'profile';});
 const [notice,setNotice]=useState('');const [tick,setTick]=useState(0);const [switching,setSwitching]=useState(false);
 const [todo,setTodo]=useState(0);const [dots,setDots]=useState<{links:number,reqs:number,vis:number}>({links:0,reqs:0,vis:0});
 // A link to «Я» with `?layer=` while «Я» is already open (notifications, «Моё» redirects) switches the layer too.
 const {search}=useLocation();
 useEffect(()=>{const l=new URLSearchParams(search).get('layer');setLayerState(l==='priv'||l==='mine'||l==='vis'?l:'profile');},[search]);
 const setLayer=(l:Layer)=>{setLayerState(l);setNotice('');const base=location.hash.split('?')[0]||'#/n/me';history.replaceState(history.state,'',l==='profile'?base:base+'?layer='+l);document.querySelector('.me18')?.scrollTo({top:0});};
 const load=useCallback(()=>{
  if(!acting)return;setError(null);setTick(n=>n+1);
  // Everything the first layer shows is asked in one wave and the layer appears whole (owner 28.10.2026: no rows
  // popping in later): the blocks below (interests, gallery, links, the staff button, «Нужно решить») read the same
  // commands and get these answers from the session's read cache at once. Their failures stay theirs.
  const id=acting.id;const any=z.unknown();
  const parts=[call('interests.list',{profileId:id},any),call('album.list',{profileId:id},any),call('gallery.list',{profileId:id},any),
   call('links.mine',{},any),call('staff.me',{},any,{asAccount:true}),call('inbox.counts',{},any,{asAccount:true}),call('catalog.get',{},any,{asAccount:true})];
  Promise.all([call('profile.get',{profileId:id},profileRes),call('profile.settings',{},settingsRes),Promise.allSettled(parts)])
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
  <H level={1} className="sr-only" tabIndex={-1}>{t('fe.nav.me')}</H>
  <div className="view me18 me-x01">
   <header className="me18-h wrap">
    <span className="av-wrap"><Av name={name} seed={acting.id} src={avatarSrc}/></span>
    {couple?<button type="button" className="me18-who" aria-haspopup="dialog" aria-label={t('fe.mx.whose')} onClick={()=>setSwitching(true)}>
      <b><span>{name}</span><ChevronDown/></b><small>{acting.kind==='couple'?t('fe.me.weCouple'):t('fe.me.iPersonal')}</small></button>
     :<div className="me18-who"><b><span>{name}</span></b><small>{t('fe.me.personalProfile')}</small></div>}
    <StaffEntry/>
    <BellButton/>
    <IconBtn icon={Eye} label={t('fe.mx.howSeen')} title={t('fe.mx.howSeen')} onClick={()=>navigate('/n/me/preview')}/>
    <IconBtn icon={Settings} label={t('fe.me.settings')} onClick={()=>navigate('/n/settings')}/>
   </header>
   <div className="wrap">
    {todo>0&&<button type="button" className="me-todo" onClick={()=>navigate('/n/inbox')}><i/><span>{t('fe.mx.todo')}</span><b>{todo}</b><ChevronRight/></button>}
    <div className="me18-seg me4"><LayerSeg value={layer} onChange={setLayer} dots={layerDots}/></div>
   </div>
   <div className="wrap">
    {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
     :!p||!settings?<MeSkel/>
     :layer==='profile'?<>
      {notice&&<Alert kind="ok" noIcon>{notice}</Alert>}
      {acting.kind==='couple'&&<><CouplePending base={p} tick={tick} onDecided={msg=>{setNotice(msg);load();}}/><CoupleMembers/></>}
      <PhotosBlock p={p} settings={settings} onChanged={load}/>
      <Group id="meBasics" title={t('fe.me.basics')} action={<AudTag k="all"/>}>
       <Card className="blk-btn" label={t('fe.me.editBasics')} onClick={()=>navigate('/n/me/edit?only=basics')}>
        <span className="blk-name">{name}{p.age&&p.showAge!==false?', '+p.age:''}{p.city&&(locale==='en'?p.city.en:p.city.ru)?' · '+(locale==='en'?p.city.en:p.city.ru):''}</span>
        {p.bio&&<span className="blk-bio">{p.bio.replace(/[*_~`>#[\]()]/g,'').slice(0,240)}</span>}<span className="chv"><ChevronRight/></span>
       </Card>
       {!p.bio&&<AddCard icon={PenLine} title={t(acting.kind==='couple'?'fe.mp.bioAddUs':'fe.mp.bioAdd')} sub={t(acting.kind==='couple'?'fe.mp.bioAddSubUs':'fe.mp.bioAddSub')} onClick={()=>navigate('/n/me/edit?only=basics')}/>}
      </Group>
      <DetailsBlock p={p} label={label}/>
      {acting.kind==='person'&&couple&&<StatusHint p={p} coupleId={couple.id} onDone={load}/>}
      <MeJars key={p.id}/>
      <GalleryBlock p={p}/>
      <LinksBlock key={'links'+p.id} onChanged={pullCounts}/>
     </>
     :layer==='priv'?<PrivateLayer profileId={p.id} on={privOn} requestsFrom={settings.requestsFrom??'all'} onChanged={()=>{load();pullCounts();}}/>
     :layer==='mine'?<MineLayer/>
     :<>{acting.kind==='couple'&&<CouplePending base={p} tick={tick} onDecided={()=>{load();pullCounts();}}/>}<Visibility p={p} settings={settings} onChanged={load}/>{acting.kind==='couple'&&<CoupleVisGroup/>}</>}
   </div>
  </div>
  {switching&&<ActAsSheet onClose={()=>setSwitching(false)}/>}
 </>;
}

/** The loading state shaped like the profile layer: the photo grid, then two cards. */
function MeSkel(){
 return <div aria-busy="true"><Group className="ph20"><PhotoSlots loading/></Group><Skel kind="card" rows={2}/></div>;
}

/** «Данные» — the filled rows only; the audience comes from the profile's `detailsVis`. */
function DetailsBlock({p,label}:{p:Profile,label:(kind:string,code:string)=>string}){
 const {t}=useI18n();const navigate=useNavigate();const cp=p.kind==='couple';
 const rows=DETAIL_ROWS.filter(([f])=>!cp||COUPLE_ROWS.includes(f)).map(([field,kind])=>{const v=p.details[field];const codes=Array.isArray(v)?v as string[]:typeof v==='string'?[v]:[];
  return codes.length?[field,t(kind==='status'?'fe.mx.f.status':'fe.reg.kind.'+kind),codes.map(c=>label(kind,c)).join(', ')]:null;}).filter((x):x is string[]=>!!x);
 const title=cp?t('fe.mx.detailsCouple'):t('fe.me.details');
 return <Group id="meDet" title={title} action={<AudTag k={p.detailsVis??'all'}/>}>
  {rows.length?<Card className="blk-btn" label={t('fe.mx.editOf',{title})} onClick={()=>navigate('/n/me/edit?only=details')}>
   <dl className="kv">{rows.map(([f,k,v])=><Fragment key={f}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
   <span className="chv"><ChevronRight/></span>
  </Card>
   :<AddCard icon={ClipboardList} title={t('fe.mp.detailsAdd')} sub={cp?t('fe.mx.detailsEmptyCouple'):t('fe.mx.detailsEmpty')} onClick={()=>navigate('/n/me/edit?only=details')}/>}
 </Group>;
}

/** V21.1 ME-047: a person in a couple whose status says «single» or nothing gets one sentence and one tap to fix it. */
function StatusHint({p,coupleId,onDone}:{p:Profile,coupleId:string,onDone:()=>void}){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();
 const [off,setOff]=useState(()=>{try{return localStorage.getItem(STAT_HINT_KEY)===p.id;}catch{return false;}});
 const [partner,setPartner]=useState('');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const status=typeof p.details.status==='string'?p.details.status:null;
 const show=!off&&(!status||status==='single');
 useEffect(()=>{if(!show)return;call('couple.get',{},coupleRes,{profileId:coupleId}).then(r=>{const o=r.couple.members.find(m=>!m.me);setPartner(o?(o.name||(o.handle?'@'+o.handle:'')):'');}).catch(()=>{});},[call,coupleId,show]);
 if(!show)return null;
 // «Отменить» in the toast puts the old status back (V21 meStatFix21); the profile's new rev comes from the server.
 const fix=async()=>{setBusy(true);setFailure('');
  try{await call('profile.update',{opId:newOpId(),rev:p.rev,status:'partnered'},ok);onDone();
   toast(t('fe.w7.stat.done'),{type:'ok',action:{label:t('fe.mx.undo'),fn:()=>void(async()=>{
    try{const cur=await call('profile.get',{profileId:p.id},profileRes);await call('profile.update',{opId:newOpId(),rev:cur.profile.rev,status},ok);toast(t('fe.w7.stat.undone'),{type:'ok'});onDone();}
    catch(e){toast(feErrorMessage(e,t),{type:'err'});}})()}});}
  catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy(false);}};
 const keep=()=>{try{localStorage.setItem(STAT_HINT_KEY,p.id);}catch{/* per-viewer convenience only */}setOff(true);};
 return <Alert kind="info" role="none" icon={Users} className="me-stat21"><b>{t(status?'fe.mx.stat.single':'fe.mx.stat.none',{name:partner||t('fe.mx.stat.partner')})}</b>
  <span className="me-stat21-a"><Btn size="sm" onClick={fix} disabled={busy} busy={busy}>{t('fe.mx.stat.fix')}</Btn><Btn size="sm" kind="soft" onClick={keep}>{t('fe.mx.stat.keep')}</Btn></span>
  {failure&&<Note as="span">{failure}</Note>}</Alert>;
}

export const photoSrc=(m:{src:Record<string,string>|null},size:'card'|'thumb'|'full'='card')=>m.src?(m.src[size]??m.src.card??m.src.thumb??m.src.blur??null):null;

/** `mePhotos20()` — the grid of profile photos: the main one big, «Ещё фото» next to it; a tap opens what can be done
 * with that photo; «Изменить» opens the photo editor (P02 `only:'media'`). */
function PhotosBlock({p,settings,onChanged}:{p:Profile,settings:Settings,onChanged:()=>void}){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const toast=useToast();
 const [open,setOpen]=useState<number|null>(null);const [busy,setBusy]=useState(false);const [viewing,setViewing]=useState<number|null>(null);
 const cp=p.kind==='couple';
 // Press and drag a photo to change the order; it is saved at once, with «Отменить».
 const drag=useDragOrder<'ph'>((_,ids)=>{void write(ids,t('fe.mx.ph.orderSaved'),p.photos.map(x=>x.id));});
 const items=drag.arrange('ph',p.photos);
 // A fresh upload has no served copies for a few seconds (it is being checked): its slot blinks and the profile is
 // asked again until the picture is there, instead of staying an empty grey box.
 const waiting=p.photos.some(x=>!x.src);
 useEffect(()=>{
  if(!waiting)return;let n=0,id=0,live=true;
  const poll=()=>{id=window.setTimeout(()=>{n++;dropReadCache();
   call('profile.get',{profileId:p.id},profileRes).then(r=>{if(!live)return;if(r.profile.photos.every(x=>x.src))onChanged();else if(n<20)poll();}).catch(()=>{if(live&&n<20)poll();});},4000);};
  poll();return ()=>{live=false;window.clearTimeout(id);};
 },[waiting,p.id,call,onChanged]);
 const edit=()=>navigate('/n/me/edit?only=media');
 if(!items.length)return <Group className="ph20" id="mePh" title={t('fe.me.photos')} action={<AudTag k="all"/>}>
  <AddCard icon={Camera} title={cp?t('fe.mx.ph.addCouple'):t('fe.me.photoAdd')} sub={settings.discoverMode==='visible'?(cp?t('fe.mx.ph.needCouple'):t('fe.mx.ph.need')):t('fe.mx.ph.mainHint')} onClick={edit}/>
 </Group>;
 const write=async(ids:string[],msg:string,prev?:string[])=>{
  setBusy(true);
  try{const r=await call('profile.photosSet',{opId:newOpId(),assetIds:ids},ok);onChanged();
   toast(r.pending?t('fe.cw.waitPartner'):msg,{type:'ok',...(prev&&!r.pending?{action:{label:t('fe.mx.undo'),fn:()=>{void call('profile.photosSet',{opId:newOpId(),assetIds:prev},ok).then(onChanged).catch(e=>toast(feErrorMessage(e,t),{type:'err'}));}}}:{})});}
  catch(e){toast(feErrorMessage(e,t),{type:'err'});}finally{setBusy(false);}
 };
 const ids=items.map(x=>x.id);
 const nCells=items.length===1?2:Math.min(MAX_PHOTOS,Math.max(items.length+1,3));
 // The small thumb paints first, so the slot never sits empty while the card-size picture loads.
 const slots:ReactNode[]=items.map((ph,i)=><PhotoSlot key={ph.id} id={ph.id} big={i===0} dragging={drag.preview?.drag===ph.id} waiting={!ph.src} thumb={ph.src?.thumb} src={photoSrc(ph)}
  main={i===0?t('fe.me.mainPhoto'):undefined} review={ph.pending?t('fe.mx.ph.review'):undefined} onPointerDown={busy?undefined:e=>drag.down(e,'ph',ids,ph.id)}
  openLabel={t('fe.mx.ph.nOf',{n:i+1,total:items.length})} onOpen={()=>setOpen(i)}/>);
 for(let i=items.length;i<nCells;i++)slots.push(i===items.length
  ?<PhotoAdd key="add" tall={items.length===1} onClick={edit} label={t('fe.mx.ph.addAria')} hint={items.length===1?t('fe.me.morePhotos'):undefined}/>
  :<PhotoAdd key={'g'+i} ghost/>);
 const x=open!==null?items[open]:undefined;
 return <Group className="ph20" id="mePh" title={t('fe.me.photos')} action={<><AudTag k="all"/><button type="button" onClick={edit}>{t('fe.mx.edit')}</button></>}>
  <PhotoSlots>{slots}</PhotoSlots>
  {x&&open!==null&&<Sheet title={open===0?t('fe.mx.ph.main'):t('fe.mx.ph.nOf',{n:open+1,total:items.length})} onClose={()=>setOpen(null)}>
   <div className="ph-sheet-prev">{photoSrc(x)&&<img src={photoSrc(x)!} alt="" draggable={false}/>}{x.pending&&<span className="ph-rev"><Clock/><span>{t('fe.mx.ph.review')}</span></span>}</div>
   <Card list>
    <Row icon={Eye} title={t('fe.mx.ph.view')} noChev onClick={()=>{const i=open;setOpen(null);setViewing(i);}}/>
    {open>0&&!x.pending&&<Row icon={Star} title={t('fe.mx.ph.makeMain')} sub={t('fe.mx.ph.makeMainSub')} noChev disabled={busy}
     onClick={()=>{const i=open;setOpen(null);void write([ids[i]!,...ids.filter((_,k)=>k!==i)],t('fe.mx.ph.mainDone'),ids);}}/>}
    {x.postId&&<Row icon={Newspaper} title={t('fe.gal.openPost')} sub={t('fe.gal.openPostSub')} noChev onClick={()=>{setOpen(null);navigate('/n/feed/post/'+x.postId);}}/>}
    <Row icon={Trash2} title={t('fe.mx.ph.remove')} sub={x.postId?t('fe.gal.postStays'):undefined} danger disabled={busy} onClick={()=>{const i=open;setOpen(null);void write(ids.filter((_,k)=>k!==i),t('fe.mx.ph.removed'),ids);}}/>
   </Card>
  </Sheet>}
  {viewing!==null&&<Viewer srcs={items.map(ph=>photoSrc(ph,'full')).filter((s):s is string=>!!s)} index={viewing} onClose={()=>setViewing(null)}/>}
 </Group>;
}

/** `galleryOwn20()` — «Все» and the albums (wave 5, src/fe/gallery.tsx), «Загрузить» to the composer with photos;
 * empty — the one «add» card, no header action (like every empty block of «Я»). */
function GalleryBlock({p}:{p:Profile}){
 const {t}=useI18n();
 return <MeGallery profileId={p.id} couple={p.kind==='couple'} title={t('fe.mx.gal')}/>;
}

/** `meVisLayer()` — Discover, the profile card, likes, activity, mentions; the couple's own group comes after. */
function Visibility({p,settings,onChanged}:{p:Profile,settings:Settings,onChanged:()=>void}){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();const toast=useToast();
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [ageIntent,setAgeIntent]=useState('');const [askOff,setAskOff]=useState(false);
 const cp=p.kind==='couple';
 const set=async(setting:string,value:string|boolean,done?:string)=>{
  if(busy)return;setBusy(true);setFailure('');
  try{const r=await call(setting==='detailsVis'?'profile.update':'profile.setVisibility',setting==='detailsVis'?{opId:newOpId(),rev:p.rev,detailsVis:value}:{opId:newOpId(),setting,value},ok);
   toast(r.pending?t('fe.cw.waitPartner'):done??t('fe.mx.saved'),{type:'ok'});onChanged();}
  catch(e){
   const age=e instanceof FeError&&e.rule==='age_not_verified';
   // The age check this sends to comes back here and applies the same change (`vis:<setting>:<value>`).
   setAgeIntent(age?`vis:${setting}:${String(value)}`:'');
   setFailure(age?t('fe.age.couple'):feErrorMessage(e,t));}finally{setBusy(false);}
 };
 useAgeResume(v=>/^vis:[a-zA-Z]+:[a-z]+$/.test(v),v=>{const [,k,raw]=v.split(':') as [string,string,string];void set(k,raw==='true'?true:raw==='false'?false:raw);});
 const hasPhoto=p.photos.some(x=>!x.pending);
 // Owner 28.10.2026: Discover is off for new accounts; «Показываюсь» without any photo asks for one first (DiscoverPhotoAsk).
 const [askPhoto,setAskPhoto]=useState(false);
 const mode=settings.discoverMode;
 const toggle=(k:string,title:string,sub:string,on:boolean)=><ToggleRow title={title} sub={sub} on={on} disabled={busy} onClick={()=>void set(k,!on)}/>;
 const modeSub=mode==='visible'&&!hasPhoto?(p.photos.length?t(cp?'fe.mx.v.photoReviewUs':'fe.mx.v.photoReview'):cp?t('fe.mx.v.noPhotoCouple'):t('fe.mx.v.noPhoto')):mode==='off'&&cp?t('fe.mx.v.offCouple'):cp?t('fe.mx.v.offNow'):t('fe.mx.v.modeSub');
 return <>
  <Group title={t('fe.reg.discover.title')}><Card list>
   <SelectRow row label={t('fe.mx.v.mode')} sub={modeSub} value={mode} onChange={v=>{if(v==='off'&&mode!=='off')setAskOff(true);else if(v==='visible'&&!p.photos.length)setAskPhoto(true);else void set('discoverMode',v);}}
    options={(['visible','hidden','off'] as const).map(v=>[v,t('fe.mx.v.mode.'+v+(cp?'Us':''))] as const)}/>
   <Row title={cp?t('fe.mx.v.cardUs'):t('fe.mx.v.card')} sub={cp?t('fe.mx.v.cardSubUs'):t('fe.mx.v.cardSub')} onClick={()=>navigate('/n/me/preview')}/>
   {toggle('acceptProfileLikes',t('fe.mx.v.likes'),cp?t('fe.mx.v.likesSubUs'):t('fe.mx.v.likesSub'),settings.acceptProfileLikes!==false)}
  </Card></Group>
  <Group title={t('fe.me.layer.profile')} foot={cp?t('fe.mx.v.footUs'):undefined}><Card list>
   <SelectRow row label={t('fe.mx.v.activity')} sub={t('fe.mx.v.activitySub')} value={settings.activityVis??'all'} onChange={v=>void set('activityVis',v)}
    options={(['all','followers','off'] as const).map(v=>[v,t('fe.mx.v.act.'+v)] as const)}/>
   <SelectRow row label={cp?t('fe.mx.v.mentionUs'):t('fe.mx.v.mention')} sub={t('fe.mx.v.mentionSub')} value={settings.mentionsFrom??'all'} onChange={v=>void set('mentionsFrom',v)}
    options={(['all','follow','none'] as const).map(v=>[v,t('fe.mx.v.from.'+v+(v==='follow'&&cp?'Us':''))] as const)}/>
   {!cp&&<SelectRow row label={t('fe.mx.v.details')} sub={t('fe.mx.v.detailsSub')} value={(p.detailsVis??'all') as 'all'|'granted'|'only'} onChange={v=>void set('detailsVis',v)}
    options={(['all','granted','only'] as const).map(v=>[v,t('fe.reg.vis.'+v)] as const)}/>}
   {toggle('showLikes',cp?t('fe.mx.v.showLikesUs'):t('fe.mx.v.showLikes'),cp?t('fe.mx.v.showLikesSubUs'):t('fe.mx.v.showLikesSub'),settings.showLikes!==false)}
  </Card></Group>
  {failure&&<Alert kind="err" noIcon>{failure}{failure===t('fe.age.couple')&&<><br/><AgeCheckLink intent={ageIntent||undefined}/></>}</Alert>}
  {/* V21 k4off: switching Discover off is asked first — matches, chats and access stay. */}
  {askOff&&<KitAsk icon={HeartOff} danger title={t(cp?'fe.w7.k4off.titleUs':'fe.w7.k4off.title')} text={t(cp?'fe.w7.k4off.textUs':'fe.w7.k4off.text')} ok={t('fe.w7.k4off.ok')} busy={busy}
   onOk={()=>{setAskOff(false);void set('discoverMode','off');}} onCancel={()=>setAskOff(false)}/>}
  {askPhoto&&<DiscoverPhotoAsk existing={p.photos.map(x=>x.id)} couple={cp} onCancel={()=>setAskPhoto(false)}
   onAdded={async()=>{setAskPhoto(false);await set('discoverMode','visible',t(cp?'fe.dph.onReviewUs':'fe.dph.onReview'));}}/>}
 </>;
}
