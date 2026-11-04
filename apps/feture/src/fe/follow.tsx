import {useState} from 'react';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Check} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Btn} from './kit';
import {useFe} from './session';
import {useToast} from './toast';

const ok=z.object({ok:z.literal(true)}).passthrough();

/** The one follow action of the app: `follow.set` on the server, the toast with «Отменить», the state back to the
 * screen in `onChange`. `FollowButton` and every other place that follows (the post ⋯ menu's row) use it, so the
 * call, the wording and the undo stay the same everywhere. `toggle(next)` resolves true when the server took it. */
export function useFollow({profileId,name,onChange,inert}:{profileId:string,name:string,onChange:(on:boolean)=>void,inert?:boolean|undefined}){
 const {call,acting}=useFe();const {t}=useI18n();const toast=useToast();const [busy,setBusy]=useState(false);
 const us=acting?.kind==='couple'&&!inert;
 const set=async(next:boolean,undo:boolean):Promise<boolean>=>{
  try{const r=await call('follow.set',{opId:newOpId(),profileId,on:next},ok) as {pending?:unknown};
   // The partner approves follows first (audit item 20): nothing changes yet, the partner decides.
   if(r.pending){toast(t('fe.gal.pendingPartner'),{type:'info'});return true;}
   onChange(next);
   if(!undo)toast(t((next?'fe.px.fl.on':'fe.px.fl.off')+(us?'Us':'')).replace('{name}',name),{type:'ok',action:{label:t('fe.mx.undo'),fn:()=>void set(!next,true)}});
   return true;}
  catch(e){toast(feErrorMessage(e,t),{type:'err'});return false;}};
 const toggle=async(next:boolean)=>{if(busy||inert)return false;setBusy(true);try{return await set(next,false);}finally{setBusy(false);}};
 return {busy,us,toggle};
}

/** The one «Подписаться» button of the app (owner 29.10.2026: one action — one component): a profile page, a Discover
 * card, a followers list. Off — «Подписаться» («Подписать пару» as the couple); on — «✓ В подписках»; a tap flips it
 * through `useFollow`. `size="sm"` is the compact one of a list row: off — a small main «Подписаться», on — a small quiet
 * «✓ Подписаны». `inert` in «Как видят другие» (looks real, does nothing). The screen keeps the state and gets it back
 * in `onChange`. */
export function FollowButton({profileId,name,on,onChange,size,inert,disabled}:{profileId:string,name:string,on:boolean,onChange:(on:boolean)=>void,
 size?:'sm'|undefined,inert?:boolean|undefined,disabled?:boolean|undefined}){
 const {t}=useI18n();const {busy,us,toggle}=useFollow({profileId,name,onChange,inert});const sm=size==='sm';
 return <Btn kind={sm?(on?'quiet':'primary'):'soft'} size={size??''} busy={busy} aria-pressed={on} disabled={!!disabled||!!inert||busy} onClick={()=>void toggle(!on)}
  title={on?t(us?'fe.px.act.unfollowHintUs':'fe.px.act.unfollowHint'):undefined}>
  {on?<><Check/>{t(us?'fe.px.act.followingUs':sm?'fe.px.act.followingSm':'fe.px.act.following')}</>:us?t('fe.px.act.followUs'):t('fe.people.follow')}</Btn>;
}
