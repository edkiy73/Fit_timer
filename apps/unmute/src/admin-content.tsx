import { useCallback, useEffect, useState } from 'react';
import type { AdminSection, AdminSectionContext } from '@appbase/ui-react/admin.js';

type Status = {
  source?: {sha?:string;url?:string};
  release?: {revision?:number;publishedAt?:string;sets?:Record<string,number>;lexiconRevision?:number}|null;
  course?: {draft?: Record<string,unknown>|null;published?: Record<string,unknown>|null};
  lexicon?: {draft?: Record<string,unknown>|null;published?: Record<string,unknown>|null};
};

type ReleaseSet = {
  id:string;
  title:Record<string,string>;
  draftRevision:number|null;
  publishedRevision:number|null;
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

type CoverageSummary = {
  uniqueSurfaces?:number;
  resolvedSurfaces?:number;
  missingSurfaces?:number;
  coveragePct?:number;
  ipaCoveragePct?:number;
  ruReadingCoveragePct?:number;
  exampleCoveragePct?:number;
};

type BulkPreview = {
  summary?:{requested?:number;creates?:number;updates?:number;conflicts?:number;warnings?:number};
  conflicts?:Array<{lemma?:string;surface?:string;code?:string;detail?:string}>;
  warnings?:string[];
  changes?:Array<{id?:string;kind?:string;lemma?:string;forms?:string[];examples?:number}>;
  coverage?:CoverageSummary;
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
  const [sets,setSets]=useState<ReleaseSet[]>([]);
  const [publishSetIds,setPublishSetIds]=useState<string[]>([]);
  const [bulkSetId,setBulkSetId]=useState('general-foundation');
  const [bulkLimit,setBulkLimit]=useState(50);
  const [bulkMode,setBulkMode]=useState<'missing'|'enrich'>('missing');
  const [bulkPrompt,setBulkPrompt]=useState('');
  const [bulkText,setBulkText]=useState('');
  const [bulkCoverage,setBulkCoverage]=useState<CoverageSummary|null>(null);
  const [bulkPreview,setBulkPreview]=useState<BulkPreview|null>(null);
  const [bulkMessage,setBulkMessage]=useState('');
  const [bulkBusy,setBulkBusy]=useState(false);
  const [ipaReport,setIpaReport]=useState<{forms:number;alreadyHaveIpa:number;sourceMatches:number;updatedForms:number;unmatched:number;updatedLexemes:number}|null>(null);

  const load=useCallback(async()=>{
    setBusy(true);
    setMessage('');
    try{
      const [s,q,setResult]=await Promise.all([
        client.action(adminKey,'content_status'),
        client.action(adminKey,'content_review_queue').catch(()=>({items:[]})),
        client.action(adminKey,'content_sets_list').catch(()=>({sets:[]}))
      ]);
      setStatus(s as Status);
      setReview(Array.isArray(q.items) ? q.items as ReviewItem[] : []);
      const nextSets=Array.isArray(setResult.sets) ? setResult.sets as ReleaseSet[] : [];
      setSets(nextSets);
      setBulkSetId(current=>nextSets.some(item=>item.id===current)
        ? current
        : (nextSets.find(item=>item.id==='general-foundation')?.id || nextSets[0]?.id || 'general-foundation'));
      setPublishSetIds(current=>{
        const valid=current.filter(id=>nextSets.some(item=>item.id===id&&item.draftRevision));
        if(valid.length)return valid;
        const general=nextSets.find(item=>item.id==='general-foundation'&&item.draftRevision);
        return general ? [general.id] : nextSets.filter(item=>item.draftRevision).slice(0,1).map(item=>item.id);
      });
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

  // The small A1 course lives in code (lib/a1-starter-course.mjs); this refreshes its draft.
  async function seedA1(){
    setBusy(true);
    setMessage('');
    try{
      await client.action(adminKey,'content_a1_seed');
      await load();
      setPublishSetIds(['a1-starter']);
      setMessage('Курс A1 загружен в draft. Он уже отмечен ниже — нажми «Опубликовать release». Опубликованные курсы останутся.');
    }catch(error){
      setMessage('Ошибка загрузки A1: '+String((error as {code?:string})?.code || 'request_failed'));
    }finally{
      setBusy(false);
    }
  }

  // «Ты вчера работал?» → «работал(а)» in the main course draft; publishing stays a separate click.
  async function fixGender(){
    setBusy(true);
    setMessage('');
    try{
      const result=await client.action(adminKey,'content_gender_fix',{setId:'general-foundation'});
      await load();
      const changed=Number(result.changed)||0;
      if(changed){
        setPublishSetIds(['general-foundation']);
        setMessage('Исправлено мест: '+changed+'. Основной курс уже отмечен ниже — нажми «Опубликовать release».');
      }else{
        setMessage('Исправлять нечего: все обращения уже подходят и мужчинам, и женщинам.');
      }
    }catch(error){
      setMessage('Не удалось исправить: '+String((error as {code?:string})?.code || 'request_failed'));
    }finally{
      setBusy(false);
    }
  }

  async function publish(){
    if(!publishSetIds.length){setMessage('Выбери хотя бы один set для публикации.');return;}
    const names=sets.filter(item=>publishSetIds.includes(item.id)).map(item=>item.title.ru||item.id).join(', ');
    const ok=window.confirm('Опубликовать выбранные set ('+names+') и текущий draft словаря одним release?');
    if(!ok)return;
    setBusy(true);
    setMessage('');
    try{
      const result=await client.action(adminKey,'content_publish',{setIds:publishSetIds});
      const lexicon=(result.lexicon || {}) as {revision?:unknown};
      const release=(result.release || {}) as {revision?:unknown};
      setMessage('Опубликован release r'+String(release.revision||'?')+': '+publishSetIds.length+' set, словарь r'+String(lexicon.revision||'?')+'.');
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

  async function runIpaBootstrap(apply:boolean){
    setBulkBusy(true);
    setBulkMessage('');
    try{
      const result=await client.action(adminKey,'content_lexicon_ipa_bootstrap',{apply});
      const report=(result.report || null) as typeof ipaReport;
      setIpaReport(report);
      setBulkMessage(apply
        ? 'IPA добавлен в draft: '+String(report?.updatedForms || 0)+' форм.'
        : 'Можно добавить IPA для '+String(report?.updatedForms || 0)+' форм без перезаписи существующих данных.');
      if(apply) await load();
    }catch(error){
      setBulkMessage('Ошибка IPA: '+String((error as {code?:string})?.code || 'request_failed'));
    }finally{
      setBulkBusy(false);
    }
  }

  async function buildBulkPrompt(){
    setBulkBusy(true);
    setBulkMessage('');
    setBulkPreview(null);
    try{
      const result=await client.action(adminKey,'content_lexicon_ai_prompt',{
        setId:bulkSetId,
        limit:bulkLimit,
        mode:bulkMode
      });
      setBulkPrompt(String(result.prompt || ''));
      setBulkCoverage((result.coverage || null) as CoverageSummary|null);
      setBulkMessage('Собрано '+String(result.targetCount || 0)+(bulkMode==='missing'?' недостающих форм.':' записей для обогащения.')+' Скопируй prompt в ИИ и вставь JSON-ответ ниже.');
    }catch(error){
      setBulkMessage('Не удалось собрать prompt: '+String((error as {code?:string})?.code || 'request_failed'));
    }finally{
      setBulkBusy(false);
    }
  }

  async function copyBulkPrompt(){
    if(!bulkPrompt)return;
    try{
      await navigator.clipboard.writeText(bulkPrompt);
      setBulkMessage('Prompt скопирован.');
    }catch(_){
      setBulkMessage('Не удалось скопировать автоматически — выдели текст вручную.');
    }
  }

  async function previewBulkPatch(){
    if(!bulkText.trim()){setBulkMessage('Вставь JSON-ответ ИИ.');return;}
    setBulkBusy(true);
    setBulkMessage('');
    try{
      const result=await client.action(adminKey,'content_lexicon_patch_preview',{
        setId:bulkSetId,
        text:bulkText
      });
      setBulkPreview(result as BulkPreview);
      setBulkCoverage((result.coverage || null) as CoverageSummary|null);
      const summary=(result.summary || {}) as Record<string,unknown>;
      setBulkMessage('Проверено: '+String(summary.creates||0)+' новых, '+String(summary.updates||0)+' обновлений, '+String(summary.conflicts||0)+' конфликтов.');
    }catch(error){
      setBulkPreview(null);
      setBulkMessage('Ошибка проверки: '+String((error as {code?:string})?.code || 'request_failed'));
    }finally{
      setBulkBusy(false);
    }
  }

  async function applyBulkPatch(){
    if(!bulkText.trim() || !bulkPreview)return;
    if((bulkPreview.summary?.conflicts || 0)>0){
      setBulkMessage('Сначала исправь конфликты — пачка не будет применена частично.');
      return;
    }
    const ok=window.confirm('Применить эту пачку к draft словаря? Live release не изменится.');
    if(!ok)return;
    setBulkBusy(true);
    setBulkMessage('');
    try{
      const result=await client.action(adminKey,'content_lexicon_patch_apply',{
        setId:bulkSetId,
        text:bulkText
      });
      setBulkCoverage((result.coverage || null) as CoverageSummary|null);
      setBulkPreview(null);
      setBulkText('');
      setBulkPrompt('');
      setBulkMessage('Применено '+String(result.applied || 0)+' записей в draft. Live release не затронут.');
      await load();
    }catch(error){
      setBulkMessage('Ошибка применения: '+String((error as {code?:string})?.code || 'request_failed'));
    }finally{
      setBulkBusy(false);
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

        <div className="ab-release-set-list">
          {sets.map(item=><label key={item.id}>
            <input
              type="checkbox"
              checked={publishSetIds.includes(item.id)}
              disabled={!item.draftRevision}
              onChange={event=>setPublishSetIds(current=>event.target.checked
                ? [...new Set([...current,item.id])]
                : current.filter(id=>id!==item.id))}
            />
            <span><b>{item.title.ru || item.id}</b><small>{item.draftRevision ? 'draft r'+item.draftRevision : 'нет draft'} · {item.publishedRevision ? 'live r'+item.publishedRevision : 'не опубликован'}</small></span>
          </label>)}
        </div>

        <div className="ab-admin-action-row">
          <button type="button" disabled={busy} onClick={()=>void importLegacy(false)}>Импортировать legacy</button>
          <button type="button" className="ab-admin-secondary" disabled={busy} onClick={()=>void seedA1()}>Загрузить курс A1 в draft</button>
          <button type="button" className="ab-admin-secondary" disabled={busy} onClick={()=>void fixGender()}>Основной курс: «работал(а)»</button>
          <button type="button" className="ab-admin-secondary" disabled={busy || !ld || !publishSetIds.length} onClick={()=>void publish()}>Опубликовать release</button>
        </div>

        {message && <p role="status" className="ab-admin-feedback">{message}</p>}
        {report && (
          <details className="ab-admin-details">
            <summary>Отчёт последнего импорта</summary>
            <pre className="ab-admin-json">{JSON.stringify(report,null,2)}</pre>
          </details>
        )}
      </article>

      <article className="ab-admin-panel ab-admin-bulk">
        <div className="ab-admin-section-head">
          <div>
            <h2>Автоматический IPA</h2>
            <p className="ab-admin-note">Pinned US pronunciation dictionary. Заполняет только отсутствующий IPA у exact forms и никогда не перезаписывает существующий.</p>
          </div>
        </div>
        <div className="ab-admin-action-row">
          <button type="button" className="ab-admin-secondary" disabled={bulkBusy || !ld} onClick={()=>void runIpaBootstrap(false)}>Проверить IPA</button>
          <button type="button" disabled={bulkBusy || !ipaReport?.updatedForms} onClick={()=>void runIpaBootstrap(true)}>Добавить IPA в draft</button>
        </div>
        {ipaReport && (
          <div className="ab-admin-status-line">
            <span><b>Форм</b> {ipaReport.forms}</span>
            <span><b>Уже есть IPA</b> {ipaReport.alreadyHaveIpa}</span>
            <span><b>Можно добавить</b> {ipaReport.updatedForms}</span>
            <span><b>Нет в базе</b> {ipaReport.unmatched}</span>
          </div>
        )}
        {bulkMessage && <p className="ab-admin-feedback" role="status">{bulkMessage}</p>}
      </article>

      <article className="ab-admin-panel ab-admin-bulk">
        <div className="ab-admin-section-head">
          <div>
            <h2>Массовое заполнение словаря через ИИ</h2>
            <p className="ab-admin-note">Без API: собираем реальные дырки курса → копируем prompt → вставляем JSON → проверяем → применяем только в draft.</p>
          </div>
        </div>

        <div className="ab-admin-bulk-controls">
          <label>
            <span>Set</span>
            <select value={bulkSetId} onChange={event=>{
              setBulkSetId(event.target.value);
              setBulkPrompt('');
              setBulkPreview(null);
              setBulkCoverage(null);
            }}>
              {sets.filter(item=>item.draftRevision).map(item=>(
                <option value={item.id} key={item.id}>{item.title.ru || item.id}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Задача</span>
            <select value={bulkMode} onChange={event=>{
              setBulkMode(event.target.value==='enrich'?'enrich':'missing');
              setBulkPrompt('');
              setBulkPreview(null);
            }}>
              <option value="missing">Добавить отсутствующие формы</option>
              <option value="enrich">Обогатить существующие</option>
            </select>
          </label>
          <label>
            <span>Пачка</span>
            <select value={bulkLimit} onChange={event=>setBulkLimit(Number(event.target.value))}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <button type="button" disabled={bulkBusy || !bulkSetId} onClick={()=>void buildBulkPrompt()}>
            {bulkMode==='missing'?'Собрать недостающие':'Собрать на обогащение'}
          </button>
        </div>

        {bulkCoverage && (
          <div className="ab-admin-status-line">
            <span><b>Покрытие</b> {String(bulkCoverage.resolvedSurfaces ?? 0)}/{String(bulkCoverage.uniqueSurfaces ?? 0)} · {String(bulkCoverage.coveragePct ?? 0)}%</span>
            <span><b>Нет в словаре</b> {String(bulkCoverage.missingSurfaces ?? 0)}</span>
            <span><b>IPA</b> {String(bulkCoverage.ipaCoveragePct ?? 0)}%</span>
            <span><b>RU произношение</b> {String(bulkCoverage.ruReadingCoveragePct ?? 0)}%</span>
            <span><b>Примеры</b> {String(bulkCoverage.exampleCoveragePct ?? 0)}%</span>
          </div>
        )}

        {bulkPrompt && (
          <div className="ab-admin-bulk-step">
            <div className="ab-admin-section-head">
              <div><strong>1. Prompt для ИИ</strong><p className="ab-admin-note">Можно вставить в ChatGPT или другой ИИ целиком.</p></div>
              <button type="button" className="ab-admin-secondary" onClick={()=>void copyBulkPrompt()}>Копировать</button>
            </div>
            <textarea readOnly rows={12} value={bulkPrompt} aria-label="Prompt для массового словаря" />
          </div>
        )}

        <div className="ab-admin-bulk-step">
          <strong>2. Ответ ИИ</strong>
          <p className="ab-admin-note">Вставь JSON формата <code>unmute.lexicon.patch.v1</code>. Markdown-код-блок тоже принимается.</p>
          <textarea
            rows={12}
            value={bulkText}
            onChange={event=>{setBulkText(event.target.value);setBulkPreview(null);}}
            placeholder={'{"format":"unmute.lexicon.patch.v1","entries":[...]}'}
            aria-label="JSON ответ ИИ"
          />
          <div className="ab-admin-action-row">
            <button type="button" className="ab-admin-secondary" disabled={bulkBusy || !bulkText.trim()} onClick={()=>void previewBulkPatch()}>Проверить без изменений</button>
            <button
              type="button"
              disabled={bulkBusy || !bulkPreview || (bulkPreview.summary?.conflicts || 0)>0}
              onClick={()=>void applyBulkPatch()}
            >Применить в draft</button>
          </div>
        </div>

        {bulkPreview && (
          <div className="ab-admin-bulk-preview">
            <div className="ab-admin-status-line">
              <span><b>Новых</b> {String(bulkPreview.summary?.creates ?? 0)}</span>
              <span><b>Обновлений</b> {String(bulkPreview.summary?.updates ?? 0)}</span>
              <span><b>Конфликтов</b> {String(bulkPreview.summary?.conflicts ?? 0)}</span>
              <span><b>Предупреждений</b> {String(bulkPreview.summary?.warnings ?? 0)}</span>
            </div>
            {!!bulkPreview.conflicts?.length && (
              <div className="ab-admin-error">
                {bulkPreview.conflicts.map((item,index)=>(
                  <div key={index}><b>{item.lemma || item.surface || 'entry'}</b>: {item.code}{item.detail ? ' · '+item.detail : ''}</div>
                ))}
              </div>
            )}
            {!!bulkPreview.warnings?.length && (
              <details className="ab-admin-details">
                <summary>Предупреждения ({bulkPreview.warnings.length})</summary>
                <ul>{bulkPreview.warnings.map((item,index)=><li key={index}>{item}</li>)}</ul>
              </details>
            )}
            {!!bulkPreview.changes?.length && (
              <details className="ab-admin-details">
                <summary>Что изменится ({bulkPreview.changes.length})</summary>
                <div className="ab-admin-table-wrap">
                  <table>
                    <thead><tr><th>Лемма</th><th>Действие</th><th>Формы</th><th>Примеры</th></tr></thead>
                    <tbody>{bulkPreview.changes.slice(0,100).map(item=>(
                      <tr key={item.id}>
                        <td data-label="Лемма"><strong>{item.lemma}</strong></td>
                        <td data-label="Действие">{item.kind}</td>
                        <td data-label="Формы">{item.forms?.join(', ')}</td>
                        <td data-label="Примеры">{String(item.examples ?? 0)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        )}

        {bulkMessage && <p className="ab-admin-feedback" role="status">{bulkMessage}</p>}
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
                  <select value={sense.partOfSpeech || ''} onChange={event=>updateSense(index,{partOfSpeech:event.target.value || undefined})}>
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
  label:'Релизы и словарь',
  group:'Контент',
  render(context){ return <ContentAdmin {...context} />; }
};
