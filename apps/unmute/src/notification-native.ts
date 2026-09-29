import { createTransport } from '@appbase/core/native-notifications.js';

type PermissionState='prompt'|'prompt-with-rationale'|'granted'|'denied';

interface ListenerHandle {
  remove():Promise<void>|void;
}

interface LocalNotificationsPlugin {
  checkPermissions():Promise<{display?:PermissionState}>;
  requestPermissions():Promise<{display?:PermissionState}>;
  checkExactNotificationSetting?():Promise<{exact_alarm?:PermissionState}>;
  changeExactNotificationSetting?():Promise<unknown>;
  getPending():Promise<{notifications?:Array<{id:number}>}>;
  cancel(input:{notifications:Array<{id:number}>}):Promise<unknown>;
  schedule(input:{notifications:Array<Record<string,unknown>>}):Promise<unknown>;
  removeDeliveredNotificationsById?(input:{ids:number[]}):Promise<unknown>;
  addListener?(
    name:'localNotificationActionPerformed',
    listener:(event:unknown)=>void
  ):Promise<ListenerHandle>|ListenerHandle;
}

interface CapacitorLike {
  isNativePlatform?():boolean;
  getPlatform?():string;
  Plugins?:{
    LocalNotifications?:LocalNotificationsPlugin;
  };
}

export type NotificationPermissionState='unavailable'|'prompt'|'granted'|'denied';

function capacitor():CapacitorLike|null{
  return ((globalThis as unknown as {Capacitor?:CapacitorLike}).Capacitor)??null;
}

function localPlugin():LocalNotificationsPlugin|null{
  return capacitor()?.Plugins?.LocalNotifications??null;
}

export function nativeNotificationsAvailable():boolean{
  const cap=capacitor();
  return Boolean(cap?.isNativePlatform?.()&&localPlugin());
}

export const notificationTransport=createTransport({
  native:nativeNotificationsAvailable(),
  local:localPlugin(),
  platform:()=>capacitor()?.getPlatform?.()??'web'
});

export async function notificationPermissionState():Promise<NotificationPermissionState>{
  if(!nativeNotificationsAvailable())return 'unavailable';
  try{
    const state=(await localPlugin()!.checkPermissions()).display;
    if(state==='granted')return 'granted';
    if(state==='denied')return 'denied';
    return 'prompt';
  }catch{
    return 'denied';
  }
}

export async function requestNotificationPermission():Promise<NotificationPermissionState>{
  if(!nativeNotificationsAvailable())return 'unavailable';
  const granted=await notificationTransport.localPermission(true);
  if(granted)return 'granted';
  return notificationPermissionState();
}

export async function exactNotificationTimeAvailable():Promise<boolean>{
  if(!nativeNotificationsAvailable())return false;
  return notificationTransport.exactAllowed();
}

export async function requestExactNotificationTime():Promise<boolean>{
  if(!nativeNotificationsAvailable())return false;
  const cap=capacitor();
  const plugin=localPlugin();
  if(cap?.getPlatform?.()!=='android')return true;
  if(await exactNotificationTimeAvailable())return true;
  if(!plugin?.changeExactNotificationSetting)return false;
  try{
    await plugin.changeExactNotificationSetting();
  }catch{}
  return exactNotificationTimeAvailable();
}

export function notificationRouteFromAction(event:unknown):'/'|'/review'|null{
  if(!event||typeof event!=='object')return null;
  const notification=(event as {notification?:unknown}).notification;
  if(!notification||typeof notification!=='object')return null;
  const extra=(notification as {extra?:unknown;data?:unknown}).extra
    ??(notification as {data?:unknown}).data;
  if(!extra||typeof extra!=='object')return null;
  const route=(extra as {route?:unknown}).route;
  return route==='/'||route==='/review'?route:null;
}

export function subscribeNotificationRoute(
  listener:(route:'/'|'/review')=>void
):()=>void{
  const plugin=localPlugin();
  if(!nativeNotificationsAvailable()||!plugin?.addListener)return ()=>{};

  let live=true;
  let handle:ListenerHandle|null=null;
  const attached=plugin.addListener('localNotificationActionPerformed',event=>{
    const route=notificationRouteFromAction(event);
    if(route&&live)listener(route);
  });

  void Promise.resolve(attached).then(value=>{
    if(!live){
      void value.remove();
      return;
    }
    handle=value;
  }).catch(()=>{});

  return ()=>{
    live=false;
    if(handle)void handle.remove();
  };
}
