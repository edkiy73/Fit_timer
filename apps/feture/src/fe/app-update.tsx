import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {App} from '@capacitor/app';
import {Download} from 'lucide-react';
import {androidUpdatePlugin,decideUpdate,type UpdateChannels,type UpdateOffer} from '@appbase/core/app-update.js';
import {apiUrl} from '../api-url';
import {Alert,Btn,Empty,Sheet,Stack,Text} from './kit';

/** In-app Android update, as in UnMute/FitTimer. Admin → «Обновление приложения» publishes the latest build per channel
 * in /api/config → update.android.{direct,store} (lib/app-update.js); the phone compares it with its own build
 * (@appbase/core/app-update) and FetUreUpdatePlugin downloads the APK (WorkManager), checks package, exact versionCode
 * and signature, then opens the Android installer. The store build only opens the store page. Below minimumCode the
 * app cannot be used until updated. Website and iOS: nothing happens. */

type DownloadStatus='idle'|'downloading'|'ready'|'installing'|'permission'|'error';
const plugin=()=>androidUpdatePlugin('FetUreUpdate');
const DISMISS_KEY='feture.update.dismissed';
/** Right after «Обновить» an old, finished download may answer first: its «error»/«idle» is not about this press. */
const START_GRACE_MS=6000;

function useAppUpdate(){
 const {locale}=useI18n();
 const [offer,setOffer]=useState<UpdateOffer|null>(null);
 const [status,setStatus]=useState<DownloadStatus>('idle');
 const [progress,setProgress]=useState(-1);
 const [dismissed,setDismissed]=useState(()=>{try{return Number(localStorage.getItem(DISMISS_KEY))||0;}catch{return 0;}});
 const poll=useRef<number|null>(null);
 const stopPolling=()=>{if(poll.current!==null){window.clearInterval(poll.current);poll.current=null;}};

 const install=useCallback(async(target:UpdateOffer)=>{
  const native=plugin();if(!native)return;
  setStatus('installing');
  const r=await native.installUpdate({expectedVersionCode:target.versionCode}).catch(()=>({status:'error'}));
  setStatus(r.status==='permission_required'?'permission':r.status==='installer_opened'?'ready':'error');
 },[]);

 const watch=useCallback((target:UpdateOffer,fresh=false)=>{
  const native=plugin();if(!native)return;
  stopPolling();
  const startedAt=Date.now();
  poll.current=window.setInterval(()=>{
   void native.getUpdateState().then(s=>{
    if(fresh&&Date.now()-startedAt<START_GRACE_MS&&(s.status==='error'||s.status==='idle'||s.status==='cancelled'))return;
    if(s.status==='downloading'){setStatus('downloading');setProgress(typeof s.progress==='number'?s.progress:-1);}
    else if(s.status==='ready'){stopPolling();void install(target);}
    else if(s.status==='error'){stopPolling();setStatus('error');}
    else if(s.status==='cancelled'||s.status==='idle'){stopPolling();setStatus('idle');setProgress(-1);}
   }).catch(()=>undefined);
  },1000);
 },[install]);

 const check=useCallback(async()=>{
  const native=plugin();if(!native)return;
  try{
   const [build,response]=await Promise.all([native.getDistribution(),fetch(apiUrl('/api/config'),{cache:'no-store'})]);
   const config=await response.json() as {update?:{android?:UpdateChannels}};
   const next=decideUpdate(config.update?.android,build.channel,Number(build.versionCode)||0,locale);
   setOffer(next);
   if(next?.channel==='direct'){
    const s=await native.getUpdateState().catch(()=>null);
    if(s?.status==='downloading'){setStatus('downloading');watch(next);}
    else if(s?.status==='ready')setStatus('ready');
   }
  }catch{/* offline or no config: ask again on the next return to the app */}
 },[locale,watch]);

 // On start and whenever the app comes back to the front (a release may have been published meanwhile).
 useEffect(()=>{
  if(!plugin())return;
  void check();
  let removed=false;let handle:{remove:()=>Promise<void>}|undefined;
  void App.addListener('resume',()=>void check()).then(h=>{if(removed)void h.remove();else handle=h;});
  return ()=>{removed=true;stopPolling();if(handle)void handle.remove();};
 },[check]);

 const start=async()=>{
  const native=plugin();if(!native||!offer)return;
  if(offer.channel==='store'){await native.openExternal({url:offer.url}).catch(()=>undefined);return;}
  if(status==='ready'||status==='permission'){await install(offer);return;}
  setStatus('downloading');setProgress(-1);
  const r=await native.downloadUpdate({url:offer.url,expectedVersionCode:offer.versionCode}).catch(()=>({status:'error'}));
  if(r.status==='error'){setStatus('error');return;}
  if(r.status==='installer_opened'){setStatus('ready');return;}
  if(r.status==='permission_required'){setStatus('permission');return;}
  watch(offer,true);
 };
 const cancel=async()=>{stopPolling();await plugin()?.cancelUpdate().catch(()=>undefined);setStatus('idle');setProgress(-1);};
 const dismiss=()=>{
  if(!offer)return;
  setDismissed(offer.versionCode);
  try{localStorage.setItem(DISMISS_KEY,String(offer.versionCode));}catch{/* shown again next start */}
 };
 const visible=Boolean(offer&&(offer.level==='required'||dismissed!==offer.versionCode));
 return {offer:visible?offer:null,status,progress,start,cancel,dismiss};
}

