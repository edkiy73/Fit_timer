import {useCallback,useEffect,useState} from 'react';
import {useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Check,Inbox,LifeBuoy,MessageCircle,RefreshCw} from 'lucide-react';
import {feErrorMessage,newOpId,sendPublicHelp} from '../feture/fe-api';
import {Actions,Alert,Btn,Card,ChoiceChips,Empty,Field,Group,Input,KeyValues,LoadMore,Note,ReviewCard,Row,Seg,Sheet,Skel,Stack,TextArea,Thread} from './kit';
import {useToast} from './toast';
import {FIELD,serverFields,softMax,textError,textErrorMessage,useChecks} from './kit/validate';
import {useFe} from './session';
import {useStaffPage} from './staff-paged';
import {pullStaffCounts} from './staff-counts';
import {clearDraft,draftKey,readDraft,writeDraft} from './drafts';

/** S01 «Написать в поддержку» (wave 8): the person writes, staff answer in the staff screen, the answer comes back
 * here (and as an inbox item). No email: everything stays in the app. */

const TOPICS=['account','safety','premium','bug','other'] as const;
type Topic=typeof TOPICS[number];
const message=z.object({id:z.string(),fromStaff:z.boolean(),body:z.string(),at:z.string()});
const ticket=z.object({id:z.uuid(),topic:z.enum(TOPICS),state:z.enum(['open','answered','closed']),createdAt:z.string(),updatedAt:z.string(),messages:z.array(message)}).passthrough();
type Ticket=z.infer<typeof ticket>;
const oneRes=z.object({ok:z.literal(true),ticket});
const mineRes=z.object({ok:z.literal(true),tickets:z.array(ticket)});
const queueRes=z.object({ok:z.literal(true),items:z.array(ticket.extend({handle:z.string().nullable()})),next:z.string().nullable().optional()});
const okRes=z.object({ok:z.literal(true)}).passthrough();

