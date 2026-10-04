import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import {
  createRemotePushClient,
  type RemotePushPlugin
} from '@appbase/core/remote-push.js';
import { authClient } from './auth';
import { apiUrl } from './api-url';
import { LOCALE_KEY } from './i18n';

const ACTION_EVENT='unmute:remote-push-action';

function locale():string{
  try{return localStorage.getItem(LOCALE_KEY)==='en'?'en':'ru';}
  catch{return 'ru';}
}

function validRoute(value:unknown):string|null{
  const route=String(value||'');
  if(route==='/'||route==='/review'||route==='/account'||route==='/access'||route==='/course')return route;
  if(/^\/learn\/[a-zA-Z0-9._-]+(?:\?resume=1)?$/.test(route))return route;
  return null;
}

const native=Capacitor.isNativePlatform();
const client=createRemotePushClient({
  auth:authClient,
  native,
  plugin:native?(PushNotifications as unknown as RemotePushPlugin):null,
  platform:()=>Capacitor.getPlatform(),
  endpoint:apiUrl('/api/auth'),
  locale,
  onAction:data=>{
    try{
      window.dispatchEvent(new CustomEvent(ACTION_EVENT,{detail:data}));
    }catch{}
  }
});

export function startRemotePush():void{
  client.start();
}

export function stopRemotePush():void{
  client.stop();
}

export async function syncRemotePush(requestPermission=false):Promise<boolean>{
  return client.sync(requestPermission);
}

export async function unregisterRemotePush():Promise<boolean>{
  return client.unregister();
}

export function subscribeRemotePushRoute(listener:(route:string)=>void):()=>void{
  const handler=(event:Event)=>{
    const detail=(event as CustomEvent<Record<string,unknown>>).detail??{};
    const route=validRoute(detail.route);
    if(route)listener(route);
  };
  window.addEventListener(ACTION_EVENT,handler);
  return ()=>window.removeEventListener(ACTION_EVENT,handler);
}
