import {useState} from 'react';
import {useNavigate} from 'react-router';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Calendar,ChartColumn,FileText,Image as ImageIcon,MessageSquareText,Sparkles,type LucideIcon} from 'lucide-react';
import {ActingAv,Card,ComposerRow,QuickStart,Row,Sheet} from './kit';
import {useFe} from './session';

/** One composer, one create sheet, one editor everywhere (owner 29.10.2026). A place you write from passes only where
 * it is: the feed nothing, a community `{id, canEvent}` (events there are for its owner and hosts — the server asks the
 * same in event.create). Never a second row, sheet or editor for a place: a difference is a prop here. */
export type WriteIn={id:string,canEvent:boolean};

/** The editor's address: a post, an article (`x=note`) or a post that starts with photos / a poll / my interests. */
export const newPostPath=(community?:WriteIn|null,x?:string)=>{
 const q=new URLSearchParams();if(community)q.set('community',community.id);if(x)q.set('x',x);const s=q.toString();
 return '/n/feed/new'+(s?'?'+s:'');
};
const newEventPath=(community?:WriteIn|null)=>'/n/events/new'+(community?'?community='+community.id:'');

/** `ACT.create` — «Создать»: a post and an article for everyone; an event where the acting profile may make one (the
 * feed: always; a community: its owner and hosts), made in that community. Under them the quick starts. */
export function CreateSheet({onClose,community}:{onClose:()=>void,community?:WriteIn|null|undefined}){
 const {t}=useI18n();const navigate=useNavigate();
 const rows:[LucideIcon,string,string,string,string][]=[[MessageSquareText,'l',t('fe.fd.cr.post'),t('fe.fd.cr.postSub'),newPostPath(community)],
  [FileText,'v',t('fe.fd.cr.note'),t('fe.fd.cr.noteSub'),newPostPath(community,'note')],
  ...(!community||community.canEvent?[[Calendar,'g',t('fe.fd.cr.event'),t('fe.fd.cr.eventSub'),newEventPath(community)] as [LucideIcon,string,string,string,string]]:[])];
 const go=(to:string)=>()=>{onClose();navigate(to);};
 return <Sheet title={t('fe.create')} onClose={onClose}>
  <Card list>{rows.map(([I,tone,b,s,to])=><Row key={to} icon={I} tone={tone} title={b} sub={s} onClick={go(to)}/>)}</Card>
  <QuickStart title={t('fe.w3.cr.quick')} items={[[ImageIcon,t('fe.w3.cr.media'),go(newPostPath(community,'media'))],[ChartColumn,t('fe.feed.poll'),go(newPostPath(community,'poll'))],
   [Sparkles,t('fe.fd.myInterests'),go(newPostPath(community,'interests'))]]}/>
 </Sheet>;
}

/** The composer row of any place (kit `ComposerRow`) with its create sheet: «Что нового?» in the feed, «Новая тема»
 * in a community; the same buttons, the same sheet. */
export function Composer({community}:{community?:WriteIn|null|undefined}){
 const {acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const [open,setOpen]=useState(false);
 const us=acting?.kind==='couple';
 return <>
  <ComposerRow av={acting&&<ActingAv p={acting}/>} placeholder={community?t(us?'fe.cm.topicCouple':'fe.comm.newTopic'):t(us?'fe.feed.whatsNewUs':'fe.feed.whatsNew')}
   onOpen={()=>navigate(newPostPath(community))} media={{label:t('fe.fd.photoOrVideo'),onClick:()=>navigate(newPostPath(community,'media'))}}
   poll={{label:t('fe.feed.poll'),onClick:()=>navigate(newPostPath(community,'poll'))}} create={{label:t('fe.create'),onClick:()=>setOpen(true)}}/>
  {open&&<CreateSheet community={community} onClose={()=>setOpen(false)}/>}
 </>;
}
