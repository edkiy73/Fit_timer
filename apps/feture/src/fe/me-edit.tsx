import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {AtSign,Check,ChevronDown,ChevronRight,Clock,Lock,MapPin,Plus,Sparkles,Star,Trash2,X} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Bar,Btn,Empty,Skel} from './ui';
import {useFe} from './session';
import {Sheet} from './profile-extras';
import {useToast} from './toast';
import {Ask,AudTag,COUPLE_ROWS,DETAIL_ROWS,MAX_PHOTOS,catalogRes,ok,photoSrc,profileRes,type Profile} from './me';

/** V21 P02 «Редактировать профиль» and P04 «Приватная часть» (`SC.P02` with `only`): one editor, opened at the block
 * that was tapped on «Я» — `media` (the photo slots), `basics` (name, nickname, age, about, city), `details` (the
 * catalog answers) or `priv` (the private part); without `only` the whole profile. Nothing is written until
 * «Сохранить»; a couple's widening change comes back `pending` and waits for the partner (server rule). */
type Only='media'|'basics'|'details'|'priv'|null;
type Ph={id:string,src:string|null,pending:boolean};
const intent=z.object({ok:z.literal(true),assetId:z.uuid(),upload:z.object({url:z.string(),method:z.string(),headers:z.record(z.string(),z.string())})});
const privMedia=z.object({id:z.uuid(),src:z.record(z.string(),z.string()).nullable().optional(),pending:z.boolean().optional()}).passthrough();
const privRes=z.object({ok:z.literal(true),on:z.boolean().optional(),text:z.string().nullable().optional(),media:z.array(privMedia).optional(),counts:z.object({grants:z.number()}).passthrough().optional()}).passthrough();
const interestsRes=z.object({ok:z.literal(true),items:z.array(z.object({vis:z.string().nullable().optional()}).passthrough())});
const MIME=['image/jpeg','image/png','image/webp'];
const PRIV_MAX=18;
const MULTI_MAX:Record<string,number>={genders:5,orients:5,roles:5,formats:5,seeks:9};

type Draft={name:string,handle:string,bio:string,cityId:string|null,showAge:boolean,details:Record<string,string[]|string|null>,photos:Ph[],privOn:boolean,privText:string,privMedia:Ph[]};
const toPh=(m:{id:string,src?:Record<string,string>|null|undefined,pending?:boolean|undefined})=>({id:m.id,src:m.src?photoSrc({src:m.src}):null,pending:!!m.pending});

