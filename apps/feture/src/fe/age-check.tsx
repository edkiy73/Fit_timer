import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Camera,ChevronRight,Clock,Hand,ImagePlus,Info,Lock,RefreshCw,ScanFace,ShieldCheck,UserCheck,X} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Bar,Btn,Empty,View,Skel} from './ui';
import {useFe} from './session';

/** V21 A07 «Проверка возраста» on /api/fe (server/commands/premium.mjs): the server picks a gesture
 * (`verification.ageStart`), the person sends a selfie making it (`media.uploadIntent` purpose `verification` →
 * PUT → `media.commit` → `verification.ageSubmit`), staff compare it with the approved profile photo. */
const GESTURES=['thumb_up','peace','open_palm','three_fingers','ok_sign','hand_on_head'] as const;
const statusRes=z.object({ok:z.literal(true),verified:z.boolean(),until:z.string().nullable().optional(),
 check:z.object({id:z.uuid(),state:z.enum(['started','submitted','approved','rejected','expired']),reason:z.string().nullable(),gesture:z.string().nullable()}).nullable()});
type Status=z.infer<typeof statusRes>;
const startRes=z.object({ok:z.literal(true),id:z.uuid(),gesture:z.string(),state:z.enum(['started','submitted'])});
const intent=z.object({ok:z.literal(true),assetId:z.uuid(),upload:z.object({url:z.string(),method:z.string(),headers:z.record(z.string(),z.string())})});
const ok=z.object({ok:z.literal(true)}).passthrough();
const REASONS=['gesture_mismatch','face_hidden','not_same_person','looks_underage','bad_photo'];

/** Re-encodes the shot as JPEG (the server takes JPEG/PNG/WebP; HEIC is converted on the device), at most 1600 px,
 * without the camera's metadata. */
export async function toJpeg(file:File):Promise<Blob>{
 try{
  const bmp=await createImageBitmap(file);const k=Math.min(1,1600/Math.max(bmp.width,bmp.height));
  const c=document.createElement('canvas');c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);
  c.getContext('2d')!.drawImage(bmp,0,0,c.width,c.height);bmp.close();
  const b=await new Promise<Blob|null>(r=>c.toBlob(r,'image/jpeg',0.9));
  if(b)return b;
 }catch{/* fall back to the file itself */}
 if(['image/jpeg','image/png','image/webp'].includes(file.type))return file;
 throw new Error('type');
}

