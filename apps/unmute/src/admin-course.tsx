import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminSection, AdminSectionContext } from '@appbase/ui-react/admin.js';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { courseStages, stageNameKey } from './course-stages';
import './admin-course.css';

type TextMap = Record<string,string>;

type EditableActivity = {
  id:string;
  revision:number;
  type:string;
  revisionProgress:'preserve'|'reset';
  tags:string[];
  [key:string]:unknown;
};

type CourseNode = {
  id:string;
  kind:string;
  title:TextMap;
  dayIndex?:number|undefined;
  order:number;
  optional:boolean;
  prerequisites:string[];
  activityCount:number;
  /** First theory title of the day («Past Simple»); imported days are all named «День N». */
  topic?:string;
};

type CourseSetSummary = {
  id:string;
  title:TextMap;
  level:Record<string,unknown>;
  access:Record<string,unknown>|null;
  draftRevision:number|null;
  publishedRevision:number|null;
  nodeCount:number|null;
  unreleasedChanges?:boolean;
};

type CourseStructure = {
  draftRevision:number;
  draftUpdatedAt?:string;
  set:{
    id:string;
    title:TextMap;
    description?:TextMap;
    level?:Record<string,unknown>;
    access?:Record<string,unknown>;
  };
  roadmaps:Array<{id:string;title:TextMap;nodes:CourseNode[]}>;
};

type ActivitySummary = {
  id:string;
  revision:number;
  type:string;
  revisionProgress:string;
  label:string;
  /** The day's plan note («что скажешь вслух сегодня»), a theory card titled «День N». */
  plan?:boolean;
};

type OpenNode = {
  roadmapId:string;
  version:number;
  node:CourseNode & {activityIds:string[]};
  activities:ActivitySummary[];
};

const ACTIVITY_TYPES=[
  ['theory','Теория'],
  ['choice','Выбор ответа'],
  ['text-input','Ввод ответа'],
  ['translation','Перевод'],
  ['speaking','Говорение'],
  ['pattern-drill','Тренажёр фраз'],
  ['dialogue','Диалог'],
  ['listening','Аудирование'],
  ['review','Повторение'],
  ['ai-conversation','Разговор с ИИ']
] as const;

const KIND_LABELS:Record<string,string>={lesson:'Урок',practice:'Практика',review:'Повторение',dialogue:'Диалог',checkpoint:'Проверка',bonus:'Бонус'};

function typeLabel(type:string){
  return ACTIVITY_TYPES.find(([value])=>value===type)?.[1] || type;
}

function textMap(value:unknown):TextMap{
  return value && typeof value==='object' && !Array.isArray(value) ? value as TextMap : {};
}
function textValue(value:unknown, locale='ru'){
  return textMap(value)[locale] || '';
}
function answerAccepted(value:unknown):string[]{
  if(!value || typeof value!=='object' || Array.isArray(value)) return [];
  const accepted=(value as {accepted?:unknown}).accepted;
  return Array.isArray(accepted) ? accepted.map(String) : [];
}
function setText(activity:EditableActivity,key:string,value:string):EditableActivity{
  return {...activity,[key]:{...textMap(activity[key]),ru:value}};
}
function setAnswer(activity:EditableActivity,value:string):EditableActivity{
  const current=activity.answer && typeof activity.answer==='object' && !Array.isArray(activity.answer)
    ? activity.answer as Record<string,unknown> : {};
  return {...activity,answer:{...current,accepted:value.split(/\n/).map(x=>x.trim()).filter(Boolean),nearMiss:current.nearMiss!==false,caseSensitive:current.caseSensitive===true}};
}

