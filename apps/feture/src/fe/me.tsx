import {Fragment,useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ChevronRight,Eye,Lock,Plus,Settings,X} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Av,Btn,Empty,Seg,Skel} from './ui';
import {AgeCheckLink} from './age-check';
import {useFe} from './session';
import {PrivateLayer} from './private';
import {BellButton} from './inbox';
import {PairEntry} from './pair';
import {MineLayer} from './mine';
import {MeJars} from './interests';
import {StaffEntry} from './staff';
import {LinksEntry} from './links';
import {CoupleMembers,CouplePending,CoupleVisGroup} from './couple';
import {ProfileLinks} from './browse';

/** Slice C (V21 X01, P02, P03) with the prototype's markup: own profile, photos (others see approved ones;
 * «на проверке» only the owner), basics, details, Discover and who sees the answers. */
const media=z.object({id:z.uuid(),pending:z.boolean(),blurred:z.boolean().optional(),src:z.record(z.string(),z.string()).nullable()});
const profile=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),own:z.boolean(),bio:z.string(),
 age:z.number().nullable(),city:z.object({ru:z.string().nullable(),en:z.string().nullable(),pending:z.boolean()}).nullable(),avatar:media.nullable(),photos:z.array(media),
 details:z.record(z.string(),z.unknown()),rev:z.number().optional(),detailsVis:z.string().nullable().optional()});
const profileRes=z.object({ok:z.literal(true),profile});
const settingsRes=z.object({ok:z.literal(true),settings:z.object({discoverMode:z.enum(['visible','hidden','off']),privateOn:z.boolean()}).passthrough()});
const option=z.object({kind:z.string(),code:z.string(),ru:z.string(),en:z.string()});
const catalog=z.object({ok:z.literal(true),options:z.array(option)});
const ok=z.object({ok:z.literal(true)}).passthrough();
const intent=z.object({ok:z.literal(true),assetId:z.uuid(),upload:z.object({url:z.string(),method:z.string(),headers:z.record(z.string(),z.string())})});
type Profile=z.infer<typeof profile>;
type Layer='profile'|'priv'|'vis'|'mine';
const DETAIL_ROWS:[string,string][]=[['genders','gender'],['orients','orient'],['roles','role'],['status','status'],['formats','format'],['seeks','seek']];