export function AgeCheckScreen(){
 const {call,state}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const [s,setS]=useState<Status|null>(null);const [error,setError]=useState<unknown>(null);
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [needPhoto,setNeedPhoto]=useState(false);
 const [shot,setShot]=useState<{blob:Blob,url:string}|null>(null);const input=useRef<HTMLInputElement>(null);
 const person=state.status==='ready'?state.boot.profiles.find(p=>p.kind==='person'&&p.state!=='deleted'):undefined;
 const load=useCallback(()=>{setError(null);call('verification.ageStatus',{},statusRes,{asAccount:true}).then(setS).catch(setError);},[call]);
 useEffect(()=>{load();},[load]);
 useEffect(()=>()=>{if(shot)URL.revokeObjectURL(shot.url);},[shot]);

 const start=async()=>{
  setBusy(true);setFailure('');setNeedPhoto(false);
  try{const r=await call('verification.ageStart',{opId:newOpId()},startRes,{asAccount:true});
   setS(cur=>({ok:true,verified:false,until:cur?.until??null,check:{id:r.id,state:r.state,reason:null,gesture:r.state==='started'?r.gesture:null}}));}
  catch(e){if(e instanceof FeError&&e.code==='rule_violation'&&e.rule==='photo_required')setNeedPhoto(true);else setFailure(feErrorMessage(e,t));}
  finally{setBusy(false);}
 };
 const pick=async(file:File|undefined)=>{
  if(input.current)input.current.value='';if(!file)return;setFailure('');
  try{const blob=await toJpeg(file);setShot({blob,url:URL.createObjectURL(blob)});}catch{setFailure(t('fe.age.photoType'));}
 };
 const send=async()=>{
  const c=s?.check;if(!shot||!c||!person)return;
  setBusy(true);setFailure('');
  try{
   const i=await call('media.uploadIntent',{opId:newOpId(),purpose:'verification',kind:'image',mime:shot.blob.type||'image/jpeg',bytes:shot.blob.size},intent,{profileId:person.id});
   const put=await fetch(i.upload.url,{method:i.upload.method,headers:i.upload.headers,body:shot.blob});
   if(!put.ok)throw new Error('upload');
   await call('media.commit',{assetId:i.assetId},ok,{profileId:person.id});
   await call('verification.ageSubmit',{opId:newOpId(),checkId:c.id,assetId:i.assetId},ok,{asAccount:true});
   setShot(null);load();
  }catch(e){
   if(e instanceof FeError&&e.code==='conflict'&&e.state==='expired'){setShot(null);setFailure(t('fe.age.late'));load();}
   else setFailure(e instanceof Error&&e.message==='upload'?t('fe.age.uploadFailed'):feErrorMessage(e,t));
  }finally{setBusy(false);}
 };

 const alertErr=failure?<div className="alert err mt12" role="alert"><X/><span>{failure}</span></div>:null;
 if(error)return <><Bar title={t('fe.age.title')} back="/n/settings"/><View className="nodock"><Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty></View></>;
 if(!s)return <><Bar title={t('fe.age.title')} back="/n/settings"/><View className="nodock"><Skel kind="list"/></View></>;

 const c=s.check;
 // 18+ confirmed and still valid.
 if(s.verified){
  const until=s.until?new Date(s.until).toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'long',year:'numeric'}):'';
  return <><Bar title={t('fe.age.statusTitle')} back="/n/settings"/><View className="nodock">
   <Empty icon={ShieldCheck} role="status" title={t('fe.age.okTitle')} text={t('fe.age.okText')+(until?' '+t('fe.age.okUntil').replace('{date}',until.replace(/\.$/,'')):'')}>
    <Btn onClick={()=>navigate(-1)}>{t('fe.age.continue')}</Btn></Empty>
  </View></>;
 }
 // Sent, waiting for staff.
 if(c?.state==='submitted')return <><Bar title={t('fe.age.statusTitle')} back="/n/settings"/><View className="nodock">
  <Empty icon={Clock} role="status" title={t('fe.age.waitTitle')} text={t('fe.age.waitText')}><Btn kind="soft" icon={RefreshCw} onClick={load}>{t('fe.age.refresh')}</Btn></Empty>
 </View></>;
 // Started: show the gesture, take the selfie.
 if(c?.state==='started'&&c.gesture){
  const g=(GESTURES as readonly string[]).includes(c.gesture)?t('fe.age.gesture.'+c.gesture):c.gesture;
  return <><Bar title={t('fe.age.selfieTitle')} back="/n/settings"/><View className="nodock">
   <div className="pv-pose"><span className="ico v" aria-hidden="true"><Hand/></span><span><small>{t('fe.age.gestureLabel')}</small><b>{g}</b></span></div>
   <div className="mt12" style={{position:'relative',aspectRatio:'3/4',borderRadius:30,overflow:'hidden',background:'#140B11',display:'grid',placeItems:'center'}}>
    {shot?<img src={shot.url} alt={t('fe.age.shotAlt')} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}} draggable={false}/>
     :<><div style={{width:'62%',aspectRatio:'3/4',borderRadius:'50%',border:'3px dashed rgba(255,255,255,.6)'}}/>
      <div style={{position:'absolute',bottom:16,left:0,right:0,textAlign:'center',color:'#fff',fontSize:14,fontWeight:600}}>{t('fe.age.frame')}</div></>}
   </div>
   <input ref={input} type="file" accept="image/*" capture="user" hidden onChange={e=>void pick(e.target.files?.[0])}/>
   {shot?<><Btn className="mt16" onClick={send} busy={busy} disabled={busy||!person}>{t('fe.age.send')}</Btn>
     <Btn kind="soft" className="mt8" icon={Camera} onClick={()=>input.current?.click()} disabled={busy}>{t('fe.age.retake')}</Btn></>
    :<Btn className="mt16" icon={Camera} onClick={()=>input.current?.click()}>{t('fe.age.shoot')}</Btn>}
   {alertErr}
   <div className="alert mt16"><Lock/><span>{t('fe.age.camNote')}</span></div>
  </View></>;
 }
 // Nothing yet, rejected, ran out, or the year has passed.
 const reason=c?.state==='rejected'&&c.reason&&REASONS.includes(c.reason)?t('fe.age.reason.'+c.reason):'';
 return <><Bar title={t('fe.age.title')} back="/n/settings"/><View className="nodock">
  <p className="lead">{t('fe.age.lead')}</p>
  {c?.state==='rejected'&&<div className="alert err mt12" role="status"><X/><span><b>{t('fe.age.rejected')}</b>{reason?reason+' ':''}{t('fe.age.rejectedText')}</span></div>}
  {c?.state==='approved'&&<div className="alert warn mt12" role="status"><Clock/><span><b>{t('fe.age.expiredProof')}</b>{t('fe.age.expiredProofText')}</span></div>}
  {c?.state==='expired'&&<div className="alert warn mt12" role="status"><Clock/><span><b>{t('fe.age.expiredTry')}</b>{t('fe.age.expiredTryText')}</span></div>}
  <div className="radio on mt16"><i/><span className="tx"><b>{t('fe.age.method')}</b><small>{t('fe.age.methodSub')}</small></span></div>
  <div className="alert mt16"><Lock/><span>{t('fe.age.camNoteShort')}</span></div>
  <details className="pv-about mt16"><summary><Info/><span>{t('fe.age.how')}</span><ChevronRight/></summary>
   <div className="card list">
    <div className="li static"><span className="ico v"><Hand/></span><span className="tx"><small style={{color:'var(--ink)',fontSize:14}}>{t('fe.age.step1')}</small></span></div>
    <div className="li static"><span className="ico v"><ScanFace/></span><span className="tx"><small style={{color:'var(--ink)',fontSize:14}}>{t('fe.age.step2')}</small></span></div>
    <div className="li static"><span className="ico v"><UserCheck/></span><span className="tx"><small style={{color:'var(--ink)',fontSize:14}}>{t('fe.age.step3')}</small></span></div>
    <div className="li static"><span className="ico"><Lock/></span><span className="tx"><b>{t('fe.age.stored')}</b><small>{t('fe.age.storedText')}</small></span></div>
   </div></details>
  {needPhoto?<div className="alert warn mt16" role="alert"><ImagePlus/><span>{t('fe.age.needPhoto')}<Btn kind="soft" size="sm" auto icon={ImagePlus} onClick={()=>navigate('/n/me')}>{t('fe.age.addPhoto')}</Btn></span></div>
   :<Btn className="mt24" icon={Camera} onClick={start} busy={busy} disabled={busy}>{t('fe.age.start')}</Btn>}
  {alertErr}
 </View></>;
}

/** The link the age gates show next to their message. */
export function AgeCheckLink(){
 const {t}=useI18n();const navigate=useNavigate();
 return <Btn kind="soft" size="sm" auto icon={ShieldCheck} className="mt8" onClick={()=>navigate('/n/settings/age')}>{t('fe.age.go')}</Btn>;
}
