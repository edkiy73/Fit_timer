import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {BadgeCheck,Camera,Clock,ImagePlus,Info,Lock,RefreshCw,TriangleAlert,X} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Alert,Bar,Btn,Card,Empty,FilePick,Note,Pose,Row,Skel,View} from './kit';
import {useFe,useShown} from './session';
import {toJpeg} from './age-check';

/** V21 V01 «Фото-верификация» on /api/fe (server/commands/verification.mjs): the server picks a gesture
 * (`verification.photoStart`), the person sends a selfie making it (`media.uploadIntent` purpose `verification` →
 * PUT → `media.commit` → `verification.photoSubmit`), staff compare it with the profile photos. The result is the
 * «Фото подтверждено» badge; the selfie never appears anywhere. */
const GESTURES=['thumb_up','peace','open_palm','three_fingers','ok_sign','hand_on_head'] as const;
const REASONS=['gesture_mismatch','face_hidden','not_same_person','bad_photo'];
export const photoStatusRes=z.object({ok:z.literal(true),verified:z.boolean(),state:z.enum(['none','pending','approved','rejected']),reason:z.string().nullable(),
 decidedAt:z.string().nullable().optional(),lapsed:z.boolean().optional(),
 check:z.object({id:z.uuid(),state:z.enum(['started','submitted','approved','rejected','expired']),gesture:z.string().nullable()}).nullable()});
type Status=z.infer<typeof photoStatusRes>;
const startRes=z.object({ok:z.literal(true),id:z.uuid(),gesture:z.string(),state:z.enum(['started','submitted'])});
const intent=z.object({ok:z.literal(true),assetId:z.uuid(),upload:z.object({url:z.string(),method:z.string(),headers:z.record(z.string(),z.string())})});
const ok=z.object({ok:z.literal(true)}).passthrough();

/** `nameBadges()` — «Фото подтверждено» next to a name (V21 `.nbadge.v`). */
export function PhotoBadge(){
 const {t}=useI18n();
 return <span className="nbadge v" title={t('fe.pc.badge')} role="img" aria-label={t('fe.pc.badge')}><BadgeCheck aria-hidden="true"/></span>;
}

function About(){
 const {t}=useI18n();
 return <Card list>{([[BadgeCheck,'g','fe.pc.about1'],[Info,'','fe.pc.about2'],[Lock,'v','fe.pc.about3']] as const).map(([Icon,tone,k])=>
  <Row key={k} icon={Icon} tone={tone||undefined} title={t(k)} sub={t(k+'Text')}/>)}</Card>;
}

