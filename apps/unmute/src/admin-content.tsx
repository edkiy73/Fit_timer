import { useCallback, useEffect, useRef, useState } from 'react';
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
  publishedAt?:string|null;
  draftUpdatedAt?:string|null;
  unreleasedChanges?:boolean;
  access?:{mode?:string;freePreview?:{days?:number};price?:{RUB?:number;USD?:number}}|null;
};

type WordCheck = {
  ready:boolean;
  words:number;
  missingCount:number;
  ambiguousCount:number;
  missing:Array<{surface:string;count:number;context:string}>;
  ambiguous:Array<{surface:string;count:number;context:string}>;
};

function wordList(items:WordCheck['missing'],total:number){
  const shown=items.slice(0,12).map(item=>item.surface).join(', ');
  return total>12 ? shown+' и ещё '+(total-12) : shown;
}

function courseState(item:ReleaseSet){
  if(!item.publishedRevision) return {tone:'new',text:'Ещё не выпущен — ученики его не видят'};
  if(item.unreleasedChanges) return {tone:'changed',text:'Есть правки, ученики их ещё не видят'};
  return {tone:'live',text:'На сайте, новых правок нет'};
}

function courseTerms(item:ReleaseSet){
  const access=item.access;
  if(!access || access.mode==='free') return 'Бесплатный';
  const parts=['Бесплатных дней: '+String(access.freePreview?.days ?? 0)];
  const price=access.price;
  parts.push(price && (price.RUB || price.USD)
    ? 'цена '+[price.RUB ? price.RUB+' ₽' : '',price.USD ? '$'+price.USD : ''].filter(Boolean).join(' / ')
    : 'общая цена');
  return parts.join(' · ');
}