function FriendlyFields({activity,onChange}:{activity:EditableActivity;onChange(next:EditableActivity):void}){
  const update=(key:string,value:unknown)=>onChange({...activity,[key]:value});
  const text=(key:string,value:string)=>onChange(setText(activity,key,value));
  const answers=answerAccepted(activity.answer).join('\n');

  if(activity.type==='theory'){
    return <>
      <label><span>Название</span><input value={textValue(activity.title)} onChange={e=>text('title',e.target.value)} /></label>
      <label><span>Текст</span><textarea rows={8} value={textValue(activity.body)} onChange={e=>text('body',e.target.value)} /></label>
      <label><span>Формат</span><select value={String(activity.format||'text')} onChange={e=>update('format',e.target.value)}>
        <option value="text">Обычный текст</option><option value="markdown">Markdown (заголовки, списки, таблицы)</option><option value="html">HTML</option>
      </select></label>
    </>;
  }

  if(activity.type==='choice'){
    const options=Array.isArray(activity.options) ? activity.options as TextMap[] : [];
    return <>
      <label><span>Вопрос</span><textarea rows={3} value={textValue(activity.prompt)} onChange={e=>text('prompt',e.target.value)} /></label>
      <label><span>Варианты — один на строку</span><textarea rows={5} value={options.map(x=>textValue(x)).join('\n')} onChange={e=>{
        const lines=e.target.value.split('\n');
        update('options',lines.map(line=>({ru:line})));
      }} /></label>
      <label><span>Правильный вариант</span><input type="number" min={1} max={Math.max(1,options.length)} value={Number(activity.correctIndex||0)+1}
        onChange={e=>update('correctIndex',Math.max(0,Number(e.target.value||1)-1))} /></label>
      <label><span>Объяснение</span><textarea rows={3} value={textValue(activity.explanation)} onChange={e=>text('explanation',e.target.value)} /></label>
    </>;
  }

  if(activity.type==='text-input' || activity.type==='translation'){
    return <>
      {activity.type==='translation' && <label><span>Направление</span><select value={String(activity.direction||'to-target')} onChange={e=>update('direction',e.target.value)}>
        <option value="to-target">в английский</option><option value="from-target">из английского</option>
      </select></label>}
      <label><span>Задание / фраза</span><textarea rows={3} value={textValue(activity.prompt)} onChange={e=>text('prompt',e.target.value)} /></label>
      <label><span>Допустимые ответы — один на строку</span><textarea rows={5} value={answers} onChange={e=>onChange(setAnswer(activity,e.target.value))} /></label>
      <label><span>Объяснение</span><textarea rows={3} value={textValue(activity.explanation)} onChange={e=>text('explanation',e.target.value)} /></label>
    </>;
  }

  if(activity.type==='speaking'){
    return <>
      <label><span>Задание</span><textarea rows={3} value={textValue(activity.prompt)} onChange={e=>text('prompt',e.target.value)} /></label>
      <label><span>Целевая фраза</span><input value={String(activity.target||'')} onChange={e=>update('target',e.target.value)} /></label>
    </>;
  }

  if(activity.type==='listening'){
    return <>
      <label><span>Подсказка</span><textarea rows={2} value={textValue(activity.prompt)} onChange={e=>text('prompt',e.target.value)} /></label>
      <label><span>Текст для аудио</span><textarea rows={5} value={String(activity.text||'')} onChange={e=>update('text',e.target.value)} /></label>
    </>;
  }

  if(activity.type==='ai-conversation'){
    const focus=Array.isArray(activity.focus) ? activity.focus.map(String) : [];
    return <>
      <label><span>Тема</span><input value={textValue(activity.topic)} onChange={e=>text('topic',e.target.value)} /></label>
      <label><span>Инструкция для ИИ</span><textarea rows={6} value={String(activity.promptTemplate||'')} onChange={e=>update('promptTemplate',e.target.value)} /></label>
      <label><span>На что обратить внимание — через запятую</span><input value={focus.join(', ')} onChange={e=>update('focus',e.target.value.split(',').map(x=>x.trim()).filter(Boolean))} /></label>
    </>;
  }

  if(activity.type==='review'){
    const source=activity.source && typeof activity.source==='object' && !Array.isArray(activity.source)
      ? activity.source as Record<string,unknown> : {};
    return <>
      <label className="ab-course-check"><input type="checkbox" checked={source.dueOnly!==false}
        onChange={e=>update('source',{...source,activityIds:Array.isArray(source.activityIds)?source.activityIds:[],tags:Array.isArray(source.tags)?source.tags:[],dueOnly:e.target.checked})} />
        <span>Только элементы, которым пора повторяться</span></label>
      <label><span>Лимит</span><input type="number" min={1} value={activity.limit===undefined?'':String(activity.limit)}
        onChange={e=>update('limit',e.target.value?Number(e.target.value):undefined)} /></label>
    </>;
  }

  return null;
}

