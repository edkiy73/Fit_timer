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
  lemma:string;
  senses:Array<{senseId:string;translations:Record<string,string[]>}>;
};

function ContentAdmin({client,adminKey}: AdminSectionContext){
  const [status,setStatus]=useState<Status|null>(null);
  const [review,setReview]=useState<ReviewItem[]>([]);
  const [report,setReport]=useState<Record<string,unknown>|null>(null);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);

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

  async function importLegacy(){
    setBusy(true);
    setMessage('');
    setReport(null);
    try{
      const result=await client.action(adminKey,'content_legacy_import');
      setReport((result.report || {}) as Record<string,unknown>);
      setMessage('Legacy импортирован в draft. Пользователям ничего не опубликовано.');
      await load();
    }catch(error){
      setMessage('Ошибка импорта: '+String((error as {code?:string})?.code || 'request_failed'));
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

  const cd=status?.course?.draft;
  const cp=status?.course?.published;
  const ld=status?.lexicon?.draft;
  const lp=status?.lexicon?.published;

  return (
    <>
      <article className="ab-admin-panel">
        <h2>Контент курса</h2>
        <p className="ab-admin-empty">Источник legacy зафиксирован на commit <code>{status?.source?.sha?.slice(0,12) || '…'}</code>. Импорт всегда идёт сначала в draft.</p>
        <div className="ab-admin-grid">
          <div className="ab-admin-card"><span>Release</span><strong>{status?.release ? 'r'+String(status.release.revision ?? 0) : 'не опубликован'}</strong></div>
          <div className="ab-admin-card"><span>Course draft</span><strong>{cd ? 'r'+String(cd.revision ?? 0)+' · '+String(cd.activities ?? 0)+' activities' : 'нет'}</strong></div>
          <div className="ab-admin-card"><span>Course published</span><strong>{cp ? 'r'+String(cp.revision ?? 0) : 'нет'}</strong></div>
          <div className="ab-admin-card"><span>Lexicon draft</span><strong>{ld ? String(ld.entries ?? 0)+' entries' : 'нет'}</strong></div>
          <div className="ab-admin-card"><span>Lexicon published</span><strong>{lp ? 'r'+String(lp.revision ?? 0) : 'нет'}</strong></div>
        </div>
        <div className="ab-admin-row">
          <button type="button" disabled={busy} onClick={()=>void importLegacy()}>Импортировать legacy в draft</button>
          <button type="button" className="ab-admin-secondary" disabled={busy || !cd || !ld} onClick={()=>void publish()}>Опубликовать draft</button>
          <button type="button" className="ab-admin-secondary" disabled={busy} onClick={()=>void load()}>Обновить</button>
        </div>
        {message && <p role="status" className="ab-admin-empty">{message}</p>}
        {report && <pre className="ab-admin-json">{JSON.stringify(report,null,2)}</pre>}
      </article>

      <article className="ab-admin-panel">
        <h2>Словарь: требует проверки ({review.length})</h2>
        <p className="ab-admin-empty">Это неоднозначные значения из legacy. Они сохранены, но приложение не должно угадывать смысл автоматически.</p>
        {review.length ? (
          <div className="ab-admin-table-wrap">
            <table>
              <thead><tr><th>Слово</th><th>Значения</th><th>ID</th></tr></thead>
              <tbody>{review.map(item=>(
                <tr key={item.lexemeId}>
                  <td><strong>{item.lemma}</strong></td>
                  <td>{item.senses.map(s=>s.translations.ru?.join(', ') || '—').join(' · ')}</td>
                  <td><code>{item.lexemeId}</code></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="ab-admin-empty">Очередь пуста.</p>}
      </article>
    </>
  );
}

export const contentAdminSection: AdminSection = {
  id:'content',
  label:'Контент',
  render(context){ return <ContentAdmin {...context} />; }
};