export function MeEditScreen(){
 const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const toast=useToast();
 const [params]=useSearchParams();const o=params.get('only');const only:Only=o==='media'||o==='basics'||o==='details'||o==='priv'?o:null;
 const [p,setP]=useState<Profile|null>(null);const [base,setBase]=useState<Draft|null>(null);const [d,setD]=useState<Draft|null>(null);
 const [cat,setCat]=useState<z.infer<typeof catalogRes>|null>(null);const [jars,setJars]=useState({all:0,granted:0});const [grants,setGrants]=useState(0);
 const [error,setError]=useState<unknown>(null);const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const [whoOpen,setWhoOpen]=useState<boolean|null>(null);const [city,setCity]=useState(false);const [phSheet,setPhSheet]=useState<{k:'photos'|'privMedia',i:number}|null>(null);
 const [askOff,setAskOff]=useState(false);const [uploading,setUploading]=useState<'photos'|'privMedia'|null>(null);
 const file=useRef<HTMLInputElement>(null);const fileKind=useRef<'photos'|'privMedia'>('photos');
 const cp=acting?.kind==='couple';
 const load=useCallback(()=>{
  if(!acting)return;setError(null);
  Promise.all([call('profile.get',{profileId:acting.id},profileRes),call('private.get',{profileId:acting.id},privRes),call('catalog.get',{},catalogRes,{asAccount:true}),
   call('interests.list',{profileId:acting.id},interestsRes).catch(()=>({ok:true as const,items:[]}))])
   .then(([a,b,c,e])=>{
    const pr=a.profile;const det:Draft['details']={};
    for(const [f] of DETAIL_ROWS){const v=pr.details[f];det[f]=f==='status'?(typeof v==='string'?v:null):Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'):[];}
    const draft:Draft={name:pr.name??'',handle:pr.handle??'',bio:pr.bio,cityId:typeof pr.cityId==='string'?pr.cityId:null,showAge:pr.showAge!==false,details:det,
     photos:pr.photos.map(toPh),privOn:b.on!==false,privText:b.text??'',privMedia:(b.media??[]).map(toPh)};
    setP(pr);setBase(draft);setD(structuredClone(draft));setCat(c);setGrants(b.counts?.grants??0);
    setJars({all:e.items.length,granted:e.items.filter(j=>j.vis==='granted').length});
   }).catch(setError);
 },[call,acting]);
 useEffect(()=>{load();},[load]);
 const label=(kind:string,code:string)=>{const x=cat?.options.find(y=>y.kind===kind&&y.code===code);return x?(locale==='en'?x.en:x.ru):code;};
 const dirty=!!d&&!!base&&JSON.stringify(d)!==JSON.stringify(base);
 const set=(patch:Partial<Draft>)=>setD(v=>v?{...v,...patch}:v);
 const show=(k:Exclude<Only,null>)=>!only||only===k;
 // Opened by a link (no app history behind it), back and «Сохранить» return to «Я» instead of leaving the app.
 const home='/n/me'+(only==='priv'?'?layer=priv':'');const canBack=((history.state as {idx?:number}|null)?.idx??0)>0;
 const leave=()=>canBack?navigate(-1):navigate(home,{replace:true});
 const fields=DETAIL_ROWS.filter(([f])=>!cp||COUPLE_ROWS.includes(f));
 const title=only==='media'?t('fe.me.photos'):only==='basics'?t('fe.me.basics'):only==='details'?(cp?t('fe.mx.detailsCouple'):t('fe.me.details')):only==='priv'?t('fe.priv.title'):(cp?t('fe.me.coupleProfile'):t('fe.mx.ed.myProfile'));

 const upload=async(f:File,k:'photos'|'privMedia')=>{
  setFailure('');
  if(!MIME.includes(f.type)){setFailure(t('fe.me.photoType'));return;}
  if(f.size>20*1024*1024){setFailure(t('fe.me.photoSize'));return;}
  setUploading(k);
  try{
   const i=await call('media.uploadIntent',{opId:newOpId(),purpose:k==='photos'?'avatar':'private',kind:'image',mime:f.type,bytes:f.size},intent);
   const put=await fetch(i.upload.url,{method:i.upload.method,headers:i.upload.headers,body:f});
   if(!put.ok)throw new FeError('unavailable');
   await call('media.commit',{assetId:i.assetId},ok);
   const ph:Ph={id:i.assetId,src:URL.createObjectURL(f),pending:true};
   setD(v=>v?{...v,[k]:[...v[k],ph]}:v);
  }catch(e){setFailure(feErrorMessage(e,t));}finally{setUploading(null);if(file.current)file.current.value='';}
 };
 const pick=(k:'photos'|'privMedia')=>{fileKind.current=k;file.current?.click();};

 const save=async()=>{
  if(!d||!base||!p||busy)return;setBusy(true);setFailure('');
  try{
   let pending=false;
   const upd:Record<string,unknown>={};
   if(d.name.trim()!==base.name)upd.name=d.name.trim();
   if(!cp&&d.handle.trim()!==base.handle)upd.handle=d.handle.trim();
   if(d.bio.trim()!==base.bio)upd.bio=d.bio.trim();
   if(d.cityId!==base.cityId)upd.cityId=d.cityId;
   if(!cp&&d.showAge!==base.showAge)upd.showAge=d.showAge;
   for(const [f] of fields)if(JSON.stringify(d.details[f])!==JSON.stringify(base.details[f]))upd[f]=d.details[f];
   if(Object.keys(upd).length){const r=await call('profile.update',{opId:newOpId(),rev:p.rev,...upd},ok);pending||=!!r.pending;}
   if(JSON.stringify(d.photos.map(x=>x.id))!==JSON.stringify(base.photos.map(x=>x.id))){const r=await call('profile.photosSet',{opId:newOpId(),assetIds:d.photos.map(x=>x.id)},ok);pending||=!!r.pending;}
   if(d.privOn!==base.privOn&&!d.privOn)await call('private.setOn',{opId:newOpId(),on:false,confirm:true},ok);
   if(d.privOn!==base.privOn&&d.privOn)await call('private.setOn',{opId:newOpId(),on:true},ok);
   if(!cp&&d.privOn&&d.privText.trim()!==base.privText)await call('private.setText',{opId:newOpId(),text:d.privText.trim()},ok);
   if(!cp&&d.privOn&&JSON.stringify(d.privMedia.map(x=>x.id))!==JSON.stringify(base.privMedia.map(x=>x.id)))await call('private.setMedia',{opId:newOpId(),assetIds:d.privMedia.map(x=>x.id)},ok);
   toast(pending?t('fe.me.pending'):only==='media'?t('fe.mx.ed.photosSaved'):t('fe.me.saved'),{type:'ok'});
   leave();
  }catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy(false);}
 };

 if(!acting)return null;
 const aud=only==='priv'?<AudTag k="granted"/>:only?<AudTag k={only==='details'?(p?.detailsVis??'all'):'all'}/>:null;
 const slots=(k:'photos'|'privMedia',list:Ph[],max:number)=>{
  const cells:ReactNode[]=list.map((ph,i)=><div key={ph.id} className={'mi'+(k==='photos'&&i===0?' big':'')}>
   {ph.src&&<img src={ph.src} alt="" draggable={false}/>}
   {k==='photos'&&i===0&&<span className="mainph">{t('fe.me.mainPhoto')}</span>}
   {ph.pending&&<span className="ph-rev"><Clock/><span>{t('fe.mx.ph.review')}</span></span>}
   <button type="button" className="vw" aria-label={t('fe.mx.ph.nOf',{n:i+1,total:list.length})} onClick={()=>setPhSheet({k,i})}/>
  </div>);
  const n=k==='photos'?(list.length===1?2:Math.min(max,Math.max(list.length+1,3))):list.length+(list.length<max?1:0);
  for(let i=list.length;i<n;i++)cells.push(i===list.length
   ?<button key="add" type="button" className={'ph-add'+(k==='photos'&&i===0?' big':'')+(k==='photos'&&list.length===1?' tall':'')} disabled={!!uploading} aria-busy={uploading===k||undefined} onClick={()=>pick(k)} aria-label={t('fe.mx.ph.addAria')}>
    <Plus/>{k==='photos'&&i===0?<small>{cp?t('fe.mx.ph.couplePhoto'):t('fe.mx.ph.mainSlot')}</small>:k==='photos'&&list.length===1?<small>{t('fe.me.morePhotos')}</small>:null}</button>
   :<span key={'g'+i} className="ph-add ghost" aria-hidden="true"/>);
  return <div className={k==='photos'?'ph-slots':'ph-slots priv'}>{cells}</div>;
 };
 const sheetList=phSheet&&d?d[phSheet.k]:[];const sheetPh=phSheet?sheetList[phSheet.i]:undefined;
 const move=(k:'photos'|'privMedia',i:number,to:'main'|'remove')=>{if(!d)return;const list=[...d[k]];const [x]=list.splice(i,1);if(to==='main'&&x)list.unshift(x);set({[k]:list} as Partial<Draft>);setPhSheet(null);};
 const placeName=(id:string|null)=>{const x=id?cat?.places?.find(y=>y.id===id):null;return x?(locale==='en'?x.en:x.ru):null;};
 const chips=(f:string,kind:string)=>{if(!d)return null;const v=d.details[f];const multi=f!=='status';const sel=multi?(Array.isArray(v)?v:[]):(typeof v==='string'?[v]:[]);
  const opts=cat?.options.filter(x=>x.kind===kind)??[];
  return <div className="chips" role="group" aria-label={t(kind==='status'?'fe.mx.f.status':'fe.reg.kind.'+kind)}>{opts.map(x=>{const on=sel.includes(x.code);
   return <button key={x.code} type="button" className={'chip'+(on?' on':'')} aria-pressed={on} onClick={()=>{
    if(!multi){set({details:{...d.details,[f]:on?null:x.code}});return;}
    if(!on&&sel.length>=(MULTI_MAX[f]??5)){toast(t('fe.mx.ed.max5'),{type:'info'});return;}
    set({details:{...d.details,[f]:on?sel.filter(c=>c!==x.code):[...sel,x.code]}});}}>{locale==='en'?x.en:x.ru}</button>;})}</div>;};
 const anyDetails=!!d&&fields.some(([f])=>{const v=d.details[f];return Array.isArray(v)?v.length>0:!!v;});
 const who=only==='details'||(whoOpen??!anyDetails);
 return <>
  <Bar title={title} back={canBack||home}>{aud}</Bar>
  <div className="view nodock cta1"><div className="wrap">
   {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!d||!p?<Skel kind="card" rows={3}/>
    :<>
     {show('media')&&<section className="grp ph20" id="peMedia">{!only&&<div className="grp-t"><span>{t('fe.me.photos')}</span><AudTag k="all"/></div>}
      {slots('photos',d.photos,MAX_PHOTOS)}<p className="grp-n">{t('fe.mx.ed.photoHint')}</p></section>}
     {(show('basics')||show('details'))&&<section className="grp"><div className="card form-card pe-form">
      {show('basics')&&<>
       <label className="field"><span>{cp?t('fe.mx.ed.coupleName'):t('fe.me.name')}</span><input className="inp" value={d.name} maxLength={60} onChange={e=>set({name:e.target.value})}/></label>
       {!cp&&<label className="field"><span>{t('fe.mx.ed.nick')}</span><div className="inwrap"><AtSign/><input className="inp" value={d.handle} maxLength={20} autoCapitalize="off" spellCheck={false} onChange={e=>set({handle:e.target.value.replace(/^@/,'')})}/></div></label>}
       {!cp&&<button type="button" className="li" role="switch" aria-checked={d.showAge} onClick={()=>set({showAge:!d.showAge})}><span className="tx"><b>{t('fe.mx.ed.showAge')}</b></span><span className={'sw'+(d.showAge?' on':'')} aria-hidden="true"/></button>}
       <label className="field"><span>{t('fe.mx.ed.about')}</span><textarea className="inp" rows={4} maxLength={500} value={d.bio} placeholder={t('fe.mx.ed.aboutPh')} onChange={e=>set({bio:e.target.value})}/><div className="counter">{d.bio.length} / 500</div></label>
       <div className="field"><span>{t('fe.mx.ed.city')}</span><button type="button" className="inp sel-btn" aria-haspopup="dialog" onClick={()=>setCity(true)}><MapPin/><span className={d.cityId?'':'sel-ph'}>{placeName(d.cityId)??t('fe.mx.ed.noCity')}</span><ChevronDown/></button></div>
      </>}
      {show('details')&&<div className="pe-who" id="peWho">
       {only!=='details'&&<button type="button" className="li" aria-expanded={who} onClick={()=>setWhoOpen(!who)}><span className="tx"><b>{cp?t('fe.mx.detailsCouple'):t('fe.mx.ed.yourDetails')}</b>
        {!who&&(anyDetails?<span className="pe-sums">{fields.map(([f,kind])=>{const v=d.details[f];const codes=Array.isArray(v)?v:v?[v]:[];return codes.length?<span key={f} className="pe-sum"><b>{t(kind==='status'?'fe.mx.f.status':'fe.reg.kind.'+kind)}</b> {codes.map(c=>label(kind,c)).join(', ')}</span>:null;})}</span>:<small>{t('fe.mx.ed.nothing')}</small>)}</span>
        <span className={'chv'+(who?' open':'')}><ChevronDown/></span></button>}
       {who&&fields.map(([f,kind])=><div key={f} className="field"><span className="flabel">{t(kind==='status'?'fe.mx.f.status':'fe.reg.kind.'+kind)}</span>{chips(f,kind)}</div>)}
      </div>}
     </div></section>}
     {!only&&<section className="grp" id="peJars"><div className="grp-t"><span>{cp?t('fe.int.titleCouple'):t('fe.int.title')}</span></div><div className="card list">
      <button type="button" className="li" onClick={()=>navigate('/n/me/interests')}><span className="ico"><Sparkles/></span><span className="tx"><b>{t('fe.int.all')}</b><small>{t('fe.mx.ed.jarsSub')}</small></span><span className="val">{jars.all}</span><ChevronRight/></button>
     </div></section>}
     {show('priv')&&<section className={'vault'+(d.privOn?'':' off')} id="privEdit">
      <div className="vault-h"><span className="vi"><Lock/></span><div><b>{t('fe.priv.title')}</b></div>
       <button type="button" className="vsw" role="switch" aria-checked={d.privOn} aria-label={t('fe.priv.title')} onClick={()=>d.privOn&&base?.privOn?setAskOff(true):set({privOn:!d.privOn})}><span className={'sw'+(d.privOn?' on':'')} aria-hidden="true"/></button></div>
      {d.privOn&&<div className="vault-b">
       {!cp&&<section className="grp"><div className="grp-t"><span>{t('fe.mx.ed.privText')}</span></div><div className="card form-card">
        <label className="field"><textarea className="inp" rows={5} maxLength={1000} value={d.privText} placeholder={t('fe.mx.ed.privPh')} aria-label={t('fe.mx.ed.privText')} onChange={e=>set({privText:e.target.value})}/><div className="counter">{d.privText.length} / 1000</div></label>
       </div></section>}
       <section className="grp"><div className="grp-t"><span>{t('fe.mx.ed.privJars')}{jars.granted?' · '+jars.granted:''}</span>{jars.granted>0&&<button type="button" onClick={()=>navigate('/n/me/interests?add=1&vis=granted')}><Plus/>{t('fe.mx.ed.add')}</button>}</div>
        {jars.granted===0&&<Btn kind="soft" icon={Plus} onClick={()=>navigate('/n/me/interests?add=1&vis=granted')}>{t('fe.int.add')}</Btn>}
        <p className="grp-n">{t('fe.mx.ed.privJarsFoot')}</p></section>
       {!cp&&<section className="grp"><div className="grp-t"><span>{t('fe.mx.ed.privMedia')}</span><span className="note">{d.privMedia.length}/{PRIV_MAX}</span></div>
        {d.privMedia.length?slots('privMedia',d.privMedia,PRIV_MAX):<Btn kind="soft" icon={Plus} disabled={!!uploading} busy={uploading==='privMedia'} onClick={()=>pick('privMedia')}>{t('fe.mx.ed.privUpload')}</Btn>}</section>}
      </div>}
     </section>}
     {failure&&<div className="alert err mt12" role="alert"><span>{failure}</span></div>}
    </>}
  </div></div>
  {d&&<div className="ctabar"><div className="wrap"><Btn onClick={save} disabled={!dirty||busy} busy={busy}>{t('fe.me.save')}</Btn></div></div>}
  <input ref={file} type="file" accept={MIME.join(',')} hidden onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f,fileKind.current);}}/>
  {city&&d&&<Sheet title={t('fe.mx.ed.city')} onClose={()=>setCity(false)}><div className="card list">
   {[null,...(cat?.places??[]).map(x=>x.id)].map(id=><button key={id??'none'} type="button" className="li" aria-pressed={d.cityId===id} onClick={()=>{set({cityId:id});setCity(false);}}>
    <span className="ico"><MapPin/></span><span className="tx"><b>{placeName(id)??t('fe.mx.ed.noCity')}</b></span>{d.cityId===id&&<span className="ico g"><Check/></span>}</button>)}
  </div><p className="note mt12">{t('fe.mx.ed.cityNote')}</p></Sheet>}
  {phSheet&&sheetPh&&<Sheet title={phSheet.k==='photos'&&phSheet.i===0?t('fe.mx.ph.main'):t('fe.mx.ph.nOf',{n:phSheet.i+1,total:sheetList.length})} onClose={()=>setPhSheet(null)}>
   <div className="ph-sheet-prev">{sheetPh.src&&<img src={sheetPh.src} alt="" draggable={false}/>}</div>
   <div className="card list">
    {phSheet.k==='photos'&&phSheet.i>0&&<button type="button" className="li" onClick={()=>move(phSheet.k,phSheet.i,'main')}><span className="ico"><Star/></span><span className="tx"><b>{t('fe.mx.ph.makeMain')}</b><small>{t('fe.mx.ph.makeMainSub')}</small></span></button>}
    <button type="button" className="li danger" onClick={()=>move(phSheet.k,phSheet.i,'remove')}><span className="ico"><Trash2/></span><span className="tx"><b>{t('fe.mx.ph.remove')}</b><small>{t('fe.mx.ed.onSave')}</small></span></button>
   </div>
  </Sheet>}
  {askOff&&<Ask icon={Lock} danger title={t('fe.mx.pr.offTitle')} text={[grants?t('fe.mx.pr.offWhat',{g:grants,q:0}):t('fe.mx.pr.offAll'),t('fe.mx.pr.offRest'),t('fe.mx.ed.onSave')].join(' ')} ok={t('fe.mx.pr.offOk')}
   onCancel={()=>setAskOff(false)} onOk={()=>{set({privOn:false});setAskOff(false);}}/>}
 </>;
}
