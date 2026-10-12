import {useEffect,useState} from 'react';
import {z} from 'zod';
import type {AdminSectionContext} from '@appbase/ui-react/admin.js';
import {AdminWorkspace} from '@appbase/ui-react/admin-workspace.js';
import {DocumentContent} from './documents-page';
import {DOCUMENT_LABELS,blockSchema,textToBlocks,blocksToText,type DocumentKey} from './document-model';
import {DOCUMENT_DRAFTS} from './document-drafts';
import './documents-admin.css';
const draftSchema=z.object({key:z.enum(Object.keys(DOCUMENT_LABELS) as [DocumentKey,...DocumentKey[]]),locale:z.enum(['ru','en']),title:z.string().min(1).max(160),blocks:z.array(blockSchema).min(1).max(80),requiresAccept:z.boolean(),revision:z.number().int().positive()}).strict();
const listSchema=z.object({ok:z.literal(true),drafts:z.array(draftSchema).max(9)}).strict();
type Draft=z.infer<typeof draftSchema>;
export function DocumentsAdmin({client,adminKey}:AdminSectionContext){
 const [locale,setLocale]=useState<'ru'|'en'>('ru'),[key,setKey]=useState<DocumentKey>('terms'),[drafts,setDrafts]=useState<Draft[]>([]),[title,setTitle]=useState(''),[text,setText]=useState(''),[revision,setRevision]=useState(0),[required,setRequired]=useState(true);
 const [open,setOpen]=useState(false),[view,setView]=useState<'edit'|'preview'|'publish'>('edit');
 const [query,setQuery]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reviewed,setReviewed]=useState(false),[refresh,setRefresh]=useState(0),[dirty,setDirty]=useState(false);
 useEffect(()=>{let live=true;setError('');setDrafts([]);setDirty(false);setReviewed(false);setBusy(true);
  client.action(adminKey,'feture.documents.list',{locale}).then(raw=>{if(live)setDrafts(listSchema.parse(raw).drafts);}).catch(()=>{if(live)setError('Не удалось загрузить документы. Проверь подключение хранилища.');}).finally(()=>{if(live)setBusy(false);});return ()=>{live=false;};
 },[client,adminKey,locale,refresh]);
 useEffect(()=>{const draft=drafts.find(d=>d.key===key);setTitle(draft?.title||DOCUMENT_LABELS[key]);setText(draft?blocksToText(draft.blocks):'');setRevision(draft?.revision||0);setRequired(draft?.requiresAccept??true);setDirty(false);setReviewed(false);setNotice('');},[drafts,key]);
 const change=()=>{setDirty(true);setReviewed(false);setNotice('');};
 const mandatory=['terms','privacy','community','adult-content'].includes(key);
 const select=(next:DocumentKey)=>{if(next!==key&&dirty&&!window.confirm('Несохранённый текст будет потерян. Продолжить?'))return false;setKey(next);return true;};
 const save=async()=>{if(busy)return;setBusy(true);setError('');setNotice('');
  try {const content=z.array(blockSchema).min(1).max(80).parse(textToBlocks(text));await client.action(adminKey,'feture.documents.save',{key,locale,expectedRevision:revision,title,blocks:content,requiresAccept:required});setDirty(false);setRefresh(n=>n+1);setNotice('Черновик сохранён.');}
  catch(e){setError(e instanceof z.ZodError?'Заполни текст; не больше 80 блоков и 4000 символов в абзаце.':'Сохранить не удалось. Черновик мог измениться — обнови его перед повтором.');}finally{setBusy(false);}
 };
 const publish=async()=>{if(busy||dirty||!reviewed||!revision)return;setBusy(true);setError('');setNotice('');
  try{await client.action(adminKey,'feture.documents.publish',{key,locale,revision,reviewed:true,effectiveAt:new Date().toISOString()});setReviewed(false);setNotice('Опубликована неизменяемая версия. Изменения и возврат прежнего текста публикуются новой версией.');}
  catch{setError('Опубликовать не удалось. Проверь сохранённую редакцию и повтори.');}finally{setBusy(false);}
 };
 const content=textToBlocks(text);
 const close=()=>{
  if(busy)return;
  if(dirty&&!window.confirm('Закрыть редактор без сохранения? Несохранённые изменения будут потеряны.'))return;
  setOpen(false);setView('edit');
  if(dirty)setRefresh(n=>n+1);
 };
 const choose=(next:DocumentKey)=>{if(!select(next))return;setView('edit');setOpen(true);};
 const visibleDocuments=(Object.entries(DOCUMENT_LABELS) as [DocumentKey,string][]).filter(([docKey,label])=>(label+' '+docKey).toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')));
 return <section className="ft-documents-admin">
  <div className="ab-admin-section-head"><div><h2>Документы FetUre</h2><p className="muted">Управляй черновиками и проверяй текст до публикации. Черновики не видны пользователям.</p></div></div>
  <div className="ft-document-toolbar">
   <label>Поиск по документам<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Название документа" aria-label="Найти документ"/></label>
   <label>Язык<select value={locale} disabled={busy} onChange={e=>{if(!dirty||window.confirm('Несохранённый текст будет потерян. Продолжить?'))setLocale(e.target.value as 'ru'|'en');}}><option value="ru">Русский</option><option value="en">English</option></select></label>
   <p role="status" aria-live="polite">{visibleDocuments.length} из {Object.keys(DOCUMENT_LABELS).length} · сохранено: {drafts.length}</p>
  </div>
  {busy&&!open&&<p role="status" className="muted">Загружаем документы…</p>}
  <div className="ab-admin-item-list ft-document-grid">
   {visibleDocuments.map(([docKey,label],index)=>{
    const stored=drafts.find(x=>x.key===docKey);
    const ordinal=Object.keys(DOCUMENT_LABELS).indexOf(docKey)+1;
    return <button type="button" key={docKey} onClick={()=>choose(docKey)} disabled={busy} className="ft-document-card">
     <span className="ft-document-card-number" aria-hidden="true">{String(ordinal).padStart(2,'0')}</span>
     <span className="ft-document-card-copy"><strong>{label}</strong><small>{stored?'Сохранённая редакция '+stored.revision:'Черновик не сохранён'} · {locale.toUpperCase()}</small></span>
     <span className={'ft-document-card-state'+(stored?' is-saved':'')}>{stored?'Черновик':'Создать'}</span>
     <span aria-hidden="true" className="ft-document-card-arrow">→</span>
    </button>;
   })}
  </div>
  {!busy&&visibleDocuments.length===0&&<p className="ft-document-empty" role="status">По этому запросу ничего нет. Попробуй другое название.</p>}
  {error&&<p role="alert">{error}</p>}{!open&&notice&&<p role="status">{notice}</p>}
  {open&&<AdminWorkspace title={DOCUMENT_LABELS[key]} subtitle={locale.toUpperCase()+' · редакция '+(revision||'не сохранена')} onClose={close}
   footer={<><button type="button" className="ab-admin-secondary" onClick={close}>Закрыть</button>
    {view==='edit'&&<button type="button" disabled={busy||!dirty||!text.trim()} onClick={()=>void save()}>Сохранить черновик</button>}
    {view==='publish'&&<button type="button" disabled={busy||dirty||!reviewed||!revision} onClick={()=>void publish()}>Опубликовать версию</button>}
   </>}>
   <div className="ft-document-workbench">
   <div className="ab-admin-workspace-tabs" role="group" aria-label="Режим редактора">
    <button type="button" aria-pressed={view==='edit'} onClick={()=>setView('edit')}>Редактировать</button>
    <button type="button" aria-pressed={view==='preview'} onClick={()=>setView('preview')}>Предпросмотр</button>
    <button type="button" aria-pressed={view==='publish'} onClick={()=>setView('publish')}>Публикация</button>
   </div>
   {view==='edit'&&<>
    <p className="ft-document-edit-intro">Редактируй текст черновика. Публикация — отдельный шаг после проверки сохранённой версии.</p>
    <div className="ft-document-editor-fields">
     <label>Заголовок<input value={title} maxLength={160} onChange={e=>{setTitle(e.target.value);change();}} disabled={busy}/></label>
     <label>Текст<textarea rows={14} value={text} onChange={e=>{setText(e.target.value);change();}} disabled={busy} placeholder="Абзацы разделяются пустой строкой. # Заголовок. Строки с - образуют список."/></label>
    </div>
    <details className="ft-document-guide"><summary>Как оформить текст</summary><p>Пустая строка разделяет абзацы. Начни строку с «# » для заголовка или с «- » для пункта списка. Перед публикацией проверь юридические формулировки, контакты и условия хранения.</p></details>
    <label className="ft-consent-choice ft-document-consent"><input type="checkbox" checked={required||mandatory} disabled={busy||mandatory} onChange={e=>{setRequired(e.target.checked);change();}}/><span>Нужно отдельное согласие пользователя{mandatory?' · обязательно для этого документа':''}</span></label>
    {locale==='ru'&&revision===0&&<button type="button" disabled={busy} onClick={()=>{if(!dirty||window.confirm('Заменить форму начальным черновиком?')){setText(DOCUMENT_DRAFTS[key]);setRequired(mandatory);change();}}}>Вставить начальный черновик</button>}
    <div className="ft-form-actions"><button type="button" className="ab-admin-secondary" disabled={busy} onClick={()=>{if(!dirty||window.confirm('Загрузить сохранённый черновик вместо изменений?'))setRefresh(n=>n+1);}}>Сбросить изменения / обновить</button></div>
   </>}
   {view==='preview'&&<section className="ft-document-preview"><p className="ft-document-preview-caption">Предпросмотр черновика · не опубликованная версия</p><article className="card"><h2>{title}</h2>{text.trim()?<DocumentContent blocks={content}/>:<p>Нет текста для предпросмотра.</p>}</article></section>}
   {view==='publish'&&<section className="ft-document-publish">
    <h3>Проверка перед публикацией</h3>
    <p>Публикуется только сохранённая редакция {revision||'—'}. После публикации текст неизменяем: следующие правки потребуют новой версии.</p>
    {dirty?<p role="status">Сначала сохрани изменения на вкладке «Редактировать».</p>:null}
    {!revision?<p role="status">Сначала создай и сохрани черновик документа.</p>:null}
    <label className="ft-consent-choice"><input type="checkbox" checked={reviewed} disabled={busy||dirty||!revision} onChange={e=>setReviewed(e.target.checked)}/><span>Точная сохранённая редакция проверена и одобрена для публикации. Обязательные документы потребуют согласия пользователей.</span></label>
   </section>}
   {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
   </div>
  </AdminWorkspace>}
 </section>;
}
