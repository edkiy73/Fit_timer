import {z} from 'zod';
import {Capacitor} from '@capacitor/core';
import {PushNotifications} from '@capacitor/push-notifications';
import {newOpId} from '../feture/fe-api';

/** V21 N02 push in the Android/iOS app: Firebase Cloud Messaging through @capacitor/push-notifications instead of the
 * browser's web push (push-web.ts stays the website's). The FCM token is the device row on the server
 * (`push.register` / `push.unregister`, platform `android` | `ios`); the server sends through Core's FCM sender.
 * Permission is asked only from a tap (`enableNativePush` is what the «Включить» / switch tap calls). */

type Call=<T>(action:string,input:Record<string,unknown>,schema:z.ZodType<T>,opts?:{asAccount?:boolean})=>Promise<T>;
export type NativePushState='unsupported'|'denied'|'off'|'on';

const ok=z.object({ok:z.literal(true)}).passthrough();
/** The token this device registered for the signed-in account, and when the server last heard it. */
const TOKEN_KEY='feture.fe.push.native';
const SEEN_KEY='feture.fe.push.native.seen';

export function nativePushSupported(){
 return Capacitor.isNativePlatform()&&Capacitor.isPluginAvailable('PushNotifications');
}
function platform():'android'|'ios'{return Capacitor.getPlatform()==='ios'?'ios':'android';}
function stored():string|null{try{return localStorage.getItem(TOKEN_KEY);}catch{return null;}}
function store(token:string|null){
 try{if(token){localStorage.setItem(TOKEN_KEY,token);localStorage.setItem(SEEN_KEY,String(Date.now()));}
  else{localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(SEEN_KEY);}}catch{/* no storage */}
}
function zone(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||undefined;}catch{return undefined;}}

/** The FCM token of this install: `register()` answers with a `registration` event (or `registrationError`). */
async function fcmToken():Promise<string>{
 const handles:Array<{remove:()=>Promise<void>}>=[];
 try{
  const token=new Promise<string>((resolve,reject)=>{
   void PushNotifications.addListener('registration',t=>resolve(t.value)).then(h=>handles.push(h));
   void PushNotifications.addListener('registrationError',e=>reject(new Error(e.error||'registration'))).then(h=>handles.push(h));
   setTimeout(()=>reject(new Error('registration_timeout')),20000);
  });
  await PushNotifications.register();
  return await token;
 }finally{for(const h of handles)void h.remove();}
}

async function permission():Promise<'granted'|'denied'|'prompt'>{
 const p=(await PushNotifications.checkPermissions()).receive;
 return p==='granted'?'granted':p==='denied'?'denied':'prompt';
}

export async function nativePushState():Promise<NativePushState>{
 if(!nativePushSupported())return 'unsupported';
 try{
  const p=await permission();
  if(p==='denied')return 'denied';
  return p==='granted'&&stored()?'on':'off';
 }catch{return 'unsupported';}
}

/** May the once-only offer ask on this device: not on yet and the system question not answered «no». */
export async function nativePushOfferable(){return (await nativePushState())==='off';}

/** Asks the system (Android 13+ / iOS; older Android grants without asking), gets the token, registers this device. */
export async function enableNativePush(call:Call):Promise<'on'|'denied'|'dismissed'|'error'>{
 if(!nativePushSupported())return 'error';
 try{
  let p=await permission();
  if(p==='prompt'){const r=(await PushNotifications.requestPermissions()).receive;p=r==='granted'?'granted':r==='denied'?'denied':'prompt';}
  if(p==='denied')return 'denied';
  if(p!=='granted')return 'dismissed';
  const token=await fcmToken();
  const tz=zone();
  await call('push.register',{opId:newOpId(),platform:platform(),token,...(tz?{tz}:{})},ok,{asAccount:true});
  store(token);
  return 'on';
 }catch{return 'error';}
}

/** Off on this device: the server forgets the token first, then FCM drops it. */
export async function disableNativePush(call:Call){
 const token=stored();
 if(!token)return;
 await call('push.unregister',{opId:newOpId(),token},ok,{asAccount:true}).catch(()=>{});
 store(null);
 await PushNotifications.unregister().catch(()=>{});
}

/** On sign-out the device stops getting this account's pushes even if the server could not be told: the FCM token is
 * deleted, so the server's next send gets «gone» and removes the row. */
export async function forgetNativePush(){
 if(!nativePushSupported()||!stored())return;
 store(null);
 try{await PushNotifications.unregister();}catch{/* nothing to drop */}
}

/** A device with push on re-registers when FCM rotated its token, and otherwise about once a day (the server skips
 * devices unseen for 60 days). Never asks for permission. */
export async function refreshNativePush(call:Call){
 const old=stored();
 if(!old||!nativePushSupported())return;
 try{
  if(await permission()!=='granted')return;
  const token=await fcmToken();
  let seen=0;try{seen=Number(localStorage.getItem(SEEN_KEY)||0);}catch{/* no storage */}
  if(token===old&&Date.now()-seen<=20*3600*1000)return;
  if(token!==old)await call('push.unregister',{opId:newOpId(),token:old},ok,{asAccount:true}).catch(()=>{});
  const tz=zone();
  await call('push.register',{opId:newOpId(),platform:platform(),token,...(tz?{tz}:{})},ok,{asAccount:true});
  store(token);
 }catch{/* next time */}
}

/** Only the app's own /n screens, as the server sends them (`/#/n/chats`, `/#/n/inbox`): never another site. */
export function pushRoute(url:unknown):string|null{
 const u=String(url??'');
 const m=/^\/#(\/n\/[A-Za-z0-9/_-]*)$/.exec(u);
 return m?m[1]!:null;
}

/** A tap on a notification (also the one that started the app: the plugin keeps it until a listener comes). */
export function onNativePushTap(open:(route:string)=>void):()=>void{
 if(!nativePushSupported())return ()=>{};
 let handle:{remove:()=>Promise<void>}|null=null;let gone=false;
 void PushNotifications.addListener('pushNotificationActionPerformed',a=>{
  const route=pushRoute((a.notification.data as Record<string,unknown>|undefined)?.url);
  if(route)open(route);
 }).then(h=>{if(gone)void h.remove();else handle=h;});
 return ()=>{gone=true;void handle?.remove();};
}
