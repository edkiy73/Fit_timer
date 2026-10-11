import {useEffect,useMemo,useState} from 'react';
import {z} from 'zod';
import type {AdminSectionContext} from '@appbase/ui-react/admin.js';
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
const topics=catalog.categories.flatMap(category=>category.interests.map(topic=>({...topic,category:category.title})));
const initialId=topics[0]!.id;
const baseline=(id:string):Entry=>{
 const v=published.interests[id as keyof typeof published.interests];
 return {definition:v?.definition??'',synonyms:[...(v?.synonyms??[])],relatedIds:[...(v?.relatedIds??[])]};
};
export function CatalogAdmin({client,adminKey}:AdminSectionContext){
 const [id,setId]=useState(initialId);
 const [drafts,setDrafts]=useState<z.infer<typeof draft>[]>([]);
 const [entry,setEntry]=useState<Entry>(()=>baseline(initialId));
 const [revision,setRevision]=useState(0),[dirty,setDirty]=useState(false),[loading,setLoading]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[query,setQuery]=useState(''),[nextRelated,setNextRelated]=useState('');
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{let active=true;setLoading(true);setError('');
  void client.action(adminKey,'feture.catalog.list',{}).then(data=>{if(active)setDrafts(listSchema.parse(data).drafts);})
   .catch(()=>{if(active)setError('Черновики не загрузились. Проверь подключение сервера.');})
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
 const current=topics.find(t=>t.id===id);
 return <section className="ft-catalog-admin"><h2>Каталог интересов</h2>
  <p>Редакционные черновики скрыты от пользователей. Сейчас можно подготовить определения, синонимы и связанные темы. Публикация и новые версии справочника появятся отдельным этапом.</p>
  <label>Тема<select disabled={loading} value={id} onChange={e=>choose(e.target.value)}>
    {catalog.categories.map(c=><optgroup key={c.id} label={c.title}>{c.interests.map(i=><option key={i.id} value={i.id}>{i.title}{drafts.some(d=>d.interestId===i.id)?' · черновик':''}</option>)}</optgroup>)}
  </select></label>
  <p className="muted">{current?.category} · Редакция {revision||'ещё не сохранена'} · Публичная версия 1</p>
  <label>Определение<textarea disabled={loading} value={entry.definition} maxLength={400} rows={4} onChange={e=>patch(v=>({...v,definition:e.target.value}))}/></label>
  <label>Поисковые синонимы (каждый с новой строки)<textarea disabled={loading} value={entry.synonyms.join('\n')} rows={4}
   onChange={e=>patch(v=>({...v,synonyms:e.target.value.split('\n').map(x=>x.trim()).filter(Boolean)}))}/></label>
  <h3>Связанные темы</h3>
  <div>{entry.relatedIds.map(related=>{const t=topics.find(x=>x.id===related);return <span key={related} className="ft-textbtn">{t?.title??related} <button type="button" disabled={loading} aria-label={'Убрать '+(t?.title??related)} onClick={()=>patch(v=>({...v,relatedIds:v.relatedIds.filter(x=>x!==related)}))}>×</button> </span>;})}</div>
  {entry.relatedIds.length<8&&<><label>Найти связанную тему<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Название или категория"/></label>
   <label>Выбрать тему<select value={nextRelated} onChange={e=>setNextRelated(e.target.value)}><option value="">Выбери тему</option>{relatedOptions.map(t=><option key={t.id} value={t.id}>{t.title} · {t.category}</option>)}</select></label>
   <button type="button" disabled={!nextRelated||loading} onClick={()=>{if(nextRelated&&relatedOptions.some(t=>t.id===nextRelated))patch(v=>({...v,relatedIds:[...v.relatedIds,nextRelated]}));setNextRelated('');}}>Добавить связь</button></>}
  <div className="ft-form-actions"><button type="button" disabled={!dirty||loading} onClick={()=>void save()}>{loading?'Сохраняем…':'Сохранить черновик'}</button>
   <button type="button" disabled={loading} onClick={()=>{if(!dirty||window.confirm('Текущие изменения будут потеряны. Обновить черновики?'))setRefresh(n=>n+1);}}>Обновить данные</button></div>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <p className="muted">Проверка редакции и публикация — отдельный этап W01.2. Черновики не входят в ответы публичного API и не меняют личную карту.</p>
 </section>;
}
