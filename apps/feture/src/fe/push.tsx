import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocation,useNavigate} from 'react-router';
import {z} from 'zod';
import {Bell} from 'lucide-react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {newOpId} from '../feture/fe-api';
import {Alert,Btn,Card,Note,Row,Sheet,Spacer,ToggleRow} from './kit';
import {useFe} from './session';
import {useToast} from './toast';
import {disableWebPush,enableWebPush,needsHomeScreen,onUseful,refreshWebPush,webPushState,webPushSupported,type WebPushState} from './push-web';
import {disableNativePush,enableNativePush,nativePushOfferable,nativePushState,nativePushSupported,onNativePushTap,refreshNativePush} from './push-native';

/** The notification settings as stored (passthrough: an update sends back exactly what the server has, plus a change). */
const settingsRes=z.object({ok:z.literal(true),settings:z.object({push:z.boolean(),offered:z.boolean().optional()}).passthrough()});
type Settings=z.infer<typeof settingsRes>['settings'];
const ok=z.object({ok:z.literal(true)}).passthrough();
/** One offer per page load at most; the server's `offered` mark makes it once per account. */
let asked=false;
const wait=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));

/** In the Android/iOS app push goes through FCM (push-native.ts), on the website through web push (push-web.ts). */
const native=nativePushSupported();

/** Turns push on for this browser (or this phone, in the app) and, if the account had push off, for the account too. */
function useTurnOn(){
 const {state,call}=useFe();const {t}=useI18n();const toast=useToast();
 const webKey=state.status==='ready'?state.boot.push?.webKey:undefined;
 return useCallback(async()=>{
  if(!native&&!webKey)return 'error' as const;
  // first: the browser's / phone's question must come from this tap
  const r=native?await enableNativePush(call):await enableWebPush(call,webKey!);
  if(r==='on'){
   const s=await call('notifications.settings.get',{},settingsRes,{asAccount:true}).catch(()=>null);
   if(s&&!s.settings.push)await call('notifications.settings.update',{opId:newOpId(),settings:{...s.settings,push:true}},ok,{asAccount:true}).catch(()=>{});
   toast(t('fe.push.on'),{type:'ok'});
  }else if(r==='denied')toast(t(native?'fe.push.app.deniedToast':'fe.push.deniedToast'),{type:'warn'});
  else if(r==='error')toast(t('fe.push.failed'),{type:'err'});
  return r;
 },[webKey,call,t,toast]);
}

/** V21 N02 `maybePush`: after the first useful action (never on start, never twice) — in a chat a quiet toast with
 * «Включить», elsewhere a small sheet. Also keeps an already subscribed browser registered. */
export function PushOffer(){
 const {state,call}=useFe();const {t}=useI18n();const toast=useToast();const {pathname}=useLocation();const navigate=useNavigate();
 const webKey=state.status==='ready'?state.boot.push?.webKey:undefined;
 const ready=state.status==='ready';
 const [sheet,setSheet]=useState(false);
 const where=useRef(pathname);where.current=pathname;
 const callRef=useRef(call);callRef.current=call;
 const turnOn=useTurnOn();const turnOnRef=useRef(turnOn);turnOnRef.current=turnOn;
 useEffect(()=>{if(!native&&webKey)void refreshWebPush((...a)=>callRef.current(...a),webKey);},[webKey]);
 useEffect(()=>{if(native&&ready)void refreshNativePush((...a)=>callRef.current(...a));},[ready]);
 // In the app a tap on a notification opens its screen (only /#/n/... routes, see pushRoute).
 useEffect(()=>native?onNativePushTap(route=>navigate(route)):undefined,[navigate]);
 useEffect(()=>{
  if(native?!ready:!webKey)return;
  return onUseful(()=>{
   if(asked||(!native&&(!webPushSupported()||Notification.permission!=='default')))return;
   asked=true;
   void (async()=>{
    try{
     if(native?!(await nativePushOfferable()):await webPushState()==='on')return;
     const s:Settings=(await callRef.current('notifications.settings.get',{},settingsRes,{asAccount:true})).settings;
     if(s.offered)return;
     const route=where.current;
     await wait(900);
     // Moved on, or a sheet / dialog is open: not now — the next useful action may ask.
     if(where.current!==route||document.querySelector('.v21 .sheet.on, .v21 .dialog.on')){asked=false;return;}
     await callRef.current('notifications.settings.update',{opId:newOpId(),settings:{...s,offered:true}},ok,{asAccount:true});
     if(route.startsWith('/n/chats/'))toast(t('fe.push.chatOffer'),{ms:6000,action:{label:t('fe.push.turnOn'),fn:()=>void turnOnRef.current()}});
     else setSheet(true);
    }catch{asked=false;}
   })();
  });
 },[webKey,ready,t,toast]);
 if(!sheet)return null;
 const close=()=>setSheet(false);
 return <Sheet title={t('fe.push.offerTitle')} lead={<span className="ico l"><Bell/></span>} onClose={close}
  foot={<><Btn onClick={()=>{close();void turnOn();}}>{t('fe.push.offerOk')}</Btn><Btn kind="text" onClick={close}>{t('fe.push.later')}</Btn></>}>
  <Card list><Row icon={Bell} title="FetUre" sub={t('fe.push.preview')}/></Card>
  <Spacer size={2}/><Note>{t('fe.push.offerText')}</Note>
 </Sheet>;
}

/** K05 «Push-уведомления»: this browser's subscription (this phone's FCM registration in the app) — reflects it and
 * changes it. */
let lastPushState:WebPushState|null=null;
/** Reads the switch's state ahead (settings opens), so «Уведомления» draws it at once. */
export function warmPushState(){void (native?nativePushState:webPushState)().then(v=>{lastPushState=v;}).catch(()=>{});}
export function PushSwitch(){
 const {state,call}=useFe();const {t}=useI18n();
 const webKey=state.status==='ready'?state.boot.push?.webKey:undefined;
 // The state read last draws the switch on the first frame (it is asked again at once): no row popping in.
 const [s,setS0]=useState<WebPushState|null>(lastPushState);const [busy,setBusy]=useState(false);
 const setS=useCallback((v:WebPushState)=>{lastPushState=v;setS0(v);},[]);
 const turnOn=useTurnOn();
 const read=native?nativePushState:webPushState;
 useEffect(()=>{let live=true;void read().then(v=>{if(live)setS(v);});return ()=>{live=false;};},[read,setS]);
 if(!native&&!webPushSupported())return needsHomeScreen()?<Note>{t('fe.push.homeScreen')}</Note>:null;
 if((!native&&!webKey)||!s||s==='unsupported')return null;
 const flip=()=>{
  if(busy)return;setBusy(true);
  const done=(p:Promise<unknown>)=>void p.finally(()=>read().then(setS).finally(()=>setBusy(false)));
  if(s==='on')done(native?disableNativePush(call):disableWebPush(call));
  else done(turnOn()); // asks the browser / phone right away, inside this tap
 };
 const k=native?'fe.push.app.':'fe.push.';
 return <>
  <Card list><ToggleRow title={t('fe.push.switch')} sub={s==='on'?t(k+'switchOn'):s==='denied'?t(k+'switchDenied'):t(k+'switchOff')} on={s==='on'} disabled={busy} onClick={flip}/></Card>
  {s==='denied'&&<Alert kind="warn">{t(k+'denied')}</Alert>}
 </>;
}
