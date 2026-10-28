import {useState} from 'react';
import {useNavigate} from 'react-router';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ArrowLeftRight,Ban,Check,EyeOff,MessageCircle,Pencil,Plus,Sparkles,type LucideIcon} from 'lucide-react';
import {Btn,Sheet,Skel,Text,Verdict} from './kit';
import {useFe} from './session';
import {InterestSheet,useInterests,type Interest} from './interests';
import {CmpRow,compatGroup,explain,type CompatItem} from './profile-extras';

/** Someone's answer as the sheet takes it (a post's snapshot, a profile's list): a limit never carries a level. */
export const asInterest=(x:{topicId:string,value?:unknown,mark?:unknown,dir?:unknown}):Interest=>x.mark==='hard'||x.mark==='discuss'
 ?{topicId:x.topicId,value:null,mark:x.mark,dir:null}
 :{topicId:x.topicId,value:typeof x.value==='number'?x.value:null,mark:null,dir:Array.isArray(x.dir)?x.dir.filter((d):d is string=>typeof d==='string'):null};

/** Someone else's interest (V21 `openTopic`), owner 28.10.2026: one comparison bar is the whole story — both avatars,
 * both answers with their roles («даю / получаю»), the interest in the middle — and right under it one short verdict
 * with at most one quiet line. No separate «их ответ / твой ответ» blocks and no headings; a key on my avatar says my
 * answer is not public; «Изменить мой» / «Добавить себе» and «Об этом интересе» at the bottom.
 * `theirs` is only what the server let the viewer see (interests.list: public, «по доступу» with the info grant; a
 * hard limit comes without level or roles). Their limit is a boundary, never a match. */
export function CompareSheet({topicId,name,avatar,personId,theirs,onClose}:{topicId:string,name:string,/** Their photo. */ avatar?:string|null|undefined,
 /** Their profile id (the colour of their initials). */ personId?:string|undefined,theirs:Interest|undefined,onClose:()=>void}){
 const {t,locale}=useI18n();const {acting}=useFe();const navigate=useNavigate();
 const {items:mineAll,cats,topics,load}=useInterests();
 const [edit,setEdit]=useState(false);
 const us=acting?.kind==='couple';
 const tp=topics.find(x=>x.id===topicId);const cat=cats.find(c=>c.id===tp?.categoryId);
 const title=tp?(locale==='en'?tp.en:tp.ru):topicId;const desc=tp?(locale==='en'?tp.descEn:tp.descRu):null;
 const mine=mineAll?.find(j=>j.topicId===topicId);
 if(edit)return <InterestSheet topicId={topicId} topics={topics} cats={cats} current={mine} onClose={()=>setEdit(false)}
  onDone={()=>{setEdit(false);load();}}/>;
 const group=mine&&theirs?compatGroup(mine,theirs):null;
 const me={name:acting?.name||acting?.handle||'?',id:acting?.id??'me',src:acting?.avatar??null};
 const them={name,id:personId??'them:'+topicId,src:avatar??null};
 const empty={value:null,mark:null,dir:[]};
 const item:CompatItem={topicId,group:group??'try',mine:mine??empty,theirs:theirs??empty};
 const lock=mine&&mine.vis!=='public'?t(mine.vis==='granted'?(us?'fe.cmpx.visGrantedUs':'fe.cmpx.visGranted'):(us?'fe.cmpx.visOnlyUs':'fe.cmpx.visOnly')):undefined;
 const verdict=!theirs?<Verdict icon={EyeOff} title={t('fe.cmpx.theirsNone',{name})}/>
  :!mine?<Verdict icon={Plus} title={t(us?'fe.cmpx.noneUs':'fe.cmpx.none')}/>
  :group&&<Verdict className="cmpx-verdict" tone={TONE[group]} icon={ICON[group]} title={t('fe.px.cmp.g.'+group)}
    sub={theirs.mark==='hard'&&mine.mark!=='hard'?t('fe.cmpx.theirHard',{name}):sayWhy(explain(item,k=>t(k),name),t('fe.px.cmp.w.roles'))}/>;
 return <Sheet title={title} sub={cat?(locale==='en'?cat.en:cat.ru):undefined} onClose={onClose} foot={<>
  <Btn kind={mine?'soft':'primary'} icon={mine?Pencil:Plus} disabled={!mineAll||!tp} onClick={()=>setEdit(true)}>
   {mine?t(us?'fe.cmpx.editUs':'fe.cmpx.edit'):t(us?'fe.cmpx.addUs':'fe.cmpx.add')}</Btn>
  <Btn kind="text" onClick={()=>navigate('/n/topics/'+topicId)}>{t('fe.cmpx.topic')}</Btn>
 </>}>
  {desc&&<p className="topic-desc">{desc}</p>}
  {mineAll===null?<Skel kind="line" rows={2}/>:<div className="cmpx">
   <CmpRow i={item} topic={title} me={me} them={them} t={k=>t(k)} why={false} lock={lock}/>
   {verdict}
   {group&&group!=='bound'&&group!=='discuss'&&<Text size="xs" tone="faint" center>{t('fe.px.cmp.notConsent')}</Text>}
  </div>}
 </Sheet>;
}
/** The verdict already says «дополняете друг друга»: a line that only repeats it is left out. */
const sayWhy=(why:string,same:string)=>why&&why!==same?why:undefined;
const TONE:Record<CompatItem['group'],'ok'|'try'|'warn'|'bad'>={complement:'ok',match:'ok',try:'try',discuss:'warn',bound:'bad'};
const ICON:Record<CompatItem['group'],LucideIcon>={complement:ArrowLeftRight,match:Check,try:Sparkles,discuss:MessageCircle,bound:Ban};