export function MeTab(){
 const {state,acting,setActing,call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const [p,setP]=useState<Profile|null>(null);const [settings,setSettings]=useState<z.infer<typeof settingsRes>['settings']|null>(null);
 const [options,setOptions]=useState<z.infer<typeof option>[]>([]);
 const [error,setError]=useState<unknown>(null);const [layer,setLayer]=useState<Layer>(()=>{const l=new URLSearchParams(location.hash.split('?')[1]??'').get('layer');return l==='priv'||l==='mine'||l==='vis'?l:'profile';});const [editing,setEditing]=useState(false);const [notice,setNotice]=useState('');const [tick,setTick]=useState(0);
 const load=useCallback(()=>{
  if(!acting)return;setError(null);setTick(n=>n+1);
  Promise.all([call('profile.get',{profileId:acting.id},profileRes),call('profile.settings',{},settingsRes)])
   .then(([a,b])=>{setP(a.profile);setSettings(b.settings);}).catch(setError);
 },[call,acting]);
 useEffect(()=>{setP(null);load();},[load]);
 useEffect(()=>{call('catalog.get',{},catalog,{asAccount:true}).then(r=>setOptions(r.options)).catch(()=>{});},[call]);
 if(state.status!=='ready'||!acting)return null;
 const profiles=state.boot.profiles.filter(x=>x.state!=='deleted');
 const name=p?.name||acting.name||acting.handle||'?';
 const label=(kind:string,code:string)=>{const o=options.find(x=>x.kind===kind&&x.code===code);return o?(locale==='en'?o.en:o.ru):code;};
 return <>
  <h1 className="sr-only" tabIndex={-1}>{t('fe.nav.me')}</h1>
  <div className="view me18">
   <header className="me18-h wrap">
    <span className="av-wrap"><Av name={name} seed={acting.id} src={p?.avatar?.src?.thumb??p?.avatar?.src?.card}/></span>
    <div className="me18-who"><b><span>{name}</span></b><small>{acting.kind==='couple'?t('fe.me.weCouple'):t('fe.me.iPersonal')}</small></div>
    <StaffEntry/>
    <button type="button" className="ibtn" aria-label={t('fe.px.pv.open')} onClick={()=>navigate('/n/me/preview')}><Eye/></button>
    <BellButton/>
    <button type="button" className="ibtn" aria-label={t('fe.me.settings')} onClick={()=>navigate('/n/settings')}><Settings/></button>
   </header>
   <div className="wrap">
    {profiles.length>1&&<div className="mb12"><Seg value={acting.id} onChange={setActing} label={t('fe.me.actAs')} options={profiles.map(x=>({id:x.id,label:x.kind==='couple'?t('fe.me.we'):t('fe.me.i')}))}/></div>}
    <div className="me18-seg me4"><Seg small={false} value={layer} onChange={setLayer} options={(['profile','priv','vis','mine'] as const).map(id=>({id,label:t('fe.me.layer.'+id)}))}/></div>
   </div>
   <div className="wrap">
    {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
     :!p?<Skel kind="list"/>
     :layer==='profile'?<>
      {notice&&<div className="alert ok" role="status"><span>{notice}</span></div>}
      {acting.kind==='couple'&&<><CouplePending base={p} tick={tick} onDecided={msg=>{setNotice(msg);load();}}/><CoupleMembers/></>}
      <Photos p={p} onChanged={pending=>{setNotice(pending?t('fe.cw.waitPartner'):'');load();}}/>
      {acting.kind==='person'&&<PairEntry/>}
      <section className="grp"><div className="grp-t"><span>{t('fe.me.basics')}</span><span className="aud">{t('fe.me.seenByAll')}</span></div>
       {editing?<EditBasics p={p} onDone={msg=>{setEditing(false);setNotice(msg);load();}} onCancel={()=>setEditing(false)}/>
        :<button type="button" className="card blk-btn" aria-label={t('fe.me.editBasics')} onClick={()=>setEditing(true)}>
         <span className="blk-name">{[name+(p.age?', '+p.age:''),p.city&&(locale==='en'?p.city.en:p.city.ru)].filter(Boolean).join(' · ')}</span>
         <span className="blk-bio">{p.bio||t('fe.me.noBio')}</span><span className="chv"><ChevronRight/></span>
        </button>}
      </section>
      {p.kind==='person'&&<section className="grp"><div className="grp-t"><span>{t('fe.me.details')}</span><span className="aud">{t('fe.reg.vis.'+(p.detailsVis??'only'))}</span></div>
       <div className="card blk-btn"><dl className="kv">{DETAIL_ROWS.map(([field,kind])=>{const v=p.details[field];const codes=Array.isArray(v)?v as string[]:typeof v==='string'?[v]:[];
        return <Fragment key={field}><dt>{t('fe.reg.kind.'+kind)}</dt><dd>{codes.length?codes.map(c=>label(kind,c)).join(', '):'—'}</dd></Fragment>;})}</dl></div>
      </section>}
      <ProfileLinks key={'fl'+p.id} profileId={p.id} photos={p.photos.filter(ph=>ph.src).length} self/>
      <LinksEntry key={'links'+p.id}/>
      <MeJars key={p.id}/>
     </>
     :layer==='priv'?<PrivateLayer profileId={p.id}/>
     :layer==='mine'?<MineLayer/>
     :layer==='vis'&&settings?<>{acting.kind==='couple'&&<CouplePending base={p} tick={tick} onDecided={load}/>}<Visibility p={p} settings={settings} onChanged={load}/>{acting.kind==='couple'&&<CoupleVisGroup/>}</>
     :<Empty icon={Lock} title={t('fe.me.soon.'+layer)} text={t('fe.me.soonText.'+layer)}/>}
   </div>
  </div>
 </>;
}

function EditBasics({p,onDone,onCancel}:{p:Profile,onDone:(msg:string)=>void,onCancel:()=>void}){
 const {call}=useFe();const {t}=useI18n();
 const [name,setName]=useState(p.name??'');const [bio,setBio]=useState(p.bio);const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const opId=useRef(newOpId());
 const save=async()=>{
  setBusy(true);setFailure('');
  try{const r=await call('profile.update',{opId:opId.current,rev:p.rev,name:name.trim(),bio:bio.trim()},ok);onDone(r.pending?t('fe.me.pending'):t('fe.me.saved'));}
  catch(e){setFailure(feErrorMessage(e,t));opId.current=newOpId();}finally{setBusy(false);}
 };
 return <div className="card form-card pe-form">
  <label className="field"><span>{t('fe.me.name')}</span><input className="inp" value={name} maxLength={60} onChange={e=>setName(e.target.value)}/></label>
  <label className="field"><span>{t('fe.me.bio')}</span><textarea className="inp" rows={4} maxLength={500} value={bio} onChange={e=>setBio(e.target.value)}/><div className="counter">{bio.length} / 500</div></label>
  {failure&&<div className="alert err" role="alert"><span>{failure}</span></div>}
  <div className="btns"><Btn onClick={save} disabled={busy} busy={busy}>{t('fe.me.save')}</Btn><Btn kind="text" onClick={onCancel}>{t('fe.cancel')}</Btn></div>
 </div>;
}

const MIME=['image/jpeg','image/png','image/webp'];
function Photos({p,onChanged}:{p:Profile,onChanged:(pending?:boolean)=>void}){
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
   const r=await call('profile.photosSet',{opId:newOpId(),assetIds:[...p.photos.map(x=>x.id),i.assetId].slice(0,6)},ok);
   onChanged(!!r.pending);
  }catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy(false);if(input.current)input.current.value='';}
 };
 const remove=async(id:string)=>{
  setBusy(true);setFailure('');
  try{await call('profile.photosSet',{opId:newOpId(),assetIds:p.photos.map(x=>x.id).filter(x=>x!==id)},ok);onChanged();}
  catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy(false);}
 };
 return <section className="grp ph20">
  <div className="grp-t"><span>{t('fe.me.photos')}</span><span className="aud">{t('fe.me.seenByAll')}</span></div>
  <div className="ph-slots">
   {p.photos.map((ph,i)=><div key={ph.id} className={'mi'+(i===0?' big':'')}>
    {ph.src&&<img src={ph.src.card??ph.src.thumb??ph.src.blur} alt="" draggable={false}/>}
    {i===0&&<span className="mainph">{t('fe.me.mainPhoto')}</span>}
    {ph.pending&&<span className="mainph">{t('fe.feed.state.review')}</span>}
    <button type="button" className="vw" aria-label={t('fe.me.photoRemove')} onClick={()=>remove(ph.id)} disabled={busy}/>
   </div>)}
   {p.photos.length<6&&<button type="button" className={'ph-add'+(p.photos.length?' tall':'')} onClick={()=>input.current?.click()} disabled={busy} aria-label={t('fe.me.photoAdd')}>
    <Plus/><small>{busy?t('fe.loading'):p.photos.length?t('fe.me.morePhotos'):t('fe.me.photoAdd')}</small>
   </button>}
  </div>
  <input ref={input} type="file" accept={MIME.join(',')} hidden onChange={e=>{const f=e.target.files?.[0];if(f)void add(f);}}/>
  <p className="note">{t('fe.me.photoHint')}</p>
  {failure&&<div className="alert err" role="alert"><span>{failure}</span></div>}
 </section>;
}

