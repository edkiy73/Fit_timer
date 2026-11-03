import {Capacitor} from '@capacitor/core';
import {PushNotifications} from '@capacitor/push-notifications';
import {chatTag,decideTag} from '../../contracts/notifications.mjs';

/** The app icon badge and the notifications already on screen (docs/notifications.md «Счётчики», «Push»).
 * Badge = bell + unread chats (`navigator.setAppBadge` in a browser or an installed web app; Android draws its own dot
 * from the notifications shown — no extra plugin). Shown notifications carry a tag per chat, task or object
 * (contracts/notifications.mjs pushTag): once the person reads the chat or decides the task here, its notification is
 * closed — by the service worker (`public/fe-sw.js`, a «close» message) or by the push plugin on the phone. With
 * nothing left to read or decide, all of them go. Never a silent push: the server only adds `close` to real pushes. */

type BadgeNav=Navigator&{setAppBadge?:(n?:number)=>Promise<void>,clearAppBadge?:()=>Promise<void>};
let lastBadge=-1;

/** Sets the app icon badge (0 clears it). Quietly does nothing where the platform has no badge. */
export function setAppBadge(n:number){
 if(typeof navigator==='undefined'||n===lastBadge)return;
 lastBadge=n;
 const nav=navigator as BadgeNav;
 try{
  if(n>0)void nav.setAppBadge?.(n)?.catch(()=>{});
  else void nav.clearAppBadge?.()?.catch(()=>{});
 }catch{/* no badge here */}
}

function nativeOn(){return Capacitor.isNativePlatform()&&Capacitor.isPluginAvailable('PushNotifications');}

/** Closes shown notifications with these tags, or all of them. */
export function closeShown(tags:string[]|'all'){
 if(tags!=='all'&&!tags.length)return;
 if(nativeOn()){
  void PushNotifications.getDeliveredNotifications().then(({notifications})=>{
   const gone=tags==='all'?notifications:notifications.filter(n=>typeof n.tag==='string'&&tags.includes(n.tag));
   if(gone.length)return PushNotifications.removeDeliveredNotifications({notifications:gone});
  }).catch(()=>{});
  return;
 }
 if(typeof navigator==='undefined'||!('serviceWorker' in navigator))return;
 void navigator.serviceWorker.getRegistration('/').then(reg=>{
  reg?.active?.postMessage(tags==='all'?{type:'close',all:true}:{type:'close',tags});
 }).catch(()=>{});
}

/** Writes that read a chat or decide a «Нужно решить» item → the decide kind and the input field with its id. */
const DECIDED:Record<string,[string,string]>={
 'access.grant':['req','requestId'],'access.decline':['req','requestId'],'community.requestDecide':['capp','requestId'],
 'event.applicationDecide':['eapp','applicationId'],'link.answer':['link','linkId'],'link.answerChange':['linkChange','linkId'],
 'tag.answer':['tag','postId'],'couple.inviteAnswer':['pinv','inviteId'],'decide.approval':['joint','approvalId'],
};

/** The tags a successful write makes stale: the chat read or answered, the task decided. */
export function tagsAfter(action:string,input:Record<string,unknown>):string[]{
 const str=(k:string)=>typeof input[k]==='string'?input[k] as string:'';
 if(action==='chat.read'||action==='chat.requestAnswer')return str('conversationId')?[chatTag(str('conversationId'))]:[];
 const d=DECIDED[action];
 return d&&str(d[1])?[decideTag(d[0],str(d[1]))]:[];
}
