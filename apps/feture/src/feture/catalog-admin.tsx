import {useEffect,useMemo,useState} from 'react';
import {z} from 'zod';
import type {AdminSectionContext} from '@appbase/ui-react/admin.js';
import {AdminWorkspace} from '@appbase/ui-react/admin-workspace.js';
import catalog from '../../data/concept-catalog.json';
import published from '../../data/catalog-editorial.json';

const editorialEntry=z.object({
 definition:z.string().min(1).max(400).refine(s=>s.trim()===s&&!/[<>\x00-\x1f\x7f]/.test(s)),
 synonyms:z.array(z.string().min(1).max(80).refine(s=>s.trim()===s&&!/[<>\x00-\x1f\x7f]/.test(s))).min(1).max(8),
 relatedIds:z.array(z.string()).max(8)
}).strict().superRefine((v,ctx)=>{
 if(new Set(v.synonyms).size!==v.synonyms.length||new Set(v.relatedIds).size!==v.relatedIds.length)ctx.addIssue({code:'custom',message:'Повторяющиеся синонимы или темы'});
});
type Entry=z.infer<typeof editorialEntry>;
const draft=z.object({interestId:z.string(),revision:z.number().int().positive(),entry:editorialEntry}).strict();
const listSchema=z.object({ok:z.literal(true),drafts:z.array(draft).max(144)}).strict();
const response=z.object({ok:z.literal(true),revision:z.number().int().positive()}).strict();
const publicationStatus=z.object({ok:z.literal(true),version:z.number().int().positive()}).strict();
const publishedResponse=publicationStatus.extend({published:z.number().int().positive()}).strict();
const topics=catalog.categories.flatMap(category=>category.interests.map(topic=>({...topic,category:category.title})));
const initialId=topics[0]!.id;
const baseline=(id:string):Entry=>{
 const v=published.interests[id as keyof typeof published.interests];
 return {definition:v?.definition??'',synonyms:[...(v?.synonyms??[])],relatedIds:[...(v?.relatedIds??[])]};
};
export function CatalogAdmin({client,adminKey}:AdminSectionContext){
 const [id,setId]=useState(initialId);
 const [workspace,setWorkspace]=useState<'edit'|'publish'|null>(null),[listQuery,setListQuery]=useState(''),[publicationQuery,setPublicationQuery]=useState('');
 const [drafts,setDrafts]=useState<z.infer<typeof draft>[]>([]);
 const [entry,setEntry]=useState<Entry>(()=>baseline(initialId));
 const [revision,setRevision]=useState(0),[dirty,setDirty]=useState(false),[loading,setLoading]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[query,setQuery]=useState(''),[nextRelated,setNextRelated]=useState('');
 const [refresh,setRefresh]=useState(0),[publishedVersion,setPublishedVersion]=useState(1),[publishSelected,setPublishSelected]=useState<string[]>([]),[publishing,setPublishing]=useState(false);
 useEffect(()=>{let active=true;setLoading(true);setError('');
  void Promise.all([
   client.action(adminKey,'feture.catalog.list',{}),
   client.action(adminKey,'feture.catalog.status',{})
  ]).then(([draftData,statusData])=>{
    if(active){setDrafts(listSchema.parse(draftData).drafts);setPublishedVersion(publicationStatus.parse(statusData).version);}
   }).catch(()=>{if(active)setError('Редакторские данные не загрузились. Проверь подключение сервера.');})
   .finally(()=>{if(active)setLoading(false);});return()=>{active=false;};
 },[client,adminKey,refresh]);
 useEffect(()=>{
  const d=drafts.find(x=>x.interestId===id);
  setEntry(d?{...d.entry,synonyms:[...d.entry.synonyms],relatedIds:[...d.entry.relatedIds]}:baseline(id));
  setRevision(d?.revision??0);setDirty(false);setNotice('');
 },[id,drafts]);
 const patch=(update:(v:Entry)=>Entry)=>{setEntry(update);setDirty(true);setNotice('');};
 const choose=(value:string)=>{if(dirty&&!window.confirm('Несохранённые изменения будут потеряны. Продолжить?'))return;setId(value);};
 const relatedOptions=useMemo(()=>topics.filter(t=>t.id!==id&&!entry.relatedIds.includes(t.id)&&[t.title,t.category].join(' ').toLowerCase().includes(query.trim().toLowerCase())).slice(0,30),[id,entry.relatedIds,query]);
 const save=async()=>{if(loading||!dirty)return;setLoading(true);setError('');setNotice('');
  try{
   const next=editorialEntry.parse(entry);
   if(next.relatedIds.includes(id)||next.relatedIds.some(r=>!topics.some(t=>t.id===r)))throw Error('invalid_related');
   const data=await client.action(adminKey,'feture.catalog.save',{interestId:id,expectedRevision:revision,entry:next});
   const result=response.parse(data);
   setRevision(result.revision);setDirty(false);setNotice('Черновик сохранён. Публичный каталог не изменился.');
   setDrafts(items=>[...items.filter(d=>d.interestId!==id),{interestId:id,entry:next,revision:result.revision}]);
  }catch(e){setError(e instanceof z.ZodError?'Проверь длину определения, синонимы и повторяющиеся темы.':'Не удалось сохранить. Данные могли измениться в другой вкладке: обнови черновики перед повтором.');}
  finally{setLoading(false);}
 };
 const publish=async()=>{
  if(loading||publishing||dirty||publishSelected.length===0)return;
  const selected=drafts.filter(d=>publishSelected.includes(d.interestId)).map(d=>({interestId:d.interestId,revision:d.revision}));
  if(selected.length!==publishSelected.length)return;
  if(!window.confirm(`Опубликовать новую версию справочника (${selected.length} проверенных черновиков)? Публикация доступна всем пользователям и не может быть отредактирована задним числом. Продолжить только после проверки каждого выбранного определения и связей.`))return;
  setPublishing(true);setError('');setNotice('');
  try{
   const result=publishedResponse.parse(await client.action(adminKey,'feture.catalog.publish',{expectedVersion:publishedVersion,reviewed:true,selected}));
   setPublishedVersion(result.version);setPublishSelected([]);setNotice(`Опубликована версия ${result.version} (${result.published} тем). Прошлые версии сохранены.`);
  }catch{setError('Не удалось опубликовать. Проверь ревизии черновиков и актуальную версию справочника, обнови данные.');}
  finally{setPublishing(false);}
 };
 const current=topics.find(t=>t.id===id);
 const close=()=>{
  if(loading||publishing)return;
  if(workspace==='edit'&&dirty&&!window.confirm('Закрыть редактор? Несохранённые изменения будут потеряны.'))return;
  setWorkspace(null);
  if(dirty)setRefresh(n=>n+1);
 };
 const filteredTopics=topics.filter(topic=>[topic.title,topic.category,...(baseline(topic.id).synonyms)].join(' ').toLowerCase().includes(listQuery.trim().toLowerCase()));
 const filteredDrafts=drafts.filter(d=>{const t=topics.find(item=>item.id===d.interestId);return [t?.title,t?.category].join(' ').toLowerCase().includes(publicationQuery.trim().toLowerCase());});
 return <section className="ft-catalog-admin">
  <div className="ab-admin-section-head"><div><h2>Каталог интересов</h2><p className="muted">{topics.length} тем · {drafts.length} черновиков · опубликована версия {publishedVersion}</p></div></div>
  <div className="ft-form-actions"><button type="button" disabled={loading||publishing} onClick={()=>setWorkspace('publish')}>Публикация {publishSelected.length?('· '+publishSelected.length):''}</button>
   <button type="button" className="ab-admin-secondary" disabled={loading||publishing} onClick={()=>setRefresh(n=>n+1)}>Обновить</button></div>
  <label>Поиск тем<input type="search" value={listQuery} onChange={e=>setListQuery(e.target.value)} placeholder="Название или категория"/></label>
  <div className="ab-admin-item-list">
   {filteredTopics.slice(0,80).map(topic=>{
    const d=drafts.find(x=>x.interestId===topic.id);
    return <button type="button" key={topic.id} disabled={loading||publishing} onClick={()=>{choose(topic.id);setWorkspace('edit');}}>
     <span><strong>{topic.title}</strong><small>{topic.category} · {d?'Черновик '+d.revision:'Нет черновика'}</small></span><span aria-hidden="true">→</span>
    </button>;
   })}
  </div>
  {filteredTopics.length>80&&<p className="muted">Показано 80 из {filteredTopics.length}. Уточни поиск.</p>}
  {filteredTopics.length===0&&<p className="muted">По этому запросу тем нет.</p>}
  {error&&<p role="alert">{error}</p>}{!workspace&&notice&&<p role="status">{notice}</p>}
  {workspace==='edit'&&<AdminWorkspace title={current?.title||'Редактирование темы'} subtitle={(current?.category||'')+' · редакция '+(revision||'не сохранена')} onClose={close}
    footer={<><button type="button" className="ab-admin-secondary" onClick={close}>Закрыть</button>
     <button type="button" disabled={!dirty||loading} onClick={()=>void save()}>{loading?'Сохраняем…':'Сохранить черновик'}</button>
    </>}>
   <p className="muted">Изменения в черновике скрыты от пользователей до отдельной публикации.</p>
   <label>Определение<textarea disabled={loading} value={entry.definition} maxLength={400} rows={4} onChange={e=>patch(v=>({...v,definition:e.target.value}))}/></label>
   <label>Поисковые синонимы (каждый с новой строки)<textarea disabled={loading} value={entry.synonyms.join('\n')} rows={4}
     onChange={e=>patch(v=>({...v,synonyms:e.target.value.split('\n').map(x=>x.trim()).filter(Boolean)}))}/></label>
   <h3>Связанные темы</h3>
   <div>{entry.relatedIds.map(related=>{const t=topics.find(x=>x.id===related);return <span key={related} className="ft-textbtn">{t?.title??related} <button type="button" disabled={loading} aria-label={'Убрать '+(t?.title??related)} onClick={()=>patch(v=>({...v,relatedIds:v.relatedIds.filter(x=>x!==related)}))}>×</button> </span>;})}</div>
   {entry.relatedIds.length<8&&<><label>Найти связанную тему<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Название или категория"/></label>
    <label>Выбрать тему<select value={nextRelated} onChange={e=>setNextRelated(e.target.value)}><option value="">Выбери тему</option>{relatedOptions.map(t=><option key={t.id} value={t.id}>{t.title} · {t.category}</option>)}</select></label>
    <button type="button" disabled={!nextRelated||loading} onClick={()=>{if(nextRelated&&relatedOptions.some(t=>t.id===nextRelated))patch(v=>({...v,relatedIds:[...v.relatedIds,nextRelated]}));setNextRelated('');}}>Добавить связь</button></>}
   {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </AdminWorkspace>}
  {workspace==='publish'&&<AdminWorkspace title="Публикация справочника" subtitle={'Версия '+publishedVersion+' · '+drafts.length+' доступных черновиков'} onClose={close}
    footer={<><button type="button" className="ab-admin-secondary" onClick={close}>Закрыть</button><button type="button" disabled={loading||publishing||dirty||publishSelected.length===0} onClick={()=>void publish()}>{publishing?'Публикуем…':('Опубликовать · '+publishSelected.length)}</button></>}>
   <p>Выбери только проверенные определения: опубликованные версии неизменяемы, а невыбранные темы не изменятся. Решение подтверждается отдельно.</p>
   <label>Найти черновик<input type="search" value={publicationQuery} onChange={e=>setPublicationQuery(e.target.value)} placeholder="Название темы"/></label>
   <div className="ft-form-actions"><button type="button" className="ab-admin-secondary" disabled={publishing} onClick={()=>setPublishSelected([])}>Снять выбор ({publishSelected.length})</button></div>
   <div className="ab-admin-item-list">
    {filteredDrafts.map(d=><label key={d.interestId} className="ft-consent-choice">
      <input type="checkbox" disabled={loading||publishing||dirty} checked={publishSelected.includes(d.interestId)}
       onChange={e=>setPublishSelected(items=>e.target.checked?[...items,d.interestId]:items.filter(v=>v!==d.interestId))}/>
      {topics.find(t=>t.id===d.interestId)?.title??d.interestId} · редакция {d.revision}
     </label>)}
    {filteredDrafts.length===0&&<p className="muted">Нет подходящих черновиков.</p>}
   </div>
   {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </AdminWorkspace>}
 </section>;
}