function Visibility({p,settings,onChanged}:{p:Profile,settings:{discoverMode:string},onChanged:()=>void}){
 const {call}=useFe();const {t}=useI18n();const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [wait,setWait]=useState('');
 const set=async(setting:string,value:string)=>{
  setBusy(true);setFailure('');setWait('');
  try{const r=await call(setting==='detailsVis'?'profile.update':'profile.setVisibility',setting==='detailsVis'?{opId:newOpId(),rev:p.rev,detailsVis:value}:{opId:newOpId(),setting,value},ok);if(r.pending)setWait(t('fe.cw.waitPartner'));onChanged();}
  catch(e){setFailure(e instanceof FeError&&e.rule==='age_not_verified'?t('fe.age.couple'):feErrorMessage(e,t));}finally{setBusy(false);}
 };
 const hasPhoto=p.photos.some(x=>!x.pending);
 return <>
  <section className="grp"><div className="grp-t"><span>{t('fe.reg.discover.title')}</span></div>
   <div className="chips">{(['visible','off'] as const).map(v=><button key={v} type="button" disabled={busy} className={'chip'+(settings.discoverMode===v?' on':'')} aria-pressed={settings.discoverMode===v} onClick={()=>set('discoverMode',v)}>{t('fe.reg.discover.'+v)}</button>)}</div>
   <p className="note mt8">{settings.discoverMode==='visible'&&!hasPhoto?t('fe.me.needPhoto'):t('fe.reg.discover.note.'+(settings.discoverMode==='visible'?'visible':'off'))}</p>
  </section>
  {p.kind==='person'&&<section className="grp"><div className="grp-t"><span>{t('fe.reg.vis.title')}</span></div>
   <div className="chips">{(['only','granted','all'] as const).map(v=><button key={v} type="button" disabled={busy} className={'chip'+(p.detailsVis===v?' on':'')} aria-pressed={p.detailsVis===v} onClick={()=>set('detailsVis',v)}>{t('fe.reg.vis.'+v)}</button>)}</div>
   <p className="note mt8">{t('fe.reg.vis.note.'+(p.detailsVis??'only'))}</p>
  </section>}
  {wait&&<div className="alert ok" role="status"><span>{wait}</span></div>}
  {failure&&<div className="alert err" role="alert"><span>{failure}{failure===t('fe.age.couple')&&<><br/><AgeCheckLink/></>}</span></div>}
 </>;
}