const useWhen=()=>{const {locale}=useI18n();return (v:string)=>new Date(v).toLocaleString(locale==='en'?'en-GB':'ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});};

/** The writing sheet (supportWrite / supportSend). */
export function SupportSheet({onClose,onSent}:{onClose:()=>void,onSent:(t:Ticket)=>void}){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();
 const [topic,setTopic]=useState<Topic>('other');const [body,setBody]=useState('');const [err,setErr]=useState('');const [busy,setBusy]=useState(false);
 const checks=useChecks({body:'support'},{body},{body:{too_short:t('fe.w8.sup.short'),empty:t('fe.w8.sup.short')}});
 const send=async()=>{
  if(!checks.submit())return;
  setBusy(true);setErr('');
  try{const r=await call('support.create',{opId:newOpId(),topic,body:body.trim()},oneRes,{asAccount:true});toast(t('fe.w8.sup.sent'),{type:'ok'});onSent(r.ticket);onClose();}
  catch(e){if(!checks.fromServer(e))setErr(feErrorMessage(e,t));}finally{setBusy(false);}
 };
 return <Sheet title={t('fe.w8.sup.write')} onClose={onClose} dirty={!!body.trim()} foot={<Btn busy={busy} onClick={()=>void send()}>{t('fe.w8.sup.send')}</Btn>}>
  <p className="lead">{t('fe.w8.sup.lead')}</p>
  <Field label={t('fe.w8.sup.topic')}><ChoiceChips<Topic> label={t('fe.w8.sup.topic')} value={topic} onChange={setTopic} options={TOPICS.map(k=>[k,t('fe.w8.sup.t.'+k)] as const)}/></Field>
  <Field id="fe-sup-text" name="body" label={t('fe.w8.sup.message')} error={checks.error('body')??(err||undefined)}>
   <TextArea id="fe-sup-text" rows={5} {...checks.input('body')} invalid={!!(checks.error('body')??err)} value={body} placeholder={t('fe.w8.sup.placeholder')} onChange={e=>{setBody(e.target.value);setErr('');}}/>
   {checks.counter('body')}
  </Field>
  <Note>{t('fe.w8.sup.threat')}</Note>
 </Sheet>;
}

/** «Нужна помощь со входом» — the one entry for signed-out screens (welcome, e-mail, code): a text link that opens the
 * public form. No account needed: the message goes to the support mailbox (`POST /api/fe?help=1`). */
export function SignInHelp({className}:{className?:string}){
 const {t}=useI18n();const [open,setOpen]=useState(false);
 return <>
  <Btn kind="text" auto {...(className?{className}:{})} aria-haspopup="dialog" onClick={()=>setOpen(true)}>{t('fe.hp.link')}</Btn>
  {open&&<SignInHelpSheet onClose={()=>setOpen(false)}/>}
 </>;
}

function SignInHelpSheet({onClose}:{onClose:()=>void}){
 const {t,locale}=useI18n();
 const [body,setBody]=useState('');const [contact,setContact]=useState('');const [err,setErr]=useState('');const [busy,setBusy]=useState(false);const [done,setDone]=useState(false);
 const checks=useChecks({body:'support'},{body},{body:{too_short:t('fe.w8.sup.short'),empty:t('fe.w8.sup.short')}});
 const send=async()=>{
  if(!checks.submit())return;
  setBusy(true);setErr('');
  try{await sendPublicHelp({body:body.trim(),contact:contact.trim()||undefined,locale:locale==='en'?'en':'ru'});setDone(true);}
  catch(e){setErr(feErrorMessage(e,t));}finally{setBusy(false);}
 };
 if(done)return <Sheet title={t('fe.hp.title')} onClose={onClose} foot={<Btn onClick={onClose}>{t('fe.hp.close')}</Btn>}>
  <Alert kind="ok">{t('fe.hp.sent')}</Alert>
 </Sheet>;
 return <Sheet title={t('fe.hp.title')} onClose={onClose} dirty={!!body.trim()} foot={<Btn busy={busy} onClick={()=>void send()}>{t('fe.w8.sup.send')}</Btn>}>
  <p className="lead">{t('fe.hp.lead')}</p>
  <Field id="fe-hp-text" name="body" label={t('fe.w8.sup.message')} error={checks.error('body')??(err||undefined)}>
   <TextArea id="fe-hp-text" rows={5} {...checks.input('body')} invalid={!!(checks.error('body')??err)} value={body} placeholder={t('fe.w8.sup.placeholder')} onChange={e=>{setBody(e.target.value);setErr('');}}/>
   {checks.counter('body')}
  </Field>
  <Field id="fe-hp-contact" label={t('fe.hp.contact')} optional={t('fe.reg.optional')} hint={t('fe.hp.contactHint')}>
   <Input id="fe-hp-contact" value={contact} maxLength={120} autoComplete="email" onChange={e=>setContact(e.target.value)}/>
  </Field>
 </Sheet>;
}

/** One ticket: the conversation, and a reply while it is not closed. */
function TicketSheet({item,onClose,onChange}:{item:Ticket,onClose:()=>void,onChange:(t:Ticket)=>void}){
 const {call}=useFe();const {t}=useI18n();const when=useWhen();
 const [body,setBody]=useState('');const [err,setErr]=useState('');const [busy,setBusy]=useState(false);
 const checks=useChecks({body:'support'},{body},{body:{too_short:t('fe.w8.sup.short'),empty:t('fe.w8.sup.short')}});
 const reply=async()=>{
  if(!checks.submit())return;
  setBusy(true);setErr('');
  try{const r=await call('support.reply',{opId:newOpId(),ticketId:item.id,body:body.trim()},oneRes,{asAccount:true});setBody('');checks.reset();onChange(r.ticket);}
  catch(e){if(!checks.fromServer(e))setErr(feErrorMessage(e,t));}finally{setBusy(false);}
 };
 return <Sheet title={t('fe.w8.sup.t.'+item.topic)} sub={t('fe.w8.sup.s.'+item.state)} onClose={onClose} dirty={!!body.trim()}
  foot={item.state!=='closed'?<Btn busy={busy} icon={MessageCircle} onClick={()=>void reply()}>{t('fe.w8.sup.reply')}</Btn>:undefined}>
  <Thread label={t('fe.w8.sup.ticket')} messages={item.messages.map(m=>({id:m.id,mine:!m.fromStaff,text:m.body,meta:(m.fromStaff?t('fe.w8.sup.support')+' · ':'')+when(m.at)}))}/>
  {item.state==='closed'?<Note>{t('fe.w8.sup.closedNote')}</Note>
   :<Field id="fe-sup-reply" name="body" label={t('fe.w8.sup.replyLabel')} error={checks.error('body')??(err||undefined)}>
    <TextArea id="fe-sup-reply" rows={3} {...checks.input('body')} invalid={!!(checks.error('body')??err)} value={body} onChange={e=>{setBody(e.target.value);setErr('');}}/>
    {checks.counter('body')}
   </Field>}
 </Sheet>;
}

/** «Написать в поддержку» row + «Мои обращения» for the help screen. `?ticket=<id>` (from the inbox) opens one. */
export function SupportBlock(){
 const {call}=useFe();const {t}=useI18n();const when=useWhen();const [params,setParams]=useSearchParams();
 const [list,setList]=useState<Ticket[]|null>(null);const [error,setError]=useState<unknown>(null);const [writing,setWriting]=useState(false);
 const openId=params.get('ticket');
 const load=useCallback(()=>{setError(null);call('support.mine',{},mineRes,{asAccount:true,fresh:true}).then(r=>setList(r.tickets)).catch(setError);},[call]);
 useEffect(()=>{load();},[load]);
 const put=(x:Ticket)=>setList(l=>[x,...(l??[]).filter(y=>y.id!==x.id)]);
 const open=list?.find(x=>x.id===openId)??null;
 const setOpen=(id:string|null)=>{const p=new URLSearchParams(params);if(id)p.set('ticket',id);else p.delete('ticket');setParams(p,{replace:true});};
 return <>
  <Card list><Row icon={LifeBuoy} tone="v" title={t('fe.w8.sup.write')} sub={t('fe.w8.sup.writeSub')} onClick={()=>setWriting(true)}/></Card>
  <Group title={t('fe.w8.sup.mine')}>
   {error?<Alert kind="err" action={<Btn kind="soft" size="sm" auto icon={RefreshCw} onClick={load}>{t('fe.retry')}</Btn>}>{feErrorMessage(error,t)}</Alert>
    :!list?<Skel kind="list" rows={2}/>
    :!list.length?<Empty compact icon={MessageCircle} title={t('fe.w8.sup.empty')}/>
    :<Card list>{list.map(x=>{const last=x.messages[x.messages.length-1];
     return <Row key={x.id} icon={x.state==='answered'?Check:MessageCircle} tone={x.state==='answered'?'g':undefined} title={t('fe.w8.sup.t.'+x.topic)}
      sub={t('fe.w8.sup.s.'+x.state)+' · '+when(x.updatedAt)+(last?' · '+last.body.slice(0,60):'')} onClick={()=>setOpen(x.id)}/>;})}</Card>}
  </Group>
  {writing&&<SupportSheet onClose={()=>setWriting(false)} onSent={put}/>}
  {open&&<TicketSheet item={open} onClose={()=>setOpen(null)} onChange={put}/>}
 </>;
}

/** Staff: the support queue with replies (owner / lead / moderator / support). */
export function StaffSupport(){
 const {call}=useFe();const {t}=useI18n();const when=useWhen();
 const [state,setState]=useState<'open'|'answered'|'closed'>('open');
 const fetchPage=useCallback((after?:string)=>call('staff.supportQueue',{state,limit:20,...(after?{after}:{})},queueRes,{asAccount:true,fresh:true}),[call,state]);
 const {items,setItems,error,reload:load,moreProps}=useStaffPage(fetchPage,x=>x.id);
 return <Stack gap={3}>
  <Seg value={state} onChange={setState} label={t('fe.w8.staff.support')} options={(['open','answered','closed'] as const).map(id=>({id,label:t('fe.w8.sup.s.'+id)}))}/>
  {error?<Alert kind="err" action={<Btn kind="soft" size="sm" auto icon={RefreshCw} onClick={load}>{t('fe.retry')}</Btn>}>{feErrorMessage(error,t)}</Alert>
   :!items?<Skel kind="list"/>
   :!items.length?<Empty compact icon={Inbox} title={t('fe.w8.staff.supEmpty')}/>
   :<>{items.map(x=><StaffTicket key={x.id} item={x} when={when} onDone={()=>setItems(l=>l?.filter(y=>y.id!==x.id)??l)}/>)}<LoadMore {...moreProps}/></>}
 </Stack>;
}

function StaffTicket({item,when,onDone}:{item:z.infer<typeof queueRes>['items'][number],when:(v:string)=>string,onDone:()=>void}){
 const {call,state}=useFe();const {t}=useI18n();const toast=useToast();
 // A half-written reply is kept per staff account and ticket (drafts.ts) until it is sent.
 const draftSlot=draftKey(state.status==='ready'?state.boot.account.id:'','staff','support:'+item.id);
 const [body,setBody]=useState(()=>readDraft(draftSlot)?.text??'');const [busy,setBusy]=useState(false);const [err,setErr]=useState('');
 useEffect(()=>{writeDraft(draftSlot,body);},[draftSlot,body]);
 const send=async(close:boolean)=>{
  const m=!close||body.trim()?textError(t,'support',body):undefined;if(m){setErr(m);return;}
  setBusy(true);setErr('');
  try{await call('staff.supportReply',{opId:newOpId(),ticketId:item.id,close,...(body.trim()?{body:body.trim()}:{})},okRes,{asAccount:true});clearDraft(draftSlot);toast(t('fe.staff.done'),{type:'ok'});void pullStaffCounts(call,true);onDone();}
  catch(e){const f=serverFields(e).find(f=>f.path==='body');setErr(f?textErrorMessage(t,f.code,FIELD.support):feErrorMessage(e,t));}finally{setBusy(false);}
 };
 return <ReviewCard title={t('fe.w8.sup.t.'+item.topic)} meta={when(item.updatedAt)}>
  <KeyValues rows={[[t('fe.staff.fromLabel'),item.handle?'@'+item.handle:t('fe.staff.noName')]]}/>
  <Thread label={t('fe.w8.sup.ticket')} messages={item.messages.map(m=>({id:m.id,mine:m.fromStaff,text:m.body,meta:(m.fromStaff?t('fe.w8.sup.support'):item.handle?'@'+item.handle:t('fe.staff.noName'))+' · '+when(m.at)}))}/>
  {item.state!=='closed'&&<>
   <Field id={'fe-st-sup-'+item.id} label={t('fe.w8.staff.answer')} error={err||undefined}>
    <TextArea id={'fe-st-sup-'+item.id} rows={3} maxLength={softMax('support')} value={body} invalid={!!err} onChange={e=>{setBody(e.target.value);setErr('');}}/>
   </Field>
   <Actions>
    <Btn busy={busy} icon={MessageCircle} onClick={()=>void send(false)}>{t('fe.w8.staff.send')}</Btn>
    <Btn kind="soft" disabled={busy} onClick={()=>void send(true)}>{body.trim()?t('fe.w8.staff.sendClose'):t('fe.w8.staff.close')}</Btn>
   </Actions>
  </>}
 </ReviewCard>;
}