export function PhotoCheckScreen(){
 const {call,peek,state}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const [s,setS]=useShown<Status|null>('set.photoCheck',()=>peek('verification.photoStatus',{},photoStatusRes,{asAccount:true}));const [error,setError]=useState<unknown>(null);
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 // No profile photo yet: known from the session at once (the server says the same on «start»), so the screen is drawn
 // in its final shape on the first frame.
 const [needPhoto,setNeedPhoto]=useState(()=>state.status==='ready'&&state.boot.profiles.some(p=>p.kind==='person'&&p.state!=='deleted'&&p.avatar==null));
 const [shot,setShot]=useState<{blob:Blob,url:string}|null>(null);const input=useRef<HTMLInputElement>(null);const [about,setAbout]=useState(false);
 const person=state.status==='ready'?state.boot.profiles.find(p=>p.kind==='person'&&p.state!=='deleted'):undefined;
 const load=useCallback((fresh=false)=>{setError(null);call('verification.photoStatus',{},photoStatusRes,{asAccount:true,fresh}).then(setS).catch(setError);},[call]);
 useEffect(()=>{load();},[load]);
 useEffect(()=>()=>{if(shot)URL.revokeObjectURL(shot.url);},[shot]);
 // V21 V01 shows the gesture as soon as the screen opens: the server picks it (`photoStart` reuses an open check).
 const auto=useRef(false);
 useEffect(()=>{if(!s||auto.current||s.state==='approved'||s.state==='pending'||s.check?.state==='started')return;auto.current=true;void start();},[s]);

 const start=async()=>{
  // `needPhoto` stays as it is until the answer: the pose block must not appear and vanish again under the reader.
  setBusy(true);setFailure('');
  try{const r=await call('verification.photoStart',{opId:newOpId()},startRes,{asAccount:true});setNeedPhoto(false);
   if(r.state==='submitted')load();else setS(cur=>cur&&{...cur,check:{id:r.id,state:'started',gesture:r.gesture}});}
  catch(e){if(e instanceof FeError&&e.code==='rule_violation'&&e.rule==='photo_required')setNeedPhoto(true);else setFailure(feErrorMessage(e,t));}
  finally{setBusy(false);}
 };
 const pick=async(file:File|undefined)=>{
  if(!file)return;setFailure('');
  try{const blob=await toJpeg(file);setShot({blob,url:URL.createObjectURL(blob)});}catch{setFailure(t('fe.pc.photoType'));}
 };
 const send=async()=>{
  const c=s?.check;if(!shot||!c||!person)return;
  setBusy(true);setFailure('');
  try{
   const i=await call('media.uploadIntent',{opId:newOpId(),purpose:'verification',kind:'image',mime:shot.blob.type||'image/jpeg',bytes:shot.blob.size},intent,{profileId:person.id});
   const put=await fetch(i.upload.url,{method:i.upload.method,headers:i.upload.headers,body:shot.blob});
   if(!put.ok)throw new Error('upload');
   await call('media.commit',{assetId:i.assetId},ok,{profileId:person.id});
   await call('verification.photoSubmit',{opId:newOpId(),checkId:c.id,assetId:i.assetId},ok,{asAccount:true});
   setShot(null);load();
  }catch(e){
   if(e instanceof FeError&&e.code==='conflict'&&e.state==='expired'){setShot(null);setFailure(t('fe.pc.late'));load();}
   else if(e instanceof FeError&&e.code==='rule_violation'&&e.rule==='photo_required')setNeedPhoto(true);
   else setFailure(e instanceof Error&&e.message==='upload'?t('fe.pc.uploadFailed'):feErrorMessage(e,t));
  }finally{setBusy(false);}
 };

 const bar=<Bar title={t('fe.pc.title')} back="/n/settings" small/>;
 if(error)return <>{bar}<View className="nodock"><Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={()=>load(true)}>{t('fe.retry')}</Btn></Empty></View></>;
 if(!s)return <>{bar}<View className="nodock"><Skel kind="list"/></View></>;

 if(s.state==='approved'){
  const date=s.decidedAt?new Date(s.decidedAt).toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'long',year:'numeric'}).replace(/\.$/,''):'';
  return <>{bar}<View className="nodock">
   <Empty icon={BadgeCheck} role="status" title={t('fe.pc.okTitle')} text={t('fe.pc.okText').replace('{date}',date)}/>
   <About/>
  </View></>;
 }
 if(s.state==='pending')return <>{bar}<View className="nodock">
  <Empty icon={Clock} role="status" title={t('fe.pc.waitTitle')} text={t('fe.pc.waitText')}>
   <Btn kind="soft" icon={RefreshCw} onClick={()=>load(true)}>{t('fe.pc.refresh')}</Btn></Empty>
  <About/>
 </View></>;

 // none / rejected: start a check, see the gesture, take and send the selfie.
 const c=s.check?.state==='started'&&s.check.gesture?s.check:null;
 const gesture=c?.gesture?((GESTURES as readonly string[]).includes(c.gesture)?t('fe.age.gesture.'+c.gesture):c.gesture):'';
 const reason=s.state==='rejected'&&s.reason&&REASONS.includes(s.reason)?t('fe.pc.reason.'+s.reason)+' ':'';
 const cta=needPhoto?null:!c?<Btn icon={Camera} onClick={start} busy={busy} disabled={busy}>{t('fe.pc.shoot')}</Btn>
  :shot?<Btn onClick={send} busy={busy} disabled={busy||!person}>{t('fe.pc.send')}</Btn>
  :<Btn icon={Camera} onClick={()=>input.current?.click()}>{t('fe.pc.shoot')}</Btn>;
 return <>{bar}<View className={'nodock'+(cta?' cta1':'')}>
  {s.state==='rejected'&&<Alert kind="err" role="status" icon={TriangleAlert}><b>{t('fe.pc.rejected')}</b>{reason}{t('fe.pc.rejectedText')}</Alert>}
  {s.lapsed&&<Alert kind="warn" icon={Clock}><b>{t('fe.pc.lapsed')}</b>{t('fe.pc.lapsedText')}</Alert>}
  <p className="lead">{t('fe.pc.lead')}</p>
  {!needPhoto&&<Pose icon={Camera} label={t('fe.pc.poseLabel')} value={c?gesture:undefined}/>}
  {c&&shot&&<Card className="pv-capture"><div className="pv-preview"><img src={shot.url} alt={t('fe.pc.shotAlt')} draggable={false}/></div>
   <div className="pv-capture-info"><b>{t('fe.pc.ready')}</b><Note>{t('fe.pc.readyText')}</Note>
    <Btn kind="soft" size="md" auto icon={Camera} onClick={()=>input.current?.click()} disabled={busy}>{t('fe.pc.retake')}</Btn></div></Card>}
  <FilePick ref={input} accept="image/*" capture="user" onFiles={f=>void pick(f[0])}/>
  <Card list>{(['fe.pc.req1','fe.pc.req2','fe.pc.req3'] as const).map(k=>
   <Row key={k} icon={Info} body={t(k)}/>)}</Card>
  <Card list><Row icon={Info} tone="v" title={t('fe.pc.how')} expanded={about} onClick={()=>setAbout(v=>!v)}/></Card>
  {about&&<About/>}
  {needPhoto&&<Alert kind="warn" role="alert" icon={ImagePlus} action={<Btn kind="soft" size="sm" auto icon={ImagePlus} onClick={()=>navigate('/n/me')}>{t('fe.pc.addPhoto')}</Btn>}>{t('fe.pc.needPhoto')}</Alert>}
  {failure&&<Alert kind="err" icon={X}>{failure}</Alert>}
 </View>
 {cta&&<div className="ctabar"><div className="wrap">{cta}</div></div>}</>;
}
