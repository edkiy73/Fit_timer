import {useCallback,useEffect,useRef,useState} from 'react';
import {Link} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Icon} from '../feture/components/Icon';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {ActionButton,Avatar,ScreenHeader,StateCard} from './components';
import {useFe} from './session';

/** Slice C (V21 X01/P02/P03): own profile, photos (approved ones show to others; «на проверке» only to the
 * owner), name and bio, Discover and who sees the answers. A couple's widening edits may wait for the partner. */
const media=z.object({id:z.uuid(),pending:z.boolean(),blurred:z.boolean().optional(),src:z.record(z.string(),z.string()).nullable()});
const profile=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),own:z.boolean(),bio:z.string(),
 age:z.number().nullable(),city:z.object({ru:z.string().nullable(),en:z.string().nullable(),pending:z.boolean()}).nullable(),avatar:media.nullable(),photos:z.array(media),
 rev:z.number().optional(),detailsVis:z.string().nullable().optional()});
const profileRes=z.object({ok:z.literal(true),profile});
const settingsRes=z.object({ok:z.literal(true),settings:z.object({discoverMode:z.enum(['visible','hidden','off']),privateOn:z.boolean()}).passthrough()});
const ok=z.object({ok:z.literal(true)}).passthrough();
const intent=z.object({ok:z.literal(true),assetId:z.uuid(),upload:z.object({url:z.string(),method:z.string(),headers:z.record(z.string(),z.string())})});
type Profile=z.infer<typeof profile>;

export function MeTab(){
 const {state,acting,setActing,call}=useFe();const {t,locale}=useI18n();
 const [p,setP]=useState<Profile|null>(null);const [settings,setSettings]=useState<z.infer<typeof settingsRes>['settings']|null>(null);
 const [error,setError]=useState<unknown>(null);const [notice,setNotice]=useState('');const [editing,setEditing]=useState(false);
 const load=useCallback(()=>{
  if(!acting)return;setError(null);
  Promise.all([call('profile.get',{profileId:acting.id},profileRes),call('profile.settings',{},settingsRes)])
   .then(([a,b])=>{setP(a.profile);setSettings(b.settings);}).catch(setError);
 },[call,acting]);
 useEffect(()=>{setP(null);load();},[load]);
 if(state.status!=='ready'||!acting)return null;
 const profiles=state.boot.profiles.filter(x=>x.state!=='deleted');
 const name=p?.name||acting.name||acting.handle||'?';
 return <>
  <ScreenHeader title={t('fe.nav.me')} action={<Link className="fe-ibtn" to="/account" aria-label={t('fe.me.settings')}><Icon name="settings" size={22}/></Link>}/>
  <div className="fe-body">
   {profiles.length>1&&<div className="fe-seg" role="radiogroup" aria-label={t('fe.me.actAs')}>
    {profiles.map(x=><button key={x.id} type="button" role="radio" aria-checked={x.id===acting.id} className={x.id===acting.id?'on':''} onClick={()=>setActing(x.id)}>{x.kind==='couple'?t('fe.me.we'):t('fe.me.i')}</button>)}
   </div>}
   {error?<StateCard icon="close" role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)} action={<ActionButton variant="soft" onClick={load}>{t('fe.retry')}</ActionButton>}/>
    :!p?<p className="fe-mute" role="status">{t('fe.loading')}</p>
    :<>
     <section className="fe-me-card">
      <Avatar name={name} size="xl" couple={p.kind==='couple'} src={p.avatar?.src?.card??p.avatar?.src?.thumb??null}/>
      <div>
       <h2>{name}</h2>
       <p className="fe-mute">{[p.handle&&'@'+p.handle,p.age&&t('fe.me.age').replace('{age}',String(p.age)),p.city&&(locale==='en'?p.city.en:p.city.ru)].filter(Boolean).join(' · ')}</p>
      </div>
     </section>
     {p.bio?<p className="fe-post-body">{p.bio}</p>:<p className="fe-mute">{t('fe.me.noBio')}</p>}
     <ActionButton variant="soft" size="md" icon="settings" onClick={()=>setEditing(v=>!v)}>{t('fe.me.edit')}</ActionButton>
     {editing&&<EditProfile p={p} onDone={msg=>{setEditing(false);setNotice(msg);load();}}/>}
     {notice&&<p className="fe-okbox" role="status">{notice}</p>}
     <Photos p={p} onChanged={load}/>
     {settings&&<Visibility p={p} settings={settings} onChanged={load}/>}
    </>}
  </div>
 </>;
}

function EditProfile({p,onDone}:{p:Profile,onDone:(msg:string)=>void}){
 const {call}=useFe();const {t}=useI18n();
 const [name,setName]=useState(p.name??'');const [bio,setBio]=useState(p.bio);const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const opId=useRef(newOpId());
 const save=async()=>{
  setBusy(true);setFailure('');
  try{
   const r=await call('profile.update',{opId:opId.current,rev:p.rev,name:name.trim(),bio:bio.trim()},ok);
   onDone(r.pending?t('fe.me.pending'):t('fe.me.saved'));
  }catch(e){setFailure(feErrorMessage(e,t));opId.current=newOpId();}finally{setBusy(false);}
 };
 return <section className="fe-section fe-card">
  <label className="fe-field"><span className="fe-flabel">{t('fe.me.name')}</span><input className="fe-inp" value={name} maxLength={60} onChange={e=>setName(e.target.value)}/></label>
  <label className="fe-field"><span className="fe-flabel">{t('fe.me.bio')}</span><textarea className="fe-inp fe-compose" rows={4} maxLength={500} value={bio} onChange={e=>setBio(e.target.value)}/><span className="fe-fhint">{bio.length}/500</span></label>
  {failure&&<p className="fe-alert" role="alert">{failure}</p>}
  <ActionButton size="md" onClick={save} disabled={busy}>{busy?t('fe.loading'):t('fe.me.save')}</ActionButton>
 </section>;
}

