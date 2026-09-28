import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminSection, AdminSectionContext } from '@appbase/ui-react/admin.js';
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
  dayIndex?:number;
  order:number;
  optional:boolean;
  prerequisites:string[];
  activityCount:number;
};

type CourseSetSummary = {
  id:string;
  title:TextMap;
  level:Record<string,unknown>;
  access:Record<string,unknown>|null;
  draftRevision:number|null;
  publishedRevision:number|null;
  nodeCount:number|null;
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
};

type OpenNode = {
  roadmapId:string;
  node:CourseNode & {activityIds:string[]};
  activities:ActivitySummary[];
};

const ACTIVITY_TYPES=[
  ['theory','Теория'],
  ['choice','Выбор ответа'],
  ['text-input','Ввод ответа'],
  ['translation','Перевод'],
  ['speaking','Говорение'],
  ['pattern-drill','Pattern drill'],
  ['dialogue','Диалог'],
  ['listening','Аудирование'],
  ['review','Повторение'],
  ['ai-conversation','AI-разговор']
] as const;

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
function activityLabel(activity:EditableActivity){
  return textValue(activity.title)||textValue(activity.prompt)||textValue(activity.topic)
    ||textValue(activity.pattern)||textValue(activity.scene)||String(activity.text||activity.id);
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
        <option value="text">text</option><option value="html">html</option><option value="markdown">markdown</option>
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
      <label><span>Speech locale</span><input value={String(activity.speechLocale||'en-US')} onChange={e=>update('speechLocale',e.target.value)} /></label>
    </>;
  }

  if(activity.type==='listening'){
    return <>
      <label><span>Подсказка</span><textarea rows={2} value={textValue(activity.prompt)} onChange={e=>text('prompt',e.target.value)} /></label>
      <label><span>Текст для аудио</span><textarea rows={5} value={String(activity.text||'')} onChange={e=>update('text',e.target.value)} /></label>
      <label><span>Speech locale</span><input value={String(activity.speechLocale||'en-US')} onChange={e=>update('speechLocale',e.target.value)} /></label>
    </>;
  }

  if(activity.type==='ai-conversation'){
    const focus=Array.isArray(activity.focus) ? activity.focus.map(String) : [];
    return <>
      <label><span>Тема</span><input value={textValue(activity.topic)} onChange={e=>text('topic',e.target.value)} /></label>
      <label><span>Prompt template</span><textarea rows={6} value={String(activity.promptTemplate||'')} onChange={e=>update('promptTemplate',e.target.value)} /></label>
      <label><span>Focus — через запятую</span><input value={focus.join(', ')} onChange={e=>update('focus',e.target.value.split(',').map(x=>x.trim()).filter(Boolean))} /></label>
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

  return <p className="ab-admin-note">Для {activity.type} пока используй расширенный JSON ниже. Тип полностью поддерживается движком и валидацией.</p>;
}

function ActivityEditor({client,adminKey,setId,activity,onSaved,onClose}:{client:AdminSectionContext['client'];adminKey:string;setId:string;activity:EditableActivity;onSaved(next:EditableActivity):void;onClose():void}){
  const [value,setValue]=useState(activity);
  const [raw,setRaw]=useState(()=>JSON.stringify(activity,null,2));
  const [message,setMessage]=useState('');
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

  useEffect(()=>{setValue(activity);setRaw(JSON.stringify(activity,null,2));setMessage('');},[activity]);

  function change(next:EditableActivity){
    setValue(next);
    setRaw(JSON.stringify(next,null,2));
  }

  function applyRaw(){
    try{
      const parsed=JSON.parse(raw) as EditableActivity;
      if(parsed.id!==value.id || parsed.type!==value.type){
        setMessage('ID и type существующей activity менять нельзя.');
        return;
      }
      setValue(parsed);
      setRaw(JSON.stringify(parsed,null,2));
      setMessage('JSON применён локально. Нажми «Сохранить draft».');
    }catch(_){
      setMessage('JSON невалиден.');
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
      setMessage('Сохранено в draft.');
      onSaved(next);
    }catch(error){
      const code=String((error as {code?:string})?.code || 'request_failed');
      setMessage(code==='activity_revision_conflict'?'Activity уже изменена в другой вкладке. Открой её заново.':'Ошибка: '+code);
    }finally{setBusy(false);}
  }

  return <article className="ab-admin-panel">
    <div className="ab-admin-section-head">
      <div><h2>{activityLabel(value)}</h2><p className="ab-admin-note"><code>{value.id}</code> · {value.type} · revision {value.revision}</p></div>
      <button type="button" className="ab-admin-secondary" onClick={onClose}>Закрыть</button>
    </div>

    <label><span>Что делать с уже существующим прогрессом после публикации</span>
      <select value={value.revisionProgress} onChange={e=>change({...value,revisionProgress:e.target.value as 'preserve'|'reset'})}>
        <option value="preserve">Сохранить прогресс — мелкая/совместимая правка</option>
        <option value="reset">Сбросить по этой activity — задание существенно изменилось</option>
      </select>
    </label>

    <div className="ab-course-fields"><FriendlyFields activity={value} onChange={change} /></div>

    <details className="ab-admin-details">
      <summary>Расширенный JSON</summary>
      <textarea className="ab-course-json" value={raw} onChange={e=>setRaw(e.target.value)} />
      <button type="button" className="ab-admin-secondary" onClick={applyRaw}>Применить JSON</button>
    </details>

    <div className="ab-admin-action-row">
      <button type="button" disabled={busy} onClick={()=>void save()}>Сохранить draft</button>
    </div>
    {message && <p className="ab-admin-feedback" role="status">{message}</p>}
  </article>;
}

