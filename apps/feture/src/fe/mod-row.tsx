import {lazy,Suspense,useEffect,useState,type ComponentProps} from 'react';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ShieldAlert} from 'lucide-react';
import {Row} from './kit';
import {useFe} from './session';

/** What a moderator may do from the thing itself (owner 06.11.2026): the «⋯» sheet of a community, an event, a post, a
 * comment or a profile gets one row, «Действия модератора», for staff who may; it opens a second sheet (`ModActions`,
 * loaded only then, with the staff area's own pieces). The server decides again on every action. */
export type ModTarget={kind:'community'|'event'|'post'|'reply'|'profile',id:string,
 /** The name of a community or an event. */ title?:string|null|undefined,
 /** Whose thing it is: the owner, the organizer, the author, or the profile itself. */ owner:{id:string,name?:string|null|undefined,handle?:string|null|undefined}|null};

const meRes=z.object({ok:z.literal(true),roles:z.array(z.string())}).passthrough();
const SEES=['owner','lead','moderator','auditor'];

/** The staff roles of this account ([] for everyone else), asked once per few minutes. */
let memo:{roles:string[],at:number}|null=null;
export function useModRoles(){
 const {call}=useFe();const [roles,setRoles]=useState<string[]>(()=>memo&&Date.now()-memo.at<300000?memo.roles:[]);
 useEffect(()=>{
  if(memo&&Date.now()-memo.at<300000){setRoles(memo.roles);return;}
  let live=true;
  call('staff.me',{},meRes,{asAccount:true}).then(r=>{memo={roles:r.roles,at:Date.now()};if(live)setRoles(r.roles);}).catch(()=>{});
  return ()=>{live=false;};
 },[call]);
 return roles;
}

/** The one row in a «⋯» sheet. `own`: the thing is the viewer's own (no row: nobody moderates themselves). */
export function ModRow({own,onClick}:{own?:boolean|undefined,onClick:()=>void}){
 const {t}=useI18n();const roles=useModRoles();
 if(own||!roles.some(r=>SEES.includes(r)))return null;
 return <Row noChev icon={ShieldAlert} title={t('fe.mod.row')} onClick={onClick}/>;
}

const Lazy=lazy(()=>import('./mod-actions'));
export function ModActions(props:ComponentProps<typeof Lazy>){return <Suspense fallback={null}><Lazy {...props}/></Suspense>;}