const MIME=['image/jpeg','image/png','image/webp'];
function Photos({p,onChanged}:{p:Profile,onChanged:()=>void}){
 const {call}=useFe();const {t}=useI18n();const input=useRef<HTMLInputElement>(null);
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const add=async(file:File)=>{
  setFailure('');
  if(!MIME.includes(file.type)){setFailure(t('fe.me.photoType'));return;}
  if(file.size>20*1024*1024){setFailure(t('fe.me.photoSize'));return;}
  setBusy(true);
  try{
   const i=await call('media.uploadIntent',{opId:newOpId(),purpose:'avatar',kind:'image',mime:file.type,bytes:file.size},intent);
   const put=await fetch(i.upload.url,{method:i.upload.method,headers:i.upload.headers,body:file});
   if(!put.ok)throw new Error('upload');
   await call('media.commit',{assetId:i.assetId},ok);
   await call('profile.photosSet',{opId:newOpId(),assetIds:[...p.photos.map(x=>x.id),i.assetId].slice(0,6)},ok);
   onChanged();
  }catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy(false);if(input.current)input.current.value='';}
 };
 const remove=async(id:string)=>{
  setBusy(true);setFailure('');
  try{await call('profile.photosSet',{opId:newOpId(),assetIds:p.photos.map(x=>x.id).filter(x=>x!==id)},ok);onChanged();}
  catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy(false);}
 };
 return <section className="fe-section">
  <h3>{t('fe.me.photos')}</h3>
  <div className="fe-photos">
   {p.photos.map(ph=><figure key={ph.id} className="fe-photo">
    {ph.src?<img src={ph.src.thumb??ph.src.card??ph.src.blur} alt=""/>:<span className="fe-photo-wait"><Icon name="clock" size={22}/></span>}
    {ph.pending&&<figcaption className="fe-pill">{t('fe.feed.state.review')}</figcaption>}
    <button type="button" className="fe-photo-x" aria-label={t('fe.me.photoRemove')} onClick={()=>remove(ph.id)} disabled={busy}><Icon name="close" size={14}/></button>
   </figure>)}
   {p.photos.length<6&&<button type="button" className="fe-photo fe-photo-add" onClick={()=>input.current?.click()} disabled={busy} aria-label={t('fe.me.photoAdd')}>
    {busy?<span className="fe-spinner" aria-hidden="true"/>:<Icon name="plus" size={26}/>}
   </button>}
  </div>
  <input ref={input} type="file" accept={MIME.join(',')} hidden onChange={e=>{const f=e.target.files?.[0];if(f)void add(f);}}/>
  <p className="fe-fhint">{t('fe.me.photoHint')}</p>
  {failure&&<p className="fe-alert" role="alert">{failure}</p>}
 </section>;
}

function Visibility({p,settings,onChanged}:{p:Profile,settings:{discoverMode:string},onChanged:()=>void}){
 const {call}=useFe();const {t}=useI18n();const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const set=async(setting:string,value:string)=>{
  setBusy(true);setFailure('');
  try{await call(setting==='detailsVis'?'profile.update':'profile.setVisibility',setting==='detailsVis'?{opId:newOpId(),rev:p.rev,detailsVis:value}:{opId:newOpId(),setting,value},ok);onChanged();}
  catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy(false);}
 };
 const hasPhoto=p.photos.some(x=>!x.pending);
 return <>
  <section className="fe-section">
   <h3>{t('fe.reg.discover.title')}</h3>
   <div className="fe-chips">{(['visible','off'] as const).map(v=><button key={v} type="button" disabled={busy} className={'fe-chip'+(settings.discoverMode===v?' on':'')} aria-pressed={settings.discoverMode===v} onClick={()=>set('discoverMode',v)}>{t('fe.reg.discover.'+v)}</button>)}</div>
   <p className="fe-fhint">{settings.discoverMode==='visible'&&!hasPhoto?t('fe.me.needPhoto'):t('fe.reg.discover.note.'+(settings.discoverMode==='visible'?'visible':'off'))}</p>
  </section>
  {p.kind==='person'&&<section className="fe-section">
   <h3>{t('fe.reg.vis.title')}</h3>
   <div className="fe-chips">{(['only','granted','all'] as const).map(v=><button key={v} type="button" disabled={busy} className={'fe-chip'+(p.detailsVis===v?' on':'')} aria-pressed={p.detailsVis===v} onClick={()=>set('detailsVis',v)}>{t('fe.reg.vis.'+v)}</button>)}</div>
  </section>}
  {failure&&<p className="fe-alert" role="alert">{failure}</p>}
 </>;
}