function ActivityEditor({client,adminKey,setId,activity,onSaved,onClose}:{client:AdminSectionContext['client'];adminKey:string;setId:string;activity:EditableActivity;onSaved(next:EditableActivity):void;onClose():void}){
  const [value,setValue]=useState(activity);
  const [raw,setRaw]=useState(()=>JSON.stringify(activity,null,2));
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);

  useEffect(()=>{setValue(activity);setRaw(JSON.stringify(activity,null,2));setMessage('');},[activity]);

  function change(next:EditableActivity){
    setValue(next);
    setRaw(JSON.stringify(next,null,2));
  }

  function applyRaw(){
    try{
      const parsed=JSON.parse(raw) as EditableActivity;
      if(parsed.id!==value.id || parsed.type!==value.type){
        setMessage('Имя и тип задания менять нельзя.');
        return;
      }
      setValue(parsed);
      setRaw(JSON.stringify(parsed,null,2));
      setMessage('JSON применён в форме. Нажми «Сохранить».');
    }catch(_){
      setMessage('В JSON ошибка.');
    }
  }

  async function save(){
    setBusy(true);setMessage('');
    try{
      const result=await client.action(adminKey,'content_activity_save',{
        setId,activityId:value.id,expectedRevision:value.revision,activity:value
      });
      const next=result.activity as EditableActivity;
      setValue(next);setRaw(JSON.stringify(next,null,2));
      setMessage('Сохранено. Ученики увидят после «Выпустить».');
      onSaved(next);
    }catch(error){
      const code=String((error as {code?:string})?.code || 'request_failed');
      setMessage(code==='activity_revision_conflict'?'Задание уже изменено в другой вкладке. Открой его заново.':'Ошибка: '+code);
    }finally{setBusy(false);}
  }

  // Types without a form (pattern drills, dialogues) are edited as JSON: open it right away.
  const formless=!['theory','choice','text-input','translation','speaking','listening','ai-conversation','review'].includes(value.type);

  return <div className="ab-course-editor">
    <div className="ab-course-fields"><FriendlyFields activity={value} onChange={change} /></div>

    <label className="ab-course-progress"><span>Если задание сильно изменилось</span>
      <select value={value.revisionProgress} onChange={e=>change({...value,revisionProgress:e.target.value as 'preserve'|'reset'})}>
        <option value="preserve">Мелкая правка — прогресс учеников сохранится</option>
        <option value="reset">Новое задание — ученики пройдут его заново</option>
      </select>
    </label>

    <details className="ab-admin-details" open={formless}>
      <summary>{formless ? 'Содержимое задания (JSON)' : 'Для разработчика: JSON'}</summary>
      <textarea className="ab-course-json" value={raw} onChange={e=>setRaw(e.target.value)} />
      <button type="button" className="ab-admin-secondary" onClick={applyRaw}>Применить JSON</button>
    </details>

    <div className="ab-admin-action-row">
      <button type="button" disabled={busy} onClick={()=>void save()}>Сохранить</button>
      <button type="button" className="ab-admin-secondary" data-busy="off" onClick={onClose}>Свернуть</button>
    </div>
    {message && <p className="ab-admin-feedback" role="status">{message}</p>}
  </div>;
}

type WordCheck = {
  ready:boolean;
  words:number;
  missingCount:number;
  ambiguousCount:number;
  missing:Array<{surface:string}>;
  ambiguous:Array<{surface:string}>;
};

function wordList(items:Array<{surface:string}>,total:number){
  const shown=items.slice(0,12).map(item=>item.surface).join(', ');
  return total>12 ? shown+' и ещё '+(total-12) : shown;
}

function courseState(item:CourseSetSummary){
  if(!item.publishedRevision) return {tone:'new',text:'Ещё не выпущен — ученики его не видят'};
  if(item.unreleasedChanges) return {tone:'changed',text:'Есть правки — ученики их ещё не видят'};
  return {tone:'live',text:'На сайте, новых правок нет'};
}

function failureText(error:unknown,what:string){
  const status=Number((error as {status?:number})?.status||0);
  const code=String((error as {code?:string})?.code||'');
  if(status===504||status===502)return what+': сервер не успел ответить, ничего не сохранилось. Попробуй ещё раз.';
  if(code==='activity_revision_conflict'||code==='node_revision_conflict'||code==='set_revision_conflict')
    return what+': это уже изменили в другой вкладке. Обнови раздел и повтори.';
  return what+': '+(code||'нет связи с сервером');
}

type DayRow = CourseNode & {roadmapId:string};
type DayGroup = {key:string;title:string;range:string;days:DayRow[]};