function CourseAdmin({client,adminKey}:AdminSectionContext){
  const [sets,setSets]=useState<CourseSetSummary[]>([]);
  const [setId,setSetId]=useState('general-foundation');
  const [structure,setStructure]=useState<CourseStructure|null>(null);
  const [openNode,setOpenNode]=useState<OpenNode|null>(null);
  const [editor,setEditor]=useState<EditableActivity|null>(null);
  const [newType,setNewType]=useState('text-input');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);

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
    }catch(error){
      setStructure(null);
      setMessage('Не удалось загрузить курс: '+String((error as {code?:string})?.code || 'request_failed'));
    }finally{setBusy(false);}
  },[client,adminKey,setId]);

  useEffect(()=>{void loadSets();},[loadSets]);
  useEffect(()=>{void loadStructure();setOpenNode(null);setEditor(null);},[loadStructure]);

  async function open(roadmapId:string,nodeId:string){
    setBusy(true);setMessage('');setEditor(null);
    try{
      const result=await client.action(adminKey,'content_course_node',{setId,roadmapId,nodeId});
      setOpenNode({roadmapId,node:result.node as OpenNode['node'],activities:result.activities as ActivitySummary[]});
    }catch(error){
      setMessage('Не удалось открыть день: '+String((error as {code?:string})?.code || 'request_failed'));
    }finally{setBusy(false);}
  }

  async function openActivity(id:string){
    setBusy(true);setMessage('');
    try{
      const result=await client.action(adminKey,'content_activity_get',{setId,activityId:id});
      setEditor(result.activity as EditableActivity);
    }catch(error){
      setMessage('Не удалось открыть activity: '+String((error as {code?:string})?.code || 'request_failed'));
    }finally{setBusy(false);}
  }

  async function reloadOpenNode(){
    if(openNode) await open(openNode.roadmapId,openNode.node.id);
  }

  async function createActivity(){
    if(!openNode)return;
    setBusy(true);setMessage('');
    try{
      const result=await client.action(adminKey,'content_activity_create',{setId,roadmapId:openNode.roadmapId,nodeId:openNode.node.id,type:newType});
      await Promise.all([reloadOpenNode(),loadStructure()]);
      setEditor(result.activity as EditableActivity);
    }catch(error){
      setMessage('Не удалось создать: '+String((error as {code?:string})?.code || 'request_failed'));
    }finally{setBusy(false);}
  }

  async function detach(id:string){
    if(!openNode)return;
    if(!window.confirm('Убрать эту activity из текущего дня? Сама activity останется в draft-библиотеке и не потеряется.'))return;
    setBusy(true);setMessage('');
    try{
      await client.action(adminKey,'content_activity_detach',{setId,roadmapId:openNode.roadmapId,nodeId:openNode.node.id,activityId:id});
      if(editor?.id===id)setEditor(null);
      await Promise.all([reloadOpenNode(),loadStructure()]);
    }catch(error){
      setMessage('Не удалось убрать: '+String((error as {code?:string})?.code || 'request_failed'));
    }finally{setBusy(false);}
  }

  async function move(index:number,delta:number){
    if(!openNode)return;
    const next=openNode.activities.map(item=>item.id);
    const target=index+delta;
    if(target<0 || target>=next.length)return;
    [next[index],next[target]]=[next[target]!,next[index]!];
    setBusy(true);setMessage('');
    try{
      await client.action(adminKey,'content_activity_reorder',{setId,roadmapId:openNode.roadmapId,nodeId:openNode.node.id,activityIds:next});
      await reloadOpenNode();
    }catch(error){
      setMessage('Не удалось изменить порядок: '+String((error as {code?:string})?.code || 'request_failed'));
    }finally{setBusy(false);}
  }

  const roadmaps=structure?.roadmaps || [];
  const nodes=useMemo(()=>roadmaps.flatMap(roadmap=>roadmap.nodes.map(node=>({roadmapId:roadmap.id,roadmapTitle:textValue(roadmap.title),...node})))
    .sort((a,b)=>(a.order??0)-(b.order??0)),[roadmaps]);

  return <div className="ab-course-constructor">
    <article className="ab-admin-panel">
      <div className="ab-admin-section-head">
        <div>
          <h2>{structure ? textValue(structure.set.title) : 'Курс'}</h2>
          <p className="ab-admin-note">{structure ? 'Draft r'+structure.draftRevision+' · '+nodes.length+' узлов roadmap' : 'Загрузка…'}</p>
        </div>
        <button type="button" className="ab-admin-secondary" disabled={busy} onClick={()=>void loadStructure()}>Обновить</button>
      </div>
      {message && <p className="ab-admin-feedback" role="status">{message}</p>}
      <div className="ab-admin-table-wrap">
        <table>
          <thead><tr><th>День</th><th>Узел</th><th>Тип</th><th>Activities</th><th></th></tr></thead>
          <tbody>{nodes.map(node=><tr key={node.roadmapId+':'+node.id}>
            <td data-label="День">{node.dayIndex ?? '—'}</td>
            <td data-label="Узел"><strong>{textValue(node.title)||node.id}</strong><div className="ab-admin-cell-sub">{node.id}</div></td>
            <td data-label="Тип">{node.kind}</td>
            <td data-label="Activities">{node.activityCount}</td>
            <td className="ab-admin-cell-action"><button type="button" className="ab-admin-secondary" onClick={()=>void open(node.roadmapId,node.id)}>Открыть</button></td>
          </tr>)}</tbody>
        </table>
      </div>
    </article>

    {openNode && <article className="ab-admin-panel">
      <div className="ab-admin-section-head">
        <div><h2>{textValue(openNode.node.title)||openNode.node.id}</h2><p className="ab-admin-note">Day {openNode.node.dayIndex ?? '—'} · {openNode.activities.length} activities</p></div>
        <button type="button" className="ab-admin-secondary" onClick={()=>{setOpenNode(null);setEditor(null);}}>Закрыть</button>
      </div>

      <div className="ab-course-add">
        <select value={newType} onChange={e=>setNewType(e.target.value)}>
          {ACTIVITY_TYPES.map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>
        <button type="button" disabled={busy} onClick={()=>void createActivity()}>+ Activity</button>
      </div>

      <div className="ab-course-activity-list">
        {openNode.activities.map((activity,index)=><div className="ab-course-activity" key={activity.id}>
          <div className="ab-course-activity-main">
            <strong>{activity.label || activity.id}</strong>
            <span>{activity.type} · r{activity.revision} · {activity.revisionProgress}</span>
          </div>
          <div className="ab-course-activity-actions">
            <button type="button" className="ab-admin-secondary" disabled={index===0||busy} onClick={()=>void move(index,-1)}>↑</button>
            <button type="button" className="ab-admin-secondary" disabled={index===openNode.activities.length-1||busy} onClick={()=>void move(index,1)}>↓</button>
            <button type="button" className="ab-admin-secondary" disabled={busy} onClick={()=>void openActivity(activity.id)}>Изменить</button>
            <button type="button" className="ab-admin-secondary" disabled={busy} onClick={()=>void detach(activity.id)}>Убрать</button>
          </div>
        </div>)}
      </div>
    </article>}

    {editor && <ActivityEditor client={client} adminKey={adminKey} activity={editor}
      onClose={()=>setEditor(null)}
      onSaved={next=>{setEditor(next);void reloadOpenNode();}} />}
  </div>;
}

export const courseAdminSection:AdminSection={
  id:'course',
  label:'Курс',
  group:'Контент',
  render(context){return <CourseAdmin {...context} />;}
};
