import {Fragment,useEffect,useState,type ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Camera,ClipboardList,Clock,Eye,HeartOff,Newspaper,Settings,Star,Trash2} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {AddCard,Alert,Ask as KitAsk,Card,Group,MultiChips,PhotoAdd,PhotoSlot,PhotoSlots,Row,SelectRow,Sheet,Skel,ToggleRow} from './kit';
import {MESSAGE_POINTS,MESSAGES_DEFAULT} from '../../contracts/_messages.mjs';
import {AgeCheckLink,useAgeResume} from './age-check';
import {dropReadCache,useFe} from './session';
import {useToast} from './toast';
import {DiscoverPhotoAsk} from './discover-photo';
import {useDragOrder} from './reorder';
import {Viewer} from './post-parts';

export const media=z.object({id:z.uuid(),pending:z.boolean(),blurred:z.boolean().optional(),src:z.record(z.string(),z.string()).nullable(),
 /** A photo taken from one of the profile's own posts (wave 5): «Открыть публикацию». */ postId:z.uuid().optional()});
export const profile=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),own:z.boolean(),bio:z.string(),
 age:z.number().nullable(),chosenName:z.string().optional(),nickAt:z.string().nullable().optional(),nameAt:z.string().nullable().optional(),nickFirst:z.boolean().optional(),city:z.object({id:z.string().optional(),ru:z.string().nullable(),en:z.string().nullable(),pending:z.boolean()}).nullable(),avatar:media.nullable(),photos:z.array(media),
 details:z.record(z.string(),z.unknown()),rev:z.number().optional(),detailsVis:z.string().nullable().optional(),showAge:z.boolean().optional(),cityId:z.string().nullable().optional()}).passthrough();
export const profileRes=z.object({ok:z.literal(true),profile});
export const settingsShape=z.object({discoverMode:z.enum(['visible','hidden','off']),privateOn:z.boolean(),acceptProfileLikes:z.boolean().optional(),requestsFrom:z.enum(['all','matches','none']).optional(),
 linksFrom:z.string().optional(),mentionsFrom:z.enum(['all','follow','none']).optional(),activityVis:z.enum(['all','followers','off']).optional(),showLikes:z.boolean().optional(),
 messagesFrom:z.array(z.enum(MESSAGE_POINTS)).optional()}).passthrough();
export const settingsRes=z.object({ok:z.literal(true),settings:settingsShape});
export const option=z.object({kind:z.string(),code:z.string(),ru:z.string(),en:z.string()});
export const place=z.object({id:z.string(),code:z.string().nullable().optional(),country:z.string().optional(),ru:z.string(),en:z.string(),lat:z.number().nullable().optional(),lon:z.number().nullable().optional()});
export const catalogRes=z.object({ok:z.literal(true),options:z.array(option),places:z.array(place).optional()});
export const ok=z.object({ok:z.literal(true)}).passthrough();
export type Profile=z.infer<typeof profile>;
export type Settings=z.infer<typeof settingsShape>;
/** Profile fields → catalog option kinds; a couple keeps only the shared ones (prototype COUPLE_FIELDS). */
export const DETAIL_ROWS:[string,string][]=[['genders','gender'],['orients','orient'],['roles','role'],['status','status'],['formats','format'],['seeks','seek']];
export const COUPLE_ROWS=['roles','formats','seeks'];
export const MAX_PHOTOS=6;

// AudTag and Ask live in me-parts.tsx: screens that only need them do not pull the whole «Я» tab into the first load.
import {Ask,AudTag} from './me-parts';
export {Ask,AudTag};

/** The loading state shaped like the profile layer: the photo grid, then two cards. */
export function MeSkel(){
 return <div aria-busy="true"><Group className="ph20"><PhotoSlots loading/></Group><Skel kind="card" rows={2}/></div>;
}

