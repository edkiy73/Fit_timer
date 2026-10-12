import {useEffect,useState} from 'react';
import {z} from 'zod';
import type {AdminSectionContext} from '@appbase/ui-react/admin.js';
import {AdminWorkspace} from '@appbase/ui-react/admin-workspace.js';
import seeds from '../../data/questionnaires.json';
import {definitionSchema,type TestDefinition,type TestQuestion,type Answers} from './questionnaire-model';
import {QuestionChoice} from './questionnaire-page';
const initial=seeds.map(v=>definitionSchema.parse(v));
const draftSchema=z.object({testId:z.string(),definition:definitionSchema,revision:z.number().int().positive(),currentVersion:z.uuid().nullable()}).strict();
const listSchema=z.object({ok:z.literal(true),drafts:z.array(draftSchema).max(30)}).strict();
const newDimension=(id:string)=>({id,title:'Новое направление',low:'При небольшом значении: что можно обсудить.',mid:'При среднем значении: что можно обсудить.',high:'При высоком значении: что можно обсудить.'});
const newQuestion=(id:string,dimension:string):TestQuestion=>({id,prompt:'Новый вопрос',dimension,kind:'scale',options:['Сейчас не подходит','Скорее не подходит','Зависит от ситуации','Скорее подходит','Сейчас подходит'].map((label,score)=>({id:'answer-'+score,label,score}))});
export function QuestionnairesAdmin({client,adminKey}:AdminSectionContext){
 const [localDefinitions,setLocalDefinitions]=useState<TestDefinition[]>([]);
 const [workspace,setWorkspace]=useState(false),[editorTab,setEditorTab]=useState<'details'|'dimensions'|'questions'|'preview'|'publish'>('details');
 const [drafts,setDrafts]=useState<z.infer<typeof draftSchema>[]>([]),[selected,setSelected]=useState(initial[0]!.id),[data,setData]=useState<TestDefinition>(initial[0]!),[revision,setRevision]=useState(0),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[reviewed,setReviewed]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[refresh,setRefresh]=useState(0),[previewPosition,setPreviewPosition]=useState(0),[previewAnswers,setPreviewAnswers]=useState<Answers>({});
 useEffect(()=>{let live=true;setBusy(true);setError('');void client.action(adminKey,'feture.tests.list',{}).then(raw=>{if(live)setDrafts(listSchema.parse(raw).drafts);}).catch(()=>{if(live)setError('Не удалось загрузить опросники.');}).finally(()=>{if(live)setBusy(false);});return ()=>{live=false;};},[client,adminKey,refresh]);
 useEffect(()=>{const draft=drafts.find(d=>d.testId===selected),seed=[...initial,...localDefinitions].find(d=>d.id===selected);if(draft||seed){setData(draft?.definition||seed!);setRevision(draft?.revision||0);setDirty(false);setReviewed(false);setPreviewPosition(0);setPreviewAnswers({});}},[drafts,selected,localDefinitions]);
 const edit=(fn:(current:TestDefinition)=>TestDefinition)=>{setData(fn);setDirty(true);setReviewed(false);setNotice('');};
 const select=(id:string)=>{
  if(id!==selected&&dirty&&!window.confirm('Несохранённые изменения будут потеряны. Продолжить?'))return false;
  setSelected(id);
  return true;
 };
 const save=async()=>{if(busy)return;setBusy(true);setError('');setNotice('');try{const checked=definitionSchema.parse(data);const raw=await client.action(adminKey,'feture.tests.save',{definition:checked,expectedRevision:revision});const result=z.object({ok:z.literal(true),revision:z.number().int().positive()}).strict().parse(raw);setRevision(result.revision);setDirty(false);setReviewed(false);setNotice('Черновик сохранён. Перед публикацией проверь вопросы и выводы.');setRefresh(n=>n+1);}catch(e){setError(e instanceof z.ZodError?e.issues.map(i=>i.message).slice(0,3).join(' · '):'Сохранить не удалось. Возможно, редакция изменилась; обнови черновик.');}finally{setBusy(false);}};
 const publish=async()=>{if(busy||dirty||!reviewed||!revision)return;setBusy(true);setError('');try{await client.action(adminKey,'feture.tests.publish',{testId:data.id,revision,reviewed:true});setReviewed(false);setNotice('Опубликована неизменяемая версия. Старые прохождения сохранят свои вопросы и правила расчёта.');setRefresh(n=>n+1);}catch{setError('Опубликовать не удалось. Проверь сохранённую редакцию.');}finally{setBusy(false);}};
 const retire=async()=>{if(busy||dirty||!revision||!window.confirm('Скрыть опросник для новых прохождений? Сохранённые результаты и черновики останутся доступны владельцам.'))return;setBusy(true);setError('');try{await client.action(adminKey,'feture.tests.retire',{testId:data.id,revision});setNotice('Опросник скрыт для новых прохождений.');setRefresh(n=>n+1);}catch{setError('Скрыть опросник не удалось.');}finally{setBusy(false);}};
 const patchQuestion=(i:number,fn:(q:TestQuestion)=>TestQuestion)=>edit(d=>({...d,questions:d.questions.map((q,j)=>i===j?fn(q):q)}));
 const options=[...new Set([...[...initial,...localDefinitions].map(x=>x.id),...drafts.map(x=>x.testId)])];
 const close=()=>{if(busy)return;if(dirty&&!window.confirm('Закрыть редактор? Несохранённые изменения будут потеряны.'))return;setWorkspace(false);setEditorTab('details');if(dirty)setRefresh(n=>n+1);};
 const displayed=[...initial,...localDefinitions,...drafts.map(d=>d.definition)];
 return <section className="ft-questionnaires-admin"><div className="ab-admin-section-head"><div><h2>Опросники FetUre</h2><p className="muted">Редактирование, предпросмотр и публикация — в отдельном рабочем окне. Черновики не видны пользователям.</p></div></div>
  <div className="ft-form-actions"><button type="button" disabled={busy} onClick={()=>{if(!dirty||window.confirm('Создать новый опросник? Несохранённые изменения будут потеряны.')){const id='questionnaire-'+crypto.randomUUID().slice(0,8);const dim=newDimension('reflection');const next:TestDefinition={id,title:'Новый опросник',description:'Опиши цель исследования и напомни, что вопросы можно пропускать.',dimensions:[dim],questions:Array.from({length:6},(_,i)=>newQuestion('question-'+(i+1),dim.id))};setLocalDefinitions(items=>[...items,next]);setSelected(id);setEditorTab('details');setWorkspace(true);}}}>+ Создать опросник</button>
   <button type="button" className="ab-admin-secondary" disabled={busy} onClick={()=>{if(!dirty||window.confirm('Обновить список? Несохранённые изменения в редакторе будут потеряны.'))setRefresh(n=>n+1);}}>Обновить</button></div>
  <div className="ab-admin-item-list">{options.map(id=>{const item=displayed.find(d=>d.id===id);const draft=drafts.find(d=>d.testId===id);
   return <button type="button" key={id} disabled={busy} onClick={()=>{if(!select(id))return;setEditorTab('details');setWorkspace(true);}}>
    <span><strong>{draft?.definition.title||item?.title||id}</strong><small>{draft?'Черновик · редакция '+draft.revision:'Черновик не сохранён'} · {draft?.definition.questions.length||item?.questions.length||0} вопросов</small></span><span aria-hidden="true">→</span>
   </button>;})}</div>
  {error&&<p role="alert">{error}</p>}{!workspace&&notice&&<p role="status">{notice}</p>}
  {workspace&&<AdminWorkspace title={data.title} subtitle={data.questions.length+' вопросов · '+data.dimensions.length+' направлений · редакция '+(revision||'не сохранена')} onClose={close}
   footer={<><button type="button" className="ab-admin-secondary" onClick={close}>Закрыть</button>
    {editorTab!=='publish'&&<button type="button" disabled={busy||!dirty} onClick={()=>void save()}>Сохранить черновик</button>}
    {editorTab==='publish'&&<><button type="button" disabled={busy||dirty||!drafts.find(d=>d.testId===data.id)?.currentVersion} onClick={()=>void retire()}>Скрыть новые прохождения</button><button type="button" disabled={busy||dirty||!reviewed||!revision} onClick={()=>void publish()}>Опубликовать</button></>}
   </>}>
   <div className="ab-admin-workspace-tabs" role="group" aria-label="Редактор опросника">
    {([['details','Основное'],['dimensions','Результаты'],['questions','Вопросы'],['preview','Предпросмотр'],['publish','Публикация']] as const).map(([id,label])=><button key={id} type="button" aria-pressed={editorTab===id} onClick={()=>setEditorTab(id)}>{label}</button>)}
   </div>
   {editorTab==='details'&&<>
  <fieldset disabled={busy} className="ft-test-editor"><legend>Основное</legend><label>Название<input value={data.title} maxLength={160} onChange={e=>edit(d=>({...d,title:e.target.value}))}/></label><label>Описание<textarea value={data.description} maxLength={1200} rows={3} onChange={e=>edit(d=>({...d,description:e.target.value}))}/></label>

  </fieldset></>}
  {editorTab==='dimensions'&&<fieldset disabled={busy} className="ft-test-editor"><legend>Направления результата</legend>
   <h3>Направления результата</h3><p>Вопросы одного направления имеют одинаковый вес. Несколько выбранных вариантов дают средний вес одного вопроса. Для вывода нужны ответы хотя бы на половину вопросов направления; пропуск не равен нулю.</p>
   {data.dimensions.map((dim,i)=><details key={dim.id}><summary>{dim.title}</summary><label>Название направления<input value={dim.title} maxLength={120} onChange={e=>edit(d=>({...d,dimensions:d.dimensions.map((x,j)=>i===j?{...x,title:e.target.value}:x)}))}/></label>{(['low','mid','high'] as const).map((key,n)=><label key={key}>{['Вывод при среднем весе ниже 1,5','Вывод от 1,5 до 2,74','Вывод от 2,75 до 4'][n]}<textarea rows={3} maxLength={800} value={dim[key]} onChange={e=>edit(d=>({...d,dimensions:d.dimensions.map((x,j)=>i===j?{...x,[key]:e.target.value}:x)}))}/></label>)}</details>)}
   {data.dimensions.length<4&&<button type="button" onClick={()=>edit(d=>({...d,dimensions:[...d.dimensions,newDimension('dimension-'+crypto.randomUUID().slice(0,8))]}))}>Добавить направление</button>}

  </fieldset>}
  {editorTab==='questions'&&<fieldset disabled={busy} className="ft-test-editor"><legend>Вопросы</legend>
   <h3>Вопросы</h3>{data.questions.map((q,i)=><details key={q.id}><summary>{i+1}. {q.prompt}</summary><label>Вопрос<textarea rows={2} maxLength={600} value={q.prompt} onChange={e=>patchQuestion(i,x=>({...x,prompt:e.target.value}))}/></label><div className="ft-form-grid"><label>Направление<select value={q.dimension} onChange={e=>patchQuestion(i,x=>({...x,dimension:e.target.value}))}>{data.dimensions.map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select></label><label>Тип ответа<select value={q.kind} onChange={e=>{const kind=e.target.value as TestQuestion['kind'];patchQuestion(i,x=>({...x,kind,options:kind==='scale'?newQuestion(x.id,x.dimension).options:x.options}));}}><option value="single">Один вариант</option><option value="multi">Несколько вариантов</option><option value="scale">Шкала из пяти ответов</option></select></label></div>
    {q.options.map((o,j)=><div className="ft-test-option" key={o.id}><label>Вариант {j+1}<input value={o.label} maxLength={240} onChange={e=>patchQuestion(i,x=>({...x,options:x.options.map((a,k)=>j===k?{...a,label:e.target.value}:a)}))}/></label><label>Вес от 0 до 4<input type="number" min={0} max={4} step={1} value={o.score} disabled={q.kind==='scale'} onChange={e=>patchQuestion(i,x=>({...x,options:x.options.map((a,k)=>j===k?{...a,score:Number(e.target.value)}:a)}))}/></label>{q.kind!=='scale'&&q.options.length>2&&<button type="button" onClick={()=>patchQuestion(i,x=>({...x,options:x.options.filter((_,k)=>k!==j)}))}>Убрать вариант</button>}</div>)}
    {q.kind!=='scale'&&q.options.length<6&&<button type="button" onClick={()=>patchQuestion(i,x=>({...x,options:[...x.options,{id:'option-'+crypto.randomUUID().slice(0,8),label:'Новый вариант',score:2}]}))}>Добавить вариант</button>}
    <div className="ft-form-actions"><button type="button" disabled={i===0} onClick={()=>edit(d=>{const questions=[...d.questions];[questions[i-1],questions[i]]=[questions[i]!,questions[i-1]!];return {...d,questions};})}>Выше</button><button type="button" disabled={i===data.questions.length-1} onClick={()=>edit(d=>{const questions=[...d.questions];[questions[i+1],questions[i]]=[questions[i]!,questions[i+1]!];return {...d,questions};})}>Ниже</button><button type="button" disabled={data.questions.length<=6} onClick={()=>edit(d=>({...d,questions:d.questions.filter((_,j)=>i!==j)}))}>Удалить вопрос</button></div>
   </details>)}
   {data.questions.length<12&&<button type="button" onClick={()=>edit(d=>({...d,questions:[...d.questions,newQuestion('question-'+crypto.randomUUID().slice(0,8),d.dimensions[0]!.id)]}))}>Добавить вопрос</button>}

  </fieldset>}
  {editorTab==='preview'&&data.questions.length>0&&<article className="card"><h3>{data.title}</h3><p>{data.description}</p><QuestionChoice question={data.questions[Math.min(previewPosition,data.questions.length-1)]!} value={previewAnswers[data.questions[Math.min(previewPosition,data.questions.length-1)]!.id]} onChange={next=>setPreviewAnswers(a=>({...a,[data.questions[Math.min(previewPosition,data.questions.length-1)]!.id]:next}))}/><div className="ft-form-actions"><button type="button" disabled={previewPosition===0} onClick={()=>setPreviewPosition(i=>i-1)}>Предыдущий</button><button type="button" disabled={previewPosition>=data.questions.length-1} onClick={()=>setPreviewPosition(i=>i+1)}>Следующий</button></div></article>}
  {editorTab==='publish'&&<section><h3>Проверка перед публикацией</h3><p>Изменения нужно сохранить до публикации. Старые прохождения сохраняют свои вопросы и правила расчёта.</p>  <label className="ft-consent-choice"><input type="checkbox" checked={reviewed} disabled={busy||dirty||!revision} onChange={e=>setReviewed(e.target.checked)}/>Точная сохранённая редакция проверена: вопросы нейтральны, выводы соответствуют весам, нет медицинских или научных обещаний</label>
   </section>}
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </AdminWorkspace>}
 </section>;
}
