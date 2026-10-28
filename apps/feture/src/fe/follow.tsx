import {useState} from 'react';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Check} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Btn} from './kit';
import {useFe} from './session';
import {useToast} from './toast';

const ok=z.object({ok:z.literal(true)}).passthrough();

/** The one «Подписаться» of the app (owner 29.10.2026: one action — one component): a profile page, a Discover card,
 * a followers list. Off — «Подписаться» («… от пары» as the couple, `back` — «Подписаться в ответ»); on — «✓ Вы
 * подписаны»; a tap flips it on the server, and the toast offers «Отменить». `size="sm"` in a list row; `inert` in
 * «Как видят другие» (looks real, does nothing). The screen keeps the state and gets it back in `onChange`. */
export function FollowButton({profileId,name,on,onChange,size,back,inert,disabled}:{profileId:string,name:string,on:boolean,onChange:(on:boolean)=>void,
 size?:'sm'|undefined,back?:boolean|undefined,inert?:boolean|undefined,disabled?:boolean|undefined}){
 const {call,acting}=useFe();const {t}=useI18n();const toast=useToast();const [busy,setBusy]=useState(false);
 const us=acting?.kind==='couple'&&!inert;
 const set=async(next:boolean,undo:boolean)=>{
  try{await call('follow.set',{opId:newOpId(),profileId,on:next},ok);onChange(next);
   if(!undo)toast(t((next?'fe.px.fl.on':'fe.px.fl.off')+(us?'Us':'')).replace('{name}',name),{type:'ok',action:{label:t('fe.mx.undo'),fn:()=>void set(!next,true)}});}
  catch(e){toast(feErrorMessage(e,t),{type:'err'});}};
 const go=async()=>{if(busy||inert)return;setBusy(true);try{await set(!on,false);}finally{setBusy(false);}};
 return <Btn kind="soft" size={size??''} busy={busy} aria-pressed={on} disabled={!!disabled||!!inert||busy} onClick={()=>void go()}
  title={on?t(us?'fe.px.act.unfollowHintUs':'fe.px.act.unfollowHint'):undefined}>
  {on?<><Check/>{t(us?'fe.px.act.followingUs':'fe.px.act.following')}</>:us?t('fe.px.act.followUs'):back?t('fe.br.followBack'):t('fe.people.follow')}</Btn>;
}
