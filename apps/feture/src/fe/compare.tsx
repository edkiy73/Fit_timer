import {useState} from 'react';
import {useNavigate} from 'react-router';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Ban,Check,Info,Pencil,Plus,Sparkles} from 'lucide-react';
import {Alert,Btn,Note,SectionLabel,Sheet,Skel} from './kit';
import {useFe} from './session';
import {InterestSheet,Jars,useInterests,type Interest} from './interests';
import {CmpRow,compatGroup} from './profile-extras';

/** Someone's answer as the sheet takes it (a post's snapshot, a profile's list): a limit never carries a level. */
export const asInterest=(x:{topicId:string,value?:unknown,mark?:unknown,dir?:unknown}):Interest=>x.mark==='hard'||x.mark==='discuss'
 ?{topicId:x.topicId,value:null,mark:x.mark,dir:null}
 :{topicId:x.topicId,value:typeof x.value==='number'?x.value:null,mark:null,dir:Array.isArray(x.dir)?x.dir.filter((d):d is string=>typeof d==='string'):null};

/** V21 `openTopic` (prototype «topic» sheet): someone else's interest — what the topic is, their answer, the acting
 * profile's own answer and how they compare, with «Добавить себе» / «Изменить мой».
 * `theirs` is only what the server let the viewer see (interests.list: public, «по доступу» with the info grant; a
 * hard limit comes without level or roles). Their limit is a boundary, never a match. */
export function CompareSheet({topicId,name,theirs,onClose}:{topicId:string,name:string,theirs:Interest|undefined,onClose:()=>void}){
 const {t,locale}=useI18n();const {acting}=useFe();const navigate=useNavigate();
 const {items:mineAll,cats,topics,load}=useInterests();
 const [edit,setEdit]=useState(false);const [notice,setNotice]=useState('');
 const us=acting?.kind==='couple';
 const tp=topics.find(x=>x.id===topicId);const cat=cats.find(c=>c.id===tp?.categoryId);
 const title=tp?(locale==='en'?tp.en:tp.ru):topicId;const desc=tp?(locale==='en'?tp.descEn:tp.descRu):null;
 const mine=mineAll?.find(j=>j.topicId===topicId);
 if(edit)return <InterestSheet topicId={topicId} topics={topics} cats={cats} current={mine} onClose={()=>setEdit(false)}
  onDone={msg=>{setEdit(false);setNotice(msg);load();}}/>;
 const group=mine&&theirs?compatGroup(mine,theirs):null;
 const tone=group==='bound'?'warn':group==='match'||group==='complement'?'ok':'info';
 const me={name:acting?.name||acting?.handle||'?',id:acting?.id??'me',src:acting?.avatar??null};
 const them={name,id:'them:'+topicId};
 return <Sheet title={title} sub={cat?(locale==='en'?cat.en:cat.ru):undefined} onClose={onClose} foot={<>
  <Btn kind={mine?'soft':'primary'} icon={mine?Pencil:Plus} disabled={!mineAll||!tp} onClick={()=>setEdit(true)}>
   {mine?t(us?'fe.cmpx.editUs':'fe.cmpx.edit'):t(us?'fe.cmpx.addUs':'fe.cmpx.add')}</Btn>
  <Btn kind="text" onClick={()=>navigate('/n/topics/'+topicId)}>{t('fe.cmpx.topic')}</Btn>
 </>}>
  {desc&&<p className="topic-desc">{desc}</p>}
  {notice&&<Alert kind="ok" noIcon className="mb12">{notice}</Alert>}
  <SectionLabel>{t('fe.cmpx.theirs',{name})}</SectionLabel>
  {theirs?<Jars list={[theirs]} topics={topics} onOpen={()=>{}}/>:<Note>{t('fe.cmpx.theirsNone',{name})}</Note>}
  <SectionLabel>{t(us?'fe.cmpx.ours':'fe.cmpx.mine')}</SectionLabel>
  {mineAll===null?<Skel kind="list" rows={1}/>
   :mine?<Jars list={[mine]} topics={topics} onOpen={()=>setEdit(true)}/>
   :<Note>{t(us?'fe.cmpx.noneUs':'fe.cmpx.none')}</Note>}
  {mine&&mine.vis!=='public'&&<Note className="mt8">{t(mine.vis==='granted'?(us?'fe.cmpx.visGrantedUs':'fe.cmpx.visGranted'):(us?'fe.cmpx.visOnlyUs':'fe.cmpx.visOnly'))}</Note>}
  {group&&mine&&theirs&&<>
   <SectionLabel>{t('fe.cmpx.how')}</SectionLabel>
   <Alert kind={tone} icon={group==='bound'?Ban:group==='match'||group==='complement'?Check:group==='try'?Sparkles:Info} className="cmpx-verdict">
    <b>{t('fe.px.cmp.g.'+group)}</b> {theirs.mark==='hard'&&mine.mark!=='hard'?t('fe.cmpx.theirHard',{name}):t('fe.px.cmp.d.'+group)}</Alert>
   <CmpRow i={{topicId,group,mine,theirs}} topic={title} me={me} them={them} t={k=>t(k)}/>
   <Note className="mt8">{t('fe.px.cmp.notConsent')}</Note>
  </>}
 </Sheet>;
}
