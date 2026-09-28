import { useCallback, useEffect, useState } from 'react';
import type { AdminSection, AdminSectionContext } from '@appbase/ui-react/admin.js';

type Status = {
  source?: {sha?:string;url?:string};
  release?: {revision?:number;publishedAt?:string;sets?:Record<string,number>;lexiconRevision?:number}|null;
  course?: {draft?: Record<string,unknown>|null;published?: Record<string,unknown>|null};
  lexicon?: {draft?: Record<string,unknown>|null;published?: Record<string,unknown>|null};
};

type ReviewItem = {
  lexemeId:string;
  revision:number;
  lemma:string;
  senses:Array<{senseId:string;partOfSpeech?:string|null;translations:Record<string,string[]>}>;
};

type LexemeSense = {
  id:string;
  partOfSpeech?:string|undefined;
  translations:Record<string,string[]>;
  note?:Record<string,string>;
  tags?:string[];
};

type LexemeEditor = {
  id:string;
  revision:number;
  lemma:string;
  senses:LexemeSense[];
  examples?:Array<{id:string;senseId:string;text:string;translations:Record<string,string>}>;
};

function ContentAdmin({client,adminKey}: AdminSectionContext){
  const [status,setStatus]=useState<Status|null>(null);
  const [review,setReview]=useState<ReviewItem[]>([]);
  const [report,setReport]=useState<Record<string,unknown>|null>(null);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [query,setQuery]=useState('');
  const [editor,setEditor]=useState<LexemeEditor|null>(null);
  const [editorMessage,setEditorMessage]=useState('');
  const [editorBusy,setEditorBusy]=useState(false);

  const load=useCallback(async()=>{
    setBusy(true);
    setMessage('');
    try{
      const [s,q]=await Promise.all([
        client.action(adminKey,'content_status'),
        client.action(adminKey,'content_review_queue').catch(()=>({items:[]}))
      ]);
      setStatus(s as Status);
      setReview(Array.isArray(q.items) ? q.items as ReviewItem[] : []);
    }catch(error){
      setMessage(String((error as {code?:string})?.code || 'Не удалось загрузить статус контента.'));
    }finally{
      setBusy(false);
    }
  },[client,adminKey]);

  useEffect(()=>{void load();},[load]);

  async function importLegacy(overwrite=false){
    setBusy(true);
    setMessage('');
    setReport(null);
    try{
      const result=await client.action(adminKey,'content_legacy_import',overwrite ? {overwrite:true} : undefined);
      setReport((result.report || {}) as Record<string,unknown>);
      setMessage('Legacy импортирован в draft. Пользователям ничего не опубликовано.');
      setEditor(null);
      await load();
    }catch(error){
      const code=String((error as {code?:string})?.code || 'request_failed');
      if(code==='draft_exists_use_overwrite' && !overwrite){
        const ok=window.confirm('Draft уже существует. Повторный импорт заменит текущие draft курса и словаря, включая ручные правки. Продолжить?');
        if(ok) await importLegacy(true);
        return;
      }
      setMessage('Ошибка импорта: '+code);
    }finally{
      setBusy(false);
    }
  }

  async function publish(){
    const ok=window.confirm('Опубликовать текущие draft курса и словаря? Это создаст новые immutable revisions для пользователей.');
    if(!ok)return;
    setBusy(true);
    setMessage('');
    try{
      const result=await client.action(adminKey,'content_publish');
      const course=(result.course || {}) as {revision?:unknown};
      const lexicon=(result.lexicon || {}) as {revision?:unknown};
      setMessage('Опубликовано: курс r'+String(course.revision||'?')+', словарь r'+String(lexicon.revision||'?')+'.');
      await load();
    }catch(error){
      setMessage('Ошибка публикации: '+String((error as {code?:string})?.code || 'request_failed'));
    }finally{
      setBusy(false);
    }
  }

  async function openLexeme(id:string){
    setEditorBusy(true);
    setEditorMessage('');
    try{
      const result=await client.action(adminKey,'content_lexeme_get',{lexemeId:id});
      setEditor(result.lexeme as LexemeEditor);
    }catch(error){
      setEditorMessage('Не удалось открыть: '+String((error as {code?:string})?.code || 'request_failed'));
    }finally{
      setEditorBusy(false);
    }
  }

  function updateSense(index:number, patch:Partial<LexemeSense>){
    setEditor(current=>{
      if(!current)return current;
      const senses=current.senses.slice();
      senses[index]={...senses[index]!,...patch};
      return {...current,senses};
    });
  }

  function setSenseTranslations(index:number,value:string){
    const list=value.split(/[,;\n]/).map(item=>item.trim()).filter(Boolean);
    const current=editor?.senses[index];
    if(!current)return;
    updateSense(index,{translations:{...current.translations,ru:list}});
  }

  function addSense(){
    setEditor(current=>{
      if(!current)return current;
      const used=new Set(current.senses.map(sense=>sense.id));
      let n=current.senses.length+1;
      while(used.has('sense-'+n))n++;
      return {...current,senses:[...current.senses,{id:'sense-'+n,translations:{ru:['']},tags:['needs-review']}]};
    });
  }

  function removeSense(index:number){
    setEditor(current=>{
      if(!current || current.senses.length<=1)return current;
      const sense=current.senses[index];
      if(current.examples?.some(example=>example.senseId===sense?.id)){
        setEditorMessage('Нельзя удалить значение: к нему привязаны примеры. Сначала перенеси или удали примеры.');
        return current;
      }
      return {...current,senses:current.senses.filter((_,i)=>i!==index)};
    });
  }

  async function saveLexeme(reviewed:boolean){
    if(!editor)return;
    if(editor.senses.some(sense=>!(sense.translations.ru || []).some(Boolean))){
      setEditorMessage('У каждого значения должен быть хотя бы один перевод.');
      return;
    }
    setEditorBusy(true);
    setEditorMessage('');
    try{
      const result=await client.action(adminKey,'content_lexeme_save',{
        lexemeId:editor.id,
        expectedRevision:editor.revision,
        reviewed,
        changes:{senses:editor.senses}
      });
      setEditor(result.lexeme as LexemeEditor);
      setEditorMessage(reviewed ? 'Сохранено и отмечено проверенным.' : 'Сохранено в draft.');
      await load();
      if(reviewed)setEditor(null);
    }catch(error){
      const code=String((error as {code?:string})?.code || 'request_failed');
      setEditorMessage(code==='lexeme_revision_conflict'
        ? 'Эту запись уже изменили в другой вкладке. Открой её заново.'
        : 'Ошибка сохранения: '+code);
    }finally{
      setEditorBusy(false);
    }
  }

  const filteredReview=review.filter(item=>{
    const q=query.trim().toLowerCase();
    if(!q)return true;
    return item.lemma.toLowerCase().includes(q)
      || item.senses.some(sense=>(sense.translations.ru || []).some(value=>value.toLowerCase().includes(q)));
  });

  const cd=status?.course?.draft;
  const cp=status?.course?.published;
  const ld=status?.lexicon?.draft;
  const lp=status?.lexicon?.published;

  return (
    <>
      <article className="ab-admin-panel">
        <div className="ab-admin-section-head">
          <div>
            <h2>Контент курса</h2>
            <p className="ab-admin-note">Legacy source: <code>{status?.source?.sha?.slice(0,12) || '…'}</code>. Импорт всегда создаёт draft.</p>
          </div>
          <button type="button" className="ab-admin-secondary" disabled={busy} onClick={()=>void load()}>Обновить</button>
        </div>

        <div className="ab-admin-status-line">
          <span><b>Release</b> {status?.release ? 'r'+String(status.release.revision ?? 0) : 'нет'}</span>
          <span><b>Курс draft</b> {cd ? 'r'+String(cd.revision ?? 0)+' · '+String(cd.activities ?? 0) : 'нет'}</span>
          <span><b>Курс live</b> {cp ? 'r'+String(cp.revision ?? 0) : 'нет'}</span>
          <span><b>Словарь draft</b> {ld ? String(ld.entries ?? 0) : 'нет'}</span>
          <span><b>Словарь live</b> {lp ? 'r'+String(lp.revision ?? 0) : 'нет'}</span>
        </div>

        <div className="ab-admin-action-row">
          <button type="button" disabled={busy} onClick={()=>void importLegacy(false)}>Импортировать legacy</button>
          <button type="button" className="ab-admin-secondary" disabled={busy || !cd || !ld} onClick={()=>void publish()}>Опубликовать release</button>
        </div>

        {message && <p role="status" className="ab-admin-feedback">{message}</p>}
        {report && (
          <details className="ab-admin-details">
            <summary>Отчёт последнего импорта</summary>
            <pre className="ab-admin-json">{JSON.stringify(report,null,2)}</pre>
          </details>
        )}
      </article>

      <article className="ab-admin-panel">
        <div className="ab-admin-section-head">
          <div>
            <h2>Словарь: требует проверки ({review.length})</h2>
            <p className="ab-admin-note">Неоднозначные legacy-значения. До проверки приложение показывает варианты и не угадывает смысл.</p>
          </div>
        </div>

        {review.length ? (
          <>
            <div className="ab-admin-toolbar">
              <input
                type="search"
                value={query}
                onChange={event=>setQuery(event.target.value)}
                placeholder="Найти слово или перевод"
                aria-label="Поиск по словарю"
              />
              <span>{filteredReview.length} из {review.length}</span>
            </div>
            <div className="ab-admin-table-wrap">
              <table>
                <thead><tr><th>Слово</th><th>Значения</th><th></th></tr></thead>
                <tbody>{filteredReview.map(item=>(
                  <tr key={item.lexemeId}>
                    <td data-label="Слово"><strong>{item.lemma}</strong><div className="ab-admin-cell-sub">{item.lexemeId}</div></td>
                    <td data-label="Значения">{item.senses.map(s=>s.translations.ru?.join(', ') || '—').join(' · ')}</td>
                    <td className="ab-admin-cell-action">
                      <button type="button" className="ab-admin-secondary" disabled={editorBusy} onClick={()=>void openLexeme(item.lexemeId)}>Изменить</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        ) : <p className="ab-admin-empty">Очередь пуста.</p>}
      </article>

      {editor && (
        <article className="ab-admin-panel">
          <div className="ab-admin-section-head">
            <div>
              <h2>{editor.lemma}</h2>
              <p className="ab-admin-note"><code>{editor.id}</code> · revision {editor.revision}</p>
            </div>
            <button type="button" className="ab-admin-secondary" onClick={()=>setEditor(null)}>Закрыть</button>
          </div>

          <div className="ab-admin-sense-list">
            {editor.senses.map((sense,index)=>(
              <section className="ab-admin-sense" key={sense.id}>
                <div className="ab-admin-sense-head">
                  <strong>{sense.id}</strong>
                  {editor.senses.length>1 && (
                    <button type="button" className="ab-admin-secondary" onClick={()=>removeSense(index)}>Удалить</button>
                  )}
                </div>
                <label>
                  <span>Часть речи</span>
                  <select value={sense.partOfSpeech || ''} onChange={event=>{
                    const value=event.target.value;
                    if(value) updateSense(index,{partOfSpeech:value});
                    else setEditor(current=>{
                      if(!current)return current;
                      const senses=current.senses.slice();
                      const next={...senses[index]!};
                      delete next.partOfSpeech;
                      senses[index]=next;
                      return {...current,senses};
                    });
                  }}>
                    <option value="">Не указана</option>
                    <option value="noun">noun</option>
                    <option value="verb">verb</option>
                    <option value="adjective">adjective</option>
                    <option value="adverb">adverb</option>
                    <option value="pronoun">pronoun</option>
                    <option value="preposition">preposition</option>
                    <option value="conjunction">conjunction</option>
                    <option value="determiner">determiner</option>
                    <option value="modal">modal</option>
                    <option value="interjection">interjection</option>
                    <option value="phrase">phrase</option>
                    <option value="other">other</option>
                  </select>
                </label>
                <label>
                  <span>Переводы</span>
                  <textarea
                    rows={2}
                    value={(sense.translations.ru || []).join(', ')}
                    onChange={event=>setSenseTranslations(index,event.target.value)}
                    placeholder="Переводы через запятую"
                  />
                </label>
              </section>
            ))}
          </div>

          <div className="ab-admin-action-row">
            <button type="button" className="ab-admin-secondary" disabled={editorBusy} onClick={addSense}>+ Значение</button>
            <button type="button" className="ab-admin-secondary" disabled={editorBusy} onClick={()=>void saveLexeme(false)}>Сохранить draft</button>
            <button type="button" disabled={editorBusy} onClick={()=>void saveLexeme(true)}>Сохранить и проверить</button>
          </div>
          {editorMessage && <p className="ab-admin-feedback" role="status">{editorMessage}</p>}
        </article>
      )}
    </>
  );
}

export const contentAdminSection: AdminSection = {
  id:'content',
  label:'Курс и словарь',
  group:'Контент',
  render(context){ return <ContentAdmin {...context} />; }
};
