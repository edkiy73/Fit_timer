import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocation,useNavigate,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Camera,CameraOff,Clock,FileUp,Hand,IdCard,ImagePlus,Info,Lock,RefreshCw,ScanFace,ShieldCheck,TriangleAlert,UserCheck,X} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Alert,Bar,Btn,CaptureFrame,Card,Empty,FilePick,Group,RadioList,Row,Skel,Text,View} from './kit';
import {useSendPhoto} from './media-upload';
import {useFe,useShown} from './session';

/** V21 A07 «Проверка возраста» on /api/fe (server/commands/premium.mjs). Two methods:
 * - selfie: the server picks a gesture (`verification.ageStart`), the person sends a selfie making it, staff compare
 *   it with the approved profile photo;
 * - document: the person photographs an identity document (or uploads a photo of it), staff read the birth date.
 *   The image is deleted right after the decision; nothing from it is kept.
 * Either shot goes through `useSendPhoto('verification')` (no crop) → `verification.ageSubmit`.
 * The gates that send people here pass where to come back and what to resume (`AgeCheckLink intent`): «Продолжить»
 * after approval returns there with `?resume=<intent>`, and that screen redoes the action (`useAgeResume`). */
const GESTURES=['thumb_up','peace','open_palm','three_fingers','ok_sign','hand_on_head'] as const;
type Method='selfie'|'document';
const method=z.enum(['selfie','document']);
const statusRes=z.object({ok:z.literal(true),verified:z.boolean(),until:z.string().nullable().optional(),
 check:z.object({id:z.uuid(),method:method.optional().default('selfie'),state:z.enum(['started','submitted','approved','rejected','expired']),reason:z.string().nullable(),gesture:z.string().nullable()}).nullable()});
type Status=z.infer<typeof statusRes>;
const startRes=z.object({ok:z.literal(true),id:z.uuid(),method:method.optional().default('selfie'),gesture:z.string().nullable(),state:z.enum(['started','submitted'])});
const ok=z.object({ok:z.literal(true)}).passthrough();
const REASONS=['gesture_mismatch','face_hidden','not_same_person','looks_underage','bad_photo','under_18','date_unreadable','not_a_document'];

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

/** May the page use the camera? Asks once and lets go at once. Without the API (native shells) the system picker asks. */
async function cameraOk():Promise<boolean>{
 const md=typeof navigator!=='undefined'?navigator.mediaDevices:undefined;
 if(!md?.getUserMedia)return true;
 try{const s=await md.getUserMedia({video:true});s.getTracks().forEach(tr=>tr.stop());return true;}catch{return false;}
}

// ——— where to come back after the check ———