function shortDate(iso?:string|null){
  if(!iso) return '';
  const date=new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
}

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
  const [ipaMessage,setIpaMessage]=useState('');
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
      // Courses with edits the learners do not see yet are ticked for release.
      setPublishSetIds(nextSets.filter(item=>item.draftRevision&&(item.unreleasedChanges||!item.publishedRevision)).map(item=>item.id));
    }catch(error){
      setMessage(String((error as {code?:string})?.code || 'Не удалось загрузить статус контента.'));
    }finally{
      setBusy(false);
    }
  },[client,adminKey]);

  useEffect(()=>{void load();},[load]);

  // Ticked courses are checked against the dictionary before «Выпустить»: the release
  // refuses words a learner would tap and find nothing (or several entries) for.
  const [checks,setChecks]=useState<Record<string,WordCheck>>({});
  const [checking,setChecking]=useState(false);
  const bulkPanel=useRef<HTMLElement|null>(null);
  // Re-check when the ticked courses, their drafts or the dictionary draft change.
  const checkKey=publishSetIds.slice().sort().map(id=>id+':'+String(sets.find(item=>item.id===id)?.draftUpdatedAt ?? '')).join(',')
    +'|'+String(status?.lexicon?.draft?.draftUpdatedAt ?? '')+':'+String(status?.lexicon?.draft?.entries ?? '');
  const runCheck=useCallback(async(ids:string[])=>{
    if(!ids.length){setChecks({});return;}
    setChecking(true);
    try{
      const result=await client.action(adminKey,'content_release_check',{setIds:ids});
      setChecks((result.sets || {}) as Record<string,WordCheck>);
    }catch(_){
      setChecks({});
    }finally{setChecking(false);}
  },[client,adminKey]);
  useEffect(()=>{void runCheck(publishSetIds);},[checkKey,runCheck]);
  const blockedIds=publishSetIds.filter(id=>checks[id] && !checks[id]!.ready);

  function fillWithAi(setId:string){
    setBulkSetId(setId);
    setBulkMode('missing');
    setBulkPrompt('');
    setBulkPreview(null);
    setBulkCoverage(null);
    bulkPanel.current?.scrollIntoView?.({block:'start',behavior:'smooth'});
  }

  async function importLegacy(overwrite=false){
    setBusy(true);
    setMessage('');
    setReport(null);
    try{
      const result=await client.action(adminKey,'content_legacy_import',overwrite ? {overwrite:true} : undefined);
      setReport((result.report || {}) as Record<string,unknown>);
      setMessage('Старый курс импортирован. Ученики его увидят только после «Выпустить».');
      setEditor(null);
      await load();
    }catch(error){
      const code=String((error as {code?:string})?.code || 'request_failed');
      if(code==='draft_exists_use_overwrite' && !overwrite){
        const ok=window.confirm('Повторный импорт заменит невыпущенные правки основного курса и словаря, включая ручные. Продолжить?');
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
      setMessage('Курс A1 обновлён из кода. Он отмечен в списке — нажми «Выпустить».');
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
        setMessage('Исправлено мест: '+changed+'. Основной курс отмечен в списке — нажми «Выпустить».');
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
    if(!publishSetIds.length){setMessage('Отметь хотя бы один курс.');return;}
    const names=sets.filter(item=>publishSetIds.includes(item.id)).map(item=>item.title.ru||item.id).join(', ');
    const ok=window.confirm('Выпустить для учеников: '+names+'? Словарь выпустится вместе с ними.');
    if(!ok)return;
    setBusy(true);
    setMessage('');
    try{
      const result=await client.action(adminKey,'content_publish',{setIds:publishSetIds});
      const lexicon=(result.lexicon || {}) as {revision?:unknown};
      const release=(result.release || {}) as {revision?:unknown};
      setMessage('Готово: ученики уже видят '+names+'. Выпуск №'+String(release.revision||'?')+', словарь №'+String(lexicon.revision||'?')+'.');
      await load();
    }catch(error){
      const code=String((error as {code?:string})?.code || 'request_failed');
      setMessage(code==='lexical_coverage_incomplete'
        ? 'Не выпустилось: в курсе есть слова, которых нет в словаре. Список — под курсом выше.'
        : 'Не выпустилось: '+code);
      if(code==='lexical_coverage_incomplete') await runCheck(publishSetIds);
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
      setEditorMessage(reviewed ? 'Сохранено и отмечено проверенным.' : 'Сохранено. Ученики увидят после «Выпустить».');
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
    setIpaMessage('');
    try{
      const result=await client.action(adminKey,'content_lexicon_ipa_bootstrap',{apply});
      const report=(result.report || null) as typeof ipaReport;
      setIpaReport(report);
      setIpaMessage(apply
        ? 'Транскрипция добавлена для '+String(report?.updatedForms || 0)+' форм. Ученики увидят после «Выпустить».'
        : 'Можно добавить транскрипцию для '+String(report?.updatedForms || 0)+' форм. Уже заполненное не меняется.');
      if(apply) await load();
    }catch(error){
      setIpaMessage('Не получилось: '+String((error as {code?:string})?.code || 'request_failed'));
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
      setBulkMessage('Собрано '+String(result.targetCount || 0)+(bulkMode==='missing'?' недостающих форм.':' записей для обогащения.')+' Скопируй запрос в ИИ и вставь его ответ ниже.');
    }catch(error){
      setBulkMessage('Не удалось собрать запрос: '+String((error as {code?:string})?.code || 'request_failed'));
    }finally{
      setBulkBusy(false);
    }
  }

  async function copyBulkPrompt(){
    if(!bulkPrompt)return;
    try{
      await navigator.clipboard.writeText(bulkPrompt);
      setBulkMessage('Запрос скопирован.');
    }catch(_){
      setBulkMessage('Не удалось скопировать автоматически — выдели текст вручную.');
    }
  }

  async function previewBulkPatch(){
    if(!bulkText.trim()){setBulkMessage('Вставь ответ ИИ.');return;}
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
      setBulkMessage('Добавлено записей: '+String(result.applied || 0)+'. Ученики увидят после «Выпустить».');
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
            <h2>Курсы</h2>
            <p className="ab-admin-note">Ученики видят только выпущенное. Правки из «Редактора уроков» ждут здесь, пока не нажмёшь «Выпустить». Словарь выпускается вместе с курсами.</p>
          </div>
          <button type="button" className="ab-admin-secondary" disabled={busy} onClick={()=>void load()}>Обновить</button>
        </div>

        <div className="ab-release-set-list">
          {sets.map(item=>{
            const state=courseState(item);
            const check=publishSetIds.includes(item.id) ? checks[item.id] : undefined;
            return <div className="ab-release-course" key={item.id}><label data-state={state.tone}>
              <input
                type="checkbox"
                checked={publishSetIds.includes(item.id)}
                disabled={!item.draftRevision}
                onChange={event=>setPublishSetIds(current=>event.target.checked
                  ? [...new Set([...current,item.id])]
                  : current.filter(id=>id!==item.id))}
              />
              <span>
                <b>{item.title.ru || item.id}</b>
                <small className="ab-release-state">{state.text}{item.publishedAt ? ' · выпущен '+shortDate(item.publishedAt) : ''}</small>
                <small>{courseTerms(item)}</small>
              </span>
            </label>
            {check && (check.ready
              ? <p className="ab-release-check" data-ok>Все слова курса есть в словаре ({check.words}).</p>
              : <div className="ab-release-check">
                  {check.missingCount>0 && <p>Нет в словаре ({check.missingCount}): <b>{wordList(check.missing,check.missingCount)}</b></p>}
                  {check.ambiguousCount>0 && <p>В словаре несколько записей, приложение не знает, какую показать ({check.ambiguousCount}): <b>{wordList(check.ambiguous,check.ambiguousCount)}</b>. Объедини их в словаре.</p>}
                  {check.missingCount>0 && <button type="button" className="ab-admin-secondary" onClick={()=>fillWithAi(item.id)}>Дополнить словарь через ИИ</button>}
                </div>)}
            </div>;
          })}
          {!sets.length && <p className="ab-admin-empty">{busy ? 'Загружаю…' : 'Курсов пока нет.'}</p>}
        </div>

        <div className="ab-admin-action-row">
          <button type="button" disabled={busy || checking || !ld || !publishSetIds.length || blockedIds.length>0} onClick={()=>void publish()}>
            {publishSetIds.length ? 'Выпустить отмеченные ('+publishSetIds.length+')' : 'Выпустить'}
          </button>
        </div>
        {checking && <p className="ab-admin-feedback">Проверяю слова курса…</p>}
        {!checking && blockedIds.length>0 && <p className="ab-admin-feedback">Сначала добавь в словарь слова, которых не хватает, — иначе ученик нажмёт на слово и ничего не увидит.</p>}
        {message && <p role="status" className="ab-admin-feedback">{message}</p>}
        <p className="ab-admin-note">Цена, бесплатные дни и уроки меняются в «Редакторе уроков». Курс A1 из кода выпускается сам после каждого изменения, если в GitHub добавлен секрет ADMIN_KEY.</p>

        <details className="ab-admin-details">
          <summary>Разовые инструменты</summary>
          <div className="ab-admin-status-line">
            <span><b>Выпуск</b> {status?.release ? '№'+String(status.release.revision ?? 0) : 'ещё не было'}</span>
            <span><b>Основной курс</b> {cd ? String(cd.activities ?? 0)+' заданий' : 'нет'}{cp ? ', на сайте' : ''}</span>
            <span><b>Словарь</b> {ld ? String(ld.entries ?? 0)+' слов' : 'нет'}{lp ? ', на сайте' : ''}</span>
          </div>
          <div className="ab-admin-action-row">
            <button type="button" className="ab-admin-secondary" disabled={busy} onClick={()=>void seedA1()}>Обновить курс A1 из кода</button>
            <button type="button" className="ab-admin-secondary" disabled={busy} onClick={()=>void fixGender()}>Основной курс: «работал(а)»</button>
            <button type="button" className="ab-admin-secondary" disabled={busy} onClick={()=>void importLegacy(false)}>Импорт старого курса</button>
          </div>
          <p className="ab-admin-note">Источник старого курса: <code>{status?.source?.sha?.slice(0,12) || '…'}</code></p>
          {report && (
            <details className="ab-admin-details">
              <summary>Отчёт последнего импорта</summary>
              <pre className="ab-admin-json">{JSON.stringify(report,null,2)}</pre>
            </details>
          )}
        </details>
      </article>

      <article className="ab-admin-panel ab-admin-bulk">
        <div className="ab-admin-section-head">
          <div>
            <h2>Транскрипция слов</h2>
            <p className="ab-admin-note">Берёт американское произношение из словаря и заполняет только пустые места. Уже заполненное не меняет.</p>
          </div>
        </div>
        <div className="ab-admin-action-row">
          <button type="button" className="ab-admin-secondary" disabled={bulkBusy || !ld} onClick={()=>void runIpaBootstrap(false)}>Проверить, чего не хватает</button>
          <button type="button" disabled={bulkBusy || !ipaReport?.updatedForms} onClick={()=>void runIpaBootstrap(true)}>Добавить транскрипцию</button>
        </div>
        {ipaReport && (
          <div className="ab-admin-status-line">
            <span><b>Форм</b> {ipaReport.forms}</span>
            <span><b>Уже есть</b> {ipaReport.alreadyHaveIpa}</span>
            <span><b>Можно добавить</b> {ipaReport.updatedForms}</span>
            <span><b>Нет в базе</b> {ipaReport.unmatched}</span>
          </div>
        )}
        {ipaMessage && <p className="ab-admin-feedback" role="status">{ipaMessage}</p>}
      </article>

      <article className="ab-admin-panel ab-admin-bulk ab-course-open-day" ref={bulkPanel}>
        <div className="ab-admin-section-head">
          <div>
            <h2>Дополнить словарь через ИИ</h2>
            <p className="ab-admin-note">Находим слова курса, которых нет в словаре → копируешь запрос в ChatGPT или другой ИИ → вставляешь ответ → проверяем → добавляем. Ученики увидят после «Выпустить».</p>
          </div>
        </div>

        <div className="ab-admin-bulk-controls">
          <label>
            <span>Курс</span>
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
            <span>Что сделать</span>
            <select value={bulkMode} onChange={event=>{
              setBulkMode(event.target.value==='enrich'?'enrich':'missing');
              setBulkPrompt('');
              setBulkPreview(null);
            }}>
              <option value="missing">Добавить недостающие слова</option>
              <option value="enrich">Дополнить уже имеющиеся</option>
            </select>
          </label>
          <label>
            <span>Сколько слов за раз</span>
            <select value={bulkLimit} onChange={event=>setBulkLimit(Number(event.target.value))}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <button type="button" disabled={bulkBusy || !bulkSetId} onClick={()=>void buildBulkPrompt()}>
            {bulkMode==='missing'?'Найти недостающие':'Найти, что дополнить'}
          </button>
        </div>

        {bulkCoverage && (
          <div className="ab-admin-status-line">
            <span><b>Есть в словаре</b> {String(bulkCoverage.resolvedSurfaces ?? 0)}/{String(bulkCoverage.uniqueSurfaces ?? 0)} · {String(bulkCoverage.coveragePct ?? 0)}%</span>
            <span><b>Нет в словаре</b> {String(bulkCoverage.missingSurfaces ?? 0)}</span>
            <span><b>IPA</b> {String(bulkCoverage.ipaCoveragePct ?? 0)}%</span>
            <span><b>Произношение по-русски</b> {String(bulkCoverage.ruReadingCoveragePct ?? 0)}%</span>
            <span><b>Примеры</b> {String(bulkCoverage.exampleCoveragePct ?? 0)}%</span>
          </div>
        )}

        {bulkPrompt && (
          <div className="ab-admin-bulk-step">
            <div className="ab-admin-section-head">
              <div><strong>1. Запрос для ИИ</strong><p className="ab-admin-note">Можно вставить в ChatGPT или другой ИИ целиком.</p></div>
              <button type="button" className="ab-admin-secondary" onClick={()=>void copyBulkPrompt()}>Копировать</button>
            </div>
            <textarea readOnly rows={12} value={bulkPrompt} aria-label="Запрос для ИИ" />
          </div>
        )}

        <div className="ab-admin-bulk-step">
          <strong>2. Ответ ИИ</strong>
          <p className="ab-admin-note">Вставь ответ ИИ целиком, как есть.</p>
          <textarea
            rows={12}
            value={bulkText}
            onChange={event=>{setBulkText(event.target.value);setBulkPreview(null);}}
            placeholder={'{"format":"unmute.lexicon.patch.v1","entries":[...]}'}
            aria-label="Ответ ИИ"
          />
          <div className="ab-admin-action-row">
            <button type="button" className="ab-admin-secondary" disabled={bulkBusy || !bulkText.trim()} onClick={()=>void previewBulkPatch()}>Проверить без изменений</button>
            <button
              type="button"
              disabled={bulkBusy || !bulkPreview || (bulkPreview.summary?.conflicts || 0)>0}
              onClick={()=>void applyBulkPatch()}
            >Добавить в словарь</button>
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
                    <thead><tr><th>Слово</th><th>Действие</th><th>Формы</th><th>Примеры</th></tr></thead>
                    <tbody>{bulkPreview.changes.slice(0,100).map(item=>(
                      <tr key={item.id}>
                        <td data-label="Слово"><strong>{item.lemma}</strong></td>
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
            <p className="ab-admin-note">Слова из старого курса с несколькими значениями. Пока не проверено, приложение показывает все варианты перевода.</p>
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
              <p className="ab-admin-note"><code>{editor.id}</code> · версия {editor.revision}</p>
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
            <button type="button" className="ab-admin-secondary" disabled={editorBusy} onClick={()=>void saveLexeme(false)}>Сохранить</button>
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
  label:'Курсы и словарь',
  group:'Курсы',
  render(context){ return <ContentAdmin {...context} />; }
};
