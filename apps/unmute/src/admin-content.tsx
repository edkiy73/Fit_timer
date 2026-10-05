import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
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





function shortDate(iso?:string|null){
  if(!iso) return '';
  const date=new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
}

type LookupItem = {
  lexemeId:string;
  lemma:string;
  forms:string[];
  ipa:string;
  translations:string[];
  deprecated:boolean;
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

function ReleaseFlow({stage}:{stage:'draft'|'checked'|'ready'|'published'}){
  const items=[
    ['draft','Черновик'],
    ['checked','Проверен'],
    ['ready','Готов к выпуску'],
    ['published','Выпущен']
  ] as const;
  const order={draft:0,checked:1,ready:2,published:3} as const;
  return <div className="ab-release-flow" aria-label="Статус выпуска">
    {items.map(([id,label])=>{
      const state=order[id]<order[stage]?'done':order[id]===order[stage]?'current':'next';
      return <div className="ab-release-step" data-state={state} key={id}><span aria-hidden="true" /><b>{label}</b></div>;
    })}
  </div>;
}

type ContentAdminContext={
  query:string;
  lookup:string;
  bulkSetId:string;
  bulkMode:'missing'|'enrich';
  editorId?:string;
};
const CONTENT_CONTEXT_KEY='unmute.admin.content.context';
function readContentAdminContext():ContentAdminContext{
  try{
    const parsed=JSON.parse(sessionStorage.getItem(CONTENT_CONTEXT_KEY)||'{}') as Partial<ContentAdminContext>;
    return {
      query:String(parsed.query||''),
      lookup:String(parsed.lookup||''),
      bulkSetId:String(parsed.bulkSetId||'general-foundation'),
      bulkMode:parsed.bulkMode==='enrich'?'enrich':'missing',
      ...(parsed.editorId?{editorId:String(parsed.editorId)}:{})
    };
  }catch{return {query:'',lookup:'',bulkSetId:'general-foundation',bulkMode:'missing'};}
}
function writeContentAdminContext(next:ContentAdminContext){
  try{sessionStorage.setItem(CONTENT_CONTEXT_KEY,JSON.stringify(next));}catch{}
}

// Plain-language reason for a failed Admin request; a timeout means nothing was saved.
function failureText(error:unknown):string{
  const status=Number((error as {status?:number})?.status||0);
  const code=String((error as {code?:string})?.code||'');
  if(status===504||status===502)return 'Сервер не успел ответить, ничего не сохранилось. Попробуй ещё раз.';
  if(!status&&!code||code==='admin_request_failed')return 'Нет связи с сервером. Проверь интернет и попробуй ещё раз.';
  return 'Ошибка: '+code;
}

function ContentAdmin({client,adminKey}: AdminSectionContext){
  const [initialContext]=useState(readContentAdminContext);
  const [status,setStatus]=useState<Status|null>(null);
  const [review,setReview]=useState<ReviewItem[]>([]);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [query,setQuery]=useState(initialContext.query);
  const [editor,setEditor]=useState<LexemeEditor|null>(null);
  const [editorMessage,setEditorMessage]=useState('');
  const [editorBusy,setEditorBusy]=useState(false);
  const [sets,setSets]=useState<ReleaseSet[]>([]);
  const [bulkSetId,setBulkSetId]=useState(initialContext.bulkSetId);
  const [bulkLimit,setBulkLimit]=useState(50);
  const [bulkMode,setBulkMode]=useState<'missing'|'enrich'>(initialContext.bulkMode);
  const [bulkPrompt,setBulkPrompt]=useState('');
  const [bulkText,setBulkText]=useState('');
  const [bulkCoverage,setBulkCoverage]=useState<CoverageSummary|null>(null);
  const [bulkPreview,setBulkPreview]=useState<BulkPreview|null>(null);
  const [bulkMessage,setBulkMessage]=useState('');
  const [bulkBusy,setBulkBusy]=useState(false);
  const [bulkStep,setBulkStep]=useState<1|2|3>(1);
  const [lookup,setLookup]=useState(initialContext.lookup);
  const [lookupResults,setLookupResults]=useState<LookupItem[]|null>(null);
  const [lookupMessage,setLookupMessage]=useState('');
  const editorPanel=useRef<HTMLElement|null>(null);
  const [ipaMessage,setIpaMessage]=useState('');
  const [ipaApplied,setIpaApplied]=useState(false);
  const [dictMessage,setDictMessage]=useState('');
  const [ipaReport,setIpaReport]=useState<{forms:number;alreadyBritish:number;updatedForms:number;unmatched:number;unmatchedSample:string[];updatedLexemes:number}|null>(null);

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
    }catch(error){
      setMessage(String((error as {code?:string})?.code || 'Не удалось загрузить статус контента.'));
    }finally{
      setBusy(false);
    }
  },[client,adminKey]);

  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    writeContentAdminContext({
      query,
      lookup,
      bulkSetId,
      bulkMode,
      ...(editor?.id?{editorId:editor.id}:{})
    });
  },[query,lookup,bulkSetId,bulkMode,editor?.id]);
  useEffect(()=>{
    if(!initialContext.editorId)return;
    void openLexeme(initialContext.editorId);
  },[initialContext.editorId]);

  async function findWord(event:FormEvent){
    event.preventDefault();
    const query=lookup.trim();
    if(!query)return;
    setLookupMessage('');
    try{
      const result=await client.action(adminKey,'content_lexicon_search',{query});
      const items=(result.items || []) as LookupItem[];
      setLookupResults(items);
      if(!items.length)setLookupMessage('Ничего не нашлось. Слова нет в словаре — добавь его через ИИ ниже.');
    }catch(error){
      setLookupResults(null);
      setLookupMessage('Не получилось: '+String((error as {code?:string})?.code || 'request_failed'));
    }
  }

  // The editor opens below the lists: bring it into view so the click visibly did something.
  useEffect(()=>{
    if(editor)editorPanel.current?.scrollIntoView({behavior:'smooth',block:'start'});
  },[editor?.id]);

  async function openLexeme(id:string){
    setEditorBusy(true);
    setEditorMessage('');
    try{
      const result=await client.action(adminKey,'content_lexeme_get',{lexemeId:id});
      setEditor(result.lexeme as LexemeEditor);
      writeContentAdminContext({query,lookup,bulkSetId,bulkMode,editorId:id});
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

  // One press writes British IPA for every dictionary word, then re-checks what is left.
  async function updateTranscription(){
    setBulkBusy(true);
    setIpaMessage('');
    try{
      const result=await client.action(adminKey,'content_lexicon_ipa_bootstrap',{apply:true});
      const written=Number((result.report as {updatedForms?:number}|undefined)?.updatedForms || 0);
      const after=await client.action(adminKey,'content_lexicon_ipa_bootstrap',{});
      setIpaReport((after.report || result.report || null) as typeof ipaReport);
      setIpaApplied(written>0 || dictionaryChanged);
      setIpaMessage(written
        ? 'Готово: британская транскрипция записана для '+written+' форм. Осталось выпустить словарь, чтобы ученики увидели.'
        : 'Обновлять нечего: у всех слов из словаря уже британская транскрипция.'+(dictionaryChanged ? ' Выпусти словарь, если ещё не выпускал.' : ''));
      await load();
    }catch(error){
      setIpaMessage(failureText(error));
    }finally{
      setBulkBusy(false);
    }
  }

  // Dictionary edits go out on their own; the courses learners have stay as they are.
  // The result shows under the button that was pressed (header or transcription panel).
  async function publishDictionary(say:(text:string)=>void=setDictMessage){
    setBulkBusy(true);
    say('');
    try{
      await client.action(adminKey,'content_publish_lexicon');
      setIpaApplied(false);
      say('Выпущено: ученики уже видят новый словарь.');
      await load();
    }catch(error){
      const code=String((error as {code?:string})?.code||'');
      say(code==='lexical_coverage_incomplete'
        ? 'Не выпустилось: в выпущенном курсе есть слова, которых в новом словаре нет. Верни их через «Найти слово» или «Дополнить словарь через ИИ».'
        : code==='no_released_courses' ? 'Сначала выпусти хотя бы один курс в разделе «Курсы».' : failureText(error));
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
      setBulkStep(2);
      setBulkMessage('Собрано '+String(result.targetCount || 0)+(bulkMode==='missing'?' недостающих форм.':' записей для обогащения.')+'.');
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
      setBulkStep(3);
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
      setBulkStep(1);
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

  const ld=status?.lexicon?.draft;
  const lp=status?.lexicon?.published;
  // The draft changed after the last release (transcription, AI batch, a word edit).
  const dictionaryChanged=!!ld && (!lp || String(ld.draftUpdatedAt||'')>String(lp.publishedAt||''));
  const dictionaryStage:'draft'|'checked'|'ready'|'published'=
    !ld ? 'draft' : !dictionaryChanged ? 'published' : review.length===0 ? 'ready' : 'checked';

  return (
    <>
      <article className="ab-admin-panel ab-dictionary-release">
        <div className="ab-admin-section-head">
          <div>
            <h2>Словарь{ld ? ' · '+String(ld.entries ?? 0)+' слов' : ''}</h2>
            <p className="ab-admin-note" data-tone={dictionaryChanged ? 'changed' : 'live'}>
              {!ld ? (busy ? 'Загружаю…' : 'Словаря ещё нет.')
                : dictionaryChanged ? 'Есть правки, ученики их ещё не видят.'
                : 'На сайте, новых правок нет'+(lp?.publishedAt ? ' · выпущен '+shortDate(String(lp.publishedAt)) : '')+'.'}
            </p>
          </div>
        </div>
        <ReleaseFlow stage={dictionaryStage} />
        {dictionaryChanged&&(
          <div className="ab-dictionary-release-actions">
            <span className="ab-admin-note">{review.length?('Сначала проверь записи: '+review.length):'Проверка завершена — можно выпускать.'}</span>
            <button type="button" disabled={bulkBusy || review.length>0} onClick={()=>void publishDictionary()}>Выпустить словарь</button>
          </div>
        )}
        <p className="ab-admin-note">Курсы выпускаются отдельно, в разделе «Курсы». Выпуск словаря их не трогает.</p>
        {dictMessage && <p className="ab-admin-feedback" role="status">{dictMessage}</p>}
        {message && <p className="ab-admin-feedback" role="status">{message}</p>}
      </article>

      <article className="ab-admin-panel">
        <div className="ab-admin-section-head">
          <div>
            <h2>Найти слово</h2>
            <p className="ab-admin-note">По-английски (любая форма: worked, can't) или по переводу. Изменения видны ученикам после «Выпустить».</p>
          </div>
        </div>
        <form className="ab-admin-toolbar" onSubmit={event=>void findWord(event)}>
          <input type="search" value={lookup} onChange={event=>setLookup(event.target.value)} placeholder="Слово или перевод" aria-label="Слово или перевод" />
          <button type="submit" disabled={!lookup.trim()}>Найти</button>
        </form>
        {lookupMessage && <p className="ab-admin-feedback" role="status">{lookupMessage}</p>}
        {!!lookupResults?.length && (
          <div className="ab-admin-table-wrap">
            <table>
              <thead><tr><th>Слово</th><th>Перевод</th><th></th></tr></thead>
              <tbody>{lookupResults.map(item=>(
                <tr key={item.lexemeId}>
                  <td data-label="Слово">
                    <strong>{item.lemma}</strong>{item.ipa && <span className="ab-admin-cell-sub"> /{item.ipa.replace(/^\/|\/$/g,'')}/</span>}
                    {item.deprecated && <div className="ab-admin-cell-sub">скрыто из приложения</div>}
                    {!!item.forms.length && <div className="ab-admin-cell-sub">{item.forms.join(', ')}</div>}
                  </td>
                  <td data-label="Перевод">{item.translations.join(' · ') || '—'}</td>
                  <td className="ab-admin-cell-action">
                    <button type="button" className="ab-admin-secondary" disabled={editorBusy} onClick={()=>void openLexeme(item.lexemeId)}>Изменить</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </article>

      <article className="ab-admin-panel ab-admin-bulk">
        <div className="ab-admin-section-head">
          <div>
            <h2>Транскрипция слов</h2>
            <p className="ab-admin-note">Британское произношение и подсказка русскими буквами с ударением — для всех слов словаря. Нажимай после пополнения словаря через ИИ, потом «Выпустить словарь».</p>
          </div>
        </div>
        <div className="ab-admin-action-row">
          <button type="button" disabled={bulkBusy || !ld} onClick={()=>void updateTranscription()}>Обновить транскрипцию</button>
        </div>
        {ipaMessage && <p className="ab-admin-feedback" role="status">{ipaMessage}</p>}
        {ipaReport && (
          <div className="ab-admin-status-line">
            <span><b>Британская</b> {ipaReport.alreadyBritish}</span>
            <span><b>Без транскрипции</b> {ipaReport.unmatched}</span>
          </div>
        )}
        {!!ipaReport?.unmatchedSample?.length && (
          <details className="ab-admin-details">
            <summary>Что осталось без транскрипции (обычно целые фразы)</summary>
            <p className="ab-admin-note">{ipaReport.unmatchedSample.join(' · ')}</p>
          </details>
        )}
        {ipaApplied && (
          <div className="ab-admin-action-row">
            <button type="button" disabled={bulkBusy} onClick={()=>void publishDictionary(setIpaMessage)}>Выпустить словарь</button>
          </div>
        )}
      </article>

      <article className="ab-admin-panel ab-admin-bulk ab-bulk-wizard">
        <div className="ab-admin-section-head">
          <div>
            <h2>Дополнить словарь через ИИ</h2>
            <p className="ab-admin-note">Три шага: подготовить запрос → вставить ответ ИИ → проверить и применить.</p>
          </div>
        </div>

        <nav className="ab-bulk-wizard-nav" aria-label="Шаги дополнения словаря">
          <button type="button" data-state={bulkStep===1?'current':bulkStep>1?'done':'idle'} onClick={()=>setBulkStep(1)}>
            <span>1</span><b>Запрос</b>
          </button>
          <button type="button" data-state={bulkStep===2?'current':bulkStep>2?'done':'idle'} disabled={!bulkPrompt} onClick={()=>bulkPrompt&&setBulkStep(2)}>
            <span>2</span><b>Ответ ИИ</b>
          </button>
          <button type="button" data-state={bulkStep===3?'current':'idle'} disabled={!bulkPreview} onClick={()=>bulkPreview&&setBulkStep(3)}>
            <span>3</span><b>Проверка</b>
          </button>
        </nav>

        {bulkStep===1&&(
          <section className="ab-bulk-wizard-step" aria-labelledby="bulk-step-1-title">
            <div className="ab-bulk-wizard-step-head">
              <div>
                <span className="ab-bulk-step-kicker">Шаг 1 из 3</span>
                <h3 id="bulk-step-1-title">Подготовить запрос</h3>
                <p className="ab-admin-note">Выбери курс и что нужно сделать. Мы соберём готовый запрос для ChatGPT или другого ИИ.</p>
              </div>
            </div>

            <div className="ab-admin-bulk-controls">
              <label>
                <span>Курс</span>
                <select value={bulkSetId} onChange={event=>{
                  setBulkSetId(event.target.value);
                  setBulkPrompt('');
                  setBulkText('');
                  setBulkPreview(null);
                  setBulkCoverage(null);
                  setBulkStep(1);
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
                  setBulkText('');
                  setBulkPreview(null);
                  setBulkCoverage(null);
                  setBulkStep(1);
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
            </div>

            <div className="ab-admin-action-row">
              <button type="button" disabled={bulkBusy || !bulkSetId} onClick={()=>void buildBulkPrompt()}>
                {bulkMode==='missing'?'Подготовить недостающие':'Подготовить обогащение'}
              </button>
            </div>
          </section>
        )}

        {bulkStep===2&&(
          <section className="ab-bulk-wizard-step" aria-labelledby="bulk-step-2-title">
            <div className="ab-bulk-wizard-step-head">
              <div>
                <span className="ab-bulk-step-kicker">Шаг 2 из 3</span>
                <h3 id="bulk-step-2-title">Вставить ответ ИИ</h3>
                <p className="ab-admin-note">Запрос уже готов. Скопируй его, отправь в ИИ и вставь сюда ответ целиком.</p>
              </div>
            </div>

            <div className="ab-bulk-ready">
              <div>
                <strong>Запрос готов</strong>
                {bulkCoverage&&<span>{String(bulkCoverage.resolvedSurfaces ?? 0)}/{String(bulkCoverage.uniqueSurfaces ?? 0)} слов уже покрыто · {String(bulkCoverage.coveragePct ?? 0)}%</span>}
              </div>
              <button type="button" className="ab-admin-secondary" onClick={()=>void copyBulkPrompt()}>Копировать запрос</button>
            </div>

            <details className="ab-admin-details">
              <summary>Посмотреть запрос</summary>
              <textarea readOnly rows={10} value={bulkPrompt} aria-label="Запрос для ИИ" />
            </details>

            <label className="ab-bulk-answer">
              <span>Ответ ИИ</span>
              <textarea
                rows={12}
                value={bulkText}
                onChange={event=>{
                  setBulkText(event.target.value);
                  setBulkPreview(null);
                }}
                placeholder={'{"format":"unmute.lexicon.patch.v1","entries":[...]}'}
                aria-label="Ответ ИИ"
              />
            </label>

            <div className="ab-admin-action-row">
              <button type="button" className="ab-admin-secondary" onClick={()=>setBulkStep(1)}>Назад</button>
              <button type="button" disabled={bulkBusy || !bulkText.trim()} onClick={()=>void previewBulkPatch()}>Проверить ответ</button>
            </div>
          </section>
        )}

        {bulkStep===3&&bulkPreview&&(
          <section className="ab-bulk-wizard-step" aria-labelledby="bulk-step-3-title">
            <div className="ab-bulk-wizard-step-head">
              <div>
                <span className="ab-bulk-step-kicker">Шаг 3 из 3</span>
                <h3 id="bulk-step-3-title">Проверить и применить</h3>
                <p className="ab-admin-note">Ничего ещё не изменено. Проверь результат и только потом добавляй в draft словаря.</p>
              </div>
            </div>

            <div className="ab-admin-status-line ab-bulk-summary">
              <span><b>Новых</b> {String(bulkPreview.summary?.creates ?? 0)}</span>
              <span><b>Обновлений</b> {String(bulkPreview.summary?.updates ?? 0)}</span>
              <span><b>Конфликтов</b> {String(bulkPreview.summary?.conflicts ?? 0)}</span>
              <span><b>Предупреждений</b> {String(bulkPreview.summary?.warnings ?? 0)}</span>
            </div>

            {!!bulkPreview.conflicts?.length&&(
              <div className="ab-admin-error">
                {bulkPreview.conflicts.map((item,index)=>(
                  <div key={index}><b>{item.lemma || item.surface || 'entry'}</b>: {item.code}{item.detail ? ' · '+item.detail : ''}</div>
                ))}
              </div>
            )}

            {!!bulkPreview.warnings?.length&&(
              <details className="ab-admin-details">
                <summary>Предупреждения ({bulkPreview.warnings.length})</summary>
                <ul>{bulkPreview.warnings.map((item,index)=><li key={index}>{item}</li>)}</ul>
              </details>
            )}

            {!!bulkPreview.changes?.length&&(
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

            {bulkCoverage&&(
              <details className="ab-admin-details">
                <summary>Покрытие словаря после изменений</summary>
                <div className="ab-admin-status-line">
                  <span><b>Словарь</b> {String(bulkCoverage.coveragePct ?? 0)}%</span>
                  <span><b>IPA</b> {String(bulkCoverage.ipaCoveragePct ?? 0)}%</span>
                  <span><b>Произношение</b> {String(bulkCoverage.ruReadingCoveragePct ?? 0)}%</span>
                  <span><b>Примеры</b> {String(bulkCoverage.exampleCoveragePct ?? 0)}%</span>
                </div>
              </details>
            )}

            <div className="ab-admin-action-row">
              <button type="button" className="ab-admin-secondary" onClick={()=>setBulkStep(2)}>Исправить ответ</button>
              <button
                type="button"
                disabled={bulkBusy || (bulkPreview.summary?.conflicts || 0)>0}
                onClick={()=>void applyBulkPatch()}
              >Добавить в словарь</button>
            </div>
          </section>
        )}

        {bulkMessage&&<p className="ab-admin-feedback" role="status">{bulkMessage}</p>}
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
        <article className="ab-admin-panel" ref={editorPanel}>
          <div className="ab-admin-section-head">
            <div>
              <h2>{editor.lemma}</h2>
              <p className="ab-admin-note"><code>{editor.id}</code> · версия {editor.revision}</p>
            </div>
            <button type="button" className="ab-admin-secondary" onClick={()=>{setEditor(null);writeContentAdminContext({query,lookup,bulkSetId,bulkMode});}}>Закрыть</button>
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
  label:'Словарь',
  group:'Курсы',
  render(context){ return <ContentAdmin {...context} />; }
};