const INTENT=/^[a-z][a-zA-Z0-9.:_-]{0,80}$/;
/** Only an in-app path, never another site or the check itself. */
function safeReturn(v:string|null):string|null{
 if(!v||!v.startsWith('/n/')||v.startsWith('/n/settings/age')||/[\\\s]|\/\//.test(v))return null;
 return v;
}
/** The age-check route that comes back to `then` and resumes `intent` after approval. */
export function agePath(then?:string,intent?:string){
 const p=new URLSearchParams();if(then&&safeReturn(then))p.set('then',then);if(intent&&INTENT.test(intent))p.set('do',intent);
 const q=p.toString();return '/n/settings/age'+(q?'?'+q:'');
}
/** Redoes the action the check was opened for once the person is back (`?resume=<intent>`); `ready` waits for data. */
export function useAgeResume(match:(intent:string)=>boolean,run:(intent:string)=>void,ready=true){
 const [params,setParams]=useSearchParams();const v=params.get('resume');
 const fn=useRef({match,run});fn.current={match,run};
 useEffect(()=>{
  if(!ready||!v||!fn.current.match(v))return;
  const next=new URLSearchParams(params);next.delete('resume');setParams(next,{replace:true});
  fn.current.run(v);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[v,ready]);
}

export function AgeCheckScreen(){
 const {call,peek,state}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const [params]=useSearchParams();
 const [s,setS]=useShown<Status|null>('set.ageCheck',()=>peek('verification.ageStatus',{},statusRes,{asAccount:true}));const [error,setError]=useState<unknown>(null);
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [needPhoto,setNeedPhoto]=useState(false);
 const [shot,setShot]=useState<{blob:Blob,url:string,method:Method}|null>(null);
 const [choice,setChoice]=useState<Method|null>(null);const [denied,setDenied]=useState<Method|null>(null);const [choosing,setChoosing]=useState(false);
 const cam=useRef<HTMLInputElement>(null);const file=useRef<HTMLInputElement>(null);const docCam=useRef<HTMLInputElement>(null);
 const person=state.status==='ready'?state.boot.profiles.find(p=>p.kind==='person'&&p.state!=='deleted'):undefined;
 const sendPhoto=useSendPhoto('verification',{},person?.id);
 const load=useCallback((fresh=false)=>{setError(null);call('verification.ageStatus',{},statusRes,{asAccount:true,fresh}).then(setS).catch(setError);},[call]);
 useEffect(()=>{load();},[load]);
 useEffect(()=>()=>{if(shot)URL.revokeObjectURL(shot.url);},[shot]);

 const c=s?.check??null;
 const open=c&&(c.state==='started'||c.state==='submitted')?c:null;
 const m:Method=choice??(open?.method??'selfie');

 /** Opens (or switches) the check for a method; the server keeps one open check. */
 const start=async(how:Method)=>{
  setFailure('');setNeedPhoto(false);
  try{const r=await call('verification.ageStart',{opId:newOpId(),method:how},startRes,{asAccount:true});
   setChoosing(false);setDenied(null);
   if(r.state==='submitted'){load();return null;}
   setS(cur=>({ok:true,verified:cur?.verified??false,until:cur?.until??null,check:{id:r.id,method:r.method,state:'started',reason:null,gesture:r.gesture}}));
   return r.id;}
  catch(e){if(e instanceof FeError&&e.code==='rule_violation'&&e.rule==='photo_required')setNeedPhoto(true);else setFailure(feErrorMessage(e,t));return null;}
 };
 /** «Разрешить камеру» / «Сфотографировать документ» on the choice screen: camera first, then the check. */
 const allowCamera=async(how:Method)=>{
  setBusy(true);
  try{if(!(await cameraOk())){setDenied(how);return;}await start(how);}finally{setBusy(false);}
 };
 const pick=async(f:File|undefined,how:Method)=>{
  if(!f)return;setFailure('');
  let blob:Blob;
  try{blob=await toJpeg(f);}catch{setFailure(t(how==='document'?'fe.age.photoTypeDoc':'fe.age.photoType'));return;}
  // A file chosen from the choice or «no camera» screen opens the document check first.
  if(!(c?.state==='started'&&c.method===how)){setBusy(true);const id=await start(how);setBusy(false);if(!id)return;}
  setShot({blob,url:URL.createObjectURL(blob),method:how});
 };
 const send=async()=>{
  if(!shot||!c||c.state!=='started'||!person)return;
  setBusy(true);setFailure('');
  try{
   const assetId=await sendPhoto(shot.blob,()=>{});
   await call('verification.ageSubmit',{opId:newOpId(),checkId:c.id,assetId},ok,{asAccount:true});
   setShot(null);load();
  }catch(e){
   if(e instanceof FeError&&e.code==='conflict'&&e.state==='expired'){setShot(null);setFailure(t(shot.method==='document'?'fe.age.docLate':'fe.age.late'));load();}
   else setFailure(e instanceof Error&&e.message==='upload'?t('fe.age.uploadFailed'):feErrorMessage(e,t));
  }finally{setBusy(false);}
 };
 /** «Продолжить»: back to where the check was opened, resuming what the person was doing. */
 const proceed=()=>{
  const then=safeReturn(params.get('then'));const intent=params.get('do');
  if(!then){navigate(-1);return;}
  const u=new URL(then,window.location.origin);if(intent&&INTENT.test(intent))u.searchParams.set('resume',intent);
  navigate(u.pathname+u.search,{replace:true});
 };

 const pickers=<>
  <FilePick ref={cam} accept="image/*" capture="user" onFiles={f=>void pick(f[0],'selfie')}/>
  <FilePick ref={docCam} accept="image/*" capture="environment" onFiles={f=>void pick(f[0],'document')}/>
  <FilePick ref={file} accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onFiles={f=>void pick(f[0],'document')}/>
 </>;
 const alertErr=failure?<Alert kind="err" icon={X} className="mt12">{failure}</Alert>:null;
 const back='/n/settings';
 if(error)return <><Bar title={t('fe.age.title')} back={back}/><View className="nodock"><Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={()=>load(true)}>{t('fe.retry')}</Btn></Empty></View></>;
 if(!s)return <><Bar title={t('fe.age.title')} back={back}/><View className="nodock"><Skel kind="list"/></View></>;

 // ageDone: 18+ confirmed and still valid.
 if(s.verified){
  const until=s.until?new Date(s.until).toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'long',year:'numeric'}):'';
  return <><Bar title={t('fe.age.statusTitle')} back={back}/><View className="nodock">
   <Empty icon={ShieldCheck} role="status" title={t('fe.age.okTitle')} text={t('fe.age.okText')+(until?' '+t('fe.age.okUntil').replace('{date}',until.replace(/\.$/,'')):'')}>
    <Btn onClick={proceed}>{t('fe.age.continue')}</Btn></Empty>
  </View></>;
 }
 // Sent, waiting for staff.
 if(c?.state==='submitted')return <><Bar title={t('fe.age.statusTitle')} back={back}/><View className="nodock">
  <Empty icon={Clock} role="status" title={t('fe.age.waitTitle')} text={t(c.method==='document'?'fe.age.docWaitText':'fe.age.waitText')}><Btn kind="soft" icon={RefreshCw} onClick={()=>load(true)}>{t('fe.age.refresh')}</Btn></Empty>
 </View></>;

 // ageCam: the camera was refused or is missing.
 if(denied)return <><Bar title={t('fe.age.title')} back={back}/><View className="nodock">
  <Empty icon={CameraOff} role="alert" title={t('fe.age.camDenied')} text={t('fe.age.camDeniedText')}>
   <Btn onClick={()=>void allowCamera(denied)} busy={busy} disabled={busy}>{t('fe.age.tryAgain')}</Btn>
   <Btn kind="soft" icon={FileUp} onClick={()=>file.current?.click()} disabled={busy}>{t('fe.age.docUpload')}</Btn>
  </Empty>{pickers}{alertErr}
 </View></>;

 const other=<Btn kind="text" className="mt8" onClick={()=>{setShot(null);setChoice(null);setChoosing(true);setFailure('');}} disabled={busy}>{t('fe.age.otherMethod')}</Btn>;
 // ageShot, document: the frame, then the shot to send.
 if(!choosing&&c?.state==='started'&&c.method==='document'){
  const mine=shot?.method==='document'?shot:null;
  return <><Bar title={t('fe.age.docTitle')} back={back}/><View className="nodock">
   <CaptureFrame shape="document" hint={t('fe.age.docFrame')} src={mine?.url} alt={t('fe.age.docShotAlt')}/>
   {mine?<><Btn className="mt16" onClick={send} busy={busy} disabled={busy||!person}>{t('fe.age.send')}</Btn>
     <Btn kind="soft" className="mt8" icon={FileUp} onClick={()=>file.current?.click()} disabled={busy}>{t('fe.age.docOther')}</Btn></>
    :<><Btn className="mt16" icon={Camera} onClick={()=>docCam.current?.click()}>{t('fe.age.docShoot')}</Btn>
     <Btn kind="soft" className="mt8" icon={FileUp} onClick={()=>file.current?.click()}>{t('fe.age.docUpload')}</Btn></>}
   {pickers}{alertErr}
   <Card list className="mt16">
    <Row icon={Info} title={t('fe.age.docReq1')}/>
    <Row icon={Info} title={t('fe.age.docReq2')}/>
    <Row icon={Lock} title={t('fe.age.docStored')} sub={t('fe.age.docStoredText')}/>
   </Card>
   {other}
  </View></>;
 }
 // ageShot, selfie: show the gesture, take the selfie.
 if(!choosing&&c?.state==='started'&&c.gesture){
  const g=(GESTURES as readonly string[]).includes(c.gesture)?t('fe.age.gesture.'+c.gesture):c.gesture;
  const mine=shot?.method==='selfie'?shot:null;
  return <><Bar title={t('fe.age.selfieTitle')} back={back}/><View className="nodock">
   <Card list><Row icon={Hand} tone="v" title={g} sub={t('fe.age.gestureLabel')}/></Card>
   <div className="mt12"><CaptureFrame shape="face" hint={t('fe.age.frame')} src={mine?.url} alt={t('fe.age.shotAlt')}/></div>
   {mine?<><Btn className="mt16" onClick={send} busy={busy} disabled={busy||!person}>{t('fe.age.send')}</Btn>
     <Btn kind="soft" className="mt8" icon={Camera} onClick={()=>cam.current?.click()} disabled={busy}>{t('fe.age.retake')}</Btn></>
    :<Btn className="mt16" icon={Camera} onClick={()=>cam.current?.click()}>{t('fe.age.shoot')}</Btn>}
   {pickers}{alertErr}
   <Alert icon={Lock} className="mt16">{t('fe.age.camNote')}</Alert>
   {other}
  </View></>;
 }

 // ageM: nothing yet, rejected, ran out, the year has passed — or «Другой способ».
 const reason=c?.state==='rejected'&&c.reason&&REASONS.includes(c.reason)?t('fe.age.reason.'+c.reason)+' ':'';
 const doc=m==='document';
 return <><Bar title={t('fe.age.title')} back={back}/><View className="nodock">
  <Text>{t('fe.age.lead')}</Text>
  {c?.state==='rejected'&&!choosing&&<Alert kind="err" icon={TriangleAlert} role="status" className="mt12"><b>{t('fe.age.rejected')}</b>{reason}{t('fe.age.rejectedText')}</Alert>}
  {c?.state==='approved'&&<Alert kind="warn" icon={Clock} className="mt12"><b>{t('fe.age.expiredProof')}</b>{t('fe.age.expiredProofText')}</Alert>}
  {c?.state==='expired'&&!choosing&&<Alert kind="warn" icon={Clock} className="mt12"><b>{t('fe.age.expiredTry')}</b>{t(c.method==='document'?'fe.age.expiredDocText':'fe.age.expiredTryText')}</Alert>}
  <Group title={t('fe.age.methodLabel')} className="mt16">
   <RadioList label={t('fe.age.methodLabel')} value={m} onChange={v=>{setChoice(v);setNeedPhoto(false);setFailure('');}}
    options={[['selfie',<b key="s">{t('fe.age.method')}</b>,t('fe.age.methodSub')] as const,['document',<b key="d">{t('fe.age.methodDoc')}</b>,t('fe.age.methodDocSub')] as const]}/>
  </Group>
  <Alert icon={Lock} className="mt16">{t('fe.age.camNoteShort')}</Alert>
  {needPhoto&&!doc?<Alert kind="warn" icon={ImagePlus} role="alert" className="mt16">{t('fe.age.needPhoto')}<Btn kind="soft" size="sm" auto icon={ImagePlus} onClick={()=>navigate('/n/me')}>{t('fe.age.addPhoto')}</Btn></Alert>
   :doc?<><Btn className="mt24" icon={Camera} onClick={()=>void allowCamera('document')} busy={busy} disabled={busy}>{t('fe.age.docShoot')}</Btn>
     <Btn kind="soft" className="mt8" icon={FileUp} onClick={()=>file.current?.click()} disabled={busy}>{t('fe.age.docUpload')}</Btn></>
   :<Btn className="mt24" icon={Camera} onClick={()=>void allowCamera('selfie')} busy={busy} disabled={busy}>{t('fe.age.allowCam')}</Btn>}
  {pickers}{alertErr}
  <Group title={t('fe.age.how')} className="mt24">
   <Card list>{doc?<>
    <Row icon={IdCard} tone="v" title={t('fe.age.docStep1')}/>
    <Row icon={UserCheck} tone="v" title={t('fe.age.docStep2')}/>
    <Row icon={Lock} title={t('fe.age.docStored')} sub={t('fe.age.docStoredText')}/>
   </>:<>
    <Row icon={Hand} tone="v" title={t('fe.age.step1')}/>
    <Row icon={ScanFace} tone="v" title={t('fe.age.step2')}/>
    <Row icon={UserCheck} tone="v" title={t('fe.age.step3')}/>
    <Row icon={Lock} title={t('fe.age.stored')} sub={t('fe.age.storedText')}/>
   </>}</Card>
  </Group>
 </View></>;
}

/** The link the age gates show next to their message. `intent` names what to redo after the check (the screen
 * handles it with `useAgeResume`); the person comes back to the current page either way. */
export function AgeCheckLink({intent}:{intent?:string|undefined}={}){
 const {t}=useI18n();const navigate=useNavigate();const loc=useLocation();
 return <Btn kind="soft" size="sm" auto icon={ShieldCheck} className="mt8" onClick={()=>navigate(agePath(loc.pathname+loc.search,intent))}>{t('fe.age.go')}</Btn>;
}
