import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocation} from 'react-router';
import {z} from 'zod';
import {Bell} from 'lucide-react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {newOpId} from '../feture/fe-api';
import {Alert,Btn,Card,Note,Row,Sheet,ToggleRow} from './kit';
import {useFe} from './session';
import {useToast} from './toast';
import {disableWebPush,enableWebPush,needsHomeScreen,onUseful,refreshWebPush,webPushState,webPushSupported,type WebPushState} from './push-web';

/** The notification settings as stored (passthrough: an update sends back exactly what the server has, plus a change). */
const settingsRes=z.object({ok:z.literal(true),settings:z.object({push:z.boolean(),offered:z.boolean().optional()}).passthrough()});
type Settings=z.infer<typeof settingsRes>['settings'];
const ok=z.object({ok:z.literal(true)}).passthrough();
/** One offer per page load at most; the server's `offered` mark makes it once per account. */
let asked=false;
const wait=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));

/** Turns push on for this browser and, if the account had push off, for the account too. */
function useTurnOn(){
 const {state,call}=useFe();const {t}=useI18n();const toast=useToast();
 const webKey=state.status==='ready'?state.boot.push?.webKey:undefined;
 return useCallback(async()=>{
  if(!webKey)return 'error' as const;
  const r=await enableWebPush(call,webKey); // first: the browser's question must come from this tap
  if(r==='on'){
   const s=await call('notifications.settings.get',{},settingsRes,{asAccount:true}).catch(()=>null);
   if(s&&!s.settings.push)await call('notifications.settings.update',{opId:newOpId(),settings:{...s.settings,push:true}},ok,{asAccount:true}).catch(()=>{});
   toast(t('fe.push.on'),{type:'ok'});
  }else if(r==='denied')toast(t('fe.push.deniedToast'),{type:'warn'});
  else if(r==='error')toast(t('fe.push.failed'),{type:'err'});
  return r;
 },[webKey,call,t,toast]);
}

/** V21 N02 `maybePush`: after the first useful action (never on start, never twice) — in a chat a quiet toast with
 * «Включить», elsewhere a small sheet. Also keeps an already subscribed browser registered. */
export function PushOffer(){
 const {state,call}=useFe();const {t}=useI18n();const toast=useToast();const {pathname}=useLocation();
 const webKey=state.status==='ready'?state.boot.push?.webKey:undefined;
 const [sheet,setSheet]=useState(false);
 const where=useRef(pathname);where.current=pathname;
 const callRef=useRef(call);callRef.current=call;
 const turnOn=useTurnOn();const turnOnRef=useRef(turnOn);turnOnRef.current=turnOn;
 useEffect(()=>{if(webKey)void refreshWebPush((...a)=>callRef.current(...a),webKey);},[webKey]);
 useEffect(()=>{
  if(!webKey)return;
  return onUseful(()=>{
   if(asked||!webPushSupported()||Notification.permission!=='default')return;
   asked=true;
   void (async()=>{
    try{
     if(await webPushState()==='on')return;
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
 },[webKey,t,toast]);
 if(!sheet)return null;
 const close=()=>setSheet(false);
 return <Sheet title={t('fe.push.offerTitle')} lead={<span className="ico l"><Bell/></span>} onClose={close}
  foot={<><Btn onClick={()=>{close();void turnOn();}}>{t('fe.push.offerOk')}</Btn><Btn kind="text" onClick={close}>{t('fe.push.later')}</Btn></>}>
  <Card list><Row icon={Bell} title="FetUre" sub={t('fe.push.preview')}/></Card>
  <Note className="mt8">{t('fe.push.offerText')}</Note>
 </Sheet>;
}

/** K05 «Push-уведомления»: this browser's subscription — reflects it and changes it. */
export function PushSwitch(){
 const {state,call}=useFe();const {t}=useI18n();
 const webKey=state.status==='ready'?state.boot.push?.webKey:undefined;
 const [s,setS]=useState<WebPushState|null>(null);const [busy,setBusy]=useState(false);
 const turnOn=useTurnOn();
 useEffect(()=>{let live=true;void webPushState().then(v=>{if(live)setS(v);});return ()=>{live=false;};},[]);
 if(!webPushSupported())return needsHomeScreen()?<Note className="mt8">{t('fe.push.homeScreen')}</Note>:null;
 if(!webKey||!s)return null;
 const flip=()=>{
  if(busy)return;setBusy(true);
  const done=(p:Promise<unknown>)=>void p.finally(()=>webPushState().then(setS).finally(()=>setBusy(false)));
  if(s==='on')done(disableWebPush(call));
  else done(turnOn()); // asks the browser right away, inside this tap
 };
 return <>
  <Card list className="mt8"><ToggleRow title={t('fe.push.switch')} sub={s==='on'?t('fe.push.switchOn'):s==='denied'?t('fe.push.switchDenied'):t('fe.push.switchOff')} on={s==='on'} disabled={busy} onClick={flip}/></Card>
  {s==='denied'&&<Alert kind="warn" className="mt8">{t('fe.push.denied')}</Alert>}
 </>;
}
