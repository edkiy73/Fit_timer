import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { loadLexicon } from './lexicon/client';
import {
  normalizeSurface,
  type LexiconSnapshot
} from './lexicon/schema';
import {
  resolveLexiconClick,
  type LexiconContextRef,
  type ResolvedLexiconEntry
} from './lexicon/resolve';
import { speakText } from './speech-runtime';
import { useSavedWords } from './saved-words';
import { Icon } from './icons';

const LEXICON_QUERY_KEY=['published-lexicon'] as const;
const WORD_RE=/[A-Za-z]+(?:['\u2019][A-Za-z]+)*/g;

export interface LexiconClickRef {
  surface:string;
  lexemeId?:string|undefined;
  senseId?:string|undefined;
  formId?:string|undefined;
  occurrence?:number|undefined;
}

export interface LexiconSelection {
  surface:string;
  context:LexiconContextRef;
}

export interface LexiconRuntimeValue {
  lexicon:LexiconSnapshot|null;
  status:'pending'|'ready'|'error';
  error:unknown;
  fromCache:boolean;
  refresh:()=>Promise<void>;
  open:(surface:string,context?:LexiconContextRef)=>void;
  close:()=>void;
}

const LexiconContext=createContext<LexiconRuntimeValue|null>(null);

export interface EnglishTextPart {
  kind:'text'|'word';
  value:string;
  occurrence?:number;
}

export function splitEnglishText(value:string):EnglishTextPart[]{
  const out:EnglishTextPart[]=[];
  const counts=new Map<string,number>();
  let cursor=0;
  WORD_RE.lastIndex=0;
  for(const match of value.matchAll(WORD_RE)){
    const index=match.index??0;
    if(index>cursor)out.push({kind:'text',value:value.slice(cursor,index)});
    const word=match[0]||'';
    const key=normalizeSurface(word);
    const occurrence=(counts.get(key)||0)+1;
    counts.set(key,occurrence);
    out.push({kind:'word',value:word,occurrence});
    cursor=index+word.length;
  }
  if(cursor<value.length)out.push({kind:'text',value:value.slice(cursor)});
  return out;
}

export function lexiconContextFor(
  refs:readonly LexiconClickRef[]|undefined,
  surface:string,
  occurrence:number
):LexiconContextRef{
  if(!refs?.length)return {};
  const key=normalizeSurface(surface);
  const matches=refs.filter(ref=>normalizeSurface(ref.surface)===key);
  const pinned=matches.find(ref=>ref.occurrence===occurrence)
    ?? (matches.length===1&&matches[0]?.occurrence===undefined?matches[0]:undefined);
  if(!pinned)return {};
  const context:LexiconContextRef={};
  if(pinned.lexemeId)context.lexemeId=pinned.lexemeId;
  if(pinned.senseId)context.senseId=pinned.senseId;
  if(pinned.formId)context.formId=pinned.formId;
  return context;
}

function localizedValues(values:Record<string,string[]>|undefined,locale:string):string[]{
  if(!values)return [];
  return values[locale] || values.ru || values.en || Object.values(values)[0] || [];
}

function localizedExample(values:Record<string,string>|undefined,locale:string):string{
  if(!values)return '';
  return values[locale] || values.ru || values.en || Object.values(values)[0] || '';
}

function DictionaryEntryView({
  entry,
  surface
}:{
  entry:ResolvedLexiconEntry;
  surface:string;
}){
  const {t,locale}=useI18n();
  const pronunciation=entry.pronunciation;
  const examples=entry.examples.slice(0,3);
  return (
    <section className="dictionary-entry">
      {entry.lexeme.lemma!==surface&&(
        <div className="dictionary-lemma">{entry.lexeme.lemma}</div>
      )}
      {(pronunciation?.ipa||pronunciation?.ruReading)&&(
        <div className="dictionary-pronunciation">
          {pronunciation.ipa&&<span>/{pronunciation.ipa}/</span>}
          {pronunciation.ruReading&&<span>{pronunciation.ruReading}</span>}
        </div>
      )}
      <div className="dictionary-senses">
        {entry.senses.map(sense=>{
          const translations=localizedValues(sense.translations,locale);
          if(!translations.length)return null;
          return (
            <div className="dictionary-sense" key={sense.id}>
              <strong>{translations.join(' · ')}</strong>
              {sense.note&&(
                <span>{sense.note[locale]||sense.note.ru||sense.note.en||Object.values(sense.note)[0]||''}</span>
              )}
            </div>
          );
        })}
      </div>
      {examples.length>0&&(
        <div className="dictionary-examples">
          <div className="dictionary-label">{t('dictionary.examples')}</div>
          {examples.map(example=>(
            <div className="dictionary-example" key={example.id}>
              <div><LexiconText text={example.text} /></div>
              <span>{localizedExample(example.translations,locale)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DictionarySheet({
  selection,
  runtime
}:{
  selection:LexiconSelection;
  runtime:LexiconRuntimeValue;
}){
  const {t}=useI18n();
  const saved=useSavedWords();
  const [saveError,setSaveError]=useState(false);
  const resolved=runtime.lexicon
    ? resolveLexiconClick(runtime.lexicon,selection.surface,selection.context)
    : [];
  const ambiguous=resolved.length>1||resolved.some(entry=>entry.senses.length>1);

  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape')runtime.close();
    };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[runtime.close]);

  useEffect(()=>{
    void speakText(selection.surface,'en-US');
  },[selection.surface]);

  return (
    <div className="dictionary-scrim" role="presentation" onMouseDown={event=>{
      if(event.currentTarget===event.target)runtime.close();
    }}>
      <section className="dictionary-sheet" role="dialog" aria-modal="true" aria-labelledby="dictionary-title">
        <div className="dictionary-grab" aria-hidden="true" />
        <div className="dictionary-head">
          <div>
            <div className="eyebrow">{t('dictionary.eyebrow')}</div>
            <h2 id="dictionary-title">{selection.surface}</h2>
          </div>
          <button className="dictionary-close" type="button" onClick={runtime.close} aria-label={t('dictionary.close')}>
            <Icon name="close" size={20} />
          </button>
        </div>

        {runtime.status==='pending'&&(
          <div className="dictionary-state" role="status">{t('dictionary.loading')}</div>
        )}

        {runtime.status==='error'&&(
          <div className="dictionary-state dictionary-state-error" role="alert">
            <span>{t('dictionary.unavailable')}</span>
            <button className="secondary-button" type="button" onClick={()=>void runtime.refresh()}>
              {t('today.retry')}
            </button>
          </div>
        )}

        {runtime.status==='ready'&&resolved.length===0&&(
          <div className="dictionary-state">
            <span>{t('dictionary.missing')}</span>
          </div>
        )}

        {runtime.status==='ready'&&resolved.length>0&&(
          <>
            {ambiguous&&!resolved.every(entry=>entry.exactContext)&&(
              <div className="dictionary-ambiguity">{t('dictionary.multiple')}</div>
            )}
            <div className="dictionary-results">
              {resolved.map(entry=>(
                <DictionaryEntryView
                  key={entry.lexeme.id+'-'+entry.senses.map(sense=>sense.id).join('-')}
                  entry={entry}
                  surface={selection.surface}
                />
              ))}
            </div>
          </>
        )}

        {runtime.status==='ready'&&saved.words&&(()=>{
          const main=resolved.find(entry=>entry.senses.length>0);
          if(!main)return null;
          const lexemeIds=[...new Set(resolved.map(entry=>entry.lexeme.id))];
          const isSaved=saved.isWordSaved(lexemeIds);
          const toggle=async()=>{
            setSaveError(false);
            try{await saved.toggleWord(main.lexeme.id,main.senses[0]!.id,lexemeIds,!isSaved);}
            catch{setSaveError(true);}
          };
          return (
            <button className={'secondary-button word-save pressable'+(isSaved?' is-saved':'')} type="button" aria-pressed={isSaved} onClick={()=>void toggle()}>
              <Icon name={isSaved?'check':'plus'} size={18} />
              {isSaved?t('dictionary.saved'):t('dictionary.save')}
            </button>
          );
        })()}
        {saveError&&<p className="dictionary-state" role="alert">{t('dictionary.saveError')}</p>}
        <button className="primary-button dictionary-say" type="button" onClick={()=>void speakText(selection.surface,'en-US')}>
          {t('dictionary.say')}
        </button>
      </section>
    </div>
  );
}

export function LexiconProvider({children}:{children:ReactNode}){
  const queryClient=useQueryClient();
  const [selection,setSelection]=useState<LexiconSelection|null>(null);
  const query=useQuery({
    queryKey:LEXICON_QUERY_KEY,
    queryFn:loadLexicon,
    staleTime:5*60_000
  });

  const refresh=useCallback(async()=>{
    await queryClient.invalidateQueries({queryKey:LEXICON_QUERY_KEY,exact:true});
  },[queryClient]);

  const open=useCallback((surface:string,context:LexiconContextRef={})=>{
    setSelection({surface,context});
  },[]);
  const close=useCallback(()=>setSelection(null),[]);

  const error=query.error??null;
  const status:LexiconRuntimeValue['status']=error
    ? 'error'
    : query.data
      ? 'ready'
      : 'pending';

  const value=useMemo<LexiconRuntimeValue>(()=>({
    lexicon:query.data?.lexicon??null,
    status,
    error,
    fromCache:Boolean(query.data?.fromCache),
    refresh,
    open,
    close
  }),[query.data,error,status,refresh,open,close]);

  return (
    <LexiconContext.Provider value={value}>
      {children}
      {selection&&<DictionarySheet selection={selection} runtime={value} />}
    </LexiconContext.Provider>
  );
}

export function useLexiconRuntime():LexiconRuntimeValue{
  const value=useContext(LexiconContext);
  if(!value)throw new Error('lexicon_provider_missing');
  return value;
}

export function LexiconText({
  text,
  refs,
  className
}:{
  text:string;
  refs?:readonly LexiconClickRef[];
  className?:string;
}){
  const runtime=useContext(LexiconContext);
  const {t}=useI18n();
  const parts=useMemo(()=>splitEnglishText(text),[text]);

  if(!runtime)return <span className={className}>{text}</span>;

  return (
    <span className={className}>
      {parts.map((part,index)=>{
        if(part.kind==='text')return <span key={index}>{part.value}</span>;
        const context=lexiconContextFor(refs,part.value,part.occurrence||1);
        return (
          <span
            className="lexicon-word"
            role="button"
            tabIndex={0}
            key={index}
            aria-label={t('dictionary.lookup',{word:part.value})}
            onClick={event=>{
              event.preventDefault();
              event.stopPropagation();
              runtime.open(part.value,context);
            }}
            onKeyDown={event=>{
              if(event.key!=='Enter'&&event.key!==' ')return;
              event.preventDefault();
              event.stopPropagation();
              runtime.open(part.value,context);
            }}
          >
            {part.value}
          </span>
        );
      })}
    </span>
  );
}