/** «Данные» — the filled rows only, «Изменить» in the header like «Обо мне» (owner 04.11.2026); everyone sees them. */
export function DetailsBlock({p,label}:{p:Profile,label:(kind:string,code:string)=>string}){
 const {t}=useI18n();const navigate=useNavigate();const cp=p.kind==='couple';
 const rows=DETAIL_ROWS.filter(([f])=>!cp||COUPLE_ROWS.includes(f)).map(([field,kind])=>{const v=p.details[field];const codes=Array.isArray(v)?v as string[]:typeof v==='string'?[v]:[];
  return codes.length?[field,t(kind==='status'?'fe.mx.f.status':'fe.reg.kind.'+kind),codes.map(c=>label(kind,c)).join(', ')]:null;}).filter((x):x is string[]=>!!x);
 const title=cp?t('fe.mx.detailsCouple'):t('fe.me.details');
 return <Group id="meDet" title={title} action={rows.length?<button type="button" onClick={()=>navigate('/n/me/edit?only=details')}>{t('fe.mx.edit')}</button>:undefined}>
  {rows.length?<Card><dl className="kv side">{rows.map(([f,k,v])=><Fragment key={f}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl></Card>
   :<AddCard icon={ClipboardList} title={t('fe.mp.detailsAdd')} sub={cp?t('fe.mx.detailsEmptyCouple'):t('fe.mx.detailsEmpty')} onClick={()=>navigate('/n/me/edit?only=details')}/>}
 </Group>;
}

export const photoSrc=(m:{src:Record<string,string>|null},size:'card'|'thumb'|'full'='card')=>m.src?(m.src[size]??m.src.card??m.src.thumb??m.src.blur??null):null;

/** `mePhotos20()` — the grid of profile photos: the main one big, «Ещё фото» next to it; a tap opens what can be done
 * with that photo; «Изменить» opens the photo editor (P02 `only:'media'`). */
export function PhotosBlock({p,settings,onChanged,action}:{p:Profile,settings:Settings,onChanged:()=>void,action?:ReactNode}){
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
 if(!items.length)return <Group className="ph20" id="mePh" title={t('fe.me.photos')} action={action}>
  <AddCard icon={Camera} title={cp?t('fe.mx.ph.addCouple'):t('fe.me.photoAdd')} sub={settings.discoverMode==='visible'?(cp?t('fe.mx.ph.needCouple'):t('fe.mx.ph.need')):t('fe.mx.ph.mainHint')} onClick={edit}/>
 </Group>;
 const write=async(ids:string[],msg:string,prev?:string[])=>{
  setBusy(true);
  try{const r=await call('profile.photosSet',{opId:newOpId(),assetIds:ids},ok);onChanged();
   toast(r.pending?t('fe.cw.waitPartner'):msg,{type:'ok',...(prev&&!r.pending?{action:{label:t('fe.mx.undo'),fn:()=>{void call('profile.photosSet',{opId:newOpId(),assetIds:prev},ok).then(onChanged).catch(e=>toast(feErrorMessage(e,t),{type:'err'}));}}}:{})});}
  catch(e){toast(feErrorMessage(e,t),{type:'err'});}finally{setBusy(false);}
 };
 const ids=items.map(x=>x.id);
 // Every place is drawn: a wide screen shows all six in one row; a phone hides the empty ones past the third (kit CSS).
 const nCells=MAX_PHOTOS;
 // The small thumb paints first, so the slot never sits empty while the card-size picture loads.
 const slots:ReactNode[]=items.map((ph,i)=><PhotoSlot key={ph.id} id={ph.id} big={i===0} dragging={drag.preview?.drag===ph.id} waiting={!ph.src} thumb={ph.src?.thumb} src={photoSrc(ph)}
  main={i===0?t('fe.me.mainPhoto'):undefined} review={ph.pending?t('fe.mx.ph.review'):undefined} onPointerDown={busy?undefined:e=>drag.down(e,'ph',ids,ph.id)}
  openLabel={t('fe.mx.ph.nOf',{n:i+1,total:items.length})} onOpen={()=>setOpen(i)}/>);
 for(let i=items.length;i<nCells;i++)slots.push(i===items.length
  ?<PhotoAdd key="add" onClick={edit} label={t('fe.mx.ph.addAria')} hint={t('fe.me.morePhotos')}/>
  :<PhotoAdd key={'g'+i} ghost/>);
 const x=open!==null?items[open]:undefined;
 // No «Изменить» (owner 05.11.2026: nobody saw it): a tap on a photo opens what it can do, a hold moves it, «+» adds.
 return <Group className="ph20" id="mePh" title={t('fe.me.photos')} action={action}>
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

/** `meVisLayer()` — Discover, the profile card, likes, activity, mentions; the couple's own group comes after.
 * `part` draws one half (the «Знакомства» or the «Кто может…» section of the new settings); `who` adds the other
 * «кто может» choices kept elsewhere today (access requests, links). */
export function Visibility({p,settings,onChanged,part}:{p:Profile,settings:Settings,onChanged:()=>void,part?:'discover'|'who'|undefined}){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();const toast=useToast();
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [ageIntent,setAgeIntent]=useState('');const [askOff,setAskOff]=useState(false);
 const cp=p.kind==='couple';
 const set=async(setting:string,value:string|boolean|readonly string[],done?:string)=>{
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
  {part!=='who'&&<Group title={t('fe.reg.discover.title')}><Card list>
   <SelectRow row label={t('fe.mx.v.mode')} sub={modeSub} value={mode} onChange={v=>{if(v==='off'&&mode!=='off')setAskOff(true);else if(v==='visible'&&!p.photos.length)setAskPhoto(true);else void set('discoverMode',v);}}
    options={(['visible','hidden','off'] as const).map(v=>[v,t('fe.mx.v.mode.'+v+(cp?'Us':''))] as const)}/>
   <Row title={cp?t('fe.mx.v.cardUs'):t('fe.mx.v.card')} sub={cp?t('fe.mx.v.cardSubUs'):t('fe.mx.v.cardSub')} onClick={()=>navigate('/n/me/preview')}/>
   {toggle('acceptProfileLikes',t('fe.mx.v.likes'),cp?t('fe.mx.v.likesSubUs'):t('fe.mx.v.likesSub'),settings.acceptProfileLikes!==false)}
  </Card></Group>}
  {part!=='discover'&&<><Group title={t('fe.me.layer.profile')} foot={cp?t('fe.mx.v.footUs'):undefined}><Card list>
   <SelectRow row label={t('fe.mx.v.activity')} sub={t('fe.mx.v.activitySub')} value={settings.activityVis??'all'} onChange={v=>void set('activityVis',v)}
    options={(['all','followers','off'] as const).map(v=>[v,t('fe.mx.v.act.'+v)] as const)}/>
   <SelectRow row label={cp?t('fe.mx.v.mentionUs'):t('fe.mx.v.mention')} sub={t('fe.mx.v.mentionSub')} value={settings.mentionsFrom??'all'} onChange={v=>void set('mentionsFrom',v)}
    options={(['all','follow','none'] as const).map(v=>[v,t('fe.mx.v.from.'+v+(v==='follow'&&cp?'Us':''))] as const)}/>
   {toggle('showLikes',cp?t('fe.mx.v.showLikesUs'):t('fe.mx.v.showLikes'),cp?t('fe.mx.v.showLikesSubUs'):t('fe.mx.v.showLikesSub'),settings.showLikes!==false)}
  </Card></Group>
  {/* «Кто может мне писать» (owner 29.10.2026, message requests); the server enforces it. */}
  <Group title={cp?t('fe.rq.set.titleUs'):t('fe.rq.set.title')} foot={t('fe.rq.set.foot')}>
   {/* Chips (owner 05.11.2026): «Все» stands alone; nothing picked — only a like; a mutual like always opens a chat. */}
   <MultiChips label={cp?t('fe.rq.set.titleUs'):t('fe.rq.set.title')} value={settings.messagesFrom??[...MESSAGES_DEFAULT]} only="all" onChange={v=>void set('messagesFrom',v)}
    options={MESSAGE_POINTS.map(v=>[v,t('fe.rq.set.'+v+(cp&&(v==='followers'||v==='following')?'Us':''))] as const)}/>
  </Group>
  {part==='who'&&<Group title={t('fe.m2.who.more')}><Card list>
   <SelectRow row label={t('fe.mx.pr.reqFrom')} value={settings.requestsFrom??'all'} onChange={v=>void set('requestsFrom',v)}
    options={(['all','matches','none'] as const).map(v=>[v,t('fe.mx.pr.from.'+v)] as const)}/>
   <SelectRow row label={t('fe.ln.from')} value={(settings.linksFrom??'all') as 'all'|'follow'|'none'} onChange={v=>void set('linksFrom',v)}
    options={(['all','follow','none'] as const).map(v=>[v,t('fe.ln.from.'+v)] as const)}/>
  </Card></Group>}</>}
  {failure&&<Alert kind="err" noIcon>{failure}{failure===t('fe.age.couple')&&<><br/><AgeCheckLink intent={ageIntent||undefined}/></>}</Alert>}
  {/* V21 k4off: switching Discover off is asked first — matches, chats and access stay. */}
  {askOff&&<KitAsk icon={HeartOff} danger title={t(cp?'fe.w7.k4off.titleUs':'fe.w7.k4off.title')} text={t(cp?'fe.w7.k4off.textUs':'fe.w7.k4off.text')} ok={t('fe.w7.k4off.ok')} busy={busy}
   onOk={()=>{setAskOff(false);void set('discoverMode','off');}} onCancel={()=>setAskOff(false)}/>}
  {askPhoto&&<DiscoverPhotoAsk existing={p.photos.map(x=>x.id)} couple={cp} onCancel={()=>setAskPhoto(false)}
   onAdded={async()=>{setAskPhoto(false);await set('discoverMode','visible',t(cp?'fe.dph.onReviewUs':'fe.dph.onReview'));}}/>}
 </>;
}