type UpdateState=ReturnType<typeof useAppUpdate>;
const UpdateContext=createContext<UpdateState|null>(null);

/** One update check for the whole V21 app (FeRoot). */
export function AppUpdateProvider({children}:{children:ReactNode}){
 const state=useAppUpdate();
 return <UpdateContext.Provider value={state}>{children}</UpdateContext.Provider>;
}

/** True when this build is below the published minimum: FeGate shows UpdateRequired instead of the app. */
export function useUpdateRequired(){return useContext(UpdateContext)?.offer?.level==='required';}

function actionLabel(t:(key:string,params?:Record<string,string|number>)=>string,s:UpdateState){
 if(s.offer?.channel==='store')return t('fe.upd.openStore');
 if(s.status==='downloading')return s.progress>=0?t('fe.upd.downloadingPercent',{progress:s.progress}):t('fe.upd.downloading');
 if(s.status==='installing')return t('fe.upd.installing');
 if(s.status==='permission')return t('fe.upd.installAfterPermission');
 if(s.status==='ready')return t('fe.upd.install');
 if(s.status==='error')return t('fe.upd.retry');
 return t('fe.upd.update');
}

function Notes({s}:{s:UpdateState}){
 const {t}=useI18n();
 return <>
  {s.status==='permission'&&<Alert kind="info">{t('fe.upd.permissionHint')}</Alert>}
  {s.status==='error'&&<Alert kind="err">{t('fe.upd.error')}</Alert>}
 </>;
}
function Actions({s,later}:{s:UpdateState,later?:()=>void}){
 const {t}=useI18n();const busy=s.status==='downloading'||s.status==='installing';
 return <>
  <Btn busy={busy} disabled={busy} onClick={()=>void s.start()}>{actionLabel(t,s)}</Btn>
  {s.status==='downloading'?<Btn kind="text" onClick={()=>void s.cancel()}>{t('fe.upd.cancel')}</Btn>
   :later?<Btn kind="text" onClick={later}>{t('fe.upd.later')}</Btn>:null}
 </>;
}

/** A newer build is published: a small sheet once per version («Позже» hides it until the next one). */
export function UpdateSheet(){
 const {t}=useI18n();const s=useContext(UpdateContext);
 if(!s?.offer||s.offer.level==='required')return null;
 const o=s.offer;
 return <Sheet title={o.versionName?t('fe.upd.titleVersion',{version:o.versionName}):t('fe.upd.title')} lead={<span className="ico l"><Download/></span>}
  onClose={s.dismiss} foot={<Actions s={s} later={s.dismiss}/>}>
  <Stack gap={3}>
   <Text>{o.message||(o.channel==='store'?t('fe.upd.storeText'):t('fe.upd.directText'))}</Text>
   <Notes s={s}/>
  </Stack>
 </Sheet>;
}

/** Below the minimum version: the whole app is this screen until the update is installed. */
export function UpdateRequired(){
 const {t}=useI18n();const s=useContext(UpdateContext);
 if(!s?.offer)return null;
 const note=s.status==='permission'||s.status==='error';
 return <Empty icon={Download} role="alert" title={t('fe.upd.requiredTitle')} text={s.offer.message||t('fe.upd.requiredText')} {...(note?{after:<Notes s={s}/>}:{})}>
  <Actions s={s}/>
 </Empty>;
}
