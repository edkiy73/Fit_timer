import {useEffect,useState} from 'react';
import {z} from 'zod';
import type {AdminSectionContext} from '@appbase/ui-react/admin.js';
import {DocumentContent} from './documents-page';
import {DOCUMENT_LABELS,blockSchema,textToBlocks,blocksToText,type DocumentKey} from './document-model';
import {DOCUMENT_DRAFTS} from './document-drafts';
const draftSchema=z.object({key:z.enum(Object.keys(DOCUMENT_LABELS) as [DocumentKey,...DocumentKey[]]),locale:z.enum(['ru','en']),title:z.string().min(1).max(160),blocks:z.array(blockSchema).min(1).max(80),requiresAccept:z.boolean(),revision:z.number().int().positive()}).strict();
const listSchema=z.object({ok:z.literal(true),drafts:z.array(draftSchema).max(9)}).strict();
type Draft=z.infer<typeof draftSchema>;
export function DocumentsAdmin({client,adminKey}:AdminSectionContext){
 const [locale,setLocale]=useState<'ru'|'en'>('ru'),[key,setKey]=useState<DocumentKey>('terms'),[drafts,setDrafts]=useState<Draft[]>([]),[title,setTitle]=useState(''),[text,setText]=useState(''),[revision,setRevision]=useState(0),[required,setRequired]=useState(true);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reviewed,setReviewed]=useState(false),[refresh,setRefresh]=useState(0),[dirty,setDirty]=useState(false),[preview,setPreview]=useState(false);
 useEffect(()=>{let live=true;setError('');setDrafts([]);setDirty(false);setReviewed(false);setBusy(true);
  client.action(adminKey,'feture.documents.list',{locale}).then(raw=>{if(live)setDrafts(listSchema.parse(raw).drafts);}).catch(()=>{if(live)setError('Не удалось загрузить документы. Проверь подключение хранилища.');}).finally(()=>{if(live)setBusy(false);});return ()=>{live=false;};
 },[client,adminKey,locale,refresh]);
 useEffect(()=>{const draft=drafts.find(d=>d.key===key);setTitle(draft?.title||DOCUMENT_LABELS[key]);setText(draft?blocksToText(draft.blocks):'');setRevision(draft?.revision||0);setRequired(draft?.requiresAccept??true);setDirty(false);setReviewed(false);setNotice('');},[drafts,key]);
 const change=()=>{setDirty(true);setReviewed(false);setNotice('');};
 const mandatory=['terms','privacy','community','adult-content'].includes(key);
 const select=(next:DocumentKey)=>{if(!dirty||window.confirm('Не сохранённый текст будет потерян. Продолжить?'))setKey(next);};
 const save=async()=>{if(busy)return;setBusy(true);setError('');setNotice('');
  try {const content=z.array(blockSchema).min(1).max(80).parse(textToBlocks(text));await client.action(adminKey,'feture.documents.save',{key,locale,expectedRevision:revision,title,blocks:content,requiresAccept:required});setDirty(false);setRefresh(n=>n+1);setNotice('Черновик сохранён.');}
  catch(e){setError(e instanceof z.ZodError?'Заполни текст; не больше 80 блоков и 4000 символов в абзаце.':'Сохранить не удалось. Черновик мог измениться — обнови его перед повтором.');}finally{setBusy(false);}
 };
 const publish=async()=>{if(busy||dirty||!reviewed||!revision)return;setBusy(true);setError('');setNotice('');
  try{await client.action(adminKey,'feture.documents.publish',{key,locale,revision,reviewed:true,effectiveAt:new Date().toISOString()});setReviewed(false);setNotice('Опубликована неизменяемая версия. Изменения и возврат прежнего текста публикуются новой версией.');}
  catch{setError('Опубликовать не удалось. Проверь сохранённую редакцию и повтори.');}finally{setBusy(false);}
 };
 const content=textToBlocks(text);
 return <section className="ft-documents-admin"><h2>Документы FetUre</h2><p>Черновики скрыты от пользователей. Перед публикацией нужны финальные контакты, условия хранения и юридическая редактура. Начальная обязательная редакция — русская; переводы не заменяют согласие с её обновлениями.</p>
  <div className="ft-form-grid"><label>Документ<select value={key} onChange={e=>select(e.target.value as DocumentKey)} disabled={busy}>{Object.entries(DOCUMENT_LABELS).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label><label>Язык<select value={locale} disabled={busy} onChange={e=>{if(!dirty||window.confirm('Не сохранённый текст будет потерян. Продолжить?'))setLocale(e.target.value as 'ru'|'en');}}><option value="ru">Русский</option><option value="en">English</option></select></label></div>
  <label>Заголовок<input value={title} maxLength={160} onChange={e=>{setTitle(e.target.value);change();}} disabled={busy}/></label>
  <label>Текст<textarea rows={16} value={text} onChange={e=>{setText(e.target.value);change();}} disabled={busy} placeholder="Абзацы разделяются пустой строкой. # Заголовок. Строки с - образуют список."/></label>
  <label className="ft-consent-choice"><input type="checkbox" checked={required||mandatory} disabled={busy||mandatory} onChange={e=>{setRequired(e.target.checked);change();}}/>Нужно отдельное согласие пользователя</label>
  {locale==='ru'&&revision===0&&<button type="button" disabled={busy} onClick={()=>{if(!dirty||window.confirm('Заменить форму начальным черновиком?')){setText(DOCUMENT_DRAFTS[key]);setRequired(mandatory);change();}}}>Начальный черновик для редактирования</button>}
  <div className="ft-form-actions"><button type="button" disabled={busy||!dirty||!text.trim()} onClick={()=>void save()}>Сохранить черновик</button><button type="button" onClick={()=>setPreview(p=>!p)}>Предпросмотр</button><button type="button" disabled={busy} onClick={()=>{if(!dirty||window.confirm('Загрузить сохранённый черновик вместо изменений?'))setRefresh(n=>n+1);}}>Обновить</button></div>
  {preview&&<article className="card"><h2>{title}</h2><DocumentContent blocks={content}/></article>}
  <label className="ft-consent-choice"><input type="checkbox" checked={reviewed} disabled={busy||dirty||!revision} onChange={e=>setReviewed(e.target.checked)}/>Точная сохранённая редакция проверена и одобрена для публикации</label>
  <button type="button" disabled={busy||dirty||!reviewed||!revision} onClick={()=>void publish()}>Опубликовать версию</button>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </section>;
}
