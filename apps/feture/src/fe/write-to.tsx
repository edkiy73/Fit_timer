import {useCallback,useState} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {MessageCircle} from 'lucide-react';
import {IconBtn} from './kit';
import {useFe} from './session';

/** «Написать» someone (owner 29.10.2026, message requests): their chat when there is one, otherwise the chat composer
 * marked as a request (`/n/chats/new/:id`), which also says why a request cannot go out. One place for the profile,
 * community member lists and event attendee lists. */
const withRes=z.object({ok:z.literal(true),conversationId:z.uuid().nullable()}).passthrough();

export function useWriteTo(){
 const {call}=useFe();const navigate=useNavigate();const [busy,setBusy]=useState('');
 const open=useCallback(async(profileId:string)=>{
  if(busy)return;setBusy(profileId);
  try{const r=await call('chat.with',{profileId},withRes);navigate(r.conversationId?'/n/chats/'+r.conversationId:'/n/chats/new/'+profileId);}
  catch{navigate('/n/chats/new/'+profileId);}
  finally{setBusy('');}
 },[busy,call,navigate]);
 return {open,busy};
}

/** The round «Написать» at the end of a person row (members, attendees). */
export function WriteBtn({id,name}:{id:string,name:string}){
 const {t}=useI18n();const {open,busy}=useWriteTo();
 return <IconBtn icon={MessageCircle} kind="ghost" size="sm" label={t('fe.rq.writeTo',{name})} disabled={busy===id} onClick={e=>{e.stopPropagation();void open(id);}}/>;
}