function CourseAdmin({client,adminKey}:AdminSectionContext){
  const {t}=useI18n();
  const [sets,setSets]=useState<CourseSetSummary[]>([]);
  const [setId,setSetId]=useState('general-foundation');
  const [structure,setStructure]=useState<CourseStructure|null>(null);
  const [openNode,setOpenNode]=useState<OpenNode|null>(null);
  const [editor,setEditor]=useState<EditableActivity|null>(null);
  const [newType,setNewType]=useState('text-input');
  const [message,setMessage]=useState('');
  const [dayMessage,setDayMessage]=useState('');
  const [releaseMessage,setReleaseMessage]=useState('');
  const [check,setCheck]=useState<WordCheck|null>(null);
  const [busy,setBusy]=useState(false);
  const [createOpen,setCreateOpen]=useState(false);
  const [createId,setCreateId]=useState('');
  const [createTitle,setCreateTitle]=useState('');
  const [metaTitle,setMetaTitle]=useState('');
  const [metaDescription,setMetaDescription]=useState('');
  const [metaFrom,setMetaFrom]=useState('');
  const [metaTo,setMetaTo]=useState('');
  const [metaAccess,setMetaAccess]=useState<'free'|'entitlement'>('entitlement');
  const [metaFreeDays,setMetaFreeDays]=useState('0');
  const [metaPriceRub,setMetaPriceRub]=useState('');
  const [metaPriceUsd,setMetaPriceUsd]=useState('');
  const dayPane=useRef<HTMLElement|null>(null);

  const loadSets=useCallback(async()=>{
    const result=await client.action(adminKey,'content_sets_list');
    const list=Array.isArray(result.sets) ? result.sets as CourseSetSummary[] : [];
    setSets(list);
    if(list.length && !list.some(item=>item.id===setId)) setSetId(list[0]!.id);
    return list;
  },[client,adminKey,setId]);

  const loadStructure=useCallback(async()=>{
    setBusy(true);setMessage('');
    try{
      const result=await client.action(adminKey,'content_course_structure',{setId});
      const next=result as unknown as CourseStructure;
      setStructure(next);
      setMetaTitle(textValue(next.set.title));
      setMetaDescription(textValue(next.set.description));
      setMetaFrom(String(next.set.level?.from || ''));
      setMetaTo(String(next.set.level?.to || ''));
      const access=next.set.access || {};
      setMetaAccess(access.mode==='free'?'free':'entitlement');
      const preview=access.freePreview && typeof access.freePreview==='object' ? access.freePreview as Record<string,unknown> : {};
      setMetaFreeDays(String(preview.days ?? 0));
      const price=access.price && typeof access.price==='object' ? access.price as Record<string,unknown> : {};
      setMetaPriceRub(price.RUB ? String(price.RUB) : '');
      setMetaPriceUsd(price.USD ? String(price.USD) : '');
    }catch(error){
      setStructure(null);
      setMessage(failureText(error,'Курс не загрузился'));
    }finally{setBusy(false);}
  },[client,adminKey,setId]);

  // Words of the course the dictionary does not have block the release: checked up front.
  const runCheck=useCallback(async()=>{
    try{
      const result=await client.action(adminKey,'content_release_check',{setIds:[setId]});
      setCheck(((result.sets || {}) as Record<string,WordCheck>)[setId] ?? null);
    }catch(_){ setCheck(null); }
  },[client,adminKey,setId]);

  useEffect(()=>{void loadSets().catch(error=>setMessage(failureText(error,'Список курсов не загрузился')));},[loadSets]);
  useEffect(()=>{void loadStructure();setOpenNode(null);setEditor(null);setReleaseMessage('');setCheck(null);},[loadStructure]);

  const current=sets.find(item=>item.id===setId) ?? null;
  const state=current ? courseState(current) : null;
  const needsRelease=!!current && (!current.publishedRevision || !!current.unreleasedChanges);
  useEffect(()=>{ if(needsRelease) void runCheck(); else setCheck(null); },[needsRelease,runCheck,current?.draftRevision]);

  async function refreshCourse(){
    await Promise.all([loadStructure(),loadSets()]);
  }

  async function publish(){
    if(!current)return;
    const title=textValue(current.title)||current.id;
    if(!window.confirm('Выпустить «'+title+'» для учеников? Вместе с курсом выпустится словарь.'))return;
    setBusy(true);setReleaseMessage('');
    try{
      await client.action(adminKey,'content_publish',{setIds:[setId]});
      setReleaseMessage('Выпущено: ученики уже видят «'+title+'».');
      await loadSets();
    }catch(error){
      const code=String((error as {code?:string})?.code||'');
      if(code==='lexical_coverage_incomplete'){
        setReleaseMessage('Не выпустилось: в курсе есть слова, которых нет в словаре.');
        await runCheck();
      }else setReleaseMessage(failureText(error,'Не выпустилось'));
    }finally{setBusy(false);}
  }

  async function open(roadmapId:string,nodeId:string){
    setBusy(true);setDayMessage('');setEditor(null);
    try{
      const result=await client.action(adminKey,'content_course_node',{setId,roadmapId,nodeId});
      setOpenNode({roadmapId,version:Number(result.version||1),node:result.node as OpenNode['node'],activities:result.activities as ActivitySummary[]});
    }catch(error){
      setDayMessage(failureText(error,'День не открылся'));
    }finally{setBusy(false);}
  }

  async function toggleActivity(id:string){
    if(editor?.id===id){setEditor(null);return;}
    setBusy(true);setDayMessage('');
    try{
      const result=await client.action(adminKey,'content_activity_get',{setId,activityId:id});
      setEditor(result.activity as EditableActivity);
    }catch(error){
      setDayMessage(failureText(error,'Задание не открылось'));
    }finally{setBusy(false);}
  }

  async function reloadOpenNode(){
    if(openNode) await open(openNode.roadmapId,openNode.node.id);
  }

  async function createActivity(){
    if(!openNode)return;
    setBusy(true);setDayMessage('');
    try{
      const result=await client.action(adminKey,'content_activity_create',{setId,roadmapId:openNode.roadmapId,nodeId:openNode.node.id,type:newType});
      await Promise.all([reloadOpenNode(),refreshCourse()]);
      setEditor(result.activity as EditableActivity);
    }catch(error){
      setDayMessage(failureText(error,'Задание не добавилось'));
    }finally{setBusy(false);}
  }

  async function detach(id:string){
    if(!openNode)return;
    if(!window.confirm('Убрать это задание из дня? Само задание не удалится, его можно вернуть.'))return;
    setBusy(true);setDayMessage('');
    try{
      await client.action(adminKey,'content_activity_detach',{setId,roadmapId:openNode.roadmapId,nodeId:openNode.node.id,activityId:id});
      if(editor?.id===id)setEditor(null);
      await Promise.all([reloadOpenNode(),refreshCourse()]);
    }catch(error){
      setDayMessage(failureText(error,'Задание не убралось'));
    }finally{setBusy(false);}
  }

  async function move(index:number,delta:number){
    if(!openNode)return;
    const next=openNode.activities.map(item=>item.id);
    const target=index+delta;
    if(target<0 || target>=next.length)return;
    [next[index],next[target]]=[next[target]!,next[index]!];
    setBusy(true);setDayMessage('');
    try{
      await client.action(adminKey,'content_activity_reorder',{setId,roadmapId:openNode.roadmapId,nodeId:openNode.node.id,activityIds:next});
      await Promise.all([reloadOpenNode(),loadSets()]);
    }catch(error){
      setDayMessage(failureText(error,'Порядок не сохранился'));
    }finally{setBusy(false);}
  }

  async function createSet(){
    const id=createId.trim().toLowerCase();
    const title=createTitle.trim();
    if(!id || !title){setMessage('Укажи короткое имя и название курса.');return;}
    setBusy(true);setMessage('');
    try{
      await client.action(adminKey,'content_set_create',{id,title,accessMode:'entitlement',freeDays:0});
      await loadSets();
      setSetId(id);
      setCreateId('');setCreateTitle('');setCreateOpen(false);
      setMessage('Курс создан. Добавь дни и задания, потом нажми «Выпустить».');
    }catch(error){
      setMessage(failureText(error,'Курс не создался'));
    }finally{setBusy(false);}
  }

  async function saveSetMeta(){
    if(!structure)return;
    setBusy(true);setMessage('');
    try{
      await client.action(adminKey,'content_set_save',{
        setId,
        expectedDraftRevision:structure.draftRevision,
        changes:{
          title:metaTitle,
          description:metaDescription,
          levelFrom:metaFrom,
          levelTo:metaTo,
          accessMode:metaAccess,
          freeDays:Number(metaFreeDays)||0,
          price:{RUB:Number(metaPriceRub)||0,USD:Number(metaPriceUsd)||0}
        }
      });
      await refreshCourse();
      setMessage('Настройки сохранены. Ученики увидят их после «Выпустить».');
    }catch(error){
      setMessage(failureText(error,'Не сохранилось'));
    }finally{setBusy(false);}
  }

  async function createNode(){
    const roadmap=structure?.roadmaps[0];
    if(!roadmap)return;
    setBusy(true);setMessage('');
    try{
      const result=await client.action(adminKey,'content_node_create',{setId,roadmapId:roadmap.id});
      await refreshCourse();
      await open(roadmap.id,String((result.node as {id?:unknown})?.id||''));
    }catch(error){
      setMessage(failureText(error,'День не добавился'));
    }finally{setBusy(false);}
  }

  async function saveNodeMeta(){
    if(!openNode)return;
    setBusy(true);setDayMessage('');
    try{
      const result=await client.action(adminKey,'content_node_save',{
        setId,
        roadmapId:openNode.roadmapId,
        nodeId:openNode.node.id,
        expectedVersion:openNode.version,
        changes:{
          title:textValue(openNode.node.title),
          kind:openNode.node.kind,
          dayIndex:openNode.node.dayIndex ?? null,
          optional:openNode.node.optional,
          prerequisites:openNode.node.prerequisites
        }
      });
      const node=result.node as OpenNode['node'];
      setOpenNode(value=>value?{...value,node,version:Number(result.version||value.version)}:value);
      await refreshCourse();
      setDayMessage('День сохранён.');
    }catch(error){
      setDayMessage(failureText(error,'День не сохранился'));
    }finally{setBusy(false);}
  }

  function patchOpenNode(patch:Partial<OpenNode['node']>){
    setOpenNode(value=>value?{...value,node:{...value.node,...patch}}:value);
  }

  async function moveNode(index:number,delta:number){
    const roadmap=structure?.roadmaps[0];
    if(!roadmap)return;
    const ids=roadmap.nodes.slice().sort((a,b)=>a.order-b.order).map(node=>node.id);
    const target=index+delta;
    if(target<0||target>=ids.length)return;
    [ids[index],ids[target]]=[ids[target]!,ids[index]!];
    setBusy(true);setDayMessage('');
    try{
      await client.action(adminKey,'content_node_reorder',{setId,roadmapId:roadmap.id,nodeIds:ids});
      await refreshCourse();
    }catch(error){
      setDayMessage(failureText(error,'Порядок дней не сохранился'));
    }finally{setBusy(false);}
  }

  async function deleteNode(roadmapId:string,nodeId:string){
    if(!window.confirm('Удалить этот день из курса? Его задания не удалятся.'))return;
    setBusy(true);setDayMessage('');
    try{
      await client.action(adminKey,'content_node_delete',{setId,roadmapId,nodeId});
      setOpenNode(null);setEditor(null);
      await refreshCourse();
    }catch(error){
      const code=String((error as {code?:string})?.code || '');
      setDayMessage(code==='node_has_dependents'
        ? 'Сначала поменяй у следующих дней, после какого дня они открываются: на этот день они ссылаются.'
        : failureText(error,'День не удалился'));
    }finally{setBusy(false);}
  }

  const roadmaps=structure?.roadmaps || [];
  const nodes=useMemo<DayRow[]>(()=>roadmaps.flatMap(roadmap=>roadmap.nodes.map(node=>({roadmapId:roadmap.id,...node})))
    .sort((a,b)=>(a.order??0)-(b.order??0)),[roadmaps]);
  // Days grouped by the course's stages, as on the learner's map («1 · Основа фразы, дни 1–6»).
  const groups=useMemo<DayGroup[]>(()=>{
    const stages=courseStages(setId);
    const out:DayGroup[]=stages.map(stage=>({key:stage.id,title:stage.number+' · '+t(stageNameKey(stage)),range:'дни '+stage.fromDay+'–'+stage.toDay,days:[]}));
    const rest:DayGroup={key:'rest',title:stages.length?'Другие дни':'Все дни',range:'',days:[]};
    for(const node of nodes){
      const index=stages.findIndex(stage=>node.dayIndex!==undefined&&node.dayIndex>=stage.fromDay&&node.dayIndex<=stage.toDay);
      (index>=0?out[index]!:rest).days.push(node);
    }
    return [...out,rest].filter(group=>group.days.length);
  },[nodes,setId,t]);
  const openIndex=openNode ? nodes.findIndex(node=>node.roadmapId===openNode.roadmapId&&node.id===openNode.node.id) : -1;
  const openRow=openIndex>=0 ? nodes[openIndex] : null;
  // On a phone the day replaces the list: start it from its top.
  const openId=openNode?.node.id;
  useEffect(()=>{
    if(openId&&window.matchMedia?.('(max-width: 899px)').matches) dayPane.current?.scrollIntoView?.({block:'start'});
  },[openId]);

  // Review days have no theory: they are named by their kind («Повторение»), not «День 6».
  const dayTitle=(node:DayRow)=>node.topic || (node.kind!=='lesson' ? KIND_LABELS[node.kind] : '') || textValue(node.title) || node.id;

  return <div className="ab-course">
    <div className="ab-course-tabs" role="tablist" aria-label="Курсы">
      {sets.map(item=>{
        const itemState=courseState(item);
        return <button key={item.id} type="button" role="tab" aria-selected={item.id===setId} data-busy="off"
          className="ab-course-tab" data-state={itemState.tone} onClick={()=>setSetId(item.id)}>
          <b>{textValue(item.title)||item.id}</b>
          <small>{itemState.tone==='live'?'на сайте':itemState.tone==='changed'?'есть правки':'не выпущен'}</small>
        </button>;
      })}
      <button type="button" className="ab-course-tab ab-course-tab-add" data-busy="off" aria-expanded={createOpen} onClick={()=>setCreateOpen(value=>!value)}>+ Новый курс</button>
    </div>

    {createOpen && <article className="ab-admin-panel ab-course-create-set">
      <label><span>Короткое имя латиницей (потом не меняется)</span><input value={createId} onChange={e=>setCreateId(e.target.value)} placeholder="b1-b2" /></label>
      <label><span>Название</span><input value={createTitle} onChange={e=>setCreateTitle(e.target.value)} placeholder="B1 → B2" /></label>
      <button type="button" disabled={busy} onClick={()=>void createSet()}>Создать курс</button>
    </article>}

    {current && state && <article className="ab-admin-panel ab-course-release" data-state={state.tone}>
      <div className="ab-course-release-row">
        <div>
          <h2>{textValue(current.title)||current.id}</h2>
          <p className="ab-course-release-state">{state.text}</p>
        </div>
        <button type="button" disabled={busy||!needsRelease||(check!==null&&!check.ready)} onClick={()=>void publish()}>Выпустить</button>
      </div>
      {needsRelease && check && !check.ready && <div className="ab-release-check">
        {check.missingCount>0 && <p>Выпуск ждёт словаря — нет слов ({check.missingCount}): <b>{wordList(check.missing,check.missingCount)}</b>. Добавь их в разделе «Словарь» → «Дополнить словарь через ИИ».</p>}
        {check.ambiguousCount>0 && <p>У слов несколько записей в словаре ({check.ambiguousCount}): <b>{wordList(check.ambiguous,check.ambiguousCount)}</b>. Объедини их в разделе «Словарь».</p>}
      </div>}
      {releaseMessage && <p className="ab-admin-feedback" role="status">{releaseMessage}</p>}
      {structure && <details className="ab-admin-details">
        <summary>Название, цена и бесплатные дни</summary>
        <div className="ab-course-meta-grid">
          <label><span>Название</span><input value={metaTitle} onChange={e=>setMetaTitle(e.target.value)} /></label>
          <label><span>Описание</span><input value={metaDescription} onChange={e=>setMetaDescription(e.target.value)} /></label>
          <label><span>Уровень от</span><select value={metaFrom} onChange={e=>setMetaFrom(e.target.value)}>
            <option value="">—</option><option value="pre-a1">Pre-A1</option><option value="a1">A1</option><option value="a2">A2</option><option value="b1">B1</option><option value="b2">B2</option><option value="c1">C1</option><option value="c2">C2</option>
          </select></label>
          <label><span>Уровень до</span><select value={metaTo} onChange={e=>setMetaTo(e.target.value)}>
            <option value="">—</option><option value="pre-a1">Pre-A1</option><option value="a1">A1</option><option value="a2">A2</option><option value="b1">B1</option><option value="b2">B2</option><option value="c1">C1</option><option value="c2">C2</option>
          </select></label>
          <label><span>Доступ</span><select value={metaAccess} onChange={e=>setMetaAccess(e.target.value as 'free'|'entitlement')}>
            <option value="entitlement">Платный, первые дни бесплатно</option><option value="free">Полностью бесплатный</option>
          </select></label>
          {metaAccess==='entitlement' && <>
            <label><span>Бесплатных дней</span><input type="number" min={0} max={365} value={metaFreeDays} onChange={e=>setMetaFreeDays(e.target.value)} /></label>
            <label><span>Цена, ₽ (пусто — общая)</span><input type="number" min={0} inputMode="numeric" value={metaPriceRub} onChange={e=>setMetaPriceRub(e.target.value)} /></label>
            <label><span>Цена, $ (пусто — общая)</span><input type="number" min={0} inputMode="numeric" value={metaPriceUsd} onChange={e=>setMetaPriceUsd(e.target.value)} /></label>
          </>}
        </div>
        <div className="ab-admin-action-row">
          <button type="button" disabled={busy} onClick={()=>void saveSetMeta()}>Сохранить настройки</button>
        </div>
      </details>}
      {message && <p className="ab-admin-feedback" role="status">{message}</p>}
    </article>}

    <div className="ab-course-split" data-day-open={openNode ? '' : undefined}>
      <aside className="ab-admin-panel ab-course-days-pane" aria-label="Дни курса">
        <div className="ab-course-pane-head">
          <b>{structure ? 'Дней: '+nodes.length : busy ? 'Загружаю…' : ''}</b>
          <button type="button" className="ab-admin-secondary" disabled={busy||!structure} onClick={()=>void createNode()}>+ День</button>
        </div>
        {groups.map(group=><section key={group.key} className="ab-course-group">
          <h3>{group.title}{group.range && <small> · {group.range}</small>}</h3>
          {group.days.map(node=><button type="button" key={node.roadmapId+':'+node.id} className="ab-course-day"
            aria-current={openNode?.node.id===node.id ? 'true' : undefined}
            onClick={()=>void open(node.roadmapId,node.id)}>
            <span className="ab-course-day-num">{node.dayIndex ?? '·'}</span>
            <span className="ab-course-day-main">
              <b>{dayTitle(node)}</b>
              <small>заданий: {node.activityCount}{node.optional ? ' · необязательный' : ''}</small>
            </span>
          </button>)}
        </section>)}
      </aside>

      <section className="ab-admin-panel ab-course-day-pane" ref={dayPane} aria-label="Выбранный день">
        {!openNode ? <p className="ab-admin-empty">Выбери день в списке — здесь откроются его задания.</p> : <>
          <button type="button" className="ab-admin-link ab-course-back" data-busy="off" onClick={()=>{setOpenNode(null);setEditor(null);}}>← Все дни</button>
          <div className="ab-course-day-head">
            <span className="ab-course-day-num">{openNode.node.dayIndex ?? '·'}</span>
            <div>
              <h2>{openRow ? dayTitle(openRow) : textValue(openNode.node.title)}</h2>
              <p className="ab-admin-note">День {openNode.node.dayIndex ?? '—'} · {KIND_LABELS[openNode.node.kind] || openNode.node.kind} · заданий: {openNode.activities.length}</p>
            </div>
          </div>
          {dayMessage && <p className="ab-admin-feedback" role="status">{dayMessage}</p>}

          <ol className="ab-course-tasks">
            {openNode.activities.map((activity,index)=><li key={activity.id} className="ab-course-task" data-open={editor?.id===activity.id || undefined}>
              <div className="ab-course-task-row">
                <button type="button" className="ab-course-task-main" aria-expanded={editor?.id===activity.id} onClick={()=>void toggleActivity(activity.id)}>
                  <span className="ab-course-task-num">{index+1}</span>
                  <span className="ab-course-task-text">
                    <b>{activity.plan ? 'План дня' : activity.label || activity.id}</b>
                    <small data-type={activity.type}>{activity.plan ? 'План' : typeLabel(activity.type)}</small>
                  </span>
                </button>
                <span className="ab-course-task-tools">
                  <button type="button" className="ab-admin-secondary" aria-label="Выше" title="Выше" disabled={index===0||busy} onClick={()=>void move(index,-1)}>↑</button>
                  <button type="button" className="ab-admin-secondary" aria-label="Ниже" title="Ниже" disabled={index===openNode.activities.length-1||busy} onClick={()=>void move(index,1)}>↓</button>
                  <button type="button" className="ab-admin-secondary" aria-label="Убрать из дня" title="Убрать из дня" disabled={busy} onClick={()=>void detach(activity.id)}>✕</button>
                </span>
              </div>
              {editor?.id===activity.id && <ActivityEditor client={client} adminKey={adminKey} setId={setId} activity={editor}
                onClose={()=>setEditor(null)}
                onSaved={next=>{setEditor(next);void reloadOpenNode();void loadSets();}} />}
            </li>)}
          </ol>
          {!openNode.activities.length && <p className="ab-admin-empty">В этом дне пока нет заданий.</p>}

          <div className="ab-course-add">
            <select aria-label="Тип задания" value={newType} onChange={e=>setNewType(e.target.value)}>
              {ACTIVITY_TYPES.map(([value,label])=><option key={value} value={value}>{label}</option>)}
            </select>
            <button type="button" disabled={busy} onClick={()=>void createActivity()}>+ Задание</button>
          </div>

          <details className="ab-admin-details">
            <summary>Настройки дня</summary>
            <div className="ab-course-meta-grid">
              <label><span>Название</span><input value={textValue(openNode.node.title)} onChange={e=>patchOpenNode({title:{...openNode.node.title,ru:e.target.value}})} /></label>
              <label><span>Тип</span><select value={openNode.node.kind} onChange={e=>patchOpenNode({kind:e.target.value})}>
                <option value="lesson">Урок</option><option value="practice">Практика</option><option value="review">Повторение</option><option value="dialogue">Диалог</option><option value="checkpoint">Проверка</option><option value="bonus">Бонус</option>
              </select></label>
              <label><span>Учебный день</span><input type="number" min={1} value={openNode.node.dayIndex ?? ''} onChange={e=>patchOpenNode({dayIndex:e.target.value?Number(e.target.value):undefined})} /></label>
              <label><span>Открывается после дней (имена через запятую)</span><input value={openNode.node.prerequisites.join(', ')} onChange={e=>patchOpenNode({prerequisites:e.target.value.split(',').map(x=>x.trim()).filter(Boolean)})} /></label>
              <label className="ab-course-check"><input type="checkbox" checked={openNode.node.optional} onChange={e=>patchOpenNode({optional:e.target.checked})} /><span>Необязательный день</span></label>
            </div>
            <div className="ab-admin-action-row">
              <button type="button" disabled={busy} onClick={()=>void saveNodeMeta()}>Сохранить день</button>
              <button type="button" className="ab-admin-secondary" disabled={openIndex<=0||busy} onClick={()=>void moveNode(openIndex,-1)}>Сдвинуть выше</button>
              <button type="button" className="ab-admin-secondary" disabled={openIndex<0||openIndex===nodes.length-1||busy} onClick={()=>void moveNode(openIndex,1)}>Сдвинуть ниже</button>
              <button type="button" className="ab-admin-secondary" disabled={busy} onClick={()=>void deleteNode(openNode.roadmapId,openNode.node.id)}>Удалить день</button>
            </div>
          </details>
        </>}
      </section>
    </div>
  </div>;
}

export const courseAdminSection:AdminSection={
  id:'course',
  label:'Курсы',
  group:'Курсы',
  render(context){return <CourseAdmin {...context} />;}
};
